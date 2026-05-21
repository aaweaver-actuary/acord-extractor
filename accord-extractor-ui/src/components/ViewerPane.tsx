import Konva from "konva";
import type { ComponentProps } from "react";
import { useEffect, useRef, useState } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { Rect, Stage, Layer, Transformer } from "react-konva";
import { Document, Page } from "react-pdf";

import {
  normalizeViewportRect,
  pdfBboxToViewportRect,
  viewportRectToPdfBbox,
} from "../lib/pdfCoordinates";
import type { ViewportLike } from "../lib/pdfCoordinates";
import type { FieldTemplate, ViewportRect } from "../types";

interface ViewerPaneProps {
  pdfUrl: string;
  currentPage: number;
  zoom: number;
  savedFields: FieldTemplate[];
  draftField: FieldTemplate | null;
  transientRect: ViewportRect | null;
  onTransientRectChange: (rect: ViewportRect | null) => void;
  onSelectField: (field: FieldTemplate) => void;
  onCreateDraft: (rect: ViewportRect, viewport: ViewportLike) => void;
  onDraftBboxChange: (bbox: [number, number, number, number]) => void;
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

export function ViewerPane(props: ViewerPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draftRectRef = useRef<Konva.Rect | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const [availableWidth, setAvailableWidth] = useState(720);
  const [viewport, setViewport] = useState<ViewportLike | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      setAvailableWidth(Math.max(360, entry.contentRect.width - 32));
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
  }, [props.draftField, viewport]);

  const renderWidth = availableWidth * props.zoom;

  function handlePageLoadSuccess(page: LoadedPage) {
    const baseViewport = page.getViewport({ scale: 1, rotation: page.rotate });
    const scale = renderWidth / baseViewport.width;
    const scaledViewport = page.getViewport({ scale, rotation: page.rotate });
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
    if (props.draftField || !viewport) {
      return;
    }
    const stage = event.target.getStage();
    const targetClassName = event.target.getClassName();
    if (!stage || (event.target !== stage && targetClassName !== "Layer")) {
      return;
    }
    const pointer = stage.getPointerPosition();
    if (!pointer) {
      return;
    }
    props.onTransientRectChange({
      x: pointer.x,
      y: pointer.y,
      width: 0,
      height: 0,
    });
  }

  function handleStagePointerMove(event: KonvaEventObject<MouseEvent>) {
    if (!props.transientRect) {
      return;
    }
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) {
      return;
    }

    props.onTransientRectChange(
      normalizeViewportRect({
        x: props.transientRect.x,
        y: props.transientRect.y,
        width: pointer.x - props.transientRect.x,
        height: pointer.y - props.transientRect.y,
      }),
    );
  }

  function handleStagePointerUp() {
    if (!props.transientRect || !viewport) {
      return;
    }
    if (props.transientRect.width < 6 || props.transientRect.height < 6) {
      props.onTransientRectChange(null);
      return;
    }
    props.onCreateDraft(props.transientRect, viewport);
    props.onTransientRectChange(null);
  }

  const visibleSavedFields = props.savedFields.filter(
    (field) =>
      field.page === props.currentPage && field.id !== props.draftField?.id,
  );

  const draftRect =
    viewport && props.draftField && props.draftField.page === props.currentPage
      ? pdfBboxToViewportRect(viewport, props.draftField.bbox)
      : null;

  return (
    <section className="viewer-pane">
      <div className="viewer-scroll" ref={containerRef}>
        <div className="viewer-canvas">
          <Document
            file={props.pdfUrl}
            loading={<div className="viewer-state">Loading PDF…</div>}
          >
            <div className="page-stack">
              <Page
                key={`${props.currentPage}-${renderWidth}`}
                pageNumber={props.currentPage}
                width={renderWidth}
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
                          onClick={() => props.onSelectField(field)}
                        />
                      );
                    })}

                    {props.transientRect ? (
                      <Rect
                        x={props.transientRect.x}
                        y={props.transientRect.y}
                        width={props.transientRect.width}
                        height={props.transientRect.height}
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
                            props.onDraftBboxChange(
                              viewportRectToPdfBbox(viewport, {
                                x: event.target.x(),
                                y: event.target.y(),
                                width: event.target.width(),
                                height: event.target.height(),
                              }),
                            );
                          }}
                          onTransformEnd={(event) => {
                            if (!viewport) {
                              return;
                            }
                            const node = event.target;
                            const width = node.width() * node.scaleX();
                            const height = node.height() * node.scaleY();
                            node.scaleX(1);
                            node.scaleY(1);
                            props.onDraftBboxChange(
                              viewportRectToPdfBbox(viewport, {
                                x: node.x(),
                                y: node.y(),
                                width,
                                height,
                              }),
                            );
                          }}
                        />
                        <Transformer
                          ref={transformerRef}
                          rotateEnabled={false}
                          enabledAnchors={[
                            "top-left",
                            "top-right",
                            "bottom-left",
                            "bottom-right",
                          ]}
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
