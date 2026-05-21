import type { FormEvent } from "react";

import type { PdfDocumentInfo } from "../types";

interface NavbarProps {
  apiBaseUrl: string;
  currentPage: number;
  currentPageSize?: PdfDocumentInfo["pages"][number];
  isLoadingSession: boolean;
  onApiBaseUrlChange: (value: string) => void;
  onLoadSamplePaths: () => void;
  onLoadSession: (event: FormEvent<HTMLFormElement>) => void;
  onSetCurrentPage: (page: number) => void;
  onSetZoom: (zoom: number) => void;
  pdfInfo: PdfDocumentInfo | null;
  pdfPath: string;
  recipePath: string;
  useExistingRecipe: boolean;
  onPdfPathChange: (value: string) => void;
  onRecipePathChange: (value: string) => void;
  onUseExistingRecipeChange: (value: boolean) => void;
  zoom: number;
}

export function Navbar(props: NavbarProps) {
  return (
    <header className="navbar-shell">
      <div className="navbar-bar panel-card">
        <div>
          <p className="eyebrow">ACORD annotation MVP</p>
          <h1 className="navbar-title">Focus the PDF, not the chrome</h1>
          <p className="subtitle navbar-subtitle">
            Load a PDF, draw boxes, and only open the annotator when you are
            working on a specific field.
          </p>
        </div>

        <div className="navbar-menu-row">
          {props.pdfInfo ? (
            <details className="nav-menu">
              <summary>View</summary>
              <div className="nav-menu-panel">
                <div className="nav-view-row">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() =>
                      props.onSetCurrentPage(Math.max(1, props.currentPage - 1))
                    }
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
                      onChange={(event) =>
                        props.onSetCurrentPage(Number(event.target.value) || 1)
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() =>
                      props.onSetCurrentPage(
                        Math.min(
                          props.pdfInfo?.page_count ?? props.currentPage,
                          props.currentPage + 1,
                        ),
                      )
                    }
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
                          onClick={() => props.onSetZoom(value)}
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

          <details className="nav-menu">
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
        </div>
      </div>

      <form className="navbar-form panel-card" onSubmit={props.onLoadSession}>
        <label className="navbar-field navbar-field-wide">
          <span>PDF path</span>
          <input
            value={props.pdfPath}
            onChange={(event) => props.onPdfPathChange(event.target.value)}
          />
        </label>

        <label className="navbar-field navbar-field-wide">
          <span>Recipe path</span>
          <input
            value={props.recipePath}
            onChange={(event) => props.onRecipePathChange(event.target.value)}
          />
        </label>

        <label className="navbar-checkbox">
          <input
            type="checkbox"
            checked={props.useExistingRecipe}
            onChange={(event) =>
              props.onUseExistingRecipeChange(event.target.checked)
            }
          />
          <span>Use recipe on load</span>
        </label>

        <p className="navbar-help">
          Loading a PDF starts with no recipe by default. Opt in only when you
          want to reuse an existing recipe.
        </p>

        <div className="button-row navbar-submit-row">
          <button
            type="submit"
            className="primary-button"
            disabled={props.isLoadingSession}
          >
            {props.isLoadingSession ? "Loading…" : "Load workspace"}
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={props.onLoadSamplePaths}
          >
            Load sample paths
          </button>
        </div>
      </form>
    </header>
  );
}
