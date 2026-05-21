import {
  getLocalWorkspaceSnapshotForSession,
  deriveRecipeExportFileName,
  saveLocalWorkspaceSnapshot,
} from "../lib/localWorkspace";
import { exportRecipeToFile } from "../lib/recipeExport";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  type FormEvent,
  type RefObject,
} from "react";

import { debugError, debugLog } from "../lib/debugLogger";
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
  const setRecipePath = useUiSettings((state) => state.setRecipePath);

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

  async function refreshAllPreviews(
    nextTemplate: FormTemplate,
    nextPdfPath = pdfPath,
  ) {
    debugLog("workflow", "refresh previews started", {
      fieldCount: nextTemplate.fields.length,
      pdfPath: nextPdfPath,
    });

    setOperationState({ isRefreshingPreviews: true });

    try {
      if (!nextTemplate.fields.length) {
        debugLog("workflow", "refresh previews skipped", {
          reason: "no-fields",
        });
        startTransition(() => setPreviews([]));
        return;
      }

      const previews = await requestPreview({
        apiBaseUrl,
        pdfPath: nextPdfPath,
        template: nextTemplate,
      });

      debugLog("workflow", "refresh previews completed", {
        previewCount: previews.length,
      });

      startTransition(() => setPreviews(previews));
    } finally {
      setOperationState({ isRefreshingPreviews: false });
    }
  }

  async function loadWorkspace(options?: {
    pdfPath?: string;
    recipePath?: string;
    useExistingRecipe?: boolean;
  }) {
    const nextPdfPath = options?.pdfPath ?? pdfPath;
    const nextRecipePath = options?.recipePath ?? recipePath;
    const nextUseExistingRecipe =
      options?.useExistingRecipe ?? useExistingRecipe;

    debugLog("workflow", "load workspace started", {
      apiBaseUrl,
      pdfPath: nextPdfPath,
      recipePath: nextUseExistingRecipe ? nextRecipePath : undefined,
      useExistingRecipe: nextUseExistingRecipe,
    });

    setErrorMessage(null);
    setOperationState({ isLoadingSession: true });

    try {
      const session = await startSession({
        apiBaseUrl,
        pdfPath: nextPdfPath,
        recipePath:
          nextUseExistingRecipe && nextRecipePath.trim()
            ? nextRecipePath
            : undefined,
      });

      debugLog("workflow", "start session completed", {
        hasRecipePath: Boolean(session.recipe_path),
        pageCount: session.pdf_info.page_count,
        pdfPath: session.pdf_path,
      });

      const localSnapshot = getLocalWorkspaceSnapshotForSession(session);
      const restoredTemplate = localSnapshot?.template ?? session.template;

      debugLog("workflow", "session template resolved", {
        fieldCount: restoredTemplate.fields.length,
        restoredFromLocalSnapshot: Boolean(localSnapshot),
      });

      startTransition(() => {
        loadSessionIntoStore({ ...session, template: restoredTemplate });
        if (localSnapshot) {
          setRecipePath(localSnapshot.recipePath ?? "");
        } else if (!session.recipe_path) {
          setRecipePath("");
        }
      });
      await refreshAllPreviews(restoredTemplate, nextPdfPath);
      workspaceRef.current?.scrollIntoView?.({
        behavior: "smooth",
        block: "start",
      });
    } catch (error) {
      debugError("workflow", "load workspace failed", error, {
        pdfPath: nextPdfPath,
        recipePath: nextUseExistingRecipe ? nextRecipePath : undefined,
      });
      setErrorMessage(toErrorMessage(error, "Unable to load session."));
    } finally {
      setOperationState({ isLoadingSession: false });
    }
  }

  async function handleLoadSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    debugLog("workflow", "workspace form submitted", {
      pdfPath,
      recipePath: useExistingRecipe ? recipePath : undefined,
      useExistingRecipe,
    });
    await loadWorkspace();
  }

  async function handleSaveDraft() {
    if (!draftField || !template || !pdfInfo) {
      return;
    }

    setErrorMessage(null);
    setOperationState({ isSavingDraft: true });
    const nextTemplate = buildTemplateSnapshot(
      template,
      upsertField(savedFields, draftField),
      pdfInfo,
    );
    const activeRecipePath = recipePath.trim();

    try {
      const savedTemplate = activeRecipePath
        ? await saveRecipe({
            apiBaseUrl,
            recipePath: activeRecipePath,
            template: nextTemplate,
          })
        : nextTemplate;

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

  async function handleExportRecipe() {
    if (!template || !pdfInfo) {
      return;
    }

    const exportFields = draftField
      ? upsertField(savedFields, draftField)
      : savedFields;
    const exportTemplate = buildTemplateSnapshot(
      template,
      exportFields,
      pdfInfo,
    );
    const existingSnapshot = getLocalWorkspaceSnapshotForSession({
      pdf_path: pdfPath,
      pdf_info: pdfInfo,
    });

    setErrorMessage(null);
    setOperationState({ isExportingRecipe: true });

    try {
      const exportResult = await exportRecipeToFile({
        template: exportTemplate,
        suggestedFileName: deriveRecipeExportFileName({
          pdfPath,
          recipePath,
          preferredRecipeFileName: existingSnapshot?.preferredRecipeFileName,
        }),
      });

      if (!exportResult) {
        return;
      }

      saveLocalWorkspaceSnapshot({
        pdfPath,
        pdfInfo,
        recipePath,
        preferredRecipeFileName: exportResult.fileName,
        template: exportTemplate,
      });
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Unable to export recipe."));
    } finally {
      setOperationState({ isExportingRecipe: false });
    }
  }

  useEffect(() => {
    if (!template || !pdfInfo) {
      return;
    }

    const mergedFields = draftField
      ? upsertField(savedFields, draftField)
      : savedFields;
    const snapshotTemplate = buildTemplateSnapshot(
      template,
      mergedFields,
      pdfInfo,
    );

    saveLocalWorkspaceSnapshot({
      pdfPath,
      pdfInfo,
      recipePath,
      preferredRecipeFileName:
        getLocalWorkspaceSnapshotForSession({
          pdf_path: pdfPath,
          pdf_info: pdfInfo,
        })?.preferredRecipeFileName ?? null,
      template: snapshotTemplate,
    });
  }, [draftField, pdfInfo, pdfPath, recipePath, savedFields, template]);

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
    handleExportRecipe,
    isExportingRecipe: operationState.isExportingRecipe,
    isLoadingSession: operationState.isLoadingSession,
    isPreviewingDraft: operationState.isPreviewingDraft,
    isRefreshingPreviews: operationState.isRefreshingPreviews,
    isSavingDraft: operationState.isSavingDraft,
    loadWorkspace,
  };
}
