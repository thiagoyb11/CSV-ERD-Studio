// Punto de entrada del servidor Axum.
mod analyzer;
mod api;
mod schema;

#[tokio::main]
async fn main() {
    let app = api::router();

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();

    axum::serve(listener, app).await.unwrap();
}
