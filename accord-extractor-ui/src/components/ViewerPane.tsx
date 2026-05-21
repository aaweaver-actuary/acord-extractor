import Konva from "konva";
import type { ComponentProps } from "react";
import { useEffect, useRef, useState } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { Rect, Stage, Layer, Transformer } from "react-konva";
import { Document, Page } from "react-pdf";

import { debugError, debugLog } from "../lib/debugLogger";
import {
  normalizeViewportRect,
  pdfBboxToViewportRect,
  viewportRectToPdfBbox,
} from "../lib/pdfCoordinates";
import type { ViewportLike } from "../lib/pdfCoordinates";
import { createDraftField } from "../lib/template";
import { useAnnotationStore } from "../state/useAnnotationStore";
import {
  useCurrentPageSize,
  useVisibleSavedFields,
} from "../state/useAnnotationView";
import type { FieldTemplate, ViewportRect } from "../types";

interface ViewerPaneProps {
  pdfUrl: string;
}

type LoadedPage = Parameters<
  NonNullable<ComponentProps<typeof Page>["onLoadSuccess"]>
>[0];

function fieldColor(fieldType: FieldTemplate["field_type"]): string {
  switch (fieldType) {
    case "checkbox":
      return "rgba(13, 148, 136, 0.28)";
    case "date":
    case "money":
    case "phone":
      return "rgba(245, 158, 11, 0.28)";
    case "table_region":
      return "rgba(99, 102, 241, 0.24)";
    default:
      return "rgba(14, 116, 144, 0.22)";
  }
}

function getScrollFrameMetrics(element: HTMLDivElement | null) {
  if (!element) {
    return {
      clientHeight: null,
      clientWidth: null,
      hasHorizontalOverflow: null,
      hasVerticalOverflow: null,
      offsetHeight: null,
      offsetWidth: null,
      scrollHeight: null,
      scrollWidth: null,
    };
  }

  return {
    clientHeight: element.clientHeight,
    clientWidth: element.clientWidth,
    hasHorizontalOverflow: element.scrollWidth > element.clientWidth,
    hasVerticalOverflow: element.scrollHeight > element.clientHeight,
    offsetHeight: element.offsetHeight,
    offsetWidth: element.offsetWidth,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
  };
}

export function ViewerPane(props: ViewerPaneProps) {
  const currentPage = useAnnotationStore((state) => state.currentPage);
  const draftField = useAnnotationStore((state) => state.draftField);
  const setDraftField = useAnnotationStore((state) => state.setDraftField);
  const selectFieldForEditing = useAnnotationStore(
    (state) => state.selectFieldForEditing,
  );
  const setTransientRect = useAnnotationStore(
    (state) => state.setTransientRect,
  );
  const transientRect = useAnnotationStore((state) => state.transientRect);
  const zoom = useAnnotationStore((state) => state.zoom);
  const visibleSavedFields = useVisibleSavedFields();
  const currentPageSize = useCurrentPageSize();
  const scrollFrameRef = useRef<HTMLDivElement | null>(null);
  const draftRectRef = useRef<Konva.Rect | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const zoomSnapshotKeyRef = useRef<string | null>(null);
  const [availableWidth, setAvailableWidth] = useState(720);
  const [viewport, setViewport] = useState<ViewportLike | null>(null);

  useEffect(() => {
    debugLog("viewer", "mounted", { pdfUrl: props.pdfUrl });

    return () => {
      debugLog("viewer", "unmounted", { pdfUrl: props.pdfUrl });
    };
  }, [props.pdfUrl]);

  useEffect(() => {
    const snapshotKey = JSON.stringify({
      currentPage,
      currentPageHeight: currentPageSize?.height ?? null,
      currentPageRotation: currentPageSize?.rotation ?? null,
      currentPageWidth: currentPageSize?.width ?? null,
      pdfUrl: props.pdfUrl,
      zoom,
    });

    if (zoomSnapshotKeyRef.current === snapshotKey) {
      return;
    }

    zoomSnapshotKeyRef.current = snapshotKey;

    debugLog("viewer", "zoom snapshot", {
      availableWidth,
      currentPage,
      currentPageHeight: currentPageSize?.height ?? null,
      currentPageRotation: currentPageSize?.rotation ?? null,
      currentPageWidth: currentPageSize?.width ?? null,
      hasViewport: Boolean(viewport),
      pdfUrl: props.pdfUrl,
      renderWidth: availableWidth * zoom,
      ...getScrollFrameMetrics(scrollFrameRef.current),
      viewportHeight: viewport?.height ?? null,
      viewportWidth: viewport?.width ?? null,
      zoom,
    });
  }, [
    availableWidth,
    currentPage,
    currentPageSize,
    props.pdfUrl,
    viewport,
    zoom,
  ]);

  useEffect(() => {
    const element = scrollFrameRef.current;
    if (!element) {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const nextWidth = Math.max(360, Math.round(entry.contentRect.width));
      setAvailableWidth((currentWidth) => {
        if (currentWidth === nextWidth) {
          return currentWidth;
        }

        const currentZoom = useAnnotationStore.getState().zoom;

        debugLog(
          "viewer",
          "frame width changed",
          {
            contentRectWidth: Math.round(entry.contentRect.width),
            currentPage: useAnnotationStore.getState().currentPage,
            nextWidth,
            previousWidth: currentWidth,
            renderWidth: nextWidth * currentZoom,
            ...getScrollFrameMetrics(element),
            zoom: currentZoom,
          },
          { maxOccurrences: 6 },
        );

        return nextWidth;
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!draftRectRef.current || !transformerRef.current) {
      return;
    }

    transformerRef.current.nodes([draftRectRef.current]);
    transformerRef.current.getLayer()?.batchDraw();
  }, [draftField, viewport]);

  useEffect(() => {
    function handleCreateDraft(event: Event) {
      if (draftField || !viewport) {
        return;
      }
      const customEvent = event as CustomEvent<{
        page?: number;
        rect: ViewportRect;
      }>;
      if (!customEvent.detail?.rect) {
        return;
      }
      if (
        customEvent.detail.page !== undefined &&
        customEvent.detail.page !== currentPage
      ) {
        return;
      }

      if (!currentPageSize) {
        return;
      }

      setDraftField(
        createDraftField({
          currentPage,
          existingFields: useAnnotationStore.getState().savedFields,
          pageSize: [currentPageSize.width, currentPageSize.height],
          viewportRect: normalizeViewportRect(customEvent.detail.rect),
          viewport,
        }),
      );
    }

    window.addEventListener("acord:create-draft", handleCreateDraft);
    return () => {
      window.removeEventListener("acord:create-draft", handleCreateDraft);
    };
  }, [currentPage, currentPageSize, draftField, setDraftField, viewport]);

  const renderWidth = availableWidth * zoom;

  function handlePageLoadSuccess(page: LoadedPage) {
    const baseViewport = page.getViewport({ scale: 1, rotation: page.rotate });
    const scale = renderWidth / baseViewport.width;
    const scaledViewport = page.getViewport({ scale, rotation: page.rotate });

    debugLog(
      "viewer",
      "page load success",
      {
        baseHeight: baseViewport.height,
        baseWidth: baseViewport.width,
        currentPage,
        pdfUrl: props.pdfUrl,
        renderWidth,
        rotation: page.rotate,
        scaledHeight: scaledViewport.height,
        scaledWidth: scaledViewport.width,
        ...getScrollFrameMetrics(scrollFrameRef.current),
        zoom,
      },
      { maxOccurrences: 4 },
    );

    setViewport({
      width: scaledViewport.width,
      height: scaledViewport.height,
      rotation: scaledViewport.rotation,
      convertToPdfPoint: (x, y) => {
        const [pdfX, pdfY] = scaledViewport.convertToPdfPoint(x, y);
        return [pdfX, pdfY];
      },
      convertToViewportPoint: (x, y) => {
        const [viewX, viewY] = scaledViewport.convertToViewportPoint(x, y);
        return [viewX, viewY];
      },
    });
  }

  function handleStagePointerDown(event: KonvaEventObject<MouseEvent>) {
    if (draftField || !viewport) {
      return;
    }
    const stage = event.target.getStage();
    if (!stage) {
      return;
    }
    const pointer = stage.getPointerPosition();
    if (!pointer) {
      return;
    }
    setTransientRect({
      x: pointer.x,
      y: pointer.y,
      width: 0,
      height: 0,
    });
  }

  function handleStagePointerMove(event: KonvaEventObject<MouseEvent>) {
    if (!transientRect) {
      return;
    }
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) {
      return;
    }

    setTransientRect(
      normalizeViewportRect({
        x: transientRect.x,
        y: transientRect.y,
        width: pointer.x - transientRect.x,
        height: pointer.y - transientRect.y,
      }),
    );
  }

  function handleStagePointerUp() {
    if (!transientRect || !viewport || !currentPageSize) {
      return;
    }
    if (transientRect.width < 6 || transientRect.height < 6) {
      setTransientRect(null);
      return;
    }

    setDraftField(
      createDraftField({
        currentPage,
        existingFields: useAnnotationStore.getState().savedFields,
        pageSize: [currentPageSize.width, currentPageSize.height],
        viewportRect: transientRect,
        viewport,
      }),
    );
    setTransientRect(null);
  }

  const draftRect =
    viewport && draftField && draftField.page === currentPage
      ? pdfBboxToViewportRect(viewport, draftField.bbox)
      : null;

  return (
    <section className="viewer-pane">
      <div className="viewer-scroll" ref={scrollFrameRef}>
        <div className="viewer-canvas">
          <Document
            file={props.pdfUrl}
            loading={<div className="viewer-state">Loading PDF…</div>}
            onLoadError={(error) => {
              debugError("viewer", "document load failed", error, {
                pdfUrl: props.pdfUrl,
              });
            }}
            onLoadSuccess={(pdf) => {
              debugLog(
                "viewer",
                "document load success",
                {
                  numPages: pdf.numPages,
                  pdfUrl: props.pdfUrl,
                },
                { maxOccurrences: 1 },
              );
            }}
            onSourceError={(error) => {
              debugError("viewer", "document source failed", error, {
                pdfUrl: props.pdfUrl,
              });
            }}
            onSourceSuccess={() => {
              debugLog(
                "viewer",
                "document source resolved",
                {
                  pdfUrl: props.pdfUrl,
                },
                { maxOccurrences: 1 },
              );
            }}
          >
            <div className="page-stack">
              <Page
                pageNumber={currentPage}
                width={renderWidth}
                onRenderError={(error) => {
                  debugError("viewer", "page render failed", error, {
                    currentPage,
                    pdfUrl: props.pdfUrl,
                    renderWidth,
                  });
                }}
                onRenderSuccess={() => {
                  debugLog(
                    "viewer",
                    "page render success",
                    {
                      currentPage,
                      pdfUrl: props.pdfUrl,
                      renderWidth,
                      ...getScrollFrameMetrics(scrollFrameRef.current),
                      zoom,
                    },
                    { maxOccurrences: 4 },
                  );
                }}
                renderAnnotationLayer={false}
                renderTextLayer={false}
                onLoadSuccess={handlePageLoadSuccess}
              />

              {viewport ? (
                <Stage
                  className="overlay-stage"
                  width={viewport.width}
                  height={viewport.height}
                  onMouseDown={handleStagePointerDown}
                  onMouseMove={handleStagePointerMove}
                  onMouseUp={handleStagePointerUp}
                >
                  <Layer>
                    {visibleSavedFields.map((field) => {
                      const rect = pdfBboxToViewportRect(viewport, field.bbox);
                      return (
                        <Rect
                          key={field.id}
                          x={rect.x}
                          y={rect.y}
                          width={rect.width}
                          height={rect.height}
                          fill={fieldColor(field.field_type)}
                          stroke="rgba(15, 23, 42, 0.72)"
                          strokeWidth={1.25}
                          onClick={() => selectFieldForEditing(field)}
                        />
                      );
                    })}

                    {transientRect ? (
                      <Rect
                        x={transientRect.x}
                        y={transientRect.y}
                        width={transientRect.width}
                        height={transientRect.height}
                        stroke="rgba(15, 118, 110, 0.9)"
                        dash={[8, 4]}
                        strokeWidth={2}
                      />
                    ) : null}

                    {draftRect ? (
                      <>
                        <Rect
                          ref={draftRectRef}
                          x={draftRect.x}
                          y={draftRect.y}
                          width={draftRect.width}
                          height={draftRect.height}
                          fill="rgba(220, 38, 38, 0.14)"
                          stroke="rgba(220, 38, 38, 0.96)"
                          strokeWidth={2}
                          draggable
                          onDragEnd={(event) => {
                            if (!viewport) {
                              return;
                            }
                            if (!draftField || !currentPageSize) {
                              return;
                            }

                            setDraftField({
                              ...draftField,
                              bbox: viewportRectToPdfBbox(viewport, {
                                x: event.target.x(),
                                y: event.target.y(),
                                width: event.target.width(),
                                height: event.target.height(),
                              }),
                              page: currentPage,
                              source_page_size: [
                                currentPageSize.width,
                                currentPageSize.height,
                              ],
                            });
                          }}
                          onTransformEnd={(event) => {
                            if (!viewport) {
                              return;
                            }
                            if (!draftField || !currentPageSize) {
                              return;
                            }
                            const node = event.target;
                            const width = node.width() * node.scaleX();
                            const height = node.height() * node.scaleY();
                            node.scaleX(1);
                            node.scaleY(1);

                            setDraftField({
                              ...draftField,
                              bbox: viewportRectToPdfBbox(viewport, {
                                x: node.x(),
                                y: node.y(),
                                width,
                                height,
                              }),
                              page: currentPage,
                              source_page_size: [
                                currentPageSize.width,
                                currentPageSize.height,
                              ],
                            });
                          }}
                        />
                        <Transformer
                          ref={transformerRef}
                          rotateEnabled={false}
                          enabledAnchors={[
                            "top-left",
                            "top-center",
                            "top-right",
                            "middle-left",
                            "middle-right",
                            "bottom-left",
                            "bottom-center",
                            "bottom-right",
                          ]}
                          keepRatio={false}
                          boundBoxFunc={(oldBox, newBox) => {
                            if (newBox.width < 12 || newBox.height < 12) {
                              return oldBox;
                            }
                            return newBox;
                          }}
                        />
                      </>
                    ) : null}
                  </Layer>
                </Stage>
              ) : null}
            </div>
          </Document>
        </div>
      </div>
    </section>
  );
}
