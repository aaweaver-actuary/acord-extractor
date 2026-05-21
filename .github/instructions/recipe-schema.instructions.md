---
description: "Use when designing or modifying the annotation recipe schema, template models, migration logic, coordinate contracts, or extraction metadata. Covers schema_version, template lifecycle, field identity, coordinate conventions, and saved validation metadata."
---
# Recipe Schema

- Keep `schema_version` separate from `template_version`.
- Use lifecycle states `draft`, `validated`, and `deprecated`.
- Treat `reusable` as a computed validation result, not a stored lifecycle state.
- Give every field a stable `id`. Do not rely on mutable `name` as the only identity.
- Keep `name` as the machine key and `label` as the human-facing display value.
- Use `field_type` for semantic field kind and `extraction_method` for extraction strategy.
- Persist canonical coordinates with `coordinate_space: pdf_points_top_left`.
- Route browser conversions through `viewportRectToPdfBbox()` and `pdfBboxToViewportRect()`.
- Treat `source_page_size`, `page_sizes`, and `page_rotations` as validation metadata for mismatch detection, not as runtime authority.
- Preserve reserved schema shape for `table_region`, including `row_direction` and `column_direction`, even before table extraction is implemented.
- During migration from older recipes, accept legacy `type` and single-dimension `method` when the mapping is unambiguous, generate stable field IDs when missing, and default missing `label` from `name`.
