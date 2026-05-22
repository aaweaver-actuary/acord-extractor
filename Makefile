BACKEND_HOST ?= 127.0.0.1
BACKEND_PORT ?= 8009
FRONTEND_HOST ?= 127.0.0.1
FRONTEND_PORT ?= 5173

ROOT_DIR := $(abspath .)
UI_DIR := $(ROOT_DIR)/accord-extractor-ui
BACKEND_CMD := cd '$(ROOT_DIR)' && uv run acord-extractor serve-api --host $(BACKEND_HOST) --port $(BACKEND_PORT)
FRONTEND_CMD := cd '$(UI_DIR)' && npm run dev -- --host $(FRONTEND_HOST) --port $(FRONTEND_PORT)

.PHONY: py-lint js-lint lint py-test js-test test pycheck jscheck start-build start docker-up docker-down docker-build docker-logs

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

jsstart:
	$(FRONTEND_CMD)

pystart:
	$(BACKEND_CMD)

start: pystart jsstart

check: pycheck jscheck


docker-up:
	docker compose up


docker-build:
	docker compose build


docker-down:
	docker compose down


docker-logs:
	docker compose logs -f
