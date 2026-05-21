BACKEND_HOST ?= 127.0.0.1
BACKEND_PORT ?= 8000
FRONTEND_HOST ?= 127.0.0.1
FRONTEND_PORT ?= 5173

ROOT_DIR := $(abspath .)
UI_DIR := $(ROOT_DIR)/accord-extractor-ui
BACKEND_CMD := cd '$(ROOT_DIR)' && uv run acord-extractor serve-api --host $(BACKEND_HOST) --port $(BACKEND_PORT)
FRONTEND_CMD := cd '$(UI_DIR)' && npm run dev -- --host $(FRONTEND_HOST) --port $(FRONTEND_PORT)

.PHONY: py-lint js-lint lint py-test js-test test pycheck jscheck start-build start

py-lint:
	uv run ruff check --fix src/
	uv run ruff format src/
	uv run ty check src/

js-lint:
	cd accord-extractor-ui && \
	npm run lint && \
	npm run format && \
	npm run typecheck && \
	cd ..

lint: py-lint js-lint

py-test:
	uv run pytest -v src/ \
	--cov=src/ \
	--cov-report=term-missing \
	--cov-fail-under=95

js-test:
	cd accord-extractor-ui && \
	npm run test && \
	cd ..

test: py-test js-test

pycheck: py-lint py-test

jscheck: js-lint js-test

start-build:
	uv sync
	cd accord-extractor-ui && \
	npm install --cache ../.npm-cache && \
	npm run build && \
	cd ..

start: start-build
	@command -v osascript >/dev/null 2>&1 || { echo "make start requires macOS osascript"; exit 1; }
	@osascript -e 'tell application "Terminal" to do script "$(BACKEND_CMD)"'
	@osascript -e 'tell application "Terminal" to do script "$(FRONTEND_CMD)"'
	@echo "Backend starting at http://$(BACKEND_HOST):$(BACKEND_PORT)"
	@echo "Frontend starting at http://$(FRONTEND_HOST):$(FRONTEND_PORT)"

