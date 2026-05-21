import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { useAnnotationStore } from "./state/useAnnotationStore";

vi.mock("./components/ViewerPane", () => ({
  ViewerPane: () => <div data-testid="viewer-pane">viewer pane</div>,
}));

vi.mock("./components/Sidebar", () => ({
  Sidebar: () => <div data-testid="sidebar-pane">sidebar pane</div>,
}));

const requestPreview = vi.fn();
const saveRecipe = vi.fn();
const startSession = vi.fn();

vi.mock("./lib/api", () => ({
  buildPdfFileUrl: () => "http://127.0.0.1:8000/pdf/file?pdf_path=sample",
  requestPreview: (...args: unknown[]) => requestPreview(...args),
  saveRecipe: (...args: unknown[]) => saveRecipe(...args),
  startSession: (...args: unknown[]) => startSession(...args),
}));

describe("App", () => {
  beforeEach(() => {
    useAnnotationStore.getState().reset();
    requestPreview.mockReset();
    saveRecipe.mockReset();
    startSession.mockReset();
  });

  it("loads a session and renders the field list", async () => {
    startSession.mockResolvedValue({
      pdf_path: "/tmp/sample.pdf",
      recipe_path: "/tmp/sample.recipe.json",
      pdf_info: {
        page_count: 2,
        pages: [
          { page: 1, width: 612, height: 792, rotation: 0 },
          { page: 2, width: 612, height: 792, rotation: 0 },
        ],
        metadata: { sha256: "abc" },
      },
      template: {
        schema_version: "1.0",
        form_id: "ACORD_125",
        template_state: "validated",
        template_version: "v1",
        page_rotations: [0, 0],
        page_sizes: [
          [612, 792],
          [612, 792],
        ],
        informational_pdf_metadata: { sha256: "abc" },
        anchor_text: [],
        anchors: [],
        fields: [
          {
            id: "fld_applicant_name_001",
            name: "applicant_name",
            label: "Applicant Name",
            page: 1,
            bbox: [72, 120, 320, 145],
            coordinate_space: "pdf_points_top_left",
            source_page_size: [612, 792],
            padding: { top: 0, right: 0, bottom: 0, left: 0 },
            field_type: "text",
            extraction_method: "embedded_text",
            required: false,
            options: {
              trim: true,
              collapse_whitespace: true,
              exclude_label_text: true,
              normalizer: null,
            },
            columns: [],
          },
        ],
      },
    });
    requestPreview.mockResolvedValue([
      {
        field_id: "fld_applicant_name_001",
        field_name: "applicant_name",
        bbox: [72, 120, 320, 145],
        normalized_text: "ABC Plumbing LLC",
        status: "ok",
        status_reason: ["embedded_text_present"],
        timestamp: new Date().toISOString(),
        template_version: "v1",
      },
    ]);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /load workspace/i }));

    await waitFor(() =>
      expect(screen.getByText("Applicant Name")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("viewer-pane")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-pane")).toBeInTheDocument();
  });
});
