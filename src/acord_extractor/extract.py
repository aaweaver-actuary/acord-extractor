from pathlib import Path

from .models import FormTemplate, ExtractionResult, FieldExtraction
from .preview import preview_template


def load_template(path: Path) -> FormTemplate:
    return FormTemplate.model_validate_json(path.read_text())


def extract_pdf(pdf_path: Path, template: FormTemplate) -> ExtractionResult:
    extracted: list[FieldExtraction] = []

    preview_by_id = {
        preview.field_id: preview for preview in preview_template(pdf_path, template)
    }
    for field in template.fields:
        assert field.field_type is not None
        assert field.extraction_method is not None
        preview = preview_by_id[field.id]
        if preview.status == "unsupported_method":
            raise ValueError(
                f"Unsupported extraction combination: {field.field_type}/{field.extraction_method}"
            )

        if field.field_type == "checkbox":
            value = bool(preview.normalized_text)
        else:
            value = preview.normalized_text

        if preview.status == "ok":
            confidence = 1.0
        elif preview.status == "low_text_density":
            confidence = 0.4
        elif preview.status == "anchor_drift":
            confidence = 0.2
        else:
            confidence = 0.0

        extracted.append(
            FieldExtraction(
                field_id=field.id,
                field_name=field.name,
                value=value,
                confidence=confidence,
                page=field.page,
                bbox=preview.bbox,
                field_type=field.field_type,
                extraction_method=field.extraction_method,
            )
        )

    return ExtractionResult(
        form_id=template.form_id,
        template_version=template.template_version,
        fields=extracted,
    )
