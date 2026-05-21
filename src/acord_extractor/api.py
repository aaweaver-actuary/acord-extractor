from __future__ import annotations

from pathlib import Path
from tempfile import gettempdir
from typing import Any, Literal
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, Response, UploadFile
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


app = FastAPI(title="ACORD Data Extractor", version="0.1.0")

UPLOAD_ROOT = Path(gettempdir()) / "acord-data-extractor" / "uploads"
UPLOAD_EXTENSIONS: dict[str, str] = {"pdf": ".pdf", "recipe": ".json"}

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


class FileBrowserEntry(BaseModel):
    name: str
    path: str
    entry_type: Literal["directory", "file"]


class FileBrowserResponse(BaseModel):
    current_path: str
    parent_path: str | None = None
    entries: list[FileBrowserEntry]


class UploadedWorkspaceFile(BaseModel):
    original_name: str
    stored_path: str
    file_kind: Literal["pdf", "recipe"]


def _as_existing_path(path_text: str) -> Path:
    path = Path(path_text)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Path does not exist: {path}")
    return path


def _as_directory_path(path_text: str | None) -> Path:
    if path_text is None:
        return Path.cwd().resolve()

    path = _as_existing_path(path_text).resolve()
    if path.is_file():
        path = path.parent
    if not path.is_dir():
        raise HTTPException(status_code=400, detail=f"Not a directory: {path}")
    return path


def _parse_extensions(extensions: str | None) -> list[str]:
    if not extensions:
        return []

    normalized: list[str] = []
    for extension in extensions.split(","):
        value = extension.strip().lower()
        if not value:
            continue
        normalized.append(value if value.startswith(".") else f".{value}")
    return normalized


def _resolve_template(source: TemplateSourceRequest) -> FormTemplate:
    if source.template is not None:
        return FormTemplate.model_validate(source.template)
    if source.recipe_path is not None:
        return load_recipe(_as_existing_path(source.recipe_path))
    raise HTTPException(
        status_code=400, detail="Either recipe_path or template must be provided"
    )


def _sanitize_upload_name(filename: str | None, fallback_extension: str) -> str:
    raw_name = Path(filename or f"upload{fallback_extension}").name
    sanitized = "".join(
        character if character.isalnum() or character in {".", "-", "_"} else "_"
        for character in raw_name
    )
    return sanitized or f"upload{fallback_extension}"


async def _persist_uploaded_file(
    uploaded_file: UploadFile, file_kind: Literal["pdf", "recipe"]
) -> UploadedWorkspaceFile:
    expected_extension = UPLOAD_EXTENSIONS[file_kind]
    safe_name = _sanitize_upload_name(uploaded_file.filename, expected_extension)
    if not safe_name.lower().endswith(expected_extension):
        raise HTTPException(
            status_code=400,
            detail=f"{file_kind.title()} uploads must end with {expected_extension}",
        )

    file_bytes = await uploaded_file.read()
    await uploaded_file.close()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    stored_path = UPLOAD_ROOT / f"{uuid4().hex}-{safe_name}"
    stored_path.write_bytes(file_bytes)
    return UploadedWorkspaceFile(
        original_name=safe_name,
        stored_path=str(stored_path),
        file_kind=file_kind,
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/filesystem/list", response_model=FileBrowserResponse)
def filesystem_list(
    path: str | None = None, extensions: str | None = None
) -> FileBrowserResponse:
    directory = _as_directory_path(path)
    allowed_extensions = _parse_extensions(extensions)
    entries: list[FileBrowserEntry] = []

    children = sorted(
        directory.iterdir(), key=lambda child: (not child.is_dir(), child.name.lower())
    )
    for child in children:
        if child.name.startswith("."):
            continue
        if child.is_dir():
            entries.append(
                FileBrowserEntry(
                    name=child.name,
                    path=str(child),
                    entry_type="directory",
                )
            )
            continue
        if allowed_extensions and not any(
            child.name.lower().endswith(extension) for extension in allowed_extensions
        ):
            continue
        entries.append(
            FileBrowserEntry(name=child.name, path=str(child), entry_type="file")
        )

    parent_path = None if directory.parent == directory else str(directory.parent)
    return FileBrowserResponse(
        current_path=str(directory),
        parent_path=parent_path,
        entries=entries,
    )


@app.post("/filesystem/upload", response_model=UploadedWorkspaceFile)
async def filesystem_upload(
    file_kind: Literal["pdf", "recipe"],
    file: UploadFile = File(...),
) -> UploadedWorkspaceFile:
    return await _persist_uploaded_file(file, file_kind)


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
