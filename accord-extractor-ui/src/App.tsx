import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { FormEvent } from "react";

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
import type { FormTemplate } from "./types";

const DEFAULT_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const DEFAULT_PDF_PATH =
  "/Users/andy/acord-extractor/data/sample/acord-125.pdf";
const DEFAULT_RECIPE_PATH =
  "/Users/andy/acord-extractor/data/sample/acord-125.recipe.json";

function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [pdfPath, setPdfPath] = useState(DEFAULT_PDF_PATH);
  const [recipePath, setRecipePath] = useState(DEFAULT_RECIPE_PATH);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

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
      const session = await startSession({ apiBaseUrl, pdfPath, recipePath });
      startTransition(() => loadSessionIntoStore(session));
      await refreshAllPreviews(session.template);
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
        loadSessionIntoStore({
          pdf_path: pdfPath,
          recipe_path: recipePath,
          pdf_info: pdfInfo,
          template: savedTemplate,
        });
        setCurrentPage(draftField.page);
      });
      await refreshAllPreviews(savedTemplate);
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
      <header className="topbar">
        <div>
          <p className="eyebrow">ACORD annotation MVP</p>
          <h1>Recipe editor with live preview</h1>
          <p className="subtitle">
            Load a PDF and recipe, draw or edit boxes on the left, and save
            canonical PDF-point annotations from the sidebar.
          </p>
        </div>

        <form className="session-form" onSubmit={handleLoadSession}>
          <label>
            <span>API base URL</span>
            <input
              value={apiBaseUrl}
              onChange={(event) => setApiBaseUrl(event.target.value)}
            />
          </label>
          <label>
            <span>PDF path</span>
            <input
              value={pdfPath}
              onChange={(event) => setPdfPath(event.target.value)}
            />
          </label>
          <label>
            <span>Recipe path</span>
            <input
              value={recipePath}
              onChange={(event) => setRecipePath(event.target.value)}
            />
          </label>

          <div className="button-row topbar-actions">
            <button
              type="submit"
              className="primary-button"
              disabled={isLoadingSession}
            >
              {isLoadingSession ? "Loading…" : "Load workspace"}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setPdfPath(DEFAULT_PDF_PATH);
                setRecipePath(DEFAULT_RECIPE_PATH);
              }}
            >
              Load sample paths
            </button>
          </div>
        </form>
      </header>

      {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

      <section className="workspace-grid">
        <div className="workspace-main">
          <div className="toolbar panel-card">
            <div className="toolbar-group">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={!pdfInfo || currentPage <= 1}
              >
                Previous page
              </button>
              <label className="page-label">
                <span>Page</span>
                <input
                  type="number"
                  min={1}
                  max={pdfInfo?.page_count ?? 1}
                  value={currentPage}
                  onChange={(event) =>
                    setCurrentPage(Number(event.target.value) || 1)
                  }
                  disabled={!pdfInfo}
                />
              </label>
              <button
                type="button"
                className="ghost-button"
                onClick={() =>
                  setCurrentPage(
                    Math.min(
                      pdfInfo?.page_count ?? currentPage,
                      currentPage + 1,
                    ),
                  )
                }
                disabled={!pdfInfo || currentPage >= (pdfInfo?.page_count ?? 1)}
              >
                Next page
              </button>
            </div>

            <div className="toolbar-group toolbar-metadata">
              <div>
                <p className="eyebrow">Zoom</p>
                <div className="zoom-buttons">
                  {[0.8, 1, 1.25, 1.5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={
                        value === zoom
                          ? "chip-button chip-active"
                          : "chip-button"
                      }
                      onClick={() => setZoom(value)}
                    >
                      {Math.round(value * 100)}%
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="eyebrow">Runtime geometry</p>
                <p className="meta-line">
                  {currentPageSize
                    ? `${currentPageSize.width.toFixed(0)} × ${currentPageSize.height.toFixed(0)} · rotation ${currentPageSize.rotation}`
                    : "Load a PDF to inspect page metadata"}
                </p>
              </div>
            </div>
          </div>

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
          <div className="panel-card field-list-panel">
            <p className="eyebrow">Field list</p>
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
                        onClick={() => {
                          openDraftField(field);
                          setCurrentPage(field.page);
                        }}
                      >
                        <span>
                          <strong>{field.label ?? field.name}</strong>
                          <small>{field.name}</small>
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
                <li className="field-list-empty">No saved annotations yet.</li>
              )}
            </ul>
          </div>

          <Sidebar
            draftField={draftField}
            selectedPreview={selectedPreview}
            isSaving={isSavingDraft}
            saveEnabled={saveEnabled}
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
