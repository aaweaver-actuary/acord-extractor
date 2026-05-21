import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FormEvent } from "react";

import { Navbar } from "./components/Navbar";
import { Sidebar } from "./components/Sidebar";
import { ViewerPane } from "./components/ViewerPane";
import {
  buildPdfFileUrl,
  requestPreview,
  saveRecipe,
  startSession,
} from "./lib/api";
import {
  buildTemplateSnapshot,
  createDraftField,
  upsertField,
} from "./lib/template";
import { useAnnotationStore } from "./state/useAnnotationStore";
import { useUiSettings } from "./state/useUiSettings";
import type { FormTemplate } from "./types";

const DEFAULT_PDF_PATH =
  "/Users/andy/acord-extractor/data/sample/acord-125.pdf";
const DEFAULT_RECIPE_PATH =
  "/Users/andy/acord-extractor/data/sample/acord-125.recipe.json";

function App() {
  const [pdfPath, setPdfPath] = useState(DEFAULT_PDF_PATH);
  const [useExistingRecipe, setUseExistingRecipe] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const workspaceRef = useRef<HTMLElement | null>(null);

  const apiBaseUrl = useUiSettings((state) => state.apiBaseUrl);
  const recipePath = useUiSettings((state) => state.recipePath);
  const setApiBaseUrl = useUiSettings((state) => state.setApiBaseUrl);
  const setRecipePath = useUiSettings((state) => state.setRecipePath);

  const template = useAnnotationStore((state) => state.template);
  const pdfInfo = useAnnotationStore((state) => state.pdfInfo);
  const savedFields = useAnnotationStore((state) => state.savedFields);
  const previewByFieldId = useAnnotationStore(
    (state) => state.previewByFieldId,
  );
  const draftPreview = useAnnotationStore((state) => state.draftPreview);
  const transientRect = useAnnotationStore((state) => state.transientRect);
  const draftField = useAnnotationStore((state) => state.draftField);
  const selectedFieldId = useAnnotationStore((state) => state.selectedFieldId);
  const currentPage = useAnnotationStore((state) => state.currentPage);
  const zoom = useAnnotationStore((state) => state.zoom);
  const loadSessionIntoStore = useAnnotationStore((state) => state.loadSession);
  const applySavedTemplate = useAnnotationStore(
    (state) => state.applySavedTemplate,
  );
  const setCurrentPage = useAnnotationStore((state) => state.setCurrentPage);
  const setZoom = useAnnotationStore((state) => state.setZoom);
  const setTransientRect = useAnnotationStore(
    (state) => state.setTransientRect,
  );
  const openDraftField = useAnnotationStore((state) => state.openDraftField);
  const setDraftField = useAnnotationStore((state) => state.setDraftField);
  const setPreviews = useAnnotationStore((state) => state.setPreviews);
  const setDraftPreview = useAnnotationStore((state) => state.setDraftPreview);

  const deferredDraftField = useDeferredValue(draftField);

  const selectedPreview = useMemo(() => {
    if (draftPreview) {
      return draftPreview;
    }
    if (!selectedFieldId) {
      return null;
    }
    return previewByFieldId[selectedFieldId] ?? null;
  }, [draftPreview, previewByFieldId, selectedFieldId]);

  const fieldList = useMemo(
    () => [...savedFields].sort((left, right) => left.page - right.page),
    [savedFields],
  );

  const pdfUrl = useMemo(
    () => buildPdfFileUrl(apiBaseUrl, pdfPath),
    [apiBaseUrl, pdfPath],
  );

  async function refreshAllPreviews(nextTemplate: FormTemplate) {
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
  }

  async function handleLoadSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsLoadingSession(true);

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
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load session.",
      );
    } finally {
      setIsLoadingSession(false);
    }
  }

  async function handleSaveDraft() {
    if (!draftField || !template || !pdfInfo || !recipePath.trim()) {
      return;
    }

    setErrorMessage(null);
    setIsSavingDraft(true);
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
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save recipe.",
      );
    } finally {
      setIsSavingDraft(false);
    }
  }

  useEffect(() => {
    let isCancelled = false;

    async function runPreview() {
      if (!deferredDraftField || !template || !pdfInfo) {
        startTransition(() => setDraftPreview(null));
        return;
      }
      if (isCancelled) {
        return;
      }

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
          setErrorMessage(
            error instanceof Error ? error.message : "Unable to preview field.",
          );
        }
      }
    }

    void runPreview();

    return () => {
      isCancelled = true;
    };
  }, [
    apiBaseUrl,
    applySavedTemplate,
    deferredDraftField,
    pdfInfo,
    pdfPath,
    savedFields,
    setDraftPreview,
    template,
  ]);

  const currentPageSize = pdfInfo?.pages[currentPage - 1];
  const saveEnabled = Boolean(draftField && recipePath.trim());

  return (
    <div className="app-shell">
      <Navbar
        apiBaseUrl={apiBaseUrl}
        currentPage={currentPage}
        currentPageSize={currentPageSize}
        isLoadingSession={isLoadingSession}
        onApiBaseUrlChange={setApiBaseUrl}
        onLoadSamplePaths={() => {
          setPdfPath(DEFAULT_PDF_PATH);
          setRecipePath(DEFAULT_RECIPE_PATH);
          setUseExistingRecipe(false);
        }}
        onLoadSession={handleLoadSession}
        onSetCurrentPage={setCurrentPage}
        onSetZoom={setZoom}
        pdfInfo={pdfInfo}
        pdfPath={pdfPath}
        recipePath={recipePath}
        useExistingRecipe={useExistingRecipe}
        onPdfPathChange={setPdfPath}
        onRecipePathChange={setRecipePath}
        onUseExistingRecipeChange={setUseExistingRecipe}
        zoom={zoom}
      />

      {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

      <section className="workspace-grid" ref={workspaceRef}>
        <div className="workspace-main">
          {pdfInfo ? (
            <ViewerPane
              pdfUrl={pdfUrl}
              currentPage={currentPage}
              zoom={zoom}
              savedFields={savedFields}
              draftField={draftField}
              transientRect={transientRect}
              onTransientRectChange={setTransientRect}
              onSelectField={(field) => {
                openDraftField(field);
                setCurrentPage(field.page);
              }}
              onCreateDraft={(viewportRect, viewport) => {
                if (!currentPageSize) {
                  return;
                }
                setDraftField(
                  createDraftField({
                    currentPage,
                    existingFields: savedFields,
                    pageSize: [currentPageSize.width, currentPageSize.height],
                    viewportRect,
                    viewport,
                  }),
                );
              }}
              onDraftBboxChange={(bbox) => {
                if (!draftField || !currentPageSize) {
                  return;
                }
                setDraftField({
                  ...draftField,
                  bbox,
                  page: currentPage,
                  source_page_size: [
                    currentPageSize.width,
                    currentPageSize.height,
                  ],
                });
              }}
            />
          ) : (
            <div className="viewer-placeholder panel-card">
              Load a session to start annotating.
            </div>
          )}
        </div>

        <div className="workspace-sidebar">
          <Sidebar
            draftField={draftField}
            fieldList={fieldList}
            hasLoadedDocument={Boolean(pdfInfo)}
            previewByFieldId={previewByFieldId}
            selectedFieldId={selectedFieldId}
            selectedPreview={selectedPreview}
            isSaving={isSavingDraft}
            saveEnabled={saveEnabled}
            onSelectField={(field) => {
              openDraftField(field);
              setCurrentPage(field.page);
            }}
            onDraftChange={(field) => setDraftField(field)}
            onSaveDraft={handleSaveDraft}
            onCancelDraft={() => setDraftField(null)}
          />
        </div>
      </section>
    </div>
  );
}

export default App;
