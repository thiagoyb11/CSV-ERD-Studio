use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Multipart},
    http::{HeaderValue, Method, StatusCode, header::CONTENT_TYPE},
    routing::{get, post},
};
use serde::Serialize;
use tower_http::cors::CorsLayer;

use crate::{analyzer::analyze_csv, schema::TableSchema};

type ApiError = (StatusCode, String);

const MAX_CSV_SIZE: usize = 300 * 1024 * 1024;

pub fn router() -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route(
            "/api/parse",
            post(parse_csv).layer(DefaultBodyLimit::max(MAX_CSV_SIZE)),
        )
        .layer(
            CorsLayer::new()
                .allow_origin([
                    HeaderValue::from_static("http://localhost:5173"),
                    HeaderValue::from_static("http://127.0.0.1:5173"),
                ])
                .allow_methods([Method::GET, Method::POST])
                .allow_headers([CONTENT_TYPE]),
        )
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}

async fn parse_csv(mut multipart: Multipart) -> Result<Json<TableSchema>, ApiError> {
    while let Some(field) = multipart.next_field().await.map_err(bad_multipart)? {
        let Some(file_name) = field.file_name().map(str::to_owned) else {
            continue;
        };
        let bytes = field.bytes().await.map_err(bad_multipart)?.to_vec();
        let table = analyze_csv(&file_name, bytes).map_err(|error| {
            (
                StatusCode::UNPROCESSABLE_ENTITY,
                format!("Could not analyze CSV: {error}"),
            )
        })?;

        return Ok(Json(table));
    }

    Err((
        StatusCode::BAD_REQUEST,
        "No CSV file was provided".to_string(),
    ))
}

fn bad_multipart(error: axum::extract::multipart::MultipartError) -> ApiError {
    (StatusCode::BAD_REQUEST, error.to_string())
}
