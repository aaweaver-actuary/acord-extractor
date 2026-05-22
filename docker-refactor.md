# Dockerization and Docker Compose Reconfiguration Plan

## Goal

Reconfigure the ACORD extraction project into a containerized local development platform using Docker and Docker Compose.

The primary goals are:

```text
- deterministic local environments
- reproducible frontend/backend/runtime behavior
- simplified onboarding
- dependency isolation
- easier CI parity
- clearer service boundaries
- future deployment portability
```

This reconfiguration should preserve the intentionally local-first architecture while preparing the system for future expansion.

The project should remain:

```text
- single-user
- filesystem-backed
- local-first
- simple operationally
```

until real requirements justify more infrastructure.

---

# High-Level Architecture

Move from:

```text
single Python process
+ manually started frontend
```

to:

```text
docker compose
    ->
        backend container
        frontend container
        optional worker/debug services
```

Canonical architecture:

```text
+------------------------------------------------------+
| Docker Compose                                       |
|                                                      |
|  +----------------+      +----------------------+    |
|  | frontend       | ---> | backend              |    |
|  | react-pdf      |      | FastAPI              |    |
|  | react-konva    |      | PyMuPDF              |    |
|  | Zustand        |      | extraction engine    |    |
|  +----------------+      +----------------------+    |
|                                                      |
|               mounted workspace volume               |
|                                                      |
+------------------------------------------------------+
```

---

# Design Principles

## 1. Containers should reflect logical boundaries

Separate:

```text
frontend concerns
backend extraction concerns
```

Do not initially split:

```text
database
workers
queues
OCR services
```

until necessary.

---

## 2. Workspace should remain local and mounted

The source of truth remains:

```text
host filesystem
```

through mounted volumes.

Do not introduce DB persistence in this phase.

---

## 3. Docker Compose should be the single entrypoint

Preferred startup:

```bash
docker compose up
```

Avoid:

```text
manual frontend startup
manual backend startup
manual environment management
```

---

## 4. Containers should be development-first initially

Optimize for:

```text
fast iteration
live reload
debugging
deterministic dependencies
```

not minimal production image size yet.

---

# Recommended Container Layout

## Initial services

```text
frontend
backend
```

Optional later:

```text
ocr-worker
playwright-tests
debug-tools
```

---

# Recommended Repository Structure

```text
acord-extractor/
├── docker-compose.yml
├── .env
├── .env.example
├── Makefile
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── src/
│   └── ...
│
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── src/
│   └── ...
│
├── workspace/
│   ├── pdfs/
│   ├── recipes/
│   ├── debug-output/
│   └── previews/
│
└── tests/
```

---

# Workspace Volume Strategy

## Critical design decision

The workspace should be mounted into containers.

Recommended mount:

```yaml
volumes:
  - ./workspace:/workspace
```

Purpose:

```text
/workspace/pdfs
/workspace/recipes
/workspace/debug-output
/workspace/previews
```

Benefits:

```text
- no DB needed
- easy debugging
- inspect outputs directly
- stable local persistence
- simple backup/versioning
```

---

# Backend Container

## Responsibilities

```text
- FastAPI API
- extraction preview
- PyMuPDF rendering
- recipe validation
- template matching
- debug overlay export
```

---

# Backend Dockerfile

Recommended:

```dockerfile
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
COPY uv.lock .

RUN pip install uv

RUN uv sync

COPY . .

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "src.acord_extractor.api:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

---

# Backend Container Notes

## Keep reload enabled initially

Optimize for development:

```text
--reload
mounted source code
```

Production optimization can wait.

---

## Use slim images initially

Good tradeoff:

```text
python:3.12-slim
```

Avoid Alpine initially because:

```text
- PyMuPDF wheels
- OCR tooling
- OpenCV
```

can become painful.

---

# Frontend Container

## Responsibilities

```text
- react-pdf rendering
- react-konva overlays
- Zustand state
- annotation UI
```

---

# Frontend Dockerfile

Recommended:

```dockerfile
FROM node:22

WORKDIR /app

COPY package.json .
COPY package-lock.json .

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
```

---

# Docker Compose

## Recommended initial compose file

```yaml
services:

  backend:
    build:
      context: ./backend

    ports:
      - "8000:8000"

    volumes:
      - ./backend:/app
      - ./workspace:/workspace

    environment:
      WORKSPACE_ROOT: /workspace
      PYTHONUNBUFFERED: "1"

  frontend:
    build:
      context: ./frontend

    ports:
      - "3000:3000"

    volumes:
      - ./frontend:/app
      - /app/node_modules

    environment:
      VITE_API_BASE_URL: http://localhost:8000

    depends_on:
      - backend
```

---

# Networking Model

## Internal service communication

Frontend should communicate with backend through Compose networking.

Eventually:

```text
http://backend:8000
```

Internally.

But expose:

```text
localhost:3000
localhost:8000
```

to the host.

---

# Environment Variable Strategy

## Required `.env`

Recommended:

```env
WORKSPACE_ROOT=/workspace
ENABLE_DEBUG_EXPORTS=true
ENABLE_SNAPSHOT_PERSISTENCE=false
```

---

# Local Development Workflow

## Intended developer workflow

Startup:

```bash
docker compose up
```

Then:

```text
frontend:
http://localhost:3000

backend:
http://localhost:8000/docs
```

---

# Makefile

Strongly recommended.

Example:

```makefile
up:
	docker compose up

build:
	docker compose build

down:
	docker compose down

test-backend:
	docker compose run backend pytest

test-frontend:
	docker compose run frontend npm test

lint:
	docker compose run backend ruff check .
```

---

# Dependency Strategy

## Backend

Use:

```text
uv
```

or:

```text
poetry
```

inside the container.

Avoid:

```text
pip install -r requirements.txt
```

sprawl.

---

## Frontend

Prefer:

```text
npm
```

or:

```text
pnpm
```

consistently.

Do not mix package managers.

---

# OCR Strategy

## Do not split OCR into a separate service initially

Keep:

```text
PyMuPDF
pytesseract
OpenCV
```

inside backend container.

Only split later if:

```text
- OCR becomes CPU-heavy
- async job execution appears
- GPU inference required
```

---

# PDF Rendering Strategy

## Backend rendering remains authoritative

Use PyMuPDF for:

```text
- preview extraction
- debug overlays
- page metadata
- canonical bbox handling
```

Browser rendering remains:

```text
visual only
```

through react-pdf/PDF.js.

---

# Container Boundaries

## Backend owns

```text
- canonical PDF geometry
- extraction
- validation
- recipe migration
- template matching
```

---

## Frontend owns

```text
- drawing
- viewport transforms
- interaction state
- overlays
```

---

# Future Optional Services

## OCR worker

Only later if needed.

Possible future split:

```text
ocr-worker
```

for:

```text
- PaddleOCR
- heavy OCR jobs
- async queues
```

---

## Playwright test container

Recommended later.

Example:

```yaml
playwright:
  image: mcr.microsoft.com/playwright:v1.54.0
```

---

# Security Model

## Current assumptions

System is:

```text
- local-first
- trusted-user
- localhost-only
```

Therefore acceptable initially:

```text
- filesystem-backed persistence
- no auth
- open local API
```

But still:

```text
- bind services to localhost
- restrict workspace root
- validate mounted paths
```

---

# CI Alignment

## Major benefit of containerization

CI should run:

```bash
docker compose run backend pytest
docker compose run frontend npm test
```

Same environment as local development.

---

# Recommended Immediate Refactors

## 1. Split frontend/backend directories

Do this first.

Current mixed repo layout will become awkward under Compose.

---

## 2. Move workspace artifacts outside source tree

Create:

```text
/workspace
```

mounted volume.

Avoid:

```text
saving generated artifacts into src/
```

---

## 3. Centralize config

Add:

```python
settings.py
```

using:

```text
pydantic-settings
```

---

## 4. Add health endpoints

Backend:

```python
GET /health
```

Useful for Compose startup ordering.

---

# Suggested Compose Profiles

Useful later:

```yaml
profiles:
  - dev
  - test
  - debug
```

Example:

```bash
docker compose --profile test up
```

---

# Anti-Patterns to Avoid

## Do not containerize too aggressively initially

Avoid:

```text
- nginx reverse proxy
- postgres
- redis
- celery
- kubernetes
- microservices
```

until actual operational pressure exists.

---

## Do not over-optimize image size early

Correctness and reproducibility matter more initially.

---

## Do not duplicate coordinate logic

Frontend viewport transforms should remain thin wrappers around PDF.js behavior.

Backend owns canonical PDF geometry.

---

# Suggested Definition of Done

```text
Docker reconfiguration is complete when:

- docker compose up starts frontend and backend
- frontend can render PDFs from mounted workspace
- backend preview extraction works through API
- recipes save/load from mounted workspace
- debug overlays export correctly
- tests run successfully inside containers
- developers no longer need local Python or Node environments outside Docker
```

---

# Recommended Next Steps

## Phase 1

```text
- split frontend/backend directories
- add Dockerfiles
- add docker-compose.yml
- mount workspace volume
- verify live reload
```

---

## Phase 2

```text
- add Makefile
- add health endpoints
- add test containers
- align CI with Compose
```

---

## Phase 3

```text
- optional OCR worker
- optional Playwright container
- optional production hardening
```

---

# Key Decisions

- Use Docker Compose as the canonical runtime entrypoint.
- Keep architecture local-first and single-user.
- Use mounted workspace volumes instead of DB persistence.
- Keep frontend and backend in separate containers.
- Keep PyMuPDF authoritative for extraction and geometry.
- Keep PDF.js/react-pdf authoritative for viewport rendering.
- Keep OCR inside backend container initially.
- Optimize for deterministic development environments rather than production minimalism.
- Delay operational complexity until real requirements emerge.