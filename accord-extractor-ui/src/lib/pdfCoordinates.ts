import type { Bbox, ViewportRect } from "../types";

export interface ViewportLike {
  width: number;
  height: number;
  rotation: number;
  convertToPdfPoint: (x: number, y: number) => [number, number];
  convertToViewportPoint: (x: number, y: number) => [number, number];
}

interface PdfBounds {
  minX: number;
  maxY: number;
}

function getPdfBounds(viewport: ViewportLike): PdfBounds {
  const corners = [
    viewport.convertToPdfPoint(0, 0),
    viewport.convertToPdfPoint(viewport.width, 0),
    viewport.convertToPdfPoint(0, viewport.height),
    viewport.convertToPdfPoint(viewport.width, viewport.height),
  ];
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);

  return {
    minX: Math.min(...xs),
    maxY: Math.max(...ys),
  };
}

function viewportPointToCanonicalPdfPoint(
  viewport: ViewportLike,
  x: number,
  y: number,
): [number, number] {
  const [pdfX, pdfY] = viewport.convertToPdfPoint(x, y);
  const bounds = getPdfBounds(viewport);

  return [pdfX - bounds.minX, bounds.maxY - pdfY];
}

function canonicalPdfPointToViewportPoint(
  viewport: ViewportLike,
  x: number,
  y: number,
): [number, number] {
  const bounds = getPdfBounds(viewport);
  return viewport.convertToViewportPoint(x + bounds.minX, bounds.maxY - y);
}

function normalizeBounds(points: Array<[number, number]>): ViewportRect {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function viewportRectToPdfBbox(
  viewport: ViewportLike,
  rect: ViewportRect,
): Bbox {
  const points = [
    viewportPointToCanonicalPdfPoint(viewport, rect.x, rect.y),
    viewportPointToCanonicalPdfPoint(viewport, rect.x + rect.width, rect.y),
    viewportPointToCanonicalPdfPoint(viewport, rect.x, rect.y + rect.height),
    viewportPointToCanonicalPdfPoint(
      viewport,
      rect.x + rect.width,
      rect.y + rect.height,
    ),
  ];

  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export function pdfBboxToViewportRect(
  viewport: ViewportLike,
  bbox: Bbox,
): ViewportRect {
  const [left, top, right, bottom] = bbox;
  return normalizeBounds([
    canonicalPdfPointToViewportPoint(viewport, left, top),
    canonicalPdfPointToViewportPoint(viewport, right, top),
    canonicalPdfPointToViewportPoint(viewport, left, bottom),
    canonicalPdfPointToViewportPoint(viewport, right, bottom),
  ]);
}

export function normalizeViewportRect(rect: ViewportRect): ViewportRect {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  return {
    x: Math.min(rect.x, right),
    y: Math.min(rect.y, bottom),
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}
