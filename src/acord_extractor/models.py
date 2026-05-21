from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha1
import re
from typing import Any, Literal

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)


TemplateState = Literal["draft", "validated", "deprecated"]
FieldType = Literal[
    "text",
    "multiline_text",
    "checkbox",
    "radio",
    "date",
    "money",
    "phone",
    "table_region",
]
ExtractionMethod = Literal["embedded_text", "checkbox_image", "ocr", "manual"]
CoordinateSpace = Literal["pdf_points_top_left"]
AnchorMatchType = Literal["contains", "exact"]
TableDirection = Literal["vertical", "horizontal"]
SignalStrength = Literal["strong", "medium", "weak"]
SignalStatus = Literal["ok", "warning", "failed", "info"]
AnchorStatus = Literal["ok", "missing", "drift"]
PreviewStatus = Literal[
    "ok", "empty", "low_text_density", "anchor_drift", "unsupported_method"
]

Bbox = tuple[float, float, float, float]
PageSize = tuple[float, float]


def _validate_bbox(bbox: Bbox) -> Bbox:
    x0, y0, x1, y1 = bbox
    if x0 >= x1 or y0 >= y1:
        raise ValueError("bbox must use increasing coordinates")
    return bbox


def _validate_page_size(page_size: PageSize) -> PageSize:
    width, height = page_size
    if width <= 0 or height <= 0:
        raise ValueError("page size values must be positive")
    return page_size


def _stable_field_id(name: str, page: int, bbox: Bbox) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_") or "field"
    bbox_key = ",".join(f"{value:.3f}" for value in bbox)
    digest = sha1(f"{slug}|{page}|{bbox_key}".encode()).hexdigest()[:10]
    return f"fld_{slug}_{digest}"


def _infer_field_type(field_type: Any, extraction_method: Any) -> FieldType:
    if field_type is not None:
        return field_type
    if extraction_method == "checkbox_image":
        return "checkbox"
    if extraction_method in {"embedded_text", "ocr", "manual"}:
        return "text"
    raise ValueError(
        "field_type is required when it cannot be inferred from legacy data"
    )


def _default_extraction_method(field_type: FieldType) -> ExtractionMethod:
    if field_type == "checkbox":
        return "checkbox_image"
    return "embedded_text"


class Padding(BaseModel):
    model_config = ConfigDict(extra="forbid")

    top: float = 0.0
    right: float = 0.0
    bottom: float = 0.0
    left: float = 0.0


class FieldOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    trim: bool = True
    collapse_whitespace: bool = True
    exclude_label_text: bool = True
    normalizer: str | None = None


class Anchor(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    page: int = Field(ge=1)
    expected_text: str
    match_type: AnchorMatchType = "contains"
    min_similarity: float = Field(default=0.9, ge=0.0, le=1.0)
    bbox: Bbox

    @field_validator("bbox")
    @classmethod
    def validate_bbox(cls, bbox: Bbox) -> Bbox:
        return _validate_bbox(bbox)


class TableColumn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    bbox: Bbox

    @field_validator("bbox")
    @classmethod
    def validate_bbox(cls, bbox: Bbox) -> Bbox:
        return _validate_bbox(bbox)


class FieldTemplate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    id: str = ""
    name: str
    label: str | None = None
    page: int = Field(ge=1)
    bbox: Bbox
    coordinate_space: CoordinateSpace = "pdf_points_top_left"
    source_page_size: PageSize | None = None
    padding: Padding = Field(default_factory=Padding)
    field_type: FieldType | None = Field(
        default=None, validation_alias=AliasChoices("field_type", "type")
    )
    extraction_method: ExtractionMethod | None = Field(
        default=None,
        validation_alias=AliasChoices("extraction_method", "method"),
    )
    required: bool = False
    options: FieldOptions = Field(default_factory=FieldOptions)
    row_direction: TableDirection | None = None
    column_direction: TableDirection | None = None
    columns: list[TableColumn] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_fields(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        migrated = dict(data)
        legacy_type = migrated.pop("type", None)
        legacy_method = migrated.pop("method", None)
        field_type = migrated.get("field_type", legacy_type)
        extraction_method = migrated.get("extraction_method", legacy_method)

        migrated["field_type"] = _infer_field_type(field_type, extraction_method)
        migrated["extraction_method"] = extraction_method or _default_extraction_method(
            migrated["field_type"]
        )

        name = migrated.get("name")
        if name and not migrated.get("label"):
            migrated["label"] = name

        if (
            not migrated.get("id")
            and name
            and migrated.get("page")
            and migrated.get("bbox")
        ):
            migrated["id"] = _stable_field_id(
                name, migrated["page"], tuple(migrated["bbox"])
            )

        return migrated

    @field_validator("bbox")
    @classmethod
    def validate_bbox(cls, bbox: Bbox) -> Bbox:
        return _validate_bbox(bbox)

    @field_validator("source_page_size")
    @classmethod
    def validate_source_page_size(cls, page_size: PageSize | None) -> PageSize | None:
        if page_size is None:
            return None
        return _validate_page_size(page_size)

    @model_validator(mode="after")
    def validate_table_shape(self) -> FieldTemplate:
        if self.field_type == "table_region":
            if self.columns and (
                self.row_direction is None or self.column_direction is None
            ):
                raise ValueError(
                    "table_region fields with columns must declare row_direction and column_direction"
                )
            return self

        if self.columns or self.row_direction or self.column_direction:
            raise ValueError("table metadata is only valid for table_region fields")
        return self


class InformationalPdfMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sha256: str | None = None
    producer: str | None = None
    creator: str | None = None


class PdfPageInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    page: int = Field(ge=1)
    width: float = Field(gt=0)
    height: float = Field(gt=0)
    rotation: int


class PdfDocumentInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    page_count: int = Field(ge=1)
    pages: list[PdfPageInfo]
    metadata: InformationalPdfMetadata = Field(default_factory=InformationalPdfMetadata)


class FormTemplate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    schema_version: str = "1.0"
    form_id: str
    template_state: TemplateState = "draft"
    template_version: str = Field(
        default="v1", validation_alias=AliasChoices("template_version", "version")
    )
    form_edition: str | None = None
    expected_page_count: int | None = Field(default=None, ge=1)
    page_rotations: list[int] = Field(default_factory=list)
    page_sizes: list[PageSize] = Field(default_factory=list)
    informational_pdf_metadata: InformationalPdfMetadata = Field(
        default_factory=InformationalPdfMetadata
    )
    anchor_text: list[str] = Field(default_factory=list)
    anchors: list[Anchor] = Field(default_factory=list)
    fields: list[FieldTemplate] = Field(default_factory=list)

    @field_validator("page_sizes")
    @classmethod
    def validate_page_sizes(cls, page_sizes: list[PageSize]) -> list[PageSize]:
        return [_validate_page_size(page_size) for page_size in page_sizes]

    @model_validator(mode="after")
    def validate_template(self) -> FormTemplate:
        field_ids = [field.id for field in self.fields]
        if len(field_ids) != len(set(field_ids)):
            raise ValueError("field ids must be unique")
        if self.template_state == "validated" and not self.anchors:
            raise ValueError("validated templates must include at least one anchor")
        return self


class FieldExtraction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field_id: str
    field_name: str
    value: str | bool | None
    confidence: float = Field(ge=0.0, le=1.0)
    page: int = Field(ge=1)
    bbox: Bbox
    field_type: FieldType
    extraction_method: ExtractionMethod

    @field_validator("bbox")
    @classmethod
    def validate_bbox(cls, bbox: Bbox) -> Bbox:
        return _validate_bbox(bbox)


class ExtractionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    form_id: str
    template_version: str
    fields: list[FieldExtraction]


class ValidationSignal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    strength: SignalStrength
    status: SignalStatus
    detail: str


class AnchorValidationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    page: int = Field(ge=1)
    expected_text: str
    matched_text: str | None = None
    similarity: float = Field(ge=0.0, le=1.0)
    expected_bbox: Bbox
    matched_bbox: Bbox | None = None
    status: AnchorStatus

    @field_validator("expected_bbox", "matched_bbox")
    @classmethod
    def validate_optional_bbox(cls, bbox: Bbox | None) -> Bbox | None:
        if bbox is None:
            return None
        return _validate_bbox(bbox)


class TemplateValidationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    form_id: str
    template_version: str
    template_state: TemplateState
    reusable: bool
    failures: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    strong_signals: list[ValidationSignal] = Field(default_factory=list)
    medium_signals: list[ValidationSignal] = Field(default_factory=list)
    weak_signals: list[ValidationSignal] = Field(default_factory=list)
    anchor_results: list[AnchorValidationResult] = Field(default_factory=list)
    pdf_page_count: int = Field(ge=1)
    pdf_page_sizes: list[PageSize] = Field(default_factory=list)
    pdf_page_rotations: list[int] = Field(default_factory=list)

    @field_validator("pdf_page_sizes")
    @classmethod
    def validate_pdf_page_sizes(cls, page_sizes: list[PageSize]) -> list[PageSize]:
        return [_validate_page_size(page_size) for page_size in page_sizes]


class FieldPreview(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field_id: str
    field_name: str
    bbox: Bbox
    raw_extracted_text: str | None = None
    normalized_text: str | bool | None = None
    status: PreviewStatus
    status_reason: list[str] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    template_version: str

    @field_validator("bbox")
    @classmethod
    def validate_bbox(cls, bbox: Bbox) -> Bbox:
        return _validate_bbox(bbox)
