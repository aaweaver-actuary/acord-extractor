---
description: "Use when writing or modifying Python backend code for extraction, API handlers, recipe I/O, template validation, preview, or CLI commands in this repo. Covers the approved backend stack: PyMuPDF, FastAPI, Pydantic, pdfplumber as a diagnostic companion, and simple local-first persistence."
applyTo: "**/*.py"
---
# Backend Stack

- Use PyMuPDF as the backend source of truth for page rendering, page metadata, bbox clips, and canonical PDF-point extraction.
- Use FastAPI for the local-first API surface and Pydantic for recipe schema, validation, and migration.
- Keep pdfplumber as a debugging and exploratory companion, not the primary runtime extractor.
- Keep the backend deliberately simple in Phase 1: single-user local state, filesystem persistence, no auth, no database requirement, no websocket sync, and no multi-user orchestration.
- Treat runtime PDF geometry as authoritative. Saved page geometry is only for mismatch and drift detection.
- Add and maintain CLI paths for preview, debug overlay export, and template validation alongside the web UI.
