Phase 1 is already pointed at the right problem: deterministic extraction from stable ACORD layouts. The main implementation risk is now schema design, not extraction mechanics. The biggest correction is separating semantic field kind from extraction strategy. The current repo uses `type` in [src/acord_extractor/models.py](src/acord_extractor/models.py), while [sample-pdf-map.json](sample-pdf-map.json) uses `method`. The canonical saved recipe should instead use `field_type` and `extraction_method`, while loaders accept legacy `type` and legacy one-dimensional `method` during migration. That avoids mixing concepts like `checkbox`, `date`, and `table_region` with concepts like `embedded_text`, `checkbox_image`, `ocr`, and `manual`.

The local-first web UI recommendation still holds, but the plan should lean harder on proven libraries instead of building viewer and drawing primitives from scratch. Backend responsibilities should stay in Python: canonical PDF-point coordinates, recipe validation and migration, extraction preview, template matching, drift detection, and debug export. Frontend responsibilities should stay in the browser: visual drawing, viewport-pixel coordinates, transient zoom and pan state, and PDF page display. Extraction preview should be treated as a core MVP feature, not an optional enhancement, because it is the main way an annotator confirms that a box is correct. For Phase 1, keep the backend aggressively simple: FastAPI, single-user local session state, filesystem persistence, and no auth, multi-user coordination, database persistence, websocket sync, or SaaS-style orchestration until the extraction model stabilizes.

**Recommended Library Stack**

- Backend PDF rendering and extraction: PyMuPDF should remain the primary backend source of truth for page rendering, page metadata, coordinate-aware text extraction, clips, and canonical PDF-point bbox handling.
- Backend visual debugging and PDF inspection: pdfplumber is a strong companion tool for inspecting chars, rects, lines, and tables during debugging, even if PyMuPDF stays primary for runtime extraction.
- API and schema validation: FastAPI and Pydantic remain the right choices for typed request and response contracts, recipe migration, and validation.
- Browser PDF viewer: start with `react-pdf`, which uses PDF.js under the hood, and only drop to direct PDF.js if lower-level viewport or overlay control becomes necessary. Do not build a custom PDF viewer. The browser should rely on the PDF.js viewport for rendering dimensions, scale, rotation, and coordinate transforms.
- Annotation overlay: use Konva through `react-konva` for rectangle drawing, selection, resize handles, layers, and hit-testing rather than building a custom canvas engine.
- Frontend state: use Zustand first for annotation and session state; only move to Redux Toolkit if the state graph proves significantly more complex than expected.
- Forms and sidebar validation: use React Hook Form with Zod for editable field metadata, validation messages, keyboard save behavior, and partial draft state.
- Table extraction later: do not hand-roll table extraction in MVP. Reserve the schema now and evaluate Camelot or pdfplumber before building custom table logic.
- OCR fallback later: defer broad OCR in MVP. For scanned exceptions, crop the bbox and use Tesseract through `pytesseract` first; only escalate to PaddleOCR if layout or table recognition becomes a real requirement.
- Avoid heavy document-AI platforms in Phase 1 unless a later constraint forces them. Stable ACORD forms are a strong fit for deterministic extraction using embedded text and coordinates.

In the browser, do not hand-roll coordinate math that PDF.js already provides. The intended flow should be:

```text
react-pdf page backed by a PDF.js viewport
 -> React Konva overlay uses the same rendered page dimensions
 -> user draws rectangle in viewport pixels
 -> frontend converts viewport pixels to PDF points using the viewport transform
 -> backend stores canonical PDF-point bbox
 -> backend verifies preview and extraction with PyMuPDF
```

The backend should not care about frontend zoom or pan beyond receiving PDF-point coordinates and validating them.

Define the coordinate contract explicitly. Persist bbox values only in PDF points using the PyMuPDF-compatible top-left workflow for this project. Centralize browser conversion in exactly two tested utilities: `viewportRectToPdfBbox()` and `pdfBboxToViewportRect()`. Even when `react-pdf` is the initial wrapper, the conversion logic should remain explicit and tested against the underlying PDF.js viewport behavior, including page rotation.

Treat saved page geometry as validation metadata, not authority. Runtime page size and rotation must come from the actual PDF being inspected or extracted. Saved values such as `source_page_size`, `page_sizes`, and `page_rotations` exist to detect mismatch or drift, not to override what the PDF reports at runtime.

**Canonical Recipe Direction**

Use a recipe shape that separates template identity from field semantics and extraction behavior. A good target is:

```json
{
	"schema_version": "1.0",
	"form_id": "ACORD_125",
	"template_state": "draft",
	"template_version": "v1",
	"form_edition": "01/24",
	"expected_page_count": 3,
	"page_rotations": [0, 0, 0],
	"page_sizes": [
		[612, 792],
		[612, 792],
		[612, 792]
	],
	"informational_pdf_metadata": {
		"sha256": "...",
		"producer": "...",
		"creator": "..."
	},
	"anchor_text": [
		"ACORD 125",
		"COMMERCIAL INSURANCE APPLICATION"
	],
	"anchors": [
		{
			"name": "form_title",
			"page": 1,
			"expected_text": "COMMERCIAL INSURANCE APPLICATION",
			"match_type": "contains",
			"min_similarity": 0.90,
			"bbox": [200, 20, 500, 45]
		}
	],
	"fields": [
		{
			"id": "fld_applicant_name_001",
			"name": "applicant_name",
			"label": "Applicant Name",
			"page": 1,
			"bbox": [72, 120, 320, 145],
			"coordinate_space": "pdf_points_top_left",
			"source_page_size": [612, 792],
			"padding": {
				"top": 1,
				"right": 2,
				"bottom": 1,
				"left": 2
			},
			"field_type": "text",
			"extraction_method": "embedded_text",
			"options": {
				"trim": true,
				"collapse_whitespace": true,
				"exclude_label_text": true,
				"normalizer": null
			}
		}
	]
}
```

Use `schema_version` for the recipe format itself and `template_version` for the evolving business template. Keep them separate so schema migration does not imply a template revision and vice versa.

Template compatibility should not rely on byte-for-byte PDF identity. Treat matching signals by strength:

- strong: `form_id`, `form_edition`, `expected_page_count`, anchor text
- medium: page sizes, anchor bbox proximity
- weak or informational: `producer`, `creator`, `sha256`

Use weak signals for caching, debugging, and investigation, but do not reject an otherwise matching PDF on `sha256` alone.

Anchors should be optional while a template is still in `draft` state so the first annotation can begin immediately. Before marking a template `validated`, require anchors and apply a reusable-template gate such as:

```text
reusable = expected page count matches
	+ required anchor text found
	+ page sizes within tolerance
	+ no required field preview failures
```

Recommended template lifecycle states:

- `draft`
- `validated`
- `deprecated`

Treat `reusable` as a computed validation result, not a stored lifecycle state.

Recommended enums:

- `field_type`: `text`, `multiline_text`, `checkbox`, `radio`, `date`, `money`, `phone`, `table_region`
- `extraction_method`: `embedded_text`, `checkbox_image`, `ocr`, `manual`

Reserve table/repeating-section shape now even if MVP keeps the UI simple:

```json
{
	"name": "locations_table",
	"page": 2,
	"bbox": [60, 220, 550, 410],
	"coordinate_space": "pdf_points",
	"source_page_size": [612, 792],
	"field_type": "table_region",
	"extraction_method": "embedded_text",
	"row_direction": "vertical",
	"column_direction": "horizontal",
	"columns": [
		{"name": "location_number", "bbox": [65, 225, 140, 410]},
		{"name": "building_number", "bbox": [145, 225, 220, 410]}
	]
}
```

If the project wants to keep the current top-level `version` key for compatibility, decide and document whether it means template revision or visible form edition. The safer long-term shape is `template_version` plus `form_edition`, with legacy `version` mapped to `template_version` during migration.

For fields, treat `name` as the stable machine key and `label` as the human-facing UI value. Both matter and should not be conflated.

**Preview and Snapshot Direction**

Keep preview trust signals simple in the first slice. Start with rule-based statuses such as `ok`, `empty`, `low_text_density`, `anchor_drift`, and `unsupported_method`, plus reasons or warnings. Avoid pseudo-precise numeric confidence until there is enough real signal to justify it. A good initial preview response shape is:

```json
{
	"field_id": "fld_applicant_name_001",
	"field_name": "applicant_name",
	"bbox": [72, 120, 320, 145],
	"raw_extracted_text": "ABC Plumbing LLC",
	"normalized_text": "ABC Plumbing LLC",
	"status": "ok",
	"status_reason": [
		"embedded_text_present",
		"anchor_alignment_good"
	],
	"timestamp": "2026-05-21T12:34:56Z",
	"template_version": "v1"
}
```

Preview responses should be part of MVP. Immutable snapshot persistence can wait until after save or live behind a debug flag in the first implementation. When snapshots are eventually persisted, they should be immutable.

**Plan: Local Web Annotation UI**

1. Lock the canonical recipe contract with failing tests first. Define the saved format around `schema_version`, template lifecycle state, stable field `id`, machine `name`, display `label`, `field_type`, `extraction_method`, `bbox`, `coordinate_space`, `source_page_size`, `padding`, template identity metadata, optional draft `anchors`, and `page_rotations`; accept partially completed recipes; reject invalid bbox and page values and duplicate field IDs; reserve `columns`, `row_direction`, and `column_direction` for `table_region`.

2. Add schema normalization tests immediately after the contract is fixed. Load [sample-pdf-map.json](sample-pdf-map.json) as a compatibility fixture, accept legacy `type` and legacy one-dimensional `method` where migration is unambiguous, generate stable field IDs when older recipes do not provide them, default missing `label` from `name` during migration, and fail fast with explicit migration errors when migration is ambiguous.

3. Add shared golden fixtures. Use [sample-pdf-map.json](sample-pdf-map.json) as the first normalization fixture and [data/sample/acord-125.pdf](data/sample/acord-125.pdf) as the stable PDF fixture for backend, frontend, and browser tests.

4. Scaffold the runtime split and test harnesses. Add a FastAPI and Pydantic API test harness inside [src/acord_extractor](src/acord_extractor) and a small typed React frontend that starts with `react-pdf`, plus `react-konva`, Zustand, React Hook Form, and Zod, with a minimal browser E2E setup. Keep direct PDF.js as an escape hatch only if lower-level viewport control becomes necessary. Keep the backend intentionally local and simple: single-user session state, filesystem persistence, and no unnecessary distributed concerns. Keep all visual tokens in CSS variables from the first commit.

5. Extend the domain model before UI work. Evolve [src/acord_extractor/models.py](src/acord_extractor/models.py) to represent `schema_version`, template lifecycle state, template identity, stable field IDs, `name`, `label`, `field_type`, `extraction_method`, fuzzy-match anchors, coordinate provenance, page rotation metadata, bbox padding, field-level options, reserved `table_region` structure, and preview status models. Add explicit validation results for template matching and drift detection instead of only raising generic errors.

6. Extract recipe I/O into its own backend module under [src/acord_extractor](src/acord_extractor). Make save/load idempotent, preserve canonical ordering, and keep migration logic out of API handlers.

7. Build PDF page rendering and coordinate contracts next. Use PyMuPDF for backend page rendering and metadata, and use the PDF.js viewport exposed through `react-pdf` as the browser-side transform authority. Define and test `viewportRectToPdfBbox()` and `pdfBboxToViewportRect()` explicitly. Add failing tests for page count, page metadata, rendered image dimensions, PDF-point to viewport-pixel round trips under zoom, origin conventions, page rotation handling, agreement between PDF.js viewport transforms and backend expectations, and the rule that runtime PDF page size is authoritative while saved `source_page_size` is only used for mismatch detection.

8. Build extraction preview as a core backend capability early. Implement it with PyMuPDF as the primary extractor for clipped text and rendered regions, and keep pdfplumber available as a diagnostic aid when debugging geometry or table-like areas. Add tests that a field draft can request preview text or checkbox state for its current bbox, that normalization options and bbox padding are applied to the preview, that preview responses include rule-based status and status reasons, and that unsupported combinations fail clearly. Defer snapshot persistence until after save or behind a debug flag.

9. Add template identity and drift-detection services before broad UI work. Use strong signals such as `form_id`, visible form edition, expected page count, and anchor text first; use medium signals such as page sizes, page rotations, and anchor bbox proximity second; and treat `producer`, `creator`, and `sha256` as informational only. Support fuzzy anchor matching with configurable similarity thresholds. Allow draft templates to exist without anchors, but require anchors before a template can be marked `validated`. Compute `reusable` from validation results rather than storing it as a state. Phase 1 should detect drift and mismatch, not auto-realign.

10. Add a visual debugging export endpoint or command early. Use PyMuPDF for the primary overlay artifact and keep pdfplumber available as a complementary inspection tool for chars, lines, rects, and exploratory table diagnostics so reviewers and tests can verify coordinates without opening the full annotator.

10a. Add a small CLI path in parallel with the web UI so the same core services can be exercised without the browser. The minimum useful commands are `acord-extractor preview --pdf ... --recipe ...`, `acord-extractor export-debug-overlay --pdf ... --recipe ...`, and `acord-extractor validate-template --pdf ... --recipe ...`.

11. Add the first backend session slice. Create API contract tests for starting an annotation session with PDF plus template metadata, fetching page image and metadata, loading a partial recipe, requesting extraction preview, saving a draft recipe, optionally persisting preview snapshots after save or behind a debug flag, and exporting a debug-overlay artifact.

12. Build the shell UI with no drawing yet. Add component tests for a two-pane layout with a PDF.js-based viewer on the left, the annotation sidebar on the right, template and session metadata at the top, a field list below the editor, and a dedicated preview area in the sidebar. Use React Hook Form and Zod for the sidebar form model from the first usable slice, and surface both machine `name` and human `label` in the editor.

13. Add rectangle drawing as the first interactive slice. Implement the overlay with `react-konva` on top of the `react-pdf` page. Write reducer and component tests for click-drag rectangle creation, canceling an in-progress draw, Konva selection state, and converting the drawn viewport rectangle to canonical PDF bbox coordinates for the current page through the shared coordinate utilities.

14. Implement the overlay layer with transparent filled rectangles and color classes keyed by `field_type` or another dedicated visual token rather than overloading extraction behavior. Use Konva layers and transformer handles for selection and resize behavior, and keep three explicit UI states in Zustand: transient rectangle, editable draft field, and saved recipe field.

15. Wire the sidebar editor to the selected rectangle. Add tests that a new rectangle prefills a stable `id`, template metadata, current `page`, computed `bbox`, `coordinate_space`, `source_page_size`, `padding`, editable `name`, editable `label`, `field_type`, `extraction_method`, and field-level options, with no persistence until Save or Cmd/Ctrl+Enter. Keep draft form state in React Hook Form and Zod, keep shared annotation and dirty-state flow in Zustand, and ensure edits are keyed by field ID rather than mutable field name.

16. Save the first annotation end to end. Add API and browser tests for draw box, fill `name`, `field_type`, and `extraction_method`, verify live preview, save, receive updated recipe JSON, and keep the saved box visible on the PDF.

17. Support repeated annotation and visibility. Add tests for creating additional annotations without losing earlier ones, preserving translucent color-coded fills, and keeping the field list in saved order.

18. Support edit-in-place. Add tests for double-clicking inside a saved box to reopen it in the sidebar, editing without persistence until Save, verifying preview updates as the draft changes, using Cmd/Ctrl+Enter on an existing annotation, and preserving stable field identity even when the user renames the field.

19. Add page navigation and cross-page annotations. Test next/previous page, page jump, saving fields on one page without disturbing another, and restoring the correct overlays when returning to a page.

20. Add zoom and pan with coordinate stability. Let PDF.js own viewport transforms and let Konva follow the rendered page dimensions. Test that stored bbox coordinates never change when the view is zoomed or panned, that hit-testing still resolves the correct annotation, and that preview requests continue to use canonical PDF coordinates.

21. Load partially completed recipes and reserve space for tables and repeating sections. Add tests for importing a partial recipe, rendering its boxes immediately, reopening an existing field for edit, appending new fields without rewriting unrelated ones, and preserving schema-ready `table_region` entries with `row_direction` and `column_direction` even if the first UI only supports viewing or basic editing for them. When table extraction work starts later, evaluate Camelot and pdfplumber before designing any custom extraction layer.

22. Close with coverage and regression gates that prioritize the right surfaces. Require targeted 100% line and branch coverage for pure schema normalization, coordinate transforms, save/load idempotence, preview correctness, and template matching and drift detection modules. Do not force blanket 100% coverage across UI glue or integration-heavy surfaces where the return is low. Keep browser E2E light early: one happy-path annotation flow is enough until the core schema and math settle.

**Relevant Files**

- [phase1-spec.md](phase1-spec.md) — source scope and extraction assumptions; the UI plan expands its coordinate-picker idea into a browser annotator with template validation
- [sample-pdf-map.json](sample-pdf-map.json) — legacy compatibility fixture and migration input, not the final canonical schema
- [pyproject.toml](pyproject.toml) — dependency and test-tooling expansion point
- [src/acord_extractor/models.py](src/acord_extractor/models.py) — recipe and domain model evolution
- [src/acord_extractor/extract.py](src/acord_extractor/extract.py) — preview extraction and shared bbox-based behavior
- [src/acord_extractor](src/acord_extractor) — location for new API, render, matching, drift-detection, debug-export, and recipe I/O modules
- [data/sample/acord-125.pdf](data/sample/acord-125.pdf) — stable rendering, matching, and E2E fixture

**Library Choices**

- PyMuPDF — primary runtime library for page rendering, coordinate-aware extraction, bbox clips, and canonical PDF-point handling.
- pdfplumber — diagnostic and exploratory companion for chars, lines, rects, visual debugging, and future table investigation.
- FastAPI — local-first typed API surface.
- Pydantic — recipe schema, migration, and validation contracts.
- `react-pdf` first, backed by PDF.js — initial browser-side PDF rendering and viewport transforms; drop to direct PDF.js only if lower-level control becomes necessary.
- `react-konva` and Konva — rectangle drawing, resize handles, hit-testing, and layered overlays.
- Zustand — preferred frontend annotation and session state container.
- React Hook Form and Zod — sidebar form management, validation, and keyboard save flow.
- Camelot or pdfplumber — first libraries to try when table extraction moves into scope.
- Tesseract via `pytesseract` — first OCR fallback for scanned or image-only field crops.
- PaddleOCR — only if later OCR needs grow beyond simple cropped-field fallback.

**CLI Surface**

- `acord-extractor preview --pdf ... --recipe ...` — run preview extraction against the current recipe without opening the UI.
- `acord-extractor export-debug-overlay --pdf ... --recipe ...` — render a PDF overlay artifact for review and regression checks.
- `acord-extractor validate-template --pdf ... --recipe ...` — compute template validation results, including whether a template is currently reusable.

**Definition Of Done**

Phase 1 is done when one ACORD 125 fixture can be annotated, saved, reloaded, previewed, validated, and used to extract at least 10 target fields with debug overlay output.

**Verification**

1. Schema tests should cover canonical validation, `schema_version`, lifecycle states, stable field IDs, machine `name`, display `label`, legacy normalization from `type` and single-dimension `method`, draft versus validated templates, optional draft anchors, template identity metadata, page rotations, fuzzy-match anchors, coordinate provenance, explicit `coordinate_space`, padding, field-level options, and reserved `table_region` structure with reading-direction metadata.
2. Coordinate tests should cover `viewportRectToPdfBbox()` and `pdfBboxToViewportRect()`, PDF-point to viewport-pixel transforms, zoom and pan invariance, origin conventions, persisted `source_page_size`, page rotation handling, hit-testing correctness, and agreement between PDF.js viewport transforms and the backend's PyMuPDF-based expectations.
3. Save/load tests should cover idempotent serialization, stable field ordering, field ID generation and persistence, `label` defaulting during migration, partial-recipe round trips, and migration safety.
4. Preview tests should cover text preview correctness, checkbox preview correctness, normalizer and trim behavior, padding behavior, rule-based status and status reasons, optional snapshot persistence after save or behind a flag, and clear failure modes for unsupported extraction combinations.
5. Template matching tests should cover strong, medium, and weak identity-signal handling, page-count mismatches, page rotation mismatches, fuzzy anchor-text failures, anchor bbox drift thresholds, the computed reusable-template gate, and the rule that informational metadata alone cannot reject an otherwise matching PDF.
6. UI reducer and component tests should cover the three-state draft model, draw, select, edit, save, and cancel flows, sidebar binding, field list behavior, preview updates, page navigation, Zustand state transitions, React Hook Form draft handling, Konva selection and resize behavior, and ID-based editing independent of mutable field names.
7. Browser E2E should stay minimal at first: one happy-path flow for open PDF, draw box, preview, save, reload, and edit an existing box is enough to prove integration.

**Key Decisions**

- Use a local-first browser UI launched from this Python project.
- Use PyMuPDF as the backend source of truth for rendering, extraction, and canonical PDF-point coordinates.
- Start with `react-pdf` for browser rendering, using the underlying PDF.js viewport transforms, and only drop to direct PDF.js if lower-level control becomes necessary. Do not build a custom viewer.
- Use `react-konva` and Konva for drawing and editing overlays rather than building a custom canvas engine.
- Use Zustand for annotation and session state, and use React Hook Form with Zod for sidebar form state and validation.
- Add `schema_version` for recipe-format evolution and keep it separate from `template_version`.
- Persist canonical coordinates in PDF points using the PyMuPDF-compatible top-left workflow for this project, use `coordinate_space: pdf_points_top_left`, and route browser conversions through `viewportRectToPdfBbox()` and `pdfBboxToViewportRect()`.
- Use stable field IDs that remain fixed even when user-editable field names change.
- Keep `name` as the machine key and `label` as the human-facing field label.
- Use `field_type` for semantic field kind and `extraction_method` for how a value is extracted.
- Persist bbox values only in PDF points, with saved page geometry used for mismatch detection while runtime PDF geometry remains authoritative.
- Add template identity metadata, expected page count, page sizes, informational PDF metadata, and `anchors` early so ACORD 125 coordinates are not silently applied to ACORD 126.
- Treat identity signals by strength: strong signals gate compatibility, medium signals help detect drift, and weak signals such as `sha256` are for debugging and caching rather than rejection.
- Store and validate page rotation metadata as part of template matching.
- Use lifecycle states `draft`, `validated`, and `deprecated`; compute `reusable` from validation results instead of storing it as a lifecycle state.
- Allow anchors to be optional for draft templates, but require them before a template is marked `validated`.
- Treat extraction preview as a core MVP feature, not an optional enhancement.
- Start preview trust signals with coarse rule-based status values and reasons rather than pseudo-precise numeric confidence.
- Keep bbox padding first-class from the start, and make immutable snapshot persistence optional initially through post-save capture or a debug flag.
- Use pdfplumber as a debugging and exploratory companion, not the primary runtime extractor.
- Defer table extraction in MVP and try Camelot or pdfplumber before custom table logic.
- Defer broad OCR in MVP and start with `pytesseract` before considering heavier OCR stacks.
- Add a visual debug-overlay export endpoint or command early for review and regression testing.
- Add a small CLI path for preview, debug overlay export, and template validation in parallel with the web UI.
- Keep browser E2E light early and put the strictest targeted coverage gates on schema normalization, coordinate math, save/load idempotence, preview correctness, and drift detection.
- Keep the backend deliberately simple: FastAPI, single-user local state, and filesystem persistence until real requirements justify more.
- Keep styling isolated through CSS variables and semantic classes so visual redesigns stay cheap.