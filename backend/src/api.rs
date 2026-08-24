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
use tokio::task::JoinSet;
use tower_http::cors::CorsLayer;

use crate::{
    analyzer::{analyze_csv, dataframe_rows},
    schema::{AnalysisResult, ColumnSchema, RelationshipSuggestion, RowsPage, TableSchema},
};

type ApiError = (StatusCode, String);

// El límite incluye todos los archivos y la metadata del multipart.
const MAX_CSV_SIZE: usize = 300 * 1024 * 1024;
const MAX_SINGLE_CSV_SIZE: usize = 100 * 1024 * 1024;
// Polars ya paraleliza internamente un CSV; procesar varios archivos grandes a
// la vez solo multiplica el pico de memoria de los DataFrames temporales.
const MAX_CONCURRENT_PARSERS: usize = 1;
const DEFAULT_PAGE_SIZE: usize = 100;
const MAX_PAGE_SIZE: usize = 500;
const MAX_ACTIVE_ANALYSES: usize = 1;

// Cada tabla conserva sus datos y el perfil derivado del CSV original.
struct LoadedTable {
    schema: TableSchema,
    dataframe: DataFrame,
}

// Mantiene el orden del formulario aunque los parseos terminen en otro orden.
struct ParsedCsv {
    index: usize,
    schema: TableSchema,
    dataframe: DataFrame,
}

// La sesión agrupa todos los archivos necesarios para detectar relaciones.
struct AnalysisSession {
    tables: HashMap<String, LoadedTable>,
    table_order: Vec<String>,
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
    // La aplicación trabaja con un análisis visible a la vez. Liberar la sesión
    // anterior antes del upload deja toda la memoria disponible para el nuevo.
    {
        let mut analyses = state
            .analyses
            .write()
            .map_err(|_| internal_error("No se pudo preparar el nuevo análisis"))?;
        if analyses.len() >= MAX_ACTIVE_ANALYSES {
            analyses.clear();
        }
    }

    let mut parser_jobs = JoinSet::new();
    let mut parsed_files = Vec::new();
    let mut parser_error = None;
    let mut file_index = 0;

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

        let bytes = read_csv_field(field, &file_name).await?;
        let index = file_index;
        file_index += 1;

        parser_jobs.spawn_blocking(move || {
            let (schema, dataframe) = analyze_csv(&file_name, bytes)
                .map_err(|error| (file_name.clone(), error.to_string()))?;
            Ok::<_, (String, String)>(ParsedCsv {
                index,
                schema,
                dataframe,
            })
        });

        // La cola está acotada para no retener bytes de varios CSV grandes.
        if parser_jobs.len() >= MAX_CONCURRENT_PARSERS {
            if let Err(error) = collect_parser_job(&mut parser_jobs, &mut parsed_files).await
                && parser_error.is_none()
            {
                parser_error = Some(error);
            }
        }
    }

    while !parser_jobs.is_empty() {
        if let Err(error) = collect_parser_job(&mut parser_jobs, &mut parsed_files).await
            && parser_error.is_none()
        {
            parser_error = Some(error);
        }
    }

    // La petición se consume completa antes de responder. Si se devuelve durante
    // el upload, algunos navegadores muestran un reset de red y ocultan el error.
    if let Some(error) = parser_error {
        return Err(error);
    }

    if parsed_files.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "No se proporcionaron archivos CSV".to_string(),
        ));
    }

    parsed_files.sort_by_key(|file| file.index);
    let mut tables = HashMap::with_capacity(parsed_files.len());
    let mut table_schemas = Vec::with_capacity(parsed_files.len());
    let mut table_order = Vec::with_capacity(parsed_files.len());

    for parsed in parsed_files {
        if tables.contains_key(&parsed.schema.id) {
            return Err((
                StatusCode::CONFLICT,
                format!("Hay más de un archivo para la tabla {}", parsed.schema.name),
            ));
        }

        // El frontend recibe solo metadata; los valores quedan en el DataFrame.
        table_schemas.push(parsed.schema.clone());
        table_order.push(parsed.schema.id.clone());
        tables.insert(
            parsed.schema.id.clone(),
            LoadedTable {
                schema: parsed.schema,
                dataframe: parsed.dataframe,
            },
        );
    }

    let analysis_id = state.next_analysis_id.fetch_add(1, Ordering::Relaxed) + 1;
    // Polars y la comparación de columnas son CPU-intensivos: nunca deben bloquear Axum.
    let session = tokio::task::spawn_blocking(move || {
        let mut session = AnalysisSession {
            tables,
            table_order,
            relationships: Vec::new(),
        };
        detect_relationships(&mut session)?;
        Ok::<_, String>(session)
    })
    .await
    .map_err(|error| {
        internal_error(&format!(
            "La detección de relaciones terminó inesperadamente: {error}"
        ))
    })?
    .map_err(|error| internal_error(&format!("No se pudieron detectar relaciones: {error}")))?;

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

async fn collect_parser_job(
    parser_jobs: &mut JoinSet<Result<ParsedCsv, (String, String)>>,
    parsed_files: &mut Vec<ParsedCsv>,
) -> Result<(), ApiError> {
    let completed = parser_jobs
        .join_next()
        .await
        .ok_or_else(|| internal_error("No había ningún parseo pendiente"))?
        .map_err(|error| {
            internal_error(&format!("El analizador terminó inesperadamente: {error}"))
        })?;

    let parsed = completed.map_err(|(file_name, error)| {
        (
            StatusCode::UNPROCESSABLE_ENTITY,
            format!("No se pudo analizar {file_name}: {error}"),
        )
    })?;
    parsed_files.push(parsed);

    Ok(())
}

fn names_are_related(
    table1: &TableSchema,
    table2: &TableSchema,
    col1: &ColumnSchema,
    col2: &ColumnSchema,
) -> bool {
    let col1_name = col1.name.as_str();
    let col2_name = col2.name.as_str();

    if col1.null_count != 0 || col2.null_count != 0 {
        return false;
    }

    if !(col1.unique_count == table1.row_count || col2.unique_count == table2.row_count) {
        return false;
    }

    if col1.inferred_type != col2.inferred_type {
        return false;
    }

    if col1_name == col2_name {
        return col1_name != "id";
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

fn detect_relationships(session: &mut AnalysisSession) -> Result<(), String> {
    let tables = session.tables.values().collect::<Vec<_>>();

    // Se compara cada par de tablas una sola vez, sin volver a parsear archivos.
    for i in 0..tables.len() {
        for j in (i + 1)..tables.len() {
            let table1 = tables[i];
            let table2 = tables[j];
            let mut column_values = HashMap::<String, HashSet<String>>::new();

            for col1 in &table1.schema.columns {
                for col2 in &table2.schema.columns {
                    if !names_are_related(&table1.schema, &table2.schema, col1, col2) {
                        continue;
                    }

                    // Cada HashSet se construye una vez por columna candidata dentro
                    // de este par de tablas y se libera antes del siguiente par.
                    cache_column_values(&mut column_values, table1, col1)?;
                    cache_column_values(&mut column_values, table2, col2)?;
                    let col1_hash = column_values.get(&col1.id).ok_or_else(|| {
                        format!("No se pudieron guardar los valores de {}", col1.name)
                    })?;
                    let col2_hash = column_values.get(&col2.id).ok_or_else(|| {
                        format!("No se pudieron guardar los valores de {}", col2.name)
                    })?;

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

    Ok(())
}

fn cache_column_values(
    values_by_column: &mut HashMap<String, HashSet<String>>,
    table: &LoadedTable,
    column: &ColumnSchema,
) -> Result<(), String> {
    if values_by_column.contains_key(&column.id) {
        return Ok(());
    }

    let values = table
        .dataframe
        .column(&column.name)
        .map_err(|error| {
            format!(
                "No se encontró {} en {}: {error}",
                column.name, table.schema.name
            )
        })?
        .as_materialized_series()
        .iter()
        .map(|value| value.to_string())
        .collect();

    values_by_column.insert(column.id.clone(), values);
    Ok(())
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
    // DataFrame::clone comparte sus buffers; así la lectura costosa no retiene el lock.
    let dataframe = {
        let analyses = state
            .analyses
            .read()
            .map_err(|_| internal_error("No se pudo acceder al análisis"))?;
        let analysis = analyses
            .get(&analysis_id)
            .ok_or((StatusCode::NOT_FOUND, "Análisis no encontrado".to_string()))?;
        analysis
            .tables
            .get(&table_id)
            .ok_or((StatusCode::NOT_FOUND, "Tabla no encontrada".to_string()))?
            .dataframe
            .clone()
    };

    let limit = pagination.limit.clamp(1, MAX_PAGE_SIZE);
    let rows = dataframe_rows(&dataframe, pagination.offset, limit)
        .map_err(|error| internal_error(&format!("No se pudieron leer las filas: {error}")))?;
    let loaded_until = pagination.offset.saturating_add(rows.len());
    let next_offset = (loaded_until < dataframe.height()).then_some(loaded_until);

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
        .table_order
        .iter()
        .filter_map(|table_id| analysis.tables.get(table_id))
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
    (error.status(), error.body_text())
}

async fn read_csv_field(
    mut field: axum::extract::multipart::Field<'_>,
    file_name: &str,
) -> Result<Vec<u8>, ApiError> {
    let mut bytes = Vec::new();

    while let Some(chunk) = field.chunk().await.map_err(bad_multipart)? {
        if bytes.len().saturating_add(chunk.len()) > MAX_SINGLE_CSV_SIZE {
            return Err((
                StatusCode::PAYLOAD_TOO_LARGE,
                format!("{file_name} supera el máximo de 100 MiB por archivo"),
            ));
        }
        bytes.extend_from_slice(&chunk);
    }

    Ok(bytes)
}
