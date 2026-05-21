import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { debugLog, startDebugTrace } from "../lib/debugLogger";
import { PathPickerDialog } from "./PathPickerDialog";
import type { PdfDocumentInfo } from "../types";

const PDF_EXTENSIONS = [".pdf"];
const RECIPE_EXTENSIONS = [".json"];
const VIEW_MENU_CLOSE_DELAY_MS = 2000;

interface NavbarProps {
  apiBaseUrl: string;
  currentPage: number;
  currentPageSize?: PdfDocumentInfo["pages"][number];
  isExportingRecipe: boolean;
  isLoadingSession: boolean;
  isUploadingWorkspaceAsset: boolean;
  onApiBaseUrlChange: (value: string) => void;
  onExportRecipe: () => Promise<void> | void;
  onLoadSamplePaths: () => void;
  onLoadSession: (event: FormEvent<HTMLFormElement>) => void;
  onSetCurrentPage: (page: number) => void;
  onSetZoom: (zoom: number) => void;
  onUploadPdf: (file: File) => Promise<void> | void;
  onUploadRecipe: (file: File) => Promise<void> | void;
  pdfInfo: PdfDocumentInfo | null;
  pdfPath: string;
  recipePath: string;
  useExistingRecipe: boolean;
  onPdfPathChange: (value: string) => void;
  onRecipePathChange: (value: string) => void;
  onUseExistingRecipeChange: (value: boolean) => void;
  zoom: number;
}

function summarizePath(label: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return `${label}: none selected`;
  }

  const segments = trimmed.split(/[\\/]/).filter(Boolean);
  const leafName = segments.at(-1) ?? trimmed;
  return `${label}: ${leafName}`;
}

export function Navbar(props: NavbarProps) {
  const [pickerTarget, setPickerTarget] = useState<"pdf" | "recipe" | null>(
    null,
  );
  const pdfUploadInputRef = useRef<HTMLInputElement | null>(null);
  const recipeUploadInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceMenuRef = useRef<HTMLDetailsElement | null>(null);
  const viewMenuRef = useRef<HTMLDetailsElement | null>(null);
  const settingsMenuRef = useRef<HTMLDetailsElement | null>(null);
  const viewMenuCloseTimeoutRef = useRef<number | null>(null);

  function clearViewMenuCloseTimeout() {
    if (viewMenuCloseTimeoutRef.current !== null) {
      window.clearTimeout(viewMenuCloseTimeoutRef.current);
      viewMenuCloseTimeoutRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      clearViewMenuCloseTimeout();
    };
  }, []);

  function closeMenu(menuRef: React.RefObject<HTMLDetailsElement | null>) {
    if (menuRef.current) {
      menuRef.current.open = false;
    }
  }

  function handleMenuToggle(openMenu: "workspace" | "view" | "settings") {
    const menuRefs = {
      settings: settingsMenuRef,
      view: viewMenuRef,
      workspace: workspaceMenuRef,
    } as const;
    const activeMenuRef = menuRefs[openMenu];

    if (!activeMenuRef.current?.open) {
      if (openMenu === "view") {
        clearViewMenuCloseTimeout();
      }
      return;
    }

    for (const [menuName, menuRef] of Object.entries(menuRefs)) {
      if (menuName !== openMenu) {
        closeMenu(menuRef);
      }
    }

    if (openMenu !== "view") {
      clearViewMenuCloseTimeout();
    }
  }

  function scheduleViewMenuClose() {
    clearViewMenuCloseTimeout();

    viewMenuCloseTimeoutRef.current = window.setTimeout(() => {
      closeMenu(viewMenuRef);
      clearViewMenuCloseTimeout();
    }, VIEW_MENU_CLOSE_DELAY_MS);
  }

  function handleNativeUpload(
    event: ChangeEvent<HTMLInputElement>,
    fileKind: "pdf" | "recipe",
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    if (fileKind === "pdf") {
      void props.onUploadPdf(file);
      return;
    }

    void props.onUploadRecipe(file);
  }

  return (
    <form className="navbar-shell" onSubmit={props.onLoadSession}>
      <header className="navbar-bar navbar-bar-compact panel-card">
        <div className="navbar-brand-lockup">
          <p className="navbar-brand">acord-data-extractor</p>
          <p className="navbar-meta">Internal ACORD annotation workspace</p>
        </div>

        <div aria-live="polite" className="navbar-status-group">
          <p className="navbar-path-summary">
            {summarizePath("PDF", props.pdfPath)}
          </p>
          <p className="navbar-path-summary">
            {props.useExistingRecipe
              ? summarizePath("Recipe", props.recipePath)
              : "Recipe: load without recipe"}
          </p>
          {props.isUploadingWorkspaceAsset ? (
            <p className="navbar-upload-state">Uploading local file…</p>
          ) : null}
        </div>

        <div className="navbar-menu-row">
          <details
            className="nav-menu nav-menu-wide"
            onToggle={() => handleMenuToggle("workspace")}
            ref={workspaceMenuRef}
          >
            <summary>Workspace</summary>
            <div className="nav-menu-panel nav-menu-panel-wide">
              <div className="nav-panel-section">
                <label>
                  <span>PDF path</span>
                  <input
                    value={props.pdfPath}
                    onChange={(event) =>
                      props.onPdfPathChange(event.target.value)
                    }
                  />
                </label>

                <div className="button-row nav-file-actions">
                  <input
                    ref={pdfUploadInputRef}
                    aria-label="Choose PDF from computer"
                    accept=".pdf,application/pdf"
                    className="native-file-input"
                    onChange={(event) => handleNativeUpload(event, "pdf")}
                    type="file"
                  />
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={
                      props.isLoadingSession || props.isUploadingWorkspaceAsset
                    }
                    onClick={() => pdfUploadInputRef.current?.click()}
                  >
                    Choose PDF
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setPickerTarget("pdf")}
                  >
                    Browse PDF on server
                  </button>
                </div>
              </div>

              <div className="nav-panel-section">
                <label>
                  <span>Recipe path</span>
                  <input
                    value={props.recipePath}
                    onChange={(event) =>
                      props.onRecipePathChange(event.target.value)
                    }
                  />
                </label>

                <div className="button-row nav-file-actions">
                  <input
                    ref={recipeUploadInputRef}
                    aria-label="Choose recipe from computer"
                    accept=".json,application/json"
                    className="native-file-input"
                    onChange={(event) => handleNativeUpload(event, "recipe")}
                    type="file"
                  />
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={props.isUploadingWorkspaceAsset}
                    onClick={() => recipeUploadInputRef.current?.click()}
                  >
                    Choose recipe
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setPickerTarget("recipe")}
                  >
                    Browse recipe on server
                  </button>
                </div>
              </div>

              <label className="nav-toggle">
                <input
                  type="checkbox"
                  checked={props.useExistingRecipe}
                  onChange={(event) =>
                    props.onUseExistingRecipeChange(event.target.checked)
                  }
                />
                <span>Use recipe on load</span>
              </label>

              <p className="nav-settings-copy">
                Choose PDF or recipe uses your operating system picker and
                uploads a temp copy into the local backend.
              </p>

              <div className="button-row">
                <button
                  type="button"
                  className="primary-button"
                  disabled={
                    !props.pdfInfo ||
                    props.isExportingRecipe ||
                    props.isUploadingWorkspaceAsset
                  }
                  onClick={() => void props.onExportRecipe()}
                >
                  {props.isExportingRecipe ? "Exporting…" : "Export recipe"}
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={props.onLoadSamplePaths}
                >
                  Load sample paths
                </button>
              </div>
            </div>
          </details>

          {props.pdfInfo ? (
            <details
              className="nav-menu"
              onToggle={() => handleMenuToggle("view")}
              ref={viewMenuRef}
            >
              <summary>View</summary>
              <div className="nav-menu-panel">
                <div className="nav-view-row">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      props.onSetCurrentPage(
                        Math.max(1, props.currentPage - 1),
                      );
                      scheduleViewMenuClose();
                    }}
                    disabled={props.currentPage <= 1}
                  >
                    Previous page
                  </button>
                  <label className="page-label">
                    <span>Page</span>
                    <input
                      type="number"
                      min={1}
                      max={props.pdfInfo.page_count}
                      value={props.currentPage}
                      onChange={(event) => {
                        props.onSetCurrentPage(Number(event.target.value) || 1);
                        scheduleViewMenuClose();
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      props.onSetCurrentPage(
                        Math.min(
                          props.pdfInfo?.page_count ?? props.currentPage,
                          props.currentPage + 1,
                        ),
                      );
                      scheduleViewMenuClose();
                    }}
                    disabled={
                      props.currentPage >= (props.pdfInfo?.page_count ?? 1)
                    }
                  >
                    Next page
                  </button>
                </div>

                <div className="nav-view-row nav-view-row-wrap">
                  <div>
                    <p className="eyebrow">Zoom</p>
                    <div className="zoom-buttons">
                      {[0.8, 1, 1.25, 1.5].map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={
                            value === props.zoom
                              ? "chip-button chip-active"
                              : "chip-button"
                          }
                          onClick={() => {
                            if (value !== props.zoom) {
                              startDebugTrace(
                                "trace",
                                "zoom interaction started",
                                {
                                  currentPage: props.currentPage,
                                  fromZoom: props.zoom,
                                  messageFocus: "viewer zoom and layout",
                                  pageCount: props.pdfInfo?.page_count ?? null,
                                  toZoom: value,
                                },
                              );
                              debugLog("ui", "zoom requested", {
                                currentPage: props.currentPage,
                                currentPageHeight:
                                  props.currentPageSize?.height ?? null,
                                currentPageRotation:
                                  props.currentPageSize?.rotation ?? null,
                                currentPageWidth:
                                  props.currentPageSize?.width ?? null,
                                fromZoom: props.zoom,
                                toZoom: value,
                              });
                            }
                            props.onSetZoom(value);
                            scheduleViewMenuClose();
                          }}
                        >
                          {Math.round(value * 100)}%
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="nav-geometry">
                    <p className="eyebrow">Runtime geometry</p>
                    <p className="meta-line">
                      {props.currentPageSize
                        ? `${props.currentPageSize.width.toFixed(0)} × ${props.currentPageSize.height.toFixed(0)} · rotation ${props.currentPageSize.rotation}`
                        : "Load a PDF to inspect page metadata"}
                    </p>
                  </div>
                </div>
              </div>
            </details>
          ) : null}

          <details
            className="nav-menu"
            onToggle={() => handleMenuToggle("settings")}
            ref={settingsMenuRef}
          >
            <summary>Settings</summary>
            <div className="nav-menu-panel">
              <label>
                <span>API base URL</span>
                <input
                  value={props.apiBaseUrl}
                  onChange={(event) =>
                    props.onApiBaseUrlChange(event.target.value)
                  }
                />
              </label>
              <p className="nav-settings-copy">
                Saved locally so you do not have to re-enter it for each
                session.
              </p>
            </div>
          </details>

          <button
            type="submit"
            className="primary-button"
            disabled={props.isLoadingSession || props.isUploadingWorkspaceAsset}
          >
            {props.isLoadingSession
              ? "Loading…"
              : props.isUploadingWorkspaceAsset
                ? "Uploading…"
                : "Load workspace"}
          </button>
        </div>
      </header>

      {pickerTarget === "pdf" ? (
        <PathPickerDialog
          apiBaseUrl={props.apiBaseUrl}
          allowedExtensions={PDF_EXTENSIONS}
          description="Browse the backend filesystem and choose a PDF to annotate."
          initialPath={props.pdfPath}
          onClose={() => setPickerTarget(null)}
          onSelect={(path) => {
            props.onPdfPathChange(path);
            setPickerTarget(null);
          }}
          title="Choose PDF from server"
        />
      ) : null}

      {pickerTarget === "recipe" ? (
        <PathPickerDialog
          apiBaseUrl={props.apiBaseUrl}
          allowedExtensions={RECIPE_EXTENSIONS}
          description="Browse the backend filesystem and choose a recipe JSON file."
          initialPath={props.recipePath}
          onClose={() => setPickerTarget(null)}
          onSelect={(path) => {
            props.onRecipePathChange(path);
            setPickerTarget(null);
          }}
          title="Choose recipe from server"
        />
      ) : null}
    </form>
  );
}
