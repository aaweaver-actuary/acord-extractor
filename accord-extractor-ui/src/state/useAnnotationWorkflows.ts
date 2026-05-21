import {
  startTransition,
  useDeferredValue,
  useEffect,
  type FormEvent,
  type RefObject,
} from "react";

import { requestPreview, saveRecipe, startSession } from "../lib/api";
import { buildTemplateSnapshot, upsertField } from "../lib/template";
import { useAnnotationStore } from "./useAnnotationStore";
import { useUiSettings } from "./useUiSettings";
import type { FormTemplate } from "../types";

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

interface AnnotationWorkflowOptions {
  pdfPath: string;
  useExistingRecipe: boolean;
  workspaceRef: RefObject<HTMLElement | null>;
}

export function useAnnotationWorkflows(options: AnnotationWorkflowOptions) {
  const { pdfPath, useExistingRecipe, workspaceRef } = options;
  const apiBaseUrl = useUiSettings((state) => state.apiBaseUrl);
  const recipePath = useUiSettings((state) => state.recipePath);

  const template = useAnnotationStore((state) => state.template);
  const pdfInfo = useAnnotationStore((state) => state.pdfInfo);
  const savedFields = useAnnotationStore((state) => state.savedFields);
  const draftField = useAnnotationStore((state) => state.draftField);
  const operationState = useAnnotationStore((state) => state.operationState);
  const errorMessage = useAnnotationStore((state) => state.errorMessage);
  const loadSessionIntoStore = useAnnotationStore((state) => state.loadSession);
  const applySavedTemplate = useAnnotationStore(
    (state) => state.applySavedTemplate,
  );
  const setCurrentPage = useAnnotationStore((state) => state.setCurrentPage);
  const setPreviews = useAnnotationStore((state) => state.setPreviews);
  const setDraftPreview = useAnnotationStore((state) => state.setDraftPreview);
  const setOperationState = useAnnotationStore(
    (state) => state.setOperationState,
  );
  const setErrorMessage = useAnnotationStore((state) => state.setErrorMessage);

  const deferredDraftField = useDeferredValue(draftField);

  async function refreshAllPreviews(nextTemplate: FormTemplate) {
    setOperationState({ isRefreshingPreviews: true });

    try {
      if (!nextTemplate.fields.length) {
        startTransition(() => setPreviews([]));
        return;
      }

      const previews = await requestPreview({
        apiBaseUrl,
        pdfPath,
        template: nextTemplate,
      });

      startTransition(() => setPreviews(previews));
    } finally {
      setOperationState({ isRefreshingPreviews: false });
    }
  }

  async function handleLoadSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setOperationState({ isLoadingSession: true });

    try {
      const session = await startSession({
        apiBaseUrl,
        pdfPath,
        recipePath:
          useExistingRecipe && recipePath.trim() ? recipePath : undefined,
      });

      startTransition(() => loadSessionIntoStore(session));
      await refreshAllPreviews(session.template);
      workspaceRef.current?.scrollIntoView?.({
        behavior: "smooth",
        block: "start",
      });
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Unable to load session."));
    } finally {
      setOperationState({ isLoadingSession: false });
    }
  }

  async function handleSaveDraft() {
    if (!draftField || !template || !pdfInfo || !recipePath.trim()) {
      return;
    }

    setErrorMessage(null);
    setOperationState({ isSavingDraft: true });
    const nextTemplate = buildTemplateSnapshot(
      template,
      upsertField(savedFields, draftField),
      pdfInfo,
    );

    try {
      const savedTemplate = await saveRecipe({
        apiBaseUrl,
        recipePath,
        template: nextTemplate,
      });

      startTransition(() => {
        applySavedTemplate(savedTemplate);
        setCurrentPage(draftField.page);
      });
      await refreshAllPreviews(savedTemplate);
      workspaceRef.current?.scrollIntoView?.({
        behavior: "smooth",
        block: "start",
      });
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Unable to save recipe."));
    } finally {
      setOperationState({ isSavingDraft: false });
    }
  }

  useEffect(() => {
    let isCancelled = false;

    async function runPreview() {
      if (!deferredDraftField || !template || !pdfInfo) {
        setOperationState({ isPreviewingDraft: false });
        startTransition(() => setDraftPreview(null));
        return;
      }
      if (isCancelled) {
        return;
      }

      setOperationState({ isPreviewingDraft: true });
      const previewTemplate = buildTemplateSnapshot(
        template,
        upsertField(savedFields, deferredDraftField),
        pdfInfo,
      );

      try {
        const [preview] = await requestPreview({
          apiBaseUrl,
          pdfPath,
          template: previewTemplate,
          fieldId: deferredDraftField.id,
        });
        if (!isCancelled) {
          startTransition(() => setDraftPreview(preview ?? null));
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(toErrorMessage(error, "Unable to preview field."));
        }
      } finally {
        if (!isCancelled) {
          setOperationState({ isPreviewingDraft: false });
        }
      }
    }

    void runPreview();

    return () => {
      isCancelled = true;
    };
  }, [
    apiBaseUrl,
    deferredDraftField,
    pdfInfo,
    pdfPath,
    savedFields,
    setDraftPreview,
    setErrorMessage,
    setOperationState,
    template,
  ]);

  return {
    errorMessage,
    handleLoadSession,
    handleSaveDraft,
    isLoadingSession: operationState.isLoadingSession,
    isPreviewingDraft: operationState.isPreviewingDraft,
    isRefreshingPreviews: operationState.isRefreshingPreviews,
    isSavingDraft: operationState.isSavingDraft,
  };
}
