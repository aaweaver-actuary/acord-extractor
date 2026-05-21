import type {
  FieldTemplate,
  FormTemplate,
  PdfDocumentInfo,
  ViewportRect,
} from "../types";
import { viewportRectToPdfBbox } from "./pdfCoordinates";
import type { ViewportLike } from "./pdfCoordinates";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function createFieldName(page: number, count: number): string {
  return `field_${page}_${String(count + 1).padStart(2, "0")}`;
}

export function cloneField(field: FieldTemplate): FieldTemplate {
  return structuredClone(field);
}

export function createDraftField(options: {
  currentPage: number;
  existingFields: FieldTemplate[];
  pageSize: [number, number];
  viewportRect: ViewportRect;
  viewport: ViewportLike;
}): FieldTemplate {
  const name = createFieldName(
    options.currentPage,
    options.existingFields.length,
  );
  const slug = slugify(name) || "field";
  const sequence = String(options.existingFields.length + 1).padStart(3, "0");

  return {
    id: `fld_${slug}_${sequence}`,
    name,
    label: name.replace(/_/g, " "),
    page: options.currentPage,
    bbox: viewportRectToPdfBbox(options.viewport, options.viewportRect),
    coordinate_space: "pdf_points_top_left",
    source_page_size: options.pageSize,
    padding: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    field_type: "text",
    extraction_method: "embedded_text",
    required: false,
    options: {
      trim: true,
      collapse_whitespace: true,
      exclude_label_text: true,
      normalizer: null,
    },
    columns: [],
  };
}

export function upsertField(
  fields: FieldTemplate[],
  nextField: FieldTemplate,
): FieldTemplate[] {
  const matchIndex = fields.findIndex((field) => field.id === nextField.id);

  if (matchIndex === -1) {
    return [...fields, nextField];
  }

  return fields.map((field) => (field.id === nextField.id ? nextField : field));
}

export function buildTemplateSnapshot(
  template: FormTemplate,
  fields: FieldTemplate[],
  pdfInfo: PdfDocumentInfo,
): FormTemplate {
  return {
    ...template,
    expected_page_count: pdfInfo.page_count,
    page_rotations: pdfInfo.pages.map((page) => page.rotation),
    page_sizes: pdfInfo.pages.map((page) => [page.width, page.height]),
    informational_pdf_metadata: pdfInfo.metadata,
    fields,
  };
}
