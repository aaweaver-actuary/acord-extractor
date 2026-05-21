import { describe, expect, it } from "vitest";

import { buildPdfFileUrl } from "./api";
import { getDefaultApiBaseUrl, normalizeApiBaseUrl } from "./apiBaseUrl";

describe("api base url normalization", () => {
  it("uses the proxy path by default in dev", () => {
    expect(getDefaultApiBaseUrl({ isDev: true })).toBe("/api");
  });

  it("uses the same-origin root by default outside dev", () => {
    expect(getDefaultApiBaseUrl({ isDev: false })).toBe("");
  });

  it("rewrites proxy api bases to the same-origin root outside dev", () => {
    expect(normalizeApiBaseUrl("/api", { isDev: false })).toBe("");
  });
});

describe("api url building", () => {
  it("supports same-origin proxy api bases", () => {
    expect(buildPdfFileUrl("/api", "data/sample/acord-125.pdf")).toContain(
      "/api/pdf/file?pdf_path=data%2Fsample%2Facord-125.pdf",
    );
  });

  it("supports absolute api bases", () => {
    expect(
      buildPdfFileUrl("http://127.0.0.1:8009", "data/sample/acord-125.pdf"),
    ).toBe(
      "http://127.0.0.1:8009/pdf/file?pdf_path=data%2Fsample%2Facord-125.pdf",
    );
  });
});
