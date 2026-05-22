from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import fitz
from fastapi.testclient import TestClient
import pytest
from typer.testing import CliRunner

from acord_extractor import main
from acord_extractor.api import app as api_app
from acord_extractor.cli import app as cli_app
from acord_extractor.debug_overlay import export_debug_overlay
from acord_extractor.extract import extract_pdf
from acord_extractor.models import FormTemplate
from acord_extractor.preview import preview_field, preview_template
from acord_extractor.recipe_io import load_recipe
from acord_extractor.render import get_pdf_document_info, render_page_png
from acord_extractor.validation import validate_template


REPO_ROOT = Path(__file__).resolve().parents[2]
SAMPLE_PDF = REPO_ROOT / "data" / "sample" / "acord-125.pdf"
SAMPLE_RECIPE = REPO_ROOT / "data" / "sample" / "acord-125.recipe.json"
CHECKBOX_MULTILINE_RECIPE = REPO_ROOT / "fixtures" / "test-checkbox-multiline-text.json"
EXPECTED_EXPANDED_SAMPLE_VALUES: dict[str, str | bool | None] = {
    "has_accounts_receivable_valuable_papers": False,
    "has_boiler_and_machinery_section": False,
    "has_business_auto_section": True,
    "has_bop_section": True,
    "has_gl_section": False,
    "has_crime_section": False,
    "has_dealers_section": False,
    "agent_name_address": "Jim Bob Agency\n123 Main St\nAnytown, OH 45123",
    "auto_premium": "1000",
    "bop_premium": "2000",
    "policy_eff_date": "1/1/2027",
    "policy_premium": "3000",
    "gl_class_code": "11111",
}
SAMPLE_RECIPE_FIELD_COUNT = len(EXPECTED_EXPANDED_SAMPLE_VALUES)


def mirror_recipe_to_legacy_bboxes(template: FormTemplate) -> FormTemplate:
    legacy_fields = []
    for field in template.fields:
        source_width, source_height = field.source_page_size or (612.0, 792.0)
        x0, y0, x1, y1 = field.bbox
        legacy_fields.append(
            field.model_copy(
                update={
                    "bbox": (
                        x0,
                        source_height - y1,
                        x1,
                        source_height - y0,
                    ),
                    "coordinate_space": "pdf_points_bottom_left_legacy",
                    "source_page_size": (source_width, source_height),
                }
            )
        )

    return template.model_copy(update={"fields": legacy_fields})


def make_validated_sample_template() -> FormTemplate:
    payload = load_recipe(SAMPLE_RECIPE).model_dump(mode="json")
    payload["template_state"] = "validated"
    payload["form_edition"] = "2011/09"
    payload["anchor_text"] = ["ACORD 125 (2011/09)"]
    payload["anchors"] = [
        {
            "name": "footer_tag",
            "page": 1,
            "expected_text": "ACORD 125 (2011/09)",
            "bbox": [21.6, 745.218, 107.0381, 754.6009],
        }
    ]
    return FormTemplate.model_validate(payload)


def test_get_pdf_document_info_reports_fixture_geometry() -> None:
    info = get_pdf_document_info(SAMPLE_PDF)

    assert info.page_count == 4
    assert [page.rotation for page in info.pages] == [0, 0, 0, 0]
    assert all(page.width == 612.0 and page.height == 792.0 for page in info.pages)
    assert (
        info.metadata.sha256
        == "aa08834f5045c088af296f9748eaf440397212bd3de095f0c8ec5b77d65b49bd"
    )


def test_render_page_png_returns_png_bytes() -> None:
    image = render_page_png(SAMPLE_PDF, 2, scale=1.0)

    assert image.startswith(b"\x89PNG\r\n\x1a\n")


def test_validate_template_accepts_canonical_sample_recipe() -> None:
    result = validate_template(SAMPLE_PDF, make_validated_sample_template())

    assert result.reusable is True
    assert result.failures == []
    assert all(anchor.status == "ok" for anchor in result.anchor_results)


def test_validate_template_reports_anchor_drift_when_anchor_moves() -> None:
    payload = make_validated_sample_template().model_dump(mode="json")
    payload["anchors"][0]["bbox"] = [300.0, 500.0, 400.0, 520.0]
    template = FormTemplate.model_validate(payload)

    result = validate_template(SAMPLE_PDF, template)

    assert result.reusable is False
    assert any(anchor.status == "drift" for anchor in result.anchor_results)
    assert any("anchor drift detected" in warning for warning in result.warnings)


def test_validate_template_reports_strong_medium_and_weak_failures() -> None:
    payload = make_validated_sample_template().model_dump(mode="json")
    payload["form_id"] = "ACORD_999"
    payload["form_edition"] = "2099/99"
    payload["expected_page_count"] = 99
    payload["anchor_text"] = ["NOT A REAL ANCHOR"]
    payload["anchors"][0]["expected_text"] = "NOT A REAL ANCHOR"
    payload["page_sizes"] = [[500.0, 500.0]] * 4
    payload["page_rotations"] = [90, 90, 90, 90]
    payload["informational_pdf_metadata"]["sha256"] = "deadbeef"
    payload["informational_pdf_metadata"]["producer"] = "unknown"
    payload["informational_pdf_metadata"]["creator"] = "unknown"
    template = FormTemplate.model_validate(payload)

    result = validate_template(SAMPLE_PDF, template)

    assert result.reusable is False
    assert any(signal.status == "failed" for signal in result.strong_signals)
    assert any(signal.status == "warning" for signal in result.medium_signals)
    assert any(signal.status == "warning" for signal in result.weak_signals)
    assert any(anchor.status == "missing" for anchor in result.anchor_results)


def test_preview_template_returns_saved_sample_field() -> None:
    previews = preview_template(SAMPLE_PDF, load_recipe(SAMPLE_RECIPE))

    assert len(previews) == SAMPLE_RECIPE_FIELD_COUNT
    assert {preview.field_name: preview.normalized_text for preview in previews} == (
        EXPECTED_EXPANDED_SAMPLE_VALUES
    )


def test_preview_template_accepts_legacy_app_produced_bboxes() -> None:
    legacy_recipe = mirror_recipe_to_legacy_bboxes(load_recipe(SAMPLE_RECIPE))

    previews = preview_template(SAMPLE_PDF, legacy_recipe)

    assert {preview.field_name: preview.normalized_text for preview in previews} == (
        EXPECTED_EXPANDED_SAMPLE_VALUES
    )


@pytest.mark.parametrize(
    ("field_name", "expected_value"),
    list(EXPECTED_EXPANDED_SAMPLE_VALUES.items()),
)
def test_preview_field_returns_expected_known_sample_values(
    field_name: str, expected_value: str | bool | None
) -> None:
    recipe = load_recipe(SAMPLE_RECIPE)
    field = next(field for field in recipe.fields if field.name == field_name)

    preview = preview_field(SAMPLE_PDF, recipe, field.id)

    assert preview.normalized_text == expected_value
    assert preview.status == (
        "empty" if expected_value is False or expected_value is None else "ok"
    )


def test_preview_field_raises_for_unknown_id() -> None:
    with pytest.raises(KeyError, match="Unknown field id"):
        preview_field(SAMPLE_PDF, load_recipe(SAMPLE_RECIPE), "missing-field")


def test_preview_template_covers_anchor_drift_and_checkbox_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "schema_version": "1.0",
        "form_id": "ACORD_125",
        "template_version": "v1",
        "template_state": "draft",
        "anchors": [
            {
                "name": "page_anchor",
                "page": 1,
                "expected_text": "anchor",
                "bbox": [0, 0, 10, 10],
            }
        ],
        "fields": [
            {
                "name": "drift_text",
                "page": 1,
                "bbox": [0, 0, 10, 10],
                "field_type": "text",
                "extraction_method": "embedded_text",
            },
            {
                "name": "checkbox_field",
                "page": 1,
                "bbox": [0, 0, 10, 10],
                "field_type": "checkbox",
                "extraction_method": "checkbox_image",
            },
        ],
    }
    template = FormTemplate.model_validate(payload)

    class FakePage:
        rect = fitz.Rect(0, 0, 100, 100)

        def get_textbox(self, rect: object) -> str:
            return "ignored"

        def get_pixmap(self, clip: object, matrix: object, alpha: bool) -> object:
            raise AssertionError("checkbox helper should be monkeypatched")

    class FakeDocument:
        def __getitem__(self, index: int) -> FakePage:
            return FakePage()

    monkeypatch.setattr("acord_extractor.preview.fitz.open", lambda _: FakeDocument())
    monkeypatch.setattr(
        "acord_extractor.preview.extract_textbox",
        lambda page, bbox: "Anchor drift text",
    )
    monkeypatch.setattr(
        "acord_extractor.preview.extract_checkbox", lambda page, bbox: True
    )
    monkeypatch.setattr(
        "acord_extractor.preview.validate_template",
        lambda pdf_path, inner_template: SimpleNamespace(
            anchor_results=[SimpleNamespace(status="drift")]
        ),
    )

    previews = preview_template(Path("dummy.pdf"), template)

    assert previews[0].status == "anchor_drift"
    assert previews[0].status_reason == ["anchor_alignment_uncertain"]
    assert previews[1].status == "ok"
    assert previews[1].status_reason == ["checkbox_mark_detected"]


@pytest.mark.parametrize(
    ("text", "expected_status"),
    [("", "empty"), ("X", "low_text_density")],
)
def test_preview_template_covers_empty_and_low_density_text(
    monkeypatch: pytest.MonkeyPatch, text: str, expected_status: str
) -> None:
    payload = {
        "schema_version": "1.0",
        "form_id": "ACORD_125",
        "template_version": "v1",
        "template_state": "draft",
        "fields": [
            {
                "name": "text_field",
                "page": 1,
                "bbox": [0, 0, 10, 10],
                "field_type": "text",
                "extraction_method": "embedded_text",
            }
        ],
    }
    template = FormTemplate.model_validate(payload)

    class FakePage:
        rect = fitz.Rect(0, 0, 100, 100)

        def get_textbox(self, rect: object) -> str:
            return "ignored"

    class FakeDocument:
        def __getitem__(self, index: int) -> FakePage:
            return FakePage()

    monkeypatch.setattr("acord_extractor.preview.fitz.open", lambda _: FakeDocument())
    monkeypatch.setattr(
        "acord_extractor.preview.extract_textbox", lambda page, bbox: text
    )

    previews = preview_template(Path("dummy.pdf"), template)

    assert previews[0].status == expected_status


def test_preview_template_marks_unsupported_field_method_combinations() -> None:
    payload = load_recipe(SAMPLE_RECIPE).model_dump(mode="json")
    payload["fields"][0]["field_type"] = "checkbox"
    payload["fields"][0]["extraction_method"] = "embedded_text"
    template = FormTemplate.model_validate(payload)

    previews = preview_template(SAMPLE_PDF, template)

    assert previews[0].status == "unsupported_method"
    assert previews[0].status_reason == ["unsupported_field_method_combination"]


def test_extract_pdf_returns_saved_sample_value() -> None:
    result = extract_pdf(SAMPLE_PDF, load_recipe(SAMPLE_RECIPE))

    assert len(result.fields) == SAMPLE_RECIPE_FIELD_COUNT
    assert {field.field_name: field.value for field in result.fields} == (
        EXPECTED_EXPANDED_SAMPLE_VALUES
    )


def test_extract_pdf_accepts_legacy_app_produced_bboxes() -> None:
    legacy_recipe = mirror_recipe_to_legacy_bboxes(load_recipe(SAMPLE_RECIPE))

    result = extract_pdf(SAMPLE_PDF, legacy_recipe)

    assert {field.field_name: field.value for field in result.fields} == (
        EXPECTED_EXPANDED_SAMPLE_VALUES
    )


def test_extract_pdf_returns_expected_checkbox_and_multiline_fixture_values() -> None:
    result = extract_pdf(SAMPLE_PDF, load_recipe(CHECKBOX_MULTILINE_RECIPE))

    assert {field.field_name: field.value for field in result.fields} == {
        "has_accounts_receivable_valuable_papers": False,
        "has_boiler_and_machinery_section": False,
        "has_business_auto_section": True,
        "has_bop_section": True,
        "has_gl_section": False,
        "has_crime_section": False,
        "has_dealers_section": False,
        "agent_name_address": "Jim Bob Agency\n123 Main St\nAnytown, OH 45123",
    }


def test_export_debug_overlay_writes_pdf(tmp_path: Path) -> None:
    output_path = tmp_path / "overlay.pdf"

    saved = export_debug_overlay(SAMPLE_PDF, load_recipe(SAMPLE_RECIPE), output_path)

    assert saved == output_path
    assert output_path.exists()
    assert output_path.stat().st_size > 0


def test_api_end_to_end_supports_recipe_save_load_preview_and_validate(
    tmp_path: Path,
) -> None:
    client = TestClient(api_app)
    recipe = load_recipe(SAMPLE_RECIPE)
    saved_recipe_path = tmp_path / "saved.recipe.json"

    save_response = client.post(
        "/recipe/save",
        json={
            "recipe_path": str(saved_recipe_path),
            "template": recipe.model_dump(mode="json"),
        },
    )
    assert save_response.status_code == 200

    load_response = client.post(
        "/recipe/load", json={"recipe_path": str(saved_recipe_path)}
    )
    assert load_response.status_code == 200
    assert len(load_response.json()["fields"]) == SAMPLE_RECIPE_FIELD_COUNT

    preview_response = client.post(
        "/preview",
        json={"pdf_path": str(SAMPLE_PDF), "recipe_path": str(saved_recipe_path)},
    )
    assert preview_response.status_code == 200
    assert len(preview_response.json()) == SAMPLE_RECIPE_FIELD_COUNT

    validate_response = client.post(
        "/validate-template",
        json={"pdf_path": str(SAMPLE_PDF), "recipe_path": str(saved_recipe_path)},
    )
    assert validate_response.status_code == 200
    assert validate_response.json()["reusable"] is True


def test_api_render_extract_and_overlay_endpoints(tmp_path: Path) -> None:
    client = TestClient(api_app)
    overlay_path = tmp_path / "api-overlay.pdf"

    health = client.get("/health")
    assert health.status_code == 200
    assert health.json() == {"status": "ok"}

    metadata = client.get("/pdf/metadata", params={"pdf_path": str(SAMPLE_PDF)})
    assert metadata.status_code == 200
    assert metadata.json()["page_count"] == 4

    pdf_file = client.get("/pdf/file", params={"pdf_path": str(SAMPLE_PDF)})
    assert pdf_file.status_code == 200
    assert pdf_file.headers["content-type"] == "application/pdf"
    assert pdf_file.content.startswith(b"%PDF")

    image = client.get(f"/pdf/pages/2/image?pdf_path={SAMPLE_PDF}&scale=1.0")
    assert image.status_code == 200
    assert image.content.startswith(b"\x89PNG\r\n\x1a\n")

    session_response = client.post(
        "/session/start",
        json={"pdf_path": str(SAMPLE_PDF), "recipe_path": str(SAMPLE_RECIPE)},
    )
    assert session_response.status_code == 200
    assert session_response.json()["pdf_info"]["page_count"] == 4
    assert (
        len(session_response.json()["template"]["fields"]) == SAMPLE_RECIPE_FIELD_COUNT
    )

    extract_response = client.post(
        "/extract",
        json={"pdf_path": str(SAMPLE_PDF), "recipe_path": str(SAMPLE_RECIPE)},
    )
    assert extract_response.status_code == 200
    assert len(extract_response.json()["fields"]) == SAMPLE_RECIPE_FIELD_COUNT

    overlay_response = client.post(
        "/export-debug-overlay",
        json={
            "pdf_path": str(SAMPLE_PDF),
            "recipe_path": str(SAMPLE_RECIPE),
            "output_path": str(overlay_path),
        },
    )
    assert overlay_response.status_code == 200
    assert overlay_path.exists()


def test_api_returns_404_and_400_for_invalid_inputs() -> None:
    client = TestClient(api_app)

    missing_recipe = client.post("/recipe/load", json={"recipe_path": "missing.json"})
    assert missing_recipe.status_code == 404

    missing_template_source = client.post(
        "/preview", json={"pdf_path": str(SAMPLE_PDF)}
    )
    assert missing_template_source.status_code == 400

    missing_page = client.get(
        "/pdf/pages/99/image", params={"pdf_path": str(SAMPLE_PDF)}
    )
    assert missing_page.status_code == 404


def test_api_filesystem_list_filters_pdf_and_recipe_entries() -> None:
    client = TestClient(api_app)

    pdf_response = client.get(
        "/filesystem/list",
        params={"path": str(SAMPLE_PDF.parent), "extensions": ".pdf"},
    )
    assert pdf_response.status_code == 200
    assert pdf_response.json()["current_path"] == str(SAMPLE_PDF.parent)
    assert any(
        entry["name"] == SAMPLE_PDF.name and entry["entry_type"] == "file"
        for entry in pdf_response.json()["entries"]
    )

    recipe_response = client.get(
        "/filesystem/list",
        params={"path": str(SAMPLE_RECIPE.parent), "extensions": ".json"},
    )
    assert recipe_response.status_code == 200
    assert any(
        entry["name"] == SAMPLE_RECIPE.name and entry["entry_type"] == "file"
        for entry in recipe_response.json()["entries"]
    )


def test_api_uploads_pdf_and_recipe_files_to_temp_workspace() -> None:
    client = TestClient(api_app)

    pdf_upload = client.post(
        "/filesystem/upload?file_kind=pdf",
        files={"file": ("sample.pdf", b"%PDF-1.4\n", "application/pdf")},
    )
    assert pdf_upload.status_code == 200
    pdf_path = Path(pdf_upload.json()["stored_path"])
    assert pdf_upload.json()["file_kind"] == "pdf"
    assert pdf_path.exists()
    assert pdf_path.read_bytes() == b"%PDF-1.4\n"

    recipe_upload = client.post(
        "/filesystem/upload?file_kind=recipe",
        files={
            "file": (
                "sample.recipe.json",
                b'{"schema_version":"1.0","form_id":"ACORD_125","template_state":"draft","template_version":"v1","page_rotations":[],"page_sizes":[],"informational_pdf_metadata":{},"anchor_text":[],"anchors":[],"fields":[]}',
                "application/json",
            )
        },
    )
    assert recipe_upload.status_code == 200
    recipe_path = Path(recipe_upload.json()["stored_path"])
    assert recipe_upload.json()["file_kind"] == "recipe"
    assert recipe_path.exists()


def test_api_upload_rejects_wrong_extension_for_kind() -> None:
    client = TestClient(api_app)

    response = client.post(
        "/filesystem/upload?file_kind=pdf",
        files={"file": ("sample.json", b"{}", "application/json")},
    )

    assert response.status_code == 400
    assert ".pdf" in response.json()["detail"]


def test_session_start_without_recipe_returns_empty_draft_template() -> None:
    client = TestClient(api_app)

    response = client.post("/session/start", json={"pdf_path": str(SAMPLE_PDF)})

    assert response.status_code == 200
    assert response.json()["template"]["template_state"] == "draft"
    assert response.json()["template"]["fields"] == []


def test_cli_preview_validate_extract_and_overlay_commands(tmp_path: Path) -> None:
    runner = CliRunner()
    overlay_path = tmp_path / "cli-overlay.pdf"

    preview = runner.invoke(
        cli_app,
        [
            "preview",
            "--pdf",
            str(SAMPLE_PDF),
            "--recipe",
            str(SAMPLE_RECIPE),
        ],
    )
    assert preview.exit_code == 0
    assert len(json.loads(preview.output)) == SAMPLE_RECIPE_FIELD_COUNT

    validate = runner.invoke(
        cli_app,
        [
            "validate-template",
            "--pdf",
            str(SAMPLE_PDF),
            "--recipe",
            str(SAMPLE_RECIPE),
        ],
    )
    assert validate.exit_code == 0
    assert json.loads(validate.output)["reusable"] is True

    extract = runner.invoke(
        cli_app,
        [
            "extract",
            "--pdf",
            str(SAMPLE_PDF),
            "--recipe",
            str(SAMPLE_RECIPE),
        ],
    )
    assert extract.exit_code == 0
    assert len(json.loads(extract.output)["fields"]) == SAMPLE_RECIPE_FIELD_COUNT

    overlay = runner.invoke(
        cli_app,
        [
            "export-debug-overlay",
            "--pdf",
            str(SAMPLE_PDF),
            "--recipe",
            str(SAMPLE_RECIPE),
            "--output",
            str(overlay_path),
        ],
    )
    assert overlay.exit_code == 0
    assert json.loads(overlay.output)["output_path"] == str(overlay_path)
    assert overlay_path.exists()


def test_cli_save_recipe_command_writes_canonical_recipe(tmp_path: Path) -> None:
    runner = CliRunner()
    output_path = tmp_path / "saved-from-cli.recipe.json"

    result = runner.invoke(
        cli_app,
        [
            "save-recipe",
            "--recipe",
            str(SAMPLE_RECIPE),
            "--output",
            str(output_path),
        ],
    )

    assert result.exit_code == 0
    saved = json.loads(result.output)
    assert saved["form_id"] == "ACORD_125"
    assert output_path.exists()


def test_cli_extract_command_writes_json_output_file(tmp_path: Path) -> None:
    runner = CliRunner()
    output_path = tmp_path / "extracted-values.json"

    result = runner.invoke(
        cli_app,
        [
            "extract",
            "--pdf",
            str(SAMPLE_PDF),
            "--recipe",
            str(SAMPLE_RECIPE),
            "--output",
            str(output_path),
        ],
    )

    assert result.exit_code == 0
    extracted = json.loads(result.output)
    saved = json.loads(output_path.read_text())
    assert extracted == saved
    assert saved["form_id"] == "ACORD_125"
    assert len(saved["fields"]) == SAMPLE_RECIPE_FIELD_COUNT
    assert {field["field_name"]: field["value"] for field in saved["fields"]} == (
        EXPECTED_EXPANDED_SAMPLE_VALUES
    )


def test_main_invokes_cli_help(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr("sys.argv", ["acord-extractor", "--help"])

    with pytest.raises(SystemExit) as exc_info:
        main()

    assert exc_info.value.code == 0
    assert "preview" in capsys.readouterr().out
