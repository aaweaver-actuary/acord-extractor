from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
from typing import cast

import fitz
import pytest
from pydantic import ValidationError
from typer.testing import CliRunner

from acord_extractor.cli import app as cli_app
from acord_extractor.extract import extract_pdf, load_template
from acord_extractor.models import FieldPreview, FormTemplate
from acord_extractor.preview import extract_checkbox, extract_textbox
from acord_extractor.recipe_io import dump_recipe_json, load_recipe, save_recipe


REPO_ROOT = Path(__file__).resolve().parents[2]
SAMPLE_FIXTURE = REPO_ROOT / "sample-pdf-map.json"
SAMPLE_RECIPE_FIXTURE = REPO_ROOT / "data" / "sample" / "acord-125.recipe.json"


def make_recipe() -> dict:
    return {
        "schema_version": "1.0",
        "form_id": "ACORD_125",
        "template_version": "v1",
        "template_state": "draft",
        "page_rotations": [0],
        "page_sizes": [[612, 792]],
        "fields": [
            {
                "name": "applicant_name",
                "label": "Applicant Name",
                "page": 1,
                "bbox": [72, 120, 320, 145],
                "source_page_size": [612, 792],
                "field_type": "text",
                "extraction_method": "embedded_text",
            }
        ],
    }


def test_form_template_accepts_canonical_recipe_shape() -> None:
    payload = make_recipe()
    payload["template_state"] = "validated"
    payload["anchors"] = [
        {
            "name": "form_title",
            "page": 1,
            "expected_text": "COMMERCIAL INSURANCE APPLICATION",
            "match_type": "contains",
            "min_similarity": 0.9,
            "bbox": [200, 20, 500, 45],
        }
    ]

    template = FormTemplate.model_validate(payload)

    assert template.schema_version == "1.0"
    assert template.template_state == "validated"
    assert template.fields[0].coordinate_space == "pdf_points_top_left"
    assert template.fields[0].source_page_size == (612.0, 792.0)
    assert template.anchors[0].expected_text == "COMMERCIAL INSURANCE APPLICATION"


def test_form_template_migrates_legacy_sample_fixture() -> None:
    template = FormTemplate.model_validate(json.loads(SAMPLE_FIXTURE.read_text()))

    assert template.template_version == "sample_v1"
    assert template.fields[0].id == "fld_applicant_name_3b5cbc3a4f"
    assert template.fields[0].label == "applicant_name"
    assert template.fields[0].field_type == "text"
    assert template.fields[0].extraction_method == "embedded_text"


def test_load_template_reads_json_from_disk() -> None:
    template = load_template(SAMPLE_FIXTURE)

    assert template.form_id == "ACORD_125"
    assert template.template_version == "sample_v1"


def test_load_recipe_reads_canonical_sample_recipe() -> None:
    recipe = load_recipe(SAMPLE_RECIPE_FIXTURE)

    assert recipe.template_state == "draft"
    assert len(recipe.fields) == 1
    assert recipe.fields[0].name == "field_1_01"
    assert recipe.anchors == []


def test_recipe_io_round_trip_is_idempotent(tmp_path: Path) -> None:
    recipe = load_recipe(SAMPLE_RECIPE_FIXTURE)
    recipe_path = tmp_path / "round-trip.recipe.json"

    saved = save_recipe(recipe_path, recipe)

    assert saved.form_id == "ACORD_125"
    assert load_recipe(recipe_path) == recipe
    assert recipe_path.read_text() == dump_recipe_json(recipe)


def test_legacy_checkbox_method_infers_checkbox_field_type() -> None:
    payload = make_recipe()
    del payload["fields"][0]["field_type"]
    del payload["fields"][0]["extraction_method"]
    payload["fields"][0]["method"] = "checkbox_image"
    payload["fields"][0]["label"] = "Accepted"

    template = FormTemplate.model_validate(payload)

    assert template.fields[0].field_type == "checkbox"
    assert template.fields[0].extraction_method == "checkbox_image"


def test_missing_field_type_without_legacy_method_fails_fast() -> None:
    payload = make_recipe()
    del payload["fields"][0]["field_type"]
    del payload["fields"][0]["extraction_method"]

    with pytest.raises(
        ValidationError,
        match="field_type is required when it cannot be inferred from legacy data",
    ):
        FormTemplate.model_validate(payload)


def test_form_template_rejects_duplicate_field_ids() -> None:
    payload = make_recipe()
    duplicate_field = deepcopy(payload["fields"][0])
    payload["fields"] = [
        {**payload["fields"][0], "id": "fld_duplicate"},
        {**duplicate_field, "name": "other_name", "id": "fld_duplicate"},
    ]

    with pytest.raises(ValidationError, match="field ids must be unique"):
        FormTemplate.model_validate(payload)


def test_validated_templates_require_anchors() -> None:
    payload = make_recipe()
    payload["template_state"] = "validated"

    with pytest.raises(
        ValidationError, match="validated templates must include at least one anchor"
    ):
        FormTemplate.model_validate(payload)


def test_field_template_rejects_invalid_bbox() -> None:
    payload = make_recipe()
    payload["fields"][0]["bbox"] = [320, 145, 72, 120]

    with pytest.raises(ValidationError, match="bbox must use increasing coordinates"):
        FormTemplate.model_validate(payload)


def test_table_metadata_is_reserved_for_table_region_fields() -> None:
    payload = make_recipe()
    payload["fields"][0]["columns"] = [{"name": "col_a", "bbox": [72, 120, 100, 145]}]

    with pytest.raises(
        ValidationError, match="table metadata is only valid for table_region fields"
    ):
        FormTemplate.model_validate(payload)


def test_table_region_accepts_columns_with_directions() -> None:
    payload = make_recipe()
    payload["fields"][0]["field_type"] = "table_region"
    payload["fields"][0]["row_direction"] = "vertical"
    payload["fields"][0]["column_direction"] = "horizontal"
    payload["fields"][0]["columns"] = [{"name": "col_a", "bbox": [72, 120, 100, 145]}]

    template = FormTemplate.model_validate(payload)

    assert template.fields[0].field_type == "table_region"
    assert template.fields[0].columns[0].name == "col_a"


def test_page_sizes_must_be_positive() -> None:
    payload = make_recipe()
    payload["page_sizes"] = [[612, 0]]

    with pytest.raises(ValidationError, match="page size values must be positive"):
        FormTemplate.model_validate(payload)


def test_extract_textbox_strips_page_text() -> None:
    class FakePage:
        def get_textbox(self, rect: object) -> str:
            return "  ABC Plumbing LLC\n"

    page = cast(fitz.Page, FakePage())

    assert extract_textbox(page, (72, 120, 320, 145)) == "ABC Plumbing LLC"


@pytest.mark.parametrize(
    ("samples", "expected"),
    [
        (bytes([0, 0, 0] + [255, 255, 255] * 3), True),
        (bytes([255, 255, 255] * 4), False),
    ],
)
def test_extract_checkbox_uses_dark_pixel_ratio(samples: bytes, expected: bool) -> None:
    class FakePixmap:
        def __init__(self, raw_samples: bytes) -> None:
            self.samples = raw_samples
            self.n = 3
            self.width = 2
            self.height = 2

    class FakePage:
        def get_pixmap(self, clip: object, matrix: object, alpha: bool) -> FakePixmap:
            return FakePixmap(samples)

    page = cast(fitz.Page, FakePage())

    assert extract_checkbox(page, (72, 120, 320, 145)) is expected


def test_extract_pdf_uses_canonical_field_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    template = FormTemplate.model_validate(json.loads(SAMPLE_FIXTURE.read_text()))

    class FakePage:
        rect = fitz.Rect(0, 0, 612, 792)

    class FakeDocument:
        def __getitem__(self, index: int) -> object:
            assert index == 0
            return FakePage()

    monkeypatch.setattr("acord_extractor.preview.fitz.open", lambda _: FakeDocument())
    monkeypatch.setattr(
        "acord_extractor.preview.extract_textbox", lambda page, bbox: "ABC Plumbing LLC"
    )

    result = extract_pdf(Path("dummy.pdf"), template)

    assert result.template_version == "sample_v1"
    assert result.fields[0].field_id == template.fields[0].id
    assert result.fields[0].field_name == "applicant_name"
    assert result.fields[0].field_type == "text"
    assert result.fields[0].extraction_method == "embedded_text"
    assert result.fields[0].value == "ABC Plumbing LLC"


def test_extract_pdf_handles_checkbox_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = make_recipe()
    payload["fields"][0]["field_type"] = "checkbox"
    del payload["fields"][0]["extraction_method"]
    template = FormTemplate.model_validate(payload)

    class FakePage:
        rect = fitz.Rect(0, 0, 612, 792)

    class FakeDocument:
        def __getitem__(self, index: int) -> object:
            assert index == 0
            return FakePage()

    monkeypatch.setattr("acord_extractor.preview.fitz.open", lambda _: FakeDocument())
    monkeypatch.setattr(
        "acord_extractor.preview.extract_checkbox", lambda page, bbox: True
    )

    result = extract_pdf(Path("dummy.pdf"), template)

    assert result.fields[0].value is True
    assert result.fields[0].extraction_method == "checkbox_image"


def test_extract_pdf_rejects_unsupported_field_method_combinations(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = make_recipe()
    payload["fields"][0]["field_type"] = "checkbox"
    payload["fields"][0]["extraction_method"] = "embedded_text"
    template = FormTemplate.model_validate(payload)

    class FakePage:
        rect = fitz.Rect(0, 0, 612, 792)

    class FakeDocument:
        def __getitem__(self, index: int) -> object:
            assert index == 0
            return FakePage()

    monkeypatch.setattr("acord_extractor.preview.fitz.open", lambda _: FakeDocument())

    with pytest.raises(ValueError, match="Unsupported extraction combination"):
        extract_pdf(Path("dummy.pdf"), template)


def test_field_preview_uses_coarse_status_shape() -> None:
    preview = FieldPreview(
        field_id="fld_applicant_name_3b5cbc3a4f",
        field_name="applicant_name",
        bbox=(72, 120, 320, 145),
        raw_extracted_text="ABC Plumbing LLC",
        normalized_text="ABC Plumbing LLC",
        status="ok",
        status_reason=["embedded_text_present"],
        template_version="v1",
    )

    assert preview.status == "ok"
    assert preview.status_reason == ["embedded_text_present"]


def test_cli_help_lists_mvp_commands() -> None:
    result = CliRunner().invoke(cli_app, ["--help"])

    assert result.exit_code == 0
    assert "preview" in result.output
    assert "validate-template" in result.output
