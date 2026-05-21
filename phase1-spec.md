# Phase 1 ACORD PDF Extraction Spec

## Goal

Build a deterministic extraction pipeline for standardized ACORD PDFs using embedded PDF text and coordinate-based field templates.

Phase 1 should answer:

> Can we reliably extract known fields from known ACORD form versions by defining rectangular field boxes once and reusing them?

This phase does **not** attempt generic document understanding. It assumes the form layout is stable.

---

# 1. Scope

## In scope

- Load ACORD PDFs.
- Identify form type/version manually or by simple text detection.
- Render PDF pages for visual template setup.
- Allow a user to draw/select field rectangles.
- Save those rectangles as a reusable JSON template.
- Extract text from known field rectangles.
- Detect simple checkbox values.
- Emit structured JSON output.
- Validate extracted output with Pydantic.
- Include source metadata for every extracted field.

## Out of scope

- Full OCR for scanned forms.
- Handwriting recognition.
- LLM-based extraction.
- Generic extraction from arbitrary PDFs.
- Fully automated template creation.
- Human review UI.
- Complex table extraction.

---

# 2. Recommended Stack

## Core dependencies

```bash
pip install pymupdf pydantic typer matplotlib pillow opencv-python pytest
```

## Purpose of each dependency

```text
pymupdf        PDF rendering, embedded text extraction, rectangle extraction
pydantic       template schema and extracted output validation
typer          command-line interface
matplotlib     simple visual coordinate picker
pillow         image handling
opencv-python  checkbox detection
pytest         tests
```

---

# 3. Repository Layout

```text
acord_extractor/
  pyproject.toml
  README.md

  templates/
    acord_125_sample.json

  data/
    sample/
      acord_125_sample.pdf

  src/
    acord_extractor/
      __init__.py
      models.py
      template_io.py
      render.py
      coordinate_picker.py
      extract.py
      checkbox.py
      cli.py

  tests/
    test_template_schema.py
    test_bbox_validation.py
    test_text_extraction.py
```

---

# 4. Core Concepts

## PDF coordinate system

Use PyMuPDF coordinates.

```text
x0 = left
y0 = top
x1 = right
y1 = bottom
```

Bounding box format:

```json
[72.0, 120.0, 320.0, 145.0]
```

Meaning:

```text
left = 72.0
top = 120.0
right = 320.0
bottom = 145.0
```

All coordinates should be stored in **PDF points**, not image pixels.

---

# 5. Template Format

Each ACORD form/version gets one template file.

Example:

```json
{
  "form_id": "ACORD_125",
  "version": "sample_v1",
  "description": "Initial manually mapped ACORD 125 template",
  "fields": [
    {
      "name": "applicant_name",
      "label": "Applicant Name",
      "page": 1,
      "type": "text",
      "bbox": [72.0, 120.0, 320.0, 145.0],
      "required": true
    },
    {
      "name": "mailing_address",
      "label": "Mailing Address",
      "page": 1,
      "type": "multiline_text",
      "bbox": [72.0, 145.0, 420.0, 190.0],
      "required": false
    },
    {
      "name": "corporation_checkbox",
      "label": "Corporation",
      "page": 1,
      "type": "checkbox",
      "bbox": [80.0, 410.0, 92.0, 422.0],
      "required": false
    }
  ]
}
```

---

# 6. Pydantic Models

## Template schema

```python
from typing import Literal
from pydantic import BaseModel, Field


FieldType = Literal[
    "text",
    "multiline_text",
    "checkbox",
]


class FieldTemplate(BaseModel):
    name: str
    label: str
    page: int = Field(ge=1)
    type: FieldType
    bbox: tuple[float, float, float, float]
    required: bool = False


class FormTemplate(BaseModel):
    form_id: str
    version: str
    description: str
    fields: list[FieldTemplate]
```

## Extraction result schema

```python
from typing import Literal
from pydantic import BaseModel


class FieldExtraction(BaseModel):
    name: str
    value: str | bool | None
    confidence: float
    page: int
    bbox: tuple[float, float, float, float]
    method: Literal[
        "embedded_text",
        "checkbox_image",
    ]


class ExtractionResult(BaseModel):
    form_id: str
    version: str
    fields: list[FieldExtraction]
```

---

# 7. Coordinate Acquisition Workflow

## Problem

The user has a PDF but does not yet know the coordinates for each field.

## Solution

Build a coordinate picker tool.

Workflow:

```text
1. Render PDF page as image
2. Display image
3. User drags rectangle around field
4. Tool converts image coordinates back to PDF coordinates
5. Tool prompts for field name/type
6. Tool saves field definition into template JSON
```

---

# 8. Coordinate Picker Implementation

## Coordinate picker script

```python
from pathlib import Path
import json

import fitz
import matplotlib.pyplot as plt
from matplotlib.widgets import RectangleSelector


PDF_PATH = Path("sample_acord.pdf")
PAGE_NUM = 0
ZOOM = 2.0

OUTPUT_TEMPLATE = Path("generated_template.json")


fields = []


def render_page():
    doc = fitz.open(PDF_PATH)
    page = doc[PAGE_NUM]

    matrix = fitz.Matrix(ZOOM, ZOOM)

    pix = page.get_pixmap(
        matrix=matrix,
        alpha=False,
    )

    image_path = Path("_preview.png")
    pix.save(image_path)

    return image_path


def on_select(eclick, erelease):
    x0 = min(eclick.xdata, erelease.xdata)
    y0 = min(eclick.ydata, erelease.ydata)

    x1 = max(eclick.xdata, erelease.xdata)
    y1 = max(eclick.ydata, erelease.ydata)

    pdf_bbox = [
        round(x0 / ZOOM, 2),
        round(y0 / ZOOM, 2),
        round(x1 / ZOOM, 2),
        round(y1 / ZOOM, 2),
    ]

    print("\nPDF bbox:", pdf_bbox)

    name = input("Field name: ").strip()
    field_type = input(
        "Field type [text|multiline_text|checkbox]: "
    ).strip()

    field = {
        "name": name,
        "label": name,
        "page": PAGE_NUM + 1,
        "type": field_type,
        "bbox": pdf_bbox,
        "required": False,
    }

    fields.append(field)

    OUTPUT_TEMPLATE.write_text(
        json.dumps(
            {
                "form_id": "ACORD_125",
                "version": "draft",
                "description": "Generated template",
                "fields": fields,
            },
            indent=2,
        )
    )

    print("Saved field.")


def main():
    image_path = render_page()

    img = plt.imread(image_path)

    fig, ax = plt.subplots(figsize=(12, 16))

    ax.imshow(img)

    RectangleSelector(
        ax,
        on_select,
        useblit=True,
        button=[1],
        minspanx=5,
        minspany=5,
        interactive=True,
    )

    plt.title("Draw field rectangles")

    plt.show()


if __name__ == "__main__":
    main()
```

---

# 9. Text Extraction Logic

## Rectangle extraction

```python
import fitz


def extract_textbox(
    page: fitz.Page,
    bbox: tuple[float, float, float, float],
) -> str:
    rect = fitz.Rect(*bbox)

    return page.get_textbox(rect).strip()
```

---

# 10. Checkbox Detection

## Initial simple approach

Checkboxes often require image analysis.

Phase 1 can use a simple dark-pixel heuristic.

Workflow:

```text
1. Render checkbox rectangle
2. Convert to grayscale
3. Threshold image
4. Count dark pixels
5. If enough dark pixels -> checked
```

## Example implementation

```python
import fitz
import cv2
import numpy as np


def detect_checkbox(
    page: fitz.Page,
    bbox: tuple[float, float, float, float],
) -> bool:
    rect = fitz.Rect(*bbox)

    pix = page.get_pixmap(
        clip=rect,
        dpi=300,
    )

    img = np.frombuffer(
        pix.samples,
        dtype=np.uint8,
    ).reshape(
        pix.height,
        pix.width,
        pix.n,
    )

    gray = cv2.cvtColor(
        img,
        cv2.COLOR_RGB2GRAY,
    )

    _, thresh = cv2.threshold(
        gray,
        180,
        255,
        cv2.THRESH_BINARY_INV,
    )

    dark_pixels = np.sum(thresh > 0)

    return dark_pixels > 50
```

---

# 11. Extraction Pipeline

## Workflow

```text
PDF
 -> load template
 -> iterate fields
 -> extract field by bbox
 -> normalize values
 -> validate output
 -> emit JSON
```

---

# 12. Extraction Runner

```python
from pathlib import Path
import fitz

from acord_extractor.models import (
    ExtractionResult,
    FieldExtraction,
)


def extract_pdf(
    pdf_path: Path,
    template,
) -> ExtractionResult:

    doc = fitz.open(pdf_path)

    extracted_fields = []

    for field in template.fields:
        page = doc[field.page - 1]

        if field.type in {
            "text",
            "multiline_text",
        }:
            value = extract_textbox(
                page,
                field.bbox,
            )

            method = "embedded_text"

        elif field.type == "checkbox":
            value = detect_checkbox(
                page,
                field.bbox,
            )

            method = "checkbox_image"

        else:
            raise ValueError(field.type)

        extracted_fields.append(
            FieldExtraction(
                name=field.name,
                value=value,
                confidence=1.0,
                page=field.page,
                bbox=field.bbox,
                method=method,
            )
        )

    return ExtractionResult(
        form_id=template.form_id,
        version=template.version,
        fields=extracted_fields,
    )
```

---

# 13. CLI

```python
import typer
from pathlib import Path

app = typer.Typer()


@app.command()
def extract(
    pdf: Path,
    template: Path,
    out: Path,
):
    ...
```

Example usage:

```bash
python -m acord_extractor.cli extract \
  --pdf data/sample/acord_125.pdf \
  --template templates/acord_125_sample.json \
  --out extracted.json
```

---

# 14. Expected Output

```json
{
  "form_id": "ACORD_125",
  "version": "sample_v1",
  "fields": [
    {
      "name": "applicant_name",
      "value": "ABC Plumbing LLC",
      "confidence": 1.0,
      "page": 1,
      "bbox": [72.0, 120.0, 320.0, 145.0],
      "method": "embedded_text"
    }
  ]
}
```

---

# 15. Validation Rules

## Minimum Phase 1 validation

```text
- bbox must have x0 < x1
- bbox must have y0 < y1
- required text fields cannot be blank
- page numbers must exist
- field names must be unique
```

---

# 16. Success Criteria

Phase 1 is successful if:

```text
- A user can visually define field boxes once
- Templates can be reused across matching forms
- 10-20 critical fields extract reliably
- Structured JSON output is stable
- No OCR is required for standard embedded-text forms
```

---

# 17. Recommended Initial Fields

Do not start with the entire form.

Start with:

```text
- agent_name
- agent_address

- has_accounts_receivable_valuable_paper_coverage (checkbox)
- has_boiler_and_machinery_coverage (checkbox)
- has_business_auto_coverage (checkbox)
- has_business_owners_coverage (checkbox)
- has_commercial_general_liability_coverage (checkbox)
- has_crime_coverage (checkbox)
- has_dealers_coverage (checkbox)
- has_electronic_data_processing_coverage (checkbox)
- has_equipment_floater_coverage (checkbox)
- has_garage_and_dealers_coverage (checkbox)
- has_glass_and_sign_coverage (checkbox)
- has_installation_builders_risk_coverage (checkbox)
- has_open_cargo_coverage (checkbox)
- has_property_coverage (checkbox)
- has_transportation_motor_truck_cargo_coverage (checkbox)
- has_truckers_motor_carrier_coverage (checkbox)
- has_umbrella_coverage (checkbox)
- has_yacht_coverage (checkbox)

- first_named_insured
- first_named_insured_mailing_address
- first_named_insured_gl_code
- first_named_insured_sic_code
- first_named_insured_naics_code
- first_named_insured_fein_or_ssn

- is_first_named_insured_a_corporation (checkbox)
(etc for individual/joint venture/not for profit/S corp)

```

---

# 18. Recommended Next Steps After Phase 1

## Phase 2

- automatic form detection
- confidence scoring
- review UI
- better checkbox detection
- fuzzy field validation

## Phase 3

- OCR fallback
- scanned form support
- page alignment correction
- version auto-matching

## Phase 4

- LLM consistency validation
- supplemental narrative extraction
- underwriting enrichment
- NAICS reasoning
- fraud/anomaly checks
```