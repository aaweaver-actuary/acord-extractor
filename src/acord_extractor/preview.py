from __future__ import annotations

import re
from pathlib import Path

import fitz

from .models import FieldPreview, FieldTemplate, FormTemplate
from .render import clamp_bbox_to_page
from .validation import validate_template


TEXT_PREVIEW_FIELD_TYPES = {
    "text",
    "multiline_text",
    "date",
    "money",
    "phone",
    "radio",
    "table_region",
}


def extract_textbox(page: fitz.Page, bbox: tuple[float, float, float, float]) -> str:
    rect = fitz.Rect(*bbox)
    return page.get_textbox(rect).strip()


def extract_checkbox(page: fitz.Page, bbox: tuple[float, float, float, float]) -> bool:
    pixmap = page.get_pixmap(
        clip=fitz.Rect(*bbox), matrix=fitz.Matrix(3, 3), alpha=False
    )
    pixels = pixmap.samples
    if not pixels:
        return False
    channel_count = pixmap.n
    left = 0
    top = 0
    right = pixmap.width
    bottom = pixmap.height

    if pixmap.width >= 4 and pixmap.height >= 4:
        # Ignore the printed box border so empty boxes do not look marked.
        margin_x = max(1, pixmap.width // 4)
        margin_y = max(1, pixmap.height // 4)
        left = margin_x
        top = margin_y
        right = max(left + 1, pixmap.width - margin_x)
        bottom = max(top + 1, pixmap.height - margin_y)

    dark_pixels = 0
    total_pixels = max((right - left) * (bottom - top), 1)

    for row in range(top, bottom):
        row_offset = row * pixmap.width * channel_count
        for column in range(left, right):
            index = row_offset + (column * channel_count)
            red = pixels[index]
            green = pixels[index + 1] if channel_count > 1 else red
            blue = pixels[index + 2] if channel_count > 2 else red
            luminance = (red + green + blue) / 3
            if luminance < 180:
                dark_pixels += 1

    return (dark_pixels / max(total_pixels, 1)) >= 0.05


def _is_token_subsequence(prefix_tokens: list[str], label_tokens: list[str]) -> bool:
    label_index = 0
    for token in prefix_tokens:
        while label_index < len(label_tokens) and label_tokens[label_index] != token:
            label_index += 1
        if label_index == len(label_tokens):
            return False
        label_index += 1
    return True


def _strip_label_prefix(normalized: str, field: FieldTemplate) -> str:
    if not normalized or not field.options.exclude_label_text or not field.label:
        return normalized

    label = re.sub(r"\s+", " ", field.label).strip()
    if normalized.lower().startswith(label.lower()):
        remainder = normalized[len(label) :].lstrip(" :-\n\t")
        if remainder:
            return remainder

    label_tokens = re.findall(r"[a-z0-9]+", field.label.lower())
    raw_tokens = normalized.split()
    cleaned_tokens = [re.sub(r"[^a-z0-9]+", "", token.lower()) for token in raw_tokens]
    max_prefix = min(len(cleaned_tokens), len(label_tokens))

    for prefix_length in range(max_prefix, 1, -1):
        prefix_tokens = cleaned_tokens[:prefix_length]
        if not all(prefix_tokens):
            continue
        if _is_token_subsequence(prefix_tokens, label_tokens):
            remainder = " ".join(raw_tokens[prefix_length:]).lstrip(" :-\n\t")
            if remainder:
                return remainder
            break

    return normalized


def _legacy_bbox_to_top_left(
    page: fitz.Page, field: FieldTemplate
) -> tuple[float, float, float, float]:
    source_width, source_height = field.source_page_size or (
        page.rect.width,
        page.rect.height,
    )
    x_scale = page.rect.width / source_width
    y_scale = page.rect.height / source_height
    left, top, right, bottom = field.bbox

    return (
        page.rect.x0 + (left * x_scale),
        page.rect.y0 + ((source_height - bottom) * y_scale),
        page.rect.x0 + (right * x_scale),
        page.rect.y0 + ((source_height - top) * y_scale),
    )


def _text_candidate_score(normalized: str | None, field: FieldTemplate) -> float:
    if not normalized:
        return 0.0

    compact = re.sub(r"\s+", "", normalized)
    score = 1.0
    if len(compact) >= 3:
        score += 1.0

    context = " ".join(filter(None, [field.name, field.label])).lower()
    stripped = normalized.strip()

    if re.search(r"date|effective|eff", context):
        if re.fullmatch(r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}", stripped):
            score += 3.0
        else:
            score -= 1.0

    if re.search(r"premium|amount|total|limit|deductible", context):
        if re.fullmatch(r"\$?\d[\d,]*(?:\.\d{2})?", compact):
            score += 3.0
        elif re.search(r"\d", compact):
            score += 1.0
        else:
            score -= 1.0

    if re.search(r"code", context):
        if re.fullmatch(r"[A-Z0-9-]+", stripped.upper()):
            score += 2.0
        elif re.fullmatch(r"[A-Z0-9 -]+", stripped.upper()):
            score += 0.5

    if field.field_type == "multiline_text" and "\n" in normalized:
        score += 1.0

    return score


def _should_use_legacy_bboxes(doc: fitz.Document, template: FormTemplate) -> bool:
    text_fields = [
        field
        for field in template.fields
        if field.extraction_method == "embedded_text"
        and field.field_type in TEXT_PREVIEW_FIELD_TYPES
    ]
    if not text_fields:
        return False

    current_score = 0.0
    legacy_score = 0.0
    for field in text_fields:
        page = doc[field.page - 1]
        current_bbox = clamp_bbox_to_page(page, field.bbox, field.padding)
        legacy_bbox = clamp_bbox_to_page(
            page, _legacy_bbox_to_top_left(page, field), field.padding
        )

        current_score += _text_candidate_score(
            _normalize_preview_text(extract_textbox(page, current_bbox), field),
            field,
        )
        legacy_score += _text_candidate_score(
            _normalize_preview_text(extract_textbox(page, legacy_bbox), field),
            field,
        )

    return legacy_score > (current_score + 0.5)


def _normalize_preview_text(raw_text: str, field: FieldTemplate) -> str:
    normalized = raw_text
    if field.options.trim:
        normalized = normalized.strip()
    if field.options.collapse_whitespace and field.field_type != "multiline_text":
        normalized = re.sub(r"\s+", " ", normalized).strip()
    return _strip_label_prefix(normalized, field)


def preview_field(
    pdf_path: Path,
    template: FormTemplate,
    field_id: str,
) -> FieldPreview:
    previews = preview_template(pdf_path, template)
    for preview in previews:
        if preview.field_id == field_id:
            return preview
    raise KeyError(f"Unknown field id: {field_id}")


def preview_template(pdf_path: Path, template: FormTemplate) -> list[FieldPreview]:
    doc = fitz.open(pdf_path)
    validation = (
        validate_template(pdf_path, template)
        if (template.anchor_text or template.anchors)
        else None
    )
    anchor_drift = validation is not None and any(
        result.status == "drift" for result in validation.anchor_results
    )
    use_legacy_bboxes = _should_use_legacy_bboxes(doc, template)

    previews: list[FieldPreview] = []
    for field in template.fields:
        page = doc[field.page - 1]
        resolved_bbox = (
            _legacy_bbox_to_top_left(page, field) if use_legacy_bboxes else field.bbox
        )
        bbox = clamp_bbox_to_page(page, resolved_bbox, field.padding)

        if (
            field.extraction_method == "embedded_text"
            and field.field_type in TEXT_PREVIEW_FIELD_TYPES
        ):
            raw_text = extract_textbox(page, bbox)
            normalized = _normalize_preview_text(raw_text, field)
            if anchor_drift:
                status = "anchor_drift"
                reasons = ["anchor_alignment_uncertain"]
            elif not normalized:
                status = "empty"
                reasons = ["no_text_in_bbox"]
            elif len(re.sub(r"\s+", "", normalized)) < 3:
                status = "low_text_density"
                reasons = ["text_too_short"]
            else:
                status = "ok"
                reasons = ["embedded_text_present"]
            previews.append(
                FieldPreview(
                    field_id=field.id,
                    field_name=field.name,
                    bbox=bbox,
                    raw_extracted_text=raw_text or None,
                    normalized_text=normalized or None,
                    status=status,
                    status_reason=reasons,
                    template_version=template.template_version,
                )
            )
            continue

        if (
            field.extraction_method == "checkbox_image"
            and field.field_type == "checkbox"
        ):
            checked = extract_checkbox(page, bbox)
            previews.append(
                FieldPreview(
                    field_id=field.id,
                    field_name=field.name,
                    bbox=bbox,
                    normalized_text=checked,
                    status="ok" if checked else "empty",
                    status_reason=[
                        "checkbox_mark_detected"
                        if checked
                        else "checkbox_mark_not_detected"
                    ],
                    template_version=template.template_version,
                )
            )
            continue

        previews.append(
            FieldPreview(
                field_id=field.id,
                field_name=field.name,
                bbox=bbox,
                status="unsupported_method",
                status_reason=["unsupported_field_method_combination"],
                template_version=template.template_version,
            )
        )

    return previews
