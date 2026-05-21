from __future__ import annotations

import re
from pathlib import Path

import fitz

from .models import FieldPreview, FieldTemplate, FormTemplate
from .render import clamp_bbox_to_page
from .validation import validate_template


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
    dark_pixels = 0
    total_pixels = pixmap.width * pixmap.height
    for index in range(0, len(pixels), channel_count):
        red = pixels[index]
        green = pixels[index + 1] if channel_count > 1 else red
        blue = pixels[index + 2] if channel_count > 2 else red
        luminance = (red + green + blue) / 3
        if luminance < 180:
            dark_pixels += 1
    return (dark_pixels / max(total_pixels, 1)) >= 0.05


def _normalize_preview_text(raw_text: str, field: FieldTemplate) -> str:
    normalized = raw_text
    if field.options.trim:
        normalized = normalized.strip()
    if field.options.collapse_whitespace:
        normalized = re.sub(r"\s+", " ", normalized).strip()
    if field.options.exclude_label_text and field.label:
        label = re.sub(r"\s+", " ", field.label).strip()
        if normalized.lower().startswith(label.lower()):
            remainder = normalized[len(label) :].lstrip(" :-")
            if remainder:
                normalized = remainder
    return normalized


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

    previews: list[FieldPreview] = []
    for field in template.fields:
        page = doc[field.page - 1]
        bbox = clamp_bbox_to_page(page, field.bbox, field.padding)

        if field.extraction_method == "embedded_text" and field.field_type in {
            "text",
            "multiline_text",
            "date",
            "money",
            "phone",
            "radio",
            "table_region",
        }:
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
