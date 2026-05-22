# Codebase Review Notes

## High-Priority Fixes

### 1. Remove `fitz` from `pyproject.toml`

You want:

```toml
pymupdf
```

not:

```toml
fitz
```

PyMuPDF exposes:

```python
import fitz
```

but the standalone `fitz` package is different and can create dependency/runtime conflicts.

---

### 2. Tests currently fail because `data/sample/acord-125.pdf` is missing

Current status:

```text
29 passed
32 failed
```

Most failures are fixture-missing failures, not logic failures.

Fix options:

- commit the fixture PDF into the repo
- or skip PDF-dependent tests if fixture missing
- or generate a deterministic lightweight fixture PDF during test setup

Recommended:

```text
Commit a stable sample fixture PDF directly into the repo.
```

---

### 3. Remove heuristic legacy bbox detection

Current behavior:

```text
_should_use_legacy_bboxes()
```

attempts to infer coordinate orientation by scoring extracted text.

This is risky.

A coordinate migration should be explicit, not heuristic.

Recommended approach:

```json
{
  "coordinate_space": "pdf_points_top_left"
}
```

Possible legacy value:

```json
{
  "coordinate_space": "pdf_points_bottom_left_legacy"
}
```

Then migrate explicitly during load.

Avoid silent reinterpretation of saved coordinates.

---

### 4. Add PDF-aware page and bbox validation

Currently validation is mostly schema-level.

Add runtime PDF-aware validation:

```text
- field.page exists in PDF
- bbox intersects page bounds
- bbox remains valid after clamping
- preview returns explicit statuses for invalid geometry
```

Recommended preview statuses:

```text
ok
empty
out_of_bounds
invalid_page
anchor_drift
unsupported_method
```

Do not rely on PyMuPDF behavior alone for invalid coordinates.

---

### 5. Restrict local filesystem access

Current API endpoints expose arbitrary filesystem access patterns:

```text
/pdf/file
/filesystem/list
/recipe/save
```

For a local MVP this is acceptable only if:

```text
- API binds to localhost only
- filesystem access restricted to configured workspace root
```

Recommended:

```python
WORKSPACE_ROOT = Path("~/acord-workspace").resolve()
```

Then validate all incoming paths are descendants of that root.

---

# Medium-Priority Fixes

## 6. Enforce unique field names

You currently validate unique field IDs.

Also validate unique machine names unless aliases are intentionally supported.

Recommended invariant:

```text
field.id     -> immutable identity
field.name   -> unique machine key
field.label  -> mutable display text
```

---

## 7. Harden anchor validation

Current logic can fail if:

```text
anchor.page > document page count
```

Also:

```text
match_type
```

exists in schema but behavior is not fully differentiated.

Recommended:

```text
exact
contains
regex
fuzzy
```

with explicit matching logic per type.

---

## 8. Enforce reusable-template requirements

Current logic allows templates to become reusable without anchors.

Spec says:

```text
draft templates may omit anchors
validated/reusable templates require anchors
```

Recommended reusable gate:

```text
reusable =
    expected page count matches
    AND required anchors present
    AND anchor matches pass
    AND required previews succeed
```

---

## 9. Replace frontend-generated sequential IDs

Current pattern:

```text
fld_${slug}_${sequence}
```

can collide after:

```text
- deletion
- import/export
- merge
- partial recipe reload
```

Recommended:

```ts
crypto.randomUUID()
```

or:

```text
nanoid
```

---

# Good Architectural Decisions

## Correct separations

You correctly separated:

```text
field_type
vs
extraction_method
```

This prevents schema drift later.

---

## Correct coordinate strategy

Canonical persistence in PDF points is correct.

Frontend zoom/pan/view transforms should remain transient.

---

## Good backend/frontend split

Backend owns:

```text
- extraction
- validation
- migration
- canonical geometry
- template matching
```

Frontend owns:

```text
- drawing
- interaction
- transient viewport state
```

Correct split.

---

## Good technology choices

Strong choices:

```text
PyMuPDF
FastAPI
Pydantic
react-pdf
react-konva
Zustand
React Hook Form
Zod
```

Avoiding custom viewer/drawing logic was the right move.

---

# Recommended Additional Improvements

## Add schema versioning

Separate schema version from template version.

Recommended:

```json
{
  "schema_version": "1.0",
  "template_version": "v1"
}
```

---

## Add explicit lifecycle states

Recommended:

```text
draft
validated
deprecated
```

Avoid using `reusable` as a persisted state.

Instead compute it dynamically.

---

## Add CLI utilities early

Useful commands:

```bash
acord-extractor preview --pdf ... --recipe ...
acord-extractor export-debug-overlay --pdf ... --recipe ...
acord-extractor validate-template --pdf ... --recipe ...
```

These become extremely valuable for debugging.

---

# Suggested Immediate Next Steps

## Do these before adding more features

1. Add stable fixture PDF
2. Remove incorrect `fitz` dependency
3. Replace legacy bbox heuristic with explicit migration
4. Add PDF-aware validation
5. Restrict filesystem access to workspace root
6. Switch field IDs to UUIDs
7. Enforce reusable-template anchor requirements

---

# Overall Assessment

The project has moved beyond “prototype coordinate picker” territory.

Current architecture is already consistent with:

```text
- deterministic extraction
- schema evolution
- template validation
- coordinate stability
- migration compatibility
- production-oriented debugging
```

The remaining work is primarily:

```text
- hardening
- validation correctness
- migration safety
- operational guardrails
```

rather than fundamental redesign.