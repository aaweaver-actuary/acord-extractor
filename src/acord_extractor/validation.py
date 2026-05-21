from __future__ import annotations

from difflib import SequenceMatcher
from pathlib import Path

import fitz

from .models import (
    Anchor,
    AnchorValidationResult,
    FormTemplate,
    TemplateValidationResult,
    ValidationSignal,
)
from .render import get_pdf_document_info


def _normalize_text(value: str) -> str:
    return " ".join(value.split())


def _display_form_id(form_id: str) -> str:
    return form_id.replace("_", " ")


def _bbox_center(bbox: tuple[float, float, float, float]) -> tuple[float, float]:
    x0, y0, x1, y1 = bbox
    return ((x0 + x1) / 2.0, (y0 + y1) / 2.0)


def _bbox_distance(
    left: tuple[float, float, float, float], right: tuple[float, float, float, float]
) -> float:
    lx, ly = _bbox_center(left)
    rx, ry = _bbox_center(right)
    return ((lx - rx) ** 2 + (ly - ry) ** 2) ** 0.5


def _find_best_anchor_match(page: fitz.Page, anchor: Anchor) -> AnchorValidationResult:
    expected_text = _normalize_text(anchor.expected_text)
    clip_text = _normalize_text(page.get_textbox(fitz.Rect(*anchor.bbox)))
    similarity = SequenceMatcher(None, clip_text.lower(), expected_text.lower()).ratio()

    if clip_text and (
        expected_text.lower() in clip_text.lower()
        or similarity >= anchor.min_similarity
    ):
        return AnchorValidationResult(
            name=anchor.name,
            page=anchor.page,
            expected_text=anchor.expected_text,
            matched_text=clip_text,
            similarity=max(
                similarity,
                1.0 if expected_text.lower() in clip_text.lower() else similarity,
            ),
            expected_bbox=anchor.bbox,
            matched_bbox=anchor.bbox,
            status="ok",
        )

    hits = page.search_for(anchor.expected_text)
    if hits:
        nearest = min(hits, key=lambda hit: _bbox_distance(anchor.bbox, tuple(hit)))
        nearest_bbox = tuple(nearest)
        matched_text = _normalize_text(page.get_textbox(nearest))
        similarity = SequenceMatcher(
            None, matched_text.lower(), expected_text.lower()
        ).ratio()
        status = "drift" if _bbox_distance(anchor.bbox, nearest_bbox) > 36.0 else "ok"
        return AnchorValidationResult(
            name=anchor.name,
            page=anchor.page,
            expected_text=anchor.expected_text,
            matched_text=matched_text,
            similarity=similarity,
            expected_bbox=anchor.bbox,
            matched_bbox=nearest_bbox,
            status=status if similarity >= anchor.min_similarity else "missing",
        )

    page_lines = [
        _normalize_text(line)
        for line in page.get_text("text").splitlines()
        if line.strip()
    ]
    if page_lines:
        matched_text = max(
            page_lines,
            key=lambda line: SequenceMatcher(
                None, line.lower(), expected_text.lower()
            ).ratio(),
        )
        similarity = SequenceMatcher(
            None, matched_text.lower(), expected_text.lower()
        ).ratio()
        return AnchorValidationResult(
            name=anchor.name,
            page=anchor.page,
            expected_text=anchor.expected_text,
            matched_text=matched_text,
            similarity=similarity,
            expected_bbox=anchor.bbox,
            status="missing",
        )

    return AnchorValidationResult(
        name=anchor.name,
        page=anchor.page,
        expected_text=anchor.expected_text,
        similarity=0.0,
        expected_bbox=anchor.bbox,
        status="missing",
    )


def validate_template(
    pdf_path: Path, template: FormTemplate
) -> TemplateValidationResult:
    info = get_pdf_document_info(pdf_path)
    doc = fitz.open(pdf_path)
    failures: list[str] = []
    warnings: list[str] = []
    strong_signals: list[ValidationSignal] = []
    medium_signals: list[ValidationSignal] = []
    weak_signals: list[ValidationSignal] = []

    form_id_text = _display_form_id(template.form_id)
    all_text = "\n".join(page.get_text("text") for page in doc)
    form_id_found = form_id_text in all_text
    strong_signals.append(
        ValidationSignal(
            name="form_id",
            strength="strong",
            status="ok" if form_id_found else "failed",
            detail=f"Expected visible form id '{form_id_text}'",
        )
    )
    if not form_id_found:
        failures.append("visible form id text not found in PDF")

    if template.form_edition:
        edition_found = template.form_edition in all_text
        strong_signals.append(
            ValidationSignal(
                name="form_edition",
                strength="strong",
                status="ok" if edition_found else "failed",
                detail=f"Expected visible form edition '{template.form_edition}'",
            )
        )
        if not edition_found:
            failures.append("form edition text not found in PDF")

    page_count_ok = (
        template.expected_page_count is None
        or template.expected_page_count == info.page_count
    )
    strong_signals.append(
        ValidationSignal(
            name="expected_page_count",
            strength="strong",
            status="ok" if page_count_ok else "failed",
            detail=f"Expected {template.expected_page_count or info.page_count} page(s), found {info.page_count}",
        )
    )
    if not page_count_ok:
        failures.append("page count does not match template expectation")

    for anchor_text in template.anchor_text:
        found = anchor_text in all_text
        strong_signals.append(
            ValidationSignal(
                name=f"anchor_text:{anchor_text}",
                strength="strong",
                status="ok" if found else "failed",
                detail=f"Expected anchor text '{anchor_text}'",
            )
        )
        if not found:
            failures.append(f"anchor text not found: {anchor_text}")

    if template.page_sizes:
        page_sizes_ok = len(template.page_sizes) == len(info.pages) and all(
            abs(expected[0] - page.width) <= 2.0
            and abs(expected[1] - page.height) <= 2.0
            for expected, page in zip(template.page_sizes, info.pages, strict=False)
        )
        medium_signals.append(
            ValidationSignal(
                name="page_sizes",
                strength="medium",
                status="ok" if page_sizes_ok else "warning",
                detail="Saved page sizes are within 2 PDF points of runtime geometry",
            )
        )
        if not page_sizes_ok:
            warnings.append("saved page sizes differ from runtime PDF geometry")

    if template.page_rotations:
        runtime_rotations = [page.rotation for page in info.pages]
        rotations_ok = template.page_rotations == runtime_rotations
        medium_signals.append(
            ValidationSignal(
                name="page_rotations",
                strength="medium",
                status="ok" if rotations_ok else "warning",
                detail=f"Saved rotations {template.page_rotations} vs runtime {runtime_rotations}",
            )
        )
        if not rotations_ok:
            warnings.append("saved page rotations differ from runtime PDF geometry")

    anchor_results = [
        _find_best_anchor_match(doc[anchor.page - 1], anchor)
        for anchor in template.anchors
    ]
    for result in anchor_results:
        if result.status == "missing":
            failures.append(f"anchor missing: {result.name}")
        elif result.status == "drift":
            warnings.append(f"anchor drift detected: {result.name}")

    metadata = template.informational_pdf_metadata
    if metadata.sha256:
        weak_signals.append(
            ValidationSignal(
                name="sha256",
                strength="weak",
                status="info" if metadata.sha256 == info.metadata.sha256 else "warning",
                detail="Saved hash is informational only",
            )
        )
    if metadata.producer:
        weak_signals.append(
            ValidationSignal(
                name="producer",
                strength="weak",
                status="info"
                if metadata.producer == info.metadata.producer
                else "warning",
                detail="Saved producer is informational only",
            )
        )
    if metadata.creator:
        weak_signals.append(
            ValidationSignal(
                name="creator",
                strength="weak",
                status="info"
                if metadata.creator == info.metadata.creator
                else "warning",
                detail="Saved creator is informational only",
            )
        )

    reusable = not failures and not any(
        result.status == "drift" for result in anchor_results
    )
    return TemplateValidationResult(
        form_id=template.form_id,
        template_version=template.template_version,
        template_state=template.template_state,
        reusable=reusable,
        failures=failures,
        warnings=warnings,
        strong_signals=strong_signals,
        medium_signals=medium_signals,
        weak_signals=weak_signals,
        anchor_results=anchor_results,
        pdf_page_count=info.page_count,
        pdf_page_sizes=[(page.width, page.height) for page in info.pages],
        pdf_page_rotations=[page.rotation for page in info.pages],
    )
