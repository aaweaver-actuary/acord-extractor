import { create } from "zustand";

import type {
  FieldPreview,
  FieldTemplate,
  FormTemplate,
  PdfDocumentInfo,
  SessionStartResponse,
  ViewportRect,
} from "../types";
import { cloneField } from "../lib/template";

interface AnnotationOperationState {
  isLoadingSession: boolean;
  isSavingDraft: boolean;
  isRefreshingPreviews: boolean;
  isPreviewingDraft: boolean;
}

interface AnnotationState {
  template: FormTemplate | null;
  pdfInfo: PdfDocumentInfo | null;
  savedFields: FieldTemplate[];
  previewByFieldId: Record<string, FieldPreview>;
  draftPreview: FieldPreview | null;
  transientRect: ViewportRect | null;
  draftField: FieldTemplate | null;
  selectedFieldId: string | null;
  currentPage: number;
  zoom: number;
  operationState: AnnotationOperationState;
  errorMessage: string | null;
  loadSession: (session: SessionStartResponse) => void;
  applySavedTemplate: (template: FormTemplate) => void;
  setCurrentPage: (page: number) => void;
  setZoom: (zoom: number) => void;
  setTransientRect: (rect: ViewportRect | null) => void;
  setOperationState: (state: Partial<AnnotationOperationState>) => void;
  setErrorMessage: (message: string | null) => void;
  selectFieldForEditing: (field: FieldTemplate) => void;
  openDraftField: (field: FieldTemplate) => void;
  setDraftField: (field: FieldTemplate | null) => void;
  setPreviews: (previews: FieldPreview[]) => void;
  setDraftPreview: (preview: FieldPreview | null) => void;
  reset: () => void;
}

const initialOperationState: AnnotationOperationState = {
  isLoadingSession: false,
  isSavingDraft: false,
  isRefreshingPreviews: false,
  isPreviewingDraft: false,
};

const initialState = {
  template: null,
  pdfInfo: null,
  savedFields: [],
  previewByFieldId: {},
  draftPreview: null,
  transientRect: null,
  draftField: null,
  selectedFieldId: null,
  currentPage: 1,
  zoom: 1,
  operationState: initialOperationState,
  errorMessage: null,
};

export const useAnnotationStore = create<AnnotationState>((set) => ({
  ...initialState,
  loadSession: (session) =>
    set({
      template: session.template,
      pdfInfo: session.pdf_info,
      savedFields: session.template.fields,
      previewByFieldId: {},
      draftPreview: null,
      transientRect: null,
      draftField: null,
      selectedFieldId: null,
      currentPage: 1,
      zoom: 1,
    }),
  applySavedTemplate: (template) =>
    set((state) => ({
      template,
      savedFields: template.fields,
      previewByFieldId: {},
      draftPreview: null,
      transientRect: null,
      draftField: null,
      selectedFieldId: null,
      currentPage: state.currentPage,
      zoom: state.zoom,
    })),
  setCurrentPage: (page) => set({ currentPage: page }),
  setZoom: (zoom) => set({ zoom }),
  setTransientRect: (rect) => set({ transientRect: rect }),
  setOperationState: (operationState) =>
    set((state) => ({
      operationState: { ...state.operationState, ...operationState },
    })),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  selectFieldForEditing: (field) =>
    set({
      draftField: cloneField(field),
      selectedFieldId: field.id,
      transientRect: null,
      draftPreview: null,
      currentPage: field.page,
    }),
  openDraftField: (field) =>
    set({
      draftField: cloneField(field),
      selectedFieldId: field.id,
      transientRect: null,
      draftPreview: null,
    }),
  setDraftField: (field) =>
    set({
      draftField: field ? cloneField(field) : null,
      selectedFieldId: field?.id ?? null,
      transientRect: null,
      draftPreview: null,
    }),
  setPreviews: (previews) =>
    set({
      previewByFieldId: Object.fromEntries(
        previews.map((preview) => [preview.field_id, preview]),
      ),
    }),
  setDraftPreview: (preview) => set({ draftPreview: preview }),
  reset: () =>
    set({
      ...initialState,
      operationState: { ...initialOperationState },
    }),
}));
