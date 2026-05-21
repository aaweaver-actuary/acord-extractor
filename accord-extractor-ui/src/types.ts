export type FieldType =
  | "text"
  | "multiline_text"
  | "checkbox"
  | "radio"
  | "date"
  | "money"
  | "phone"
  | "table_region";

export type ExtractionMethod =
  | "embedded_text"
  | "checkbox_image"
  | "ocr"
  | "manual";

export type TemplateState = "draft" | "validated" | "deprecated";

export type PreviewStatus =
  | "ok"
  | "empty"
  | "low_text_density"
  | "anchor_drift"
  | "unsupported_method";

export type Bbox = [number, number, number, number];

export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface FieldOptions {
  trim: boolean;
  collapse_whitespace: boolean;
  exclude_label_text: boolean;
  normalizer: string | null;
}

export interface TableColumn {
  name: string;
  bbox: Bbox;
}

export interface FieldTemplate {
  id: string;
  name: string;
  label: string | null;
  page: number;
  bbox: Bbox;
  coordinate_space: "pdf_points_top_left";
  source_page_size: [number, number] | null;
  padding: Padding;
  field_type: FieldType;
  extraction_method: ExtractionMethod;
  required: boolean;
  options: FieldOptions;
  row_direction?: "vertical" | "horizontal" | null;
  column_direction?: "vertical" | "horizontal" | null;
  columns: TableColumn[];
}

export interface Anchor {
  name: string;
  page: number;
  expected_text: string;
  match_type?: "contains" | "exact";
  min_similarity?: number;
  bbox: Bbox;
}

export interface InformationalPdfMetadata {
  sha256?: string | null;
  producer?: string | null;
  creator?: string | null;
}

export interface FormTemplate {
  schema_version: string;
  form_id: string;
  template_state: TemplateState;
  template_version: string;
  form_edition?: string | null;
  expected_page_count?: number | null;
  page_rotations: number[];
  page_sizes: [number, number][];
  informational_pdf_metadata: InformationalPdfMetadata;
  anchor_text: string[];
  anchors: Anchor[];
  fields: FieldTemplate[];
}

export interface PdfPageInfo {
  page: number;
  width: number;
  height: number;
  rotation: number;
}

export interface PdfDocumentInfo {
  page_count: number;
  pages: PdfPageInfo[];
  metadata: InformationalPdfMetadata;
}

export interface FieldPreview {
  field_id: string;
  field_name: string;
  bbox: Bbox;
  raw_extracted_text?: string | null;
  normalized_text?: string | boolean | null;
  status: PreviewStatus;
  status_reason: string[];
  timestamp: string;
  template_version: string;
}

export interface SessionStartResponse {
  pdf_path: string;
  recipe_path?: string | null;
  pdf_info: PdfDocumentInfo;
  template: FormTemplate;
}

export interface FileBrowserEntry {
  name: string;
  path: string;
  entry_type: "directory" | "file";
}

export interface FileBrowserResponse {
  current_path: string;
  parent_path?: string | null;
  entries: FileBrowserEntry[];
}

export interface UploadedWorkspaceFile {
  original_name: string;
  stored_path: string;
  file_kind: "pdf" | "recipe";
}

export interface ExtractionField {
  field_id: string;
  field_name: string;
  value: string | boolean | null;
  confidence: number;
  page: number;
  bbox: Bbox;
  field_type: FieldType;
  extraction_method: ExtractionMethod;
}

export interface ExtractionResult {
  form_id: string;
  template_version: string;
  fields: ExtractionField[];
}
