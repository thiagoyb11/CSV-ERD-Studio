# CSV ERD Studio

CSV ERD Studio convierte un conjunto de archivos CSV relacionados en una vista exploratoria: infiere la estructura de cada tabla, propone relaciones entre columnas y genera un diagrama entidad-relación navegable. Además del diagrama, permite inspeccionar las filas de cada archivo sin cargar toda la tabla en el navegador de una sola vez.

## Funcionalidades

- Carga múltiple de archivos CSV mediante selector o arrastrar y soltar.
- Inferencia de nombres, tipos de columnas y candidatos a clave primaria.
- Detección heurística de relaciones entre tablas y sus cardinalidades.
- Diagrama ER generado con Mermaid, con zoom, arrastre y restablecimiento de vista.
- Explorador lateral redimensionable con búsqueda animada por nombre de archivo.
- Vista tabular con encabezado fijo y paginación incremental al hacer scroll.
- Temas claro y oscuro, tomando inicialmente la preferencia del dispositivo.
- Liberación del análisis anterior al iniciar uno nuevo para controlar el uso de memoria.

## Tecnologías

El frontend está construido con React, TypeScript, Vite, Tailwind CSS y Motion. El backend utiliza Rust, Axum y Polars: recibe los CSV, conserva temporalmente el análisis activo en memoria y expone páginas de filas al frontend.

```text
Navegador (React/Vite)
        │ HTTP / multipart
        ▼
API (Axum)
        │
        ├── Polars: lectura e inferencia de CSV
        ├── Analizador de claves y relaciones
        └── Sesión temporal del análisis activo
```

## Requisitos

- Node.js 22 o una versión LTS compatible.
- npm.
- Rust estable con Cargo.

## Desarrollo local

Instalá las dependencias del frontend:

```bash
npm install
```

Iniciá el backend en una terminal:

```bash
cd backend
cargo run
```

La API escucha por defecto en `http://127.0.0.1:3000`. Se puede cambiar el puerto definiendo la variable de entorno `PORT`.

En otra terminal, iniciá Vite:

```bash
npm run dev
```

Durante el desarrollo, Vite redirige las solicitudes `/api` hacia el backend local. Si el backend se ejecuta en otro dominio, creá un archivo `.env.local`:

```env
VITE_API_URL=https://api.example.com
```

No agregues una barra final a `VITE_API_URL`.

## Endpoints principales

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/health` | Comprueba que la API esté disponible. |
| `POST` | `/api/analyses` | Recibe uno o más CSV y crea el análisis. |
| `GET` | `/api/analyses/:id` | Recupera la metadata del análisis activo. |
| `GET` | `/api/analyses/:id/tables/:tableId/rows` | Obtiene una página de filas. |
| `DELETE` | `/api/analyses/:id` | Libera los datos retenidos por el análisis. |

## Comandos útiles

```bash
npm run dev       # servidor de desarrollo
npm run lint      # análisis estático del frontend
npm run build     # TypeScript + build de producción
npm run preview   # previsualización local de dist/
```

Para verificar el backend:

```bash
cd backend
cargo test
```

## Estructura del proyecto

```text
src/
  components/    Componentes de interfaz, tabla, archivos y Mermaid
  pages/         Landing y explorador del análisis
  types/         Contratos TypeScript de la API
backend/
  src/api.rs     Rutas HTTP, sesiones y paginación
  src/analyzer.rs Inferencia de tablas y relaciones
  src/schema.rs  Tipos serializables compartidos por la API
.github/
  workflows/     Build y despliegue automático de GitHub Pages
```

## Consideraciones actuales

- Los archivos se envían al backend para ser procesados; no deben subirse datos sensibles a una instancia que no controles.
- El servidor conserva un único análisis activo en memoria y libera el anterior al crear uno nuevo.
- El límite total del multipart es de 300 MB y cada CSV individual puede ocupar hasta 100 MB.
- La detección de relaciones es heurística: el resultado es una sugerencia visual y puede requerir validación manual.
