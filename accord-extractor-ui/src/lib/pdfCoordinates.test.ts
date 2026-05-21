import { describe, expect, it } from "vitest";

import {
  normalizeViewportRect,
  pdfBboxToViewportRect,
  viewportRectToPdfBbox,
} from "./pdfCoordinates";
import type { ViewportLike } from "./pdfCoordinates";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

function makeViewport(scale: number): ViewportLike {
  return {
    width: PAGE_WIDTH * scale,
    height: PAGE_HEIGHT * scale,
    rotation: 0,
    convertToPdfPoint: (x, y) => [x / scale, PAGE_HEIGHT - y / scale],
    convertToViewportPoint: (x, y) => [x * scale, (PAGE_HEIGHT - y) * scale],
  };
}

function makeRotatedViewport(scale: number): ViewportLike {
  return {
    width: PAGE_HEIGHT * scale,
    height: PAGE_WIDTH * scale,
    rotation: 90,
    convertToPdfPoint: (x, y) => [y / scale, PAGE_HEIGHT - x / scale],
    convertToViewportPoint: (x, y) => [(PAGE_HEIGHT - y) * scale, x * scale],
  };
}

describe("pdfCoordinates", () => {
  it("round-trips between viewport and pdf coordinates", () => {
    const viewport = makeViewport(1.5);
    const rect = { x: 108, y: 180, width: 372, height: 37.5 };

    const bbox = viewportRectToPdfBbox(viewport, rect);

    expect(bbox).toEqual([72, 120, 320, 145]);
    expect(pdfBboxToViewportRect(viewport, bbox)).toEqual(rect);
  });

  it("handles rotated viewport conversions", () => {
    const viewport = makeRotatedViewport(1);
    const bbox: [number, number, number, number] = [72, 120, 320, 145];

    const rect = pdfBboxToViewportRect(viewport, bbox);

    expect(rect).toEqual({ x: 120, y: 72, width: 25, height: 248 });
    expect(viewportRectToPdfBbox(viewport, rect)).toEqual(bbox);
  });

  it("normalizes negative drag rectangles", () => {
    expect(
      normalizeViewportRect({ x: 160, y: 180, width: -40, height: -30 }),
    ).toEqual({ x: 120, y: 150, width: 40, height: 30 });
  });
});
