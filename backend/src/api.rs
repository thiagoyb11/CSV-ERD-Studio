use std::{
    collections::{HashMap, HashSet},
    sync::{
        Arc, RwLock,
        atomic::{AtomicU64, Ordering},
    },
};

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Multipart, Path, Query, State},
    http::{HeaderValue, Method, StatusCode, header::CONTENT_TYPE},
    routing::{get, post},
};
use polars::prelude::DataFrame;
use serde::{Deserialize, Serialize};
use singularize::singularize;
use tower_http::cors::CorsLayer;

use crate::{
    analyzer::{analyze_csv, dataframe_rows},
    schema::{AnalysisResult, ColumnSchema, RelationshipSuggestion, RowsPage, TableSchema},
};

type ApiError = (StatusCode, String);

// El límite incluye todos los archivos y la metadata del multipart.
const MAX_CSV_SIZE: usize = 300 * 1024 * 1024;
const DEFAULT_PAGE_SIZE: usize = 100;
const MAX_PAGE_SIZE: usize = 500;
const MAX_ACTIVE_ANALYSES: usize = 2;

// Cada tabla conserva sus datos y el perfil derivado del CSV original.
struct LoadedTable {
    schema: TableSchema,
    dataframe: DataFrame,
}

// La sesión agrupa todos los archivos necesarios para detectar relaciones.
struct AnalysisSession {
    tables: HashMap<String, LoadedTable>,
    relationships: Vec<RelationshipSuggestion>,
}

#[derive(Default)]
struct AppState {
    analyses: RwLock<HashMap<u64, AnalysisSession>>,
    next_analysis_id: AtomicU64,
}

type SharedState = Arc<AppState>;

pub fn router() -> Router {
    let state = Arc::new(AppState::default());

    Router::new()
        .route("/api/health", get(health))
        .route(
            "/api/analyses",
            post(create_analysis).layer(DefaultBodyLimit::max(MAX_CSV_SIZE)),
        )
        .route(
            "/api/analyses/{analysis_id}/tables/{table_id}/rows",
            get(get_rows),
        )
        .route(
            "/api/analyses/{analysis_id}",
            get(get_analysis).delete(delete_analysis),
        )
        .layer(
            CorsLayer::new()
                .allow_origin([
                    HeaderValue::from_static("http://localhost:5173"),
                    HeaderValue::from_static("http://127.0.0.1:5173"),
                ])
                .allow_methods([Method::GET, Method::POST, Method::DELETE])
                .allow_headers([CONTENT_TYPE]),
        )
        .with_state(state)
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}

async fn create_analysis(
    State(state): State<SharedState>,
    mut multipart: Multipart,
) -> Result<Json<AnalysisResult>, ApiError> {
    let mut tables = HashMap::new();
    let mut table_schemas = Vec::new();

    while let Some(field) = multipart.next_field().await.map_err(bad_multipart)? {
        if field.name() != Some("files") {
            continue;
        }

        let file_name = field.file_name().map(str::to_owned).ok_or((
            StatusCode::BAD_REQUEST,
            "Una de las partes no contiene un archivo".to_string(),
        ))?;

        if !file_name.to_lowercase().ends_with(".csv") {
            return Err((
                StatusCode::UNSUPPORTED_MEDIA_TYPE,
                format!("{file_name} no es un archivo CSV"),
            ));
        }

        let bytes = field.bytes().await.map_err(bad_multipart)?.to_vec();
        let (schema, dataframe) = analyze_csv(&file_name, bytes).map_err(|error| {
            (
                StatusCode::UNPROCESSABLE_ENTITY,
                format!("No se pudo analizar {file_name}: {error}"),
            )
        })?;

        if tables.contains_key(&schema.id) {
            return Err((
                StatusCode::CONFLICT,
                format!("Hay más de un archivo para la tabla {}", schema.name),
            ));
        }

        // El frontend recibe solo metadata; los valores quedan en el DataFrame.
        table_schemas.push(schema.clone());
        tables.insert(schema.id.clone(), LoadedTable { schema, dataframe });
    }

    if tables.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "No se proporcionaron archivos CSV".to_string(),
        ));
    }

    let analysis_id = state.next_analysis_id.fetch_add(1, Ordering::Relaxed) + 1;
    let mut session = AnalysisSession {
        tables,
        relationships: Vec::new(),
    };

    // Las tablas ya están en memoria; esta función no vuelve a leer los CSV.
    detect_relationships(&mut session);
    let relationships = session.relationships.clone();

    let mut analyses = state
        .analyses
        .write()
        .map_err(|_| internal_error("No se pudo crear el análisis"))?;

    // Limita la memoria en caso de que un cliente abandone sesiones viejas.
    if analyses.len() >= MAX_ACTIVE_ANALYSES
        && let Some(oldest_id) = analyses.keys().min().copied()
    {
        analyses.remove(&oldest_id);
    }
    analyses.insert(analysis_id, session);

    Ok(Json(AnalysisResult {
        analysis_id,
        tables: table_schemas,
        relationships,
    }))
}

fn names_are_related(
    table1: &TableSchema,
    table2: &TableSchema,
    col1: &ColumnSchema,
    col2: &ColumnSchema,
) -> bool {
    let col1_name = col1.name.as_str();
    let col2_name = col2.name.as_str();

    if !((col1.null_count == col2.null_count) && col1.null_count == 0) {
        return false;
    }

    if !(col1.unique_count == table1.row_count || col2.unique_count == table2.row_count) {
        return false;
    }

    if col1_name == col2_name || col1.inferred_type != col2.inferred_type {
        return false;
    }

    let table1_name = singularize(&table1.name);
    let table2_name = singularize(&table2.name);

    if table1.name == table2.name {
        return true;
    }

    if format!("{}_{}", table1_name, col1_name) == col2_name {
        return true;
    }

    if format!("{}_{}", table2_name, col2_name) == col1_name {
        return true;
    }

    false
}

fn detect_relationships(session: &mut AnalysisSession) -> () {
    let tables = session.tables.values().collect::<Vec<_>>();

    // Se compara cada par de tablas una sola vez, sin volver a parsear archivos.
    for i in 0..tables.len() {
        for j in (i + 1)..tables.len() {
            let table1 = tables[i];
            let table2 = tables[j];

            for col1 in &table1.schema.columns {
                for col2 in &table2.schema.columns {
                    if !names_are_related(&table1.schema, &table2.schema, col1, col2) {
                        continue;
                    }

                    // Pendiente: comprobar con ambos DataFrames si los valores de una
                    // columna son subconjunto de la otra y construir la sugerencia.
                    let col1_hash: HashSet<String> = table1
                        .dataframe
                        .column(&col1.name)
                        .expect("No se encontró columna con ese nombre")
                        .as_materialized_series()
                        .iter()
                        .map(|value| value.to_string())
                        .collect();
                    let col2_hash: HashSet<String> = table2
                        .dataframe
                        .column(&col2.name)
                        .expect("No se encontró columna con ese nombre")
                        .as_materialized_series()
                        .iter()
                        .map(|value| value.to_string())
                        .collect();

                    let (source_table, source_column, target_table, target_column) =
                        if col1_hash.is_subset(&col2_hash) {
                            (table1, col1, table2, col2)
                        } else if col2_hash.is_subset(&col1_hash) {
                            (table2, col2, table1, col1)
                        } else {
                            continue;
                        };

                    let source_is_unique =
                        source_column.unique_count == source_table.schema.row_count;
                    let target_is_unique =
                        target_column.unique_count == target_table.schema.row_count;

                    let cardinality = match (source_is_unique, target_is_unique) {
                        (true, true) => "one-to-one",
                        (false, true) => "many-to-one",
                        (true, false) => "one-to-many",
                        (false, false) => "many-to-many",
                    };

                    let mut confidence: f32 = 0.85;

                    if col1_hash == col2_hash && cardinality == "one-to-one" {
                        confidence += 0.15;
                    } else if cardinality == "one-to-one" || cardinality == "many-to-one" {
                        confidence += 0.10;
                    }

                    let rel = RelationshipSuggestion {
                        source_table: source_table.schema.name.clone(),
                        source_column: source_column.name.clone(),
                        target_table: target_table.schema.name.clone(),
                        target_column: target_column.name.clone(),
                        cardinality: cardinality.to_string(),
                        confidence,
                        status: if confidence >= 1.0 {
                            "accepted".to_string()
                        } else {
                            "suggested".to_string()
                        },
                    };

                    session.relationships.push(rel);
                }
            }
        }
    }
}

#[derive(Deserialize)]
struct Pagination {
    #[serde(default)]
    offset: usize,
    #[serde(default = "default_page_size")]
    limit: usize,
}

async fn get_rows(
    State(state): State<SharedState>,
    Path((analysis_id, table_id)): Path<(u64, String)>,
    Query(pagination): Query<Pagination>,
) -> Result<Json<RowsPage>, ApiError> {
    let analyses = state
        .analyses
        .read()
        .map_err(|_| internal_error("No se pudo acceder al análisis"))?;
    let analysis = analyses
        .get(&analysis_id)
        .ok_or((StatusCode::NOT_FOUND, "Análisis no encontrado".to_string()))?;
    let table = analysis
        .tables
        .get(&table_id)
        .ok_or((StatusCode::NOT_FOUND, "Tabla no encontrada".to_string()))?;

    let limit = pagination.limit.clamp(1, MAX_PAGE_SIZE);
    let rows = dataframe_rows(&table.dataframe, pagination.offset, limit)
        .map_err(|error| internal_error(&format!("No se pudieron leer las filas: {error}")))?;
    let loaded_until = pagination.offset.saturating_add(rows.len());
    let next_offset = (loaded_until < table.dataframe.height()).then_some(loaded_until);

    Ok(Json(RowsPage { rows, next_offset }))
}

async fn get_analysis(
    State(state): State<SharedState>,
    Path(analysis_id): Path<u64>,
) -> Result<Json<AnalysisResult>, ApiError> {
    let analyses = state
        .analyses
        .read()
        .map_err(|_| internal_error("No se pudo acceder al análisis"))?;
    let analysis = analyses
        .get(&analysis_id)
        .ok_or((StatusCode::NOT_FOUND, "Análisis no encontrado".to_string()))?;

    // La sesión conserva la metadata junto a los DataFrames en memoria.
    let tables = analysis
        .tables
        .values()
        .map(|table| table.schema.clone())
        .collect();

    Ok(Json(AnalysisResult {
        analysis_id,
        tables,
        relationships: analysis.relationships.clone(),
    }))
}

async fn delete_analysis(
    State(state): State<SharedState>,
    Path(analysis_id): Path<u64>,
) -> Result<StatusCode, ApiError> {
    let removed = state
        .analyses
        .write()
        .map_err(|_| internal_error("No se pudo liberar el análisis"))?
        .remove(&analysis_id);

    removed
        .map(|_| StatusCode::NO_CONTENT)
        .ok_or((StatusCode::NOT_FOUND, "Análisis no encontrado".to_string()))
}

fn default_page_size() -> usize {
    DEFAULT_PAGE_SIZE
}

fn internal_error(message: &str) -> ApiError {
    (StatusCode::INTERNAL_SERVER_ERROR, message.to_string())
}

fn bad_multipart(error: axum::extract::multipart::MultipartError) -> ApiError {
    (StatusCode::BAD_REQUEST, error.to_string())
}
