import { useEffect, useRef, useState } from "react";

import { Navbar } from "./components/Navbar";
import { Sidebar } from "./components/Sidebar";
import { ViewerPane } from "./components/ViewerPane";
import { buildPdfFileUrl, uploadWorkspaceFile } from "./lib/api";
import { debugError, debugLog } from "./lib/debugLogger";
import { SAMPLE_PDF_PATH, SAMPLE_RECIPE_PATH } from "./lib/samplePaths";
import { useAnnotationStore } from "./state/useAnnotationStore";
import { useCurrentPageSize } from "./state/useAnnotationView";
import { useAnnotationWorkflows } from "./state/useAnnotationWorkflows";
import { useUiSettings } from "./state/useUiSettings";

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function App() {
  const [pdfPath, setPdfPath] = useState(SAMPLE_PDF_PATH);
  const [useExistingRecipe, setUseExistingRecipe] = useState(false);
  const [isUploadingWorkspaceAsset, setIsUploadingWorkspaceAsset] =
    useState(false);
  const workspaceRef = useRef<HTMLElement | null>(null);

  const apiBaseUrl = useUiSettings((state) => state.apiBaseUrl);
  const recipePath = useUiSettings((state) => state.recipePath);
  const setApiBaseUrl = useUiSettings((state) => state.setApiBaseUrl);
  const setRecipePath = useUiSettings((state) => state.setRecipePath);

  const pdfInfo = useAnnotationStore((state) => state.pdfInfo);
  const currentPdfPath = useAnnotationStore((state) => state.currentPdfPath);
  const currentPage = useAnnotationStore((state) => state.currentPage);
  const zoom = useAnnotationStore((state) => state.zoom);
  const setCurrentPage = useAnnotationStore((state) => state.setCurrentPage);
  const setZoom = useAnnotationStore((state) => state.setZoom);
  const setErrorMessage = useAnnotationStore((state) => state.setErrorMessage);

  const currentPageSize = useCurrentPageSize();
  const activePdfPath = currentPdfPath ?? pdfPath;
  const pdfUrl = buildPdfFileUrl(apiBaseUrl, activePdfPath);
  const {
    errorMessage,
    handleExportRecipe,
    handleLoadSession,
    handleSaveDraft,
    isExportingRecipe,
    isLoadingSession,
    isSavingDraft,
    loadWorkspace,
  } = useAnnotationWorkflows({
    pdfPath,
    useExistingRecipe,
    workspaceRef,
  });

  useEffect(() => {
    debugLog("app", "pdf source changed", {
      activePdfPath,
      apiBaseUrl,
      currentPdfPath,
      pdfPath,
      pdfUrl,
      recipePath,
      useExistingRecipe,
    });
  }, [
    activePdfPath,
    apiBaseUrl,
    currentPdfPath,
    pdfPath,
    pdfUrl,
    recipePath,
    useExistingRecipe,
  ]);

  useEffect(() => {
    debugLog("app", "viewer state changed", {
      currentPage,
      currentPageSize:
        currentPageSize === undefined
          ? null
          : {
              height: currentPageSize.height,
              page: currentPageSize.page,
              rotation: currentPageSize.rotation,
              width: currentPageSize.width,
            },
      hasPdfInfo: Boolean(pdfInfo),
      isLoadingSession,
      isUploadingWorkspaceAsset,
      pageCount: pdfInfo?.page_count ?? 0,
      zoom,
    });
  }, [
    currentPage,
    currentPageSize,
    isLoadingSession,
    isUploadingWorkspaceAsset,
    pdfInfo,
    zoom,
  ]);

  useEffect(() => {
    if (!errorMessage) {
      return;
    }

    debugLog("app", "error message updated", {
      activePdfPath,
      errorMessage,
    });
  }, [activePdfPath, errorMessage]);

  async function handleWorkspaceFileUpload(options: {
    file: File;
    fileKind: "pdf" | "recipe";
    autoLoad?: boolean;
  }) {
    debugLog("app", "workspace upload started", {
      apiBaseUrl,
      autoLoad: options.autoLoad ?? true,
      fileKind: options.fileKind,
      name: options.file.name,
      size: options.file.size,
      type: options.file.type,
    });

    setErrorMessage(null);
    setIsUploadingWorkspaceAsset(true);

    try {
      const uploadedFile = await uploadWorkspaceFile({
        apiBaseUrl,
        file: options.file,
        fileKind: options.fileKind,
      });

      debugLog("app", "workspace upload completed", {
        fileKind: uploadedFile.file_kind,
        originalName: uploadedFile.original_name,
        storedPath: uploadedFile.stored_path,
      });

      if (uploadedFile.file_kind === "pdf") {
        setPdfPath(uploadedFile.stored_path);
        if (options.autoLoad ?? true) {
          debugLog("app", "loading workspace after pdf upload", {
            pdfPath: uploadedFile.stored_path,
          });
          await loadWorkspace({ pdfPath: uploadedFile.stored_path });
        }
        return;
      }

      setRecipePath(uploadedFile.stored_path);
    } catch (error) {
      debugError("app", "workspace upload failed", error, {
        fileKind: options.fileKind,
        name: options.file.name,
      });
      setErrorMessage(
        toErrorMessage(error, "Unable to upload the selected file."),
      );
    } finally {
      setIsUploadingWorkspaceAsset(false);
    }
  }

  return (
    <div className="app-shell">
      <Navbar
        apiBaseUrl={apiBaseUrl}
        currentPage={currentPage}
        currentPageSize={currentPageSize}
        isExportingRecipe={isExportingRecipe}
        isLoadingSession={isLoadingSession}
        isUploadingWorkspaceAsset={isUploadingWorkspaceAsset}
        onApiBaseUrlChange={setApiBaseUrl}
        onExportRecipe={handleExportRecipe}
        onLoadSamplePaths={() => {
          debugLog("app", "loading bundled sample paths", {
            pdfPath: SAMPLE_PDF_PATH,
            recipePath: SAMPLE_RECIPE_PATH,
          });
          setPdfPath(SAMPLE_PDF_PATH);
          setRecipePath(SAMPLE_RECIPE_PATH);
          setUseExistingRecipe(false);
        }}
        onLoadSession={handleLoadSession}
        onSetCurrentPage={setCurrentPage}
        onSetZoom={setZoom}
        onUploadPdf={(file) =>
          handleWorkspaceFileUpload({
            file,
            fileKind: "pdf",
            autoLoad: true,
          })
        }
        onUploadRecipe={(file) =>
          handleWorkspaceFileUpload({
            file,
            fileKind: "recipe",
            autoLoad: false,
          })
        }
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
            <ViewerPane pdfUrl={pdfUrl} />
          ) : (
            <div
              aria-busy={isUploadingWorkspaceAsset}
              className="viewer-placeholder panel-card"
            >
              <strong>Choose a PDF from the Workspace menu to begin.</strong>
              <p className="viewer-placeholder-copy">
                Use Choose PDF for a local file, Browse PDF on server for an
                existing path, and optionally load a recipe alongside it.
              </p>
            </div>
          )}
        </div>

        <div className="workspace-sidebar">
          <Sidebar isSaving={isSavingDraft} onSaveDraft={handleSaveDraft} />
        </div>
      </section>
    </div>
  );
}

export default App;
