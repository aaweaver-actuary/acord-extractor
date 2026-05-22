# ACORD Extractor

Deterministic ACORD PDF extraction for stable form layouts using canonical PDF-point coordinates, PyMuPDF, FastAPI, and Pydantic.

## MVP status

The repository now includes a working backend MVP for the bundled ACORD 125 sample fixture:

- Canonical recipe schema with legacy migration from `sample-pdf-map.json`
- Filesystem recipe save/load with canonical JSON output
- Preview, extraction, template validation, and debug overlay export
- FastAPI web surface and Typer CLI for the same core workflows
- A browser annotator UI in `accord-extractor-ui` built with `react-pdf`, `react-konva`, Zustand, React Hook Form, and Zod
- A draft sample recipe at `data/sample/acord-125.recipe.json`
- End-to-end coverage proving save, reload, preview, validate, extract, and overlay export for the bundled sample PDF

## Sample fixture

- PDF: `data/sample/acord-125.pdf`
- Canonical recipe: `data/sample/acord-125.recipe.json`

The sample recipe is intentionally minimal and repo-relative so the UI can boot against the bundled sample PDF without machine-specific paths.

## CLI

Install dependencies with `uv sync`, then use:

```bash
acord-extractor preview --pdf data/sample/acord-125.pdf --recipe data/sample/acord-125.recipe.json
acord-extractor extract --pdf data/sample/acord-125.pdf --recipe data/sample/acord-125.recipe.json
acord-extractor validate-template --pdf data/sample/acord-125.pdf --recipe data/sample/acord-125.recipe.json
acord-extractor export-debug-overlay --pdf data/sample/acord-125.pdf --recipe data/sample/acord-125.recipe.json --output out/debug-overlay.pdf
acord-extractor save-recipe --recipe data/sample/acord-125.recipe.json --output out/saved.recipe.json
acord-extractor serve-api --host 127.0.0.1 --port 8009
```


## Docker Compose (new default)

Start the full development stack with Docker:

```bash
docker compose up --build
```

Services:

- Frontend: `http://localhost:3000`
- Backend API docs: `http://localhost:8000/docs`

The compose stack mounts a persistent local workspace at `./workspace` into `/workspace` inside containers so generated recipes, previews, and debug overlays persist on the host filesystem.

You can also use Make targets:

```bash
make docker-build
make docker-up
make docker-down
```

## Browser UI

Start the backend API in one terminal:

```bash
acord-extractor serve-api --host 127.0.0.1 --port 8009
```

Start the frontend in another terminal:

```bash
cd accord-extractor-ui
npm install
npm run dev
```

The UI ships with sample defaults for the bundled ACORD 125 fixture. Load the workspace, draw a rectangle on the PDF page, edit field metadata in the sidebar, review the live preview, and save the recipe back to disk.

Playwright coverage for the main UI workflows lives in `accord-extractor-ui/e2e/app.spec.ts`. Run it with:

```bash
cd accord-extractor-ui
npx playwright install chromium
npm run test:e2e
```

## API

Run `acord-extractor serve-api`, then use the FastAPI docs at `/docs`.

Implemented endpoints:

- `GET /health`
- `GET /filesystem/list?path=...&extensions=.pdf,.json`
- `GET /pdf/file?pdf_path=...`
- `GET /pdf/metadata?pdf_path=...`
- `GET /pdf/pages/{page_number}/image?pdf_path=...&scale=...`
- `POST /recipe/load`
- `POST /recipe/save`
- `POST /session/start`
- `POST /preview`
- `POST /extract`
- `POST /validate-template`
- `POST /export-debug-overlay`

## Development

Backend checks:

```bash
make pycheck
```

The current backend test suite exercises schema migration, recipe round-trips, sample-fixture preview/extraction, template validation, overlay export, API endpoints, and CLI commands.
