// Punto de entrada del servidor Axum.
mod analyzer;
mod api;
mod schema;

#[tokio::main]
async fn main() {
    let app = api::router();
    let port = std::env::var("PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(3000);
    let address = format!("0.0.0.0:{port}");

    let listener = tokio::net::TcpListener::bind(&address).await.unwrap();
    println!("CSV ERD Studio API escuchando en {address}");

    axum::serve(listener, app).await.unwrap();
}
