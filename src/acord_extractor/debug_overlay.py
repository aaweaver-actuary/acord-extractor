from __future__ import annotations

from pathlib import Path

import fitz

from .models import FormTemplate


def export_debug_overlay(
    pdf_path: Path, template: FormTemplate, output_path: Path
) -> Path:
    doc = fitz.open(pdf_path)
    field_color = (0.1, 0.45, 0.85)
    anchor_color = (0.1, 0.65, 0.25)

    for field in template.fields:
        page = doc[field.page - 1]
        rect = fitz.Rect(*field.bbox)
        page.draw_rect(rect, color=field_color, width=1.2)
        page.insert_text(
            (rect.x0, max(10, rect.y0 - 4)), field.name, fontsize=6, color=field_color
        )

    for anchor in template.anchors:
        page = doc[anchor.page - 1]
        rect = fitz.Rect(*anchor.bbox)
        page.draw_rect(rect, color=anchor_color, width=1.0)
        page.insert_text(
            (rect.x0, max(10, rect.y0 - 4)),
            f"anchor:{anchor.name}",
            fontsize=6,
            color=anchor_color,
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(output_path)
    return output_path
