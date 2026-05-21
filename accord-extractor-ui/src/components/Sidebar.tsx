import { useEffect, useEffectEvent, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import type { FieldPreview, FieldTemplate } from "../types";

const fieldFormSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  field_type: z.enum([
    "text",
    "multiline_text",
    "checkbox",
    "radio",
    "date",
    "money",
    "phone",
    "table_region",
  ]),
  extraction_method: z.enum([
    "embedded_text",
    "checkbox_image",
    "ocr",
    "manual",
  ]),
  paddingTop: z.number().min(0),
  paddingRight: z.number().min(0),
  paddingBottom: z.number().min(0),
  paddingLeft: z.number().min(0),
});

type FieldFormValues = z.infer<typeof fieldFormSchema>;

interface SidebarProps {
  draftField: FieldTemplate | null;
  fieldList: FieldTemplate[];
  hasLoadedDocument: boolean;
  previewByFieldId: Record<string, FieldPreview>;
  selectedFieldId: string | null;
  selectedPreview: FieldPreview | null;
  isSaving: boolean;
  saveEnabled: boolean;
  onSelectField: (field: FieldTemplate) => void;
  onDraftChange: (field: FieldTemplate) => void;
  onSaveDraft: () => Promise<void>;
  onCancelDraft: () => void;
}

function toFormValues(field: FieldTemplate): FieldFormValues {
  return {
    name: field.name,
    label: field.label ?? field.name,
    field_type: field.field_type,
    extraction_method: field.extraction_method,
    paddingTop: field.padding.top,
    paddingRight: field.padding.right,
    paddingBottom: field.padding.bottom,
    paddingLeft: field.padding.left,
  };
}

function formValuesEqual(
  left: FieldFormValues | undefined,
  right: FieldFormValues,
): boolean {
  return (
    !!left &&
    left.name === right.name &&
    left.label === right.label &&
    left.field_type === right.field_type &&
    left.extraction_method === right.extraction_method &&
    left.paddingTop === right.paddingTop &&
    left.paddingRight === right.paddingRight &&
    left.paddingBottom === right.paddingBottom &&
    left.paddingLeft === right.paddingLeft
  );
}

export function Sidebar(props: SidebarProps) {
  const {
    draftField,
    fieldList,
    hasLoadedDocument,
    isSaving,
    onCancelDraft,
    onDraftChange,
    onSaveDraft,
    onSelectField,
    previewByFieldId,
    saveEnabled,
    selectedFieldId,
    selectedPreview,
  } = props;

  const form = useForm<FieldFormValues>({
    resolver: zodResolver(fieldFormSchema),
    mode: "onChange",
    defaultValues: draftField ? toFormValues(draftField) : undefined,
  });

  useEffect(() => {
    if (!draftField) {
      return;
    }
    const nextValues = toFormValues(draftField);
    if (formValuesEqual(form.getValues(), nextValues)) {
      return;
    }
    form.reset(nextValues);
  }, [draftField, form]);

  const watchedValues = useWatch({ control: form.control });
  const isFormDirty = form.formState.isDirty;

  useEffect(() => {
    if (!draftField || !isFormDirty) {
      return;
    }
    const parsed = fieldFormSchema.safeParse(watchedValues);
    if (!parsed.success) {
      return;
    }

    const nextField = {
      ...draftField,
      name: parsed.data.name,
      label: parsed.data.label,
      field_type: parsed.data.field_type,
      extraction_method: parsed.data.extraction_method,
      padding: {
        top: parsed.data.paddingTop,
        right: parsed.data.paddingRight,
        bottom: parsed.data.paddingBottom,
        left: parsed.data.paddingLeft,
      },
    };

    if (
      draftField.name === nextField.name &&
      (draftField.label ?? draftField.name) === nextField.label &&
      draftField.field_type === nextField.field_type &&
      draftField.extraction_method === nextField.extraction_method &&
      draftField.padding.top === nextField.padding.top &&
      draftField.padding.right === nextField.padding.right &&
      draftField.padding.bottom === nextField.padding.bottom &&
      draftField.padding.left === nextField.padding.left
    ) {
      return;
    }

    onDraftChange(nextField);
  }, [draftField, isFormDirty, onDraftChange, watchedValues]);

  const previewText = useMemo(() => {
    if (!selectedPreview) {
      return null;
    }
    if (typeof selectedPreview.normalized_text === "boolean") {
      return selectedPreview.normalized_text ? "Checked" : "Unchecked";
    }
    return selectedPreview.normalized_text ?? "No preview value";
  }, [selectedPreview]);

  const handleShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey) || event.key !== "Enter") {
      return;
    }
    if (!draftField || !saveEnabled || isSaving) {
      return;
    }
    event.preventDefault();
    void onSaveDraft();
  });

  useEffect(() => {
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  if (!draftField) {
    return (
      <aside className="sidebar-pane">
        <div className="panel-card sidebar-list-card">
          <p className="eyebrow">Field list</p>
          <h2>
            {hasLoadedDocument ? "Saved annotations" : "Ready when you are"}
          </h2>
          <p className="preview-copy sidebar-copy">
            {hasLoadedDocument
              ? "Draw a box on the PDF to create a new draft, or pick an existing field to edit it."
              : "Load a PDF to start annotating. Once a field is active, this panel turns into the annotator."}
          </p>

          <ul className="field-list">
            {fieldList.length ? (
              fieldList.map((field) => {
                const preview = previewByFieldId[field.id];
                return (
                  <li key={field.id}>
                    <button
                      type="button"
                      className={
                        field.id === selectedFieldId
                          ? "field-row field-row-active"
                          : "field-row"
                      }
                      onClick={() => onSelectField(field)}
                    >
                      <span>
                        <strong>{field.label ?? field.name}</strong>
                        <small>
                          Page {field.page} · {field.name}
                        </small>
                      </span>
                      <span
                        className={`status-pill status-${preview?.status ?? "empty"}`}
                      >
                        {preview?.status ?? "idle"}
                      </span>
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="field-list-empty">
                {hasLoadedDocument
                  ? "No saved annotations yet. Draw the first box on the PDF to begin."
                  : "No document loaded yet."}
              </li>
            )}
          </ul>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar-pane">
      <div className="panel-card">
        <div className="sidebar-editor-header">
          <div>
            <p className="eyebrow">Field annotator</p>
            <h2>{draftField.label ?? draftField.name}</h2>
          </div>
          <button
            type="button"
            className="ghost-button sidebar-back-button"
            onClick={onCancelDraft}
          >
            Field list
          </button>
        </div>
        <p className="meta-line">
          Page {draftField.page} · ID {draftField.id}
        </p>

        <form
          className="field-form"
          onSubmit={form.handleSubmit(() => void onSaveDraft())}
        >
          <label>
            <span>Name</span>
            <input {...form.register("name")} />
          </label>

          <label>
            <span>Label</span>
            <input {...form.register("label")} />
          </label>

          <div className="form-grid">
            <label>
              <span>Field type</span>
              <select {...form.register("field_type")}>
                <option value="text">Text</option>
                <option value="multiline_text">Multiline text</option>
                <option value="checkbox">Checkbox</option>
                <option value="radio">Radio</option>
                <option value="date">Date</option>
                <option value="money">Money</option>
                <option value="phone">Phone</option>
                <option value="table_region">Table region</option>
              </select>
            </label>

            <label>
              <span>Extraction</span>
              <select {...form.register("extraction_method")}>
                <option value="embedded_text">Embedded text</option>
                <option value="checkbox_image">Checkbox image</option>
                <option value="ocr">OCR</option>
                <option value="manual">Manual</option>
              </select>
            </label>
          </div>

          <div className="padding-grid">
            <label>
              <span>Pad top</span>
              <input
                type="number"
                step="0.5"
                {...form.register("paddingTop", { valueAsNumber: true })}
              />
            </label>
            <label>
              <span>Pad right</span>
              <input
                type="number"
                step="0.5"
                {...form.register("paddingRight", { valueAsNumber: true })}
              />
            </label>
            <label>
              <span>Pad bottom</span>
              <input
                type="number"
                step="0.5"
                {...form.register("paddingBottom", { valueAsNumber: true })}
              />
            </label>
            <label>
              <span>Pad left</span>
              <input
                type="number"
                step="0.5"
                {...form.register("paddingLeft", { valueAsNumber: true })}
              />
            </label>
          </div>

          <div className="bbox-box">
            <span>BBox</span>
            <code>
              {draftField.bbox.map((value) => value.toFixed(2)).join(", ")}
            </code>
          </div>

          <div className="button-row">
            <button
              type="submit"
              className="primary-button"
              disabled={!saveEnabled || isSaving}
            >
              {isSaving ? "Saving…" : "Save field"}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={onCancelDraft}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      <div className="panel-card preview-panel">
        <p className="eyebrow">Live preview</p>
        <div
          className={`status-pill status-${selectedPreview?.status ?? "empty"}`}
        >
          {selectedPreview?.status ?? "waiting"}
        </div>
        <p className="preview-copy">
          {previewText ?? "Preview appears while you edit."}
        </p>
        {selectedPreview?.status_reason.length ? (
          <ul className="reason-list">
            {selectedPreview.status_reason.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </aside>
  );
}
