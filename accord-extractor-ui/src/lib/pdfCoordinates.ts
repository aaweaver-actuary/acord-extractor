import type { Bbox, ViewportRect } from "../types";

export interface ViewportLike {
  width: number;
  height: number;
  rotation: number;
  convertToPdfPoint: (x: number, y: number) => [number, number];
  convertToViewportPoint: (x: number, y: number) => [number, number];
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
    viewport.convertToPdfPoint(rect.x, rect.y),
    viewport.convertToPdfPoint(rect.x + rect.width, rect.y),
    viewport.convertToPdfPoint(rect.x, rect.y + rect.height),
    viewport.convertToPdfPoint(rect.x + rect.width, rect.y + rect.height),
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
    viewport.convertToViewportPoint(left, top),
    viewport.convertToViewportPoint(right, top),
    viewport.convertToViewportPoint(left, bottom),
    viewport.convertToViewportPoint(right, bottom),
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
