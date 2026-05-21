from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .debug_overlay import export_debug_overlay
from .extract import extract_pdf
from .models import (
    ExtractionResult,
    FieldPreview,
    FormTemplate,
    PdfDocumentInfo,
    TemplateValidationResult,
)
from .preview import preview_field, preview_template
from .recipe_io import load_recipe, save_recipe
from .render import get_pdf_document_info, render_page_png
from .validation import validate_template


app = FastAPI(title="ACORD Extractor", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RecipePathRequest(BaseModel):
    recipe_path: str


class TemplateSourceRequest(BaseModel):
    recipe_path: str | None = None
    template: dict[str, Any] | None = None


class SaveRecipeRequest(BaseModel):
    recipe_path: str
    template: dict[str, Any]


class PreviewRequest(TemplateSourceRequest):
    pdf_path: str
    field_id: str | None = None


class ExtractRequest(TemplateSourceRequest):
    pdf_path: str


class ValidateTemplateRequest(TemplateSourceRequest):
    pdf_path: str


class ExportDebugOverlayRequest(TemplateSourceRequest):
    pdf_path: str
    output_path: str


class OverlayExportResponse(BaseModel):
    output_path: str


class SessionStartRequest(BaseModel):
    pdf_path: str
    recipe_path: str | None = None


class SessionStartResponse(BaseModel):
    pdf_path: str
    recipe_path: str | None = None
    pdf_info: PdfDocumentInfo
    template: FormTemplate


def _as_existing_path(path_text: str) -> Path:
    path = Path(path_text)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Path does not exist: {path}")
    return path


def _resolve_template(source: TemplateSourceRequest) -> FormTemplate:
    if source.template is not None:
        return FormTemplate.model_validate(source.template)
    if source.recipe_path is not None:
        return load_recipe(_as_existing_path(source.recipe_path))
    raise HTTPException(
        status_code=400, detail="Either recipe_path or template must be provided"
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/pdf/metadata", response_model=PdfDocumentInfo)
def pdf_metadata(pdf_path: str) -> PdfDocumentInfo:
    return get_pdf_document_info(_as_existing_path(pdf_path))


@app.get("/pdf/file")
def pdf_file(pdf_path: str) -> Response:
    pdf = _as_existing_path(pdf_path)
    return Response(content=pdf.read_bytes(), media_type="application/pdf")


@app.get("/pdf/pages/{page_number}/image")
def pdf_page_image(pdf_path: str, page_number: int, scale: float = 1.5) -> Response:
    pdf = _as_existing_path(pdf_path)
    try:
        image_bytes = render_page_png(pdf, page_number, scale)
    except IndexError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return Response(content=image_bytes, media_type="image/png")


@app.post("/recipe/load", response_model=FormTemplate)
def recipe_load(request: RecipePathRequest) -> FormTemplate:
    return load_recipe(_as_existing_path(request.recipe_path))


@app.post("/recipe/save", response_model=FormTemplate)
def recipe_save(request: SaveRecipeRequest) -> FormTemplate:
    return save_recipe(Path(request.recipe_path), request.template)


@app.post("/session/start", response_model=SessionStartResponse)
def session_start(request: SessionStartRequest) -> SessionStartResponse:
    pdf = _as_existing_path(request.pdf_path)
    template = (
        load_recipe(_as_existing_path(request.recipe_path))
        if request.recipe_path is not None
        else FormTemplate(
            form_id="ACORD_125",
            template_version="v1",
            template_state="draft",
        )
    )
    return SessionStartResponse(
        pdf_path=str(pdf),
        recipe_path=request.recipe_path,
        pdf_info=get_pdf_document_info(pdf),
        template=template,
    )


@app.post("/preview", response_model=list[FieldPreview])
def preview(request: PreviewRequest) -> list[FieldPreview]:
    template = _resolve_template(request)
    pdf = _as_existing_path(request.pdf_path)
    if request.field_id:
        return [preview_field(pdf, template, request.field_id)]
    return preview_template(pdf, template)


@app.post("/extract", response_model=ExtractionResult)
def extract(request: ExtractRequest) -> ExtractionResult:
    template = _resolve_template(request)
    pdf = _as_existing_path(request.pdf_path)
    return extract_pdf(pdf, template)


@app.post("/validate-template", response_model=TemplateValidationResult)
def validate(request: ValidateTemplateRequest) -> TemplateValidationResult:
    template = _resolve_template(request)
    pdf = _as_existing_path(request.pdf_path)
    return validate_template(pdf, template)


@app.post("/export-debug-overlay", response_model=OverlayExportResponse)
def overlay_export(request: ExportDebugOverlayRequest) -> OverlayExportResponse:
    template = _resolve_template(request)
    pdf = _as_existing_path(request.pdf_path)
    output_path = export_debug_overlay(pdf, template, Path(request.output_path))
    return OverlayExportResponse(output_path=str(output_path))
