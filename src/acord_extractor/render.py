from __future__ import annotations

from hashlib import sha256
from pathlib import Path

import fitz

from .models import (
    Bbox,
    InformationalPdfMetadata,
    Padding,
    PdfDocumentInfo,
    PdfPageInfo,
)


def clamp_bbox_to_page(
    page: fitz.Page, bbox: Bbox, padding: Padding | None = None
) -> Bbox:
    left, top, right, bottom = bbox
    if padding is not None:
        left -= padding.left
        top -= padding.top
        right += padding.right
        bottom += padding.bottom

    page_rect = page.rect
    return (
        max(page_rect.x0, left),
        max(page_rect.y0, top),
        min(page_rect.x1, right),
        min(page_rect.y1, bottom),
    )


def get_pdf_document_info(pdf_path: Path) -> PdfDocumentInfo:
    pdf_bytes = pdf_path.read_bytes()
    doc = fitz.open(pdf_path)
    metadata = doc.metadata or {}
    pages = [
        PdfPageInfo(
            page=index + 1,
            width=doc[index].rect.width,
            height=doc[index].rect.height,
            rotation=doc[index].rotation,
        )
        for index in range(len(doc))
    ]
    return PdfDocumentInfo(
        page_count=len(doc),
        pages=pages,
        metadata=InformationalPdfMetadata(
            sha256=sha256(pdf_bytes).hexdigest(),
            producer=metadata.get("producer"),
            creator=metadata.get("creator"),
        ),
    )


def render_page_png(pdf_path: Path, page_number: int, scale: float = 1.5) -> bytes:
    doc = fitz.open(pdf_path)
    page = doc[page_number - 1]
    pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    return pixmap.tobytes("png")
