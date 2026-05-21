---
description: "Use when planning, reviewing, or scoping Phase 1 work for the ACORD annotation and extraction system. Covers definition of done, targeted coverage expectations, browser E2E scope, and what must exist before Phase 1 is considered complete."
---
# Phase 1 Done

- Treat Phase 1 as complete only when one ACORD 125 fixture can be annotated, saved, reloaded, previewed, validated, and used to extract at least 10 target fields with debug overlay output.
- Keep browser E2E light early. One happy-path browser test is enough until the schema and coordinate contract stabilize.
- Apply targeted 100% line and branch coverage to pure schema normalization, coordinate transforms, save/load idempotence, preview correctness, and template matching and drift detection modules.
- Do not force blanket 100% coverage across UI glue or other integration-heavy surfaces with low return.
- Maintain both web and CLI entry points for preview, debug overlay export, and template validation so core services stay usable without the browser.
- Favor deterministic extraction from embedded text and coordinates over heavier OCR or document-AI approaches unless a later requirement clearly justifies expansion.