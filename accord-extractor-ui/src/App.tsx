import { useRef, useState } from "react";

import { Navbar } from "./components/Navbar";
import { Sidebar } from "./components/Sidebar";
import { ViewerPane } from "./components/ViewerPane";
import { buildPdfFileUrl } from "./lib/api";
import { useAnnotationStore } from "./state/useAnnotationStore";
import { useCurrentPageSize } from "./state/useAnnotationView";
import { useAnnotationWorkflows } from "./state/useAnnotationWorkflows";
import { useUiSettings } from "./state/useUiSettings";

const DEFAULT_PDF_PATH =
  "/Users/andy/acord-extractor/data/sample/acord-125.pdf";
const DEFAULT_RECIPE_PATH =
  "/Users/andy/acord-extractor/data/sample/acord-125.recipe.json";

function App() {
  const [pdfPath, setPdfPath] = useState(DEFAULT_PDF_PATH);
  const [useExistingRecipe, setUseExistingRecipe] = useState(false);
  const workspaceRef = useRef<HTMLElement | null>(null);

  const apiBaseUrl = useUiSettings((state) => state.apiBaseUrl);
  const recipePath = useUiSettings((state) => state.recipePath);
  const setApiBaseUrl = useUiSettings((state) => state.setApiBaseUrl);
  const setRecipePath = useUiSettings((state) => state.setRecipePath);

  const pdfInfo = useAnnotationStore((state) => state.pdfInfo);
  const currentPage = useAnnotationStore((state) => state.currentPage);
  const zoom = useAnnotationStore((state) => state.zoom);
  const setCurrentPage = useAnnotationStore((state) => state.setCurrentPage);
  const setZoom = useAnnotationStore((state) => state.setZoom);

  const currentPageSize = useCurrentPageSize();
  const pdfUrl = buildPdfFileUrl(apiBaseUrl, pdfPath);
  const {
    errorMessage,
    handleLoadSession,
    handleSaveDraft,
    isLoadingSession,
    isSavingDraft,
  } = useAnnotationWorkflows({
    pdfPath,
    useExistingRecipe,
    workspaceRef,
  });

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
            <ViewerPane pdfUrl={pdfUrl} />
          ) : (
            <div className="viewer-placeholder panel-card">
              Load a session to start annotating.
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
