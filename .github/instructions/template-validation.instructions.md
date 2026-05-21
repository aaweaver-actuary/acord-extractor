---
description: "Use when implementing or reviewing template matching, drift detection, anchor handling, preview status logic, or template validation rules for the ACORD extractor. Covers draft vs validated templates, identity-signal strength, anchors, rotation, and preview status semantics."
---
# Template Validation

- Allow templates to exist in `draft` state without anchors so annotation can start immediately.
- Require anchors before a template can be marked `validated`.
- Use strong identity signals for compatibility: `form_id`, visible `form_edition`, expected page count, and anchor text.
- Use medium identity signals for drift detection: page sizes, page rotations, and anchor bbox proximity.
- Treat weak signals such as `sha256`, `producer`, and `creator` as informational only for caching or debugging, not as rejection criteria by themselves.
- Support fuzzy anchor matching with configurable similarity thresholds.
- Store and validate page rotation metadata as part of template matching.
- Keep preview trust signals coarse at first: `ok`, `empty`, `low_text_density`, `anchor_drift`, `unsupported_method`, plus reasons or warnings.
- Keep bbox padding first-class.
- Make immutable preview snapshot persistence optional initially through post-save capture or a debug flag.
