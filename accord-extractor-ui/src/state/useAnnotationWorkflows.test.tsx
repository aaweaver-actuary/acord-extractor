import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { saveLocalWorkspaceSnapshot } from "../lib/localWorkspace";
import type { SessionStartResponse } from "../types";
import { SAMPLE_RECIPE_PATH } from "../lib/samplePaths";
import { useAnnotationStore } from "./useAnnotationStore";
import { useAnnotationWorkflows } from "./useAnnotationWorkflows";
import { useUiSettings } from "./useUiSettings";

const exportRecipeToFile = vi.fn();
const requestPreview = vi.fn();
const saveRecipe = vi.fn();
const startSession = vi.fn();

vi.mock("../lib/api", () => ({
  requestPreview: (...args: unknown[]) => requestPreview(...args),
  saveRecipe: (...args: unknown[]) => saveRecipe(...args),
  startSession: (...args: unknown[]) => startSession(...args),
}));

vi.mock("../lib/recipeExport", () => ({
  exportRecipeToFile: (...args: unknown[]) => exportRecipeToFile(...args),
}));

const sessionFixture: SessionStartResponse = {
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
    template_state: "draft",
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
};

const previewFixture = {
  field_id: "fld_applicant_name_001",
  field_name: "applicant_name",
  bbox: [72, 120, 320, 145] as [number, number, number, number],
  normalized_text: "ABC Plumbing LLC",
  status: "ok" as const,
  status_reason: ["embedded_text_present"],
  timestamp: new Date().toISOString(),
  template_version: "v1",
};

function createWorkspaceRef() {
  return {
    current: {
      scrollIntoView: vi.fn(),
    } as unknown as HTMLElement,
  };
}

describe("useAnnotationWorkflows", () => {
  beforeEach(() => {
    useAnnotationStore.getState().reset();
    useUiSettings.setState({
      apiBaseUrl: "http://127.0.0.1:8000",
      recipePath: SAMPLE_RECIPE_PATH,
    });
    window.localStorage?.clear?.();
    requestPreview.mockReset();
    saveRecipe.mockReset();
    startSession.mockReset();
    exportRecipeToFile.mockReset();
  });

  it("loads a session and refreshes previews through workflow state", async () => {
    const workspaceRef = createWorkspaceRef();
    startSession.mockResolvedValue(sessionFixture);
    requestPreview.mockResolvedValue([previewFixture]);

    const { result } = renderHook(() =>
      useAnnotationWorkflows({
        pdfPath: "/tmp/sample.pdf",
        useExistingRecipe: false,
        workspaceRef,
      }),
    );

    await act(async () => {
      await result.current.handleLoadSession({
        preventDefault: vi.fn(),
      } as never);
    });

    expect(startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        pdfPath: "/tmp/sample.pdf",
        recipePath: undefined,
      }),
    );
    expect(requestPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        pdfPath: "/tmp/sample.pdf",
        template: sessionFixture.template,
      }),
    );
    expect(useAnnotationStore.getState().pdfInfo?.page_count).toBe(2);
    expect(
      useAnnotationStore.getState().previewByFieldId.fld_applicant_name_001
        ?.status,
    ).toBe("ok");
    expect(result.current.isLoadingSession).toBe(false);
    expect(result.current.errorMessage).toBeNull();
  });

  it("saves the current draft through workflow state", async () => {
    const workspaceRef = createWorkspaceRef();
    requestPreview.mockResolvedValue([]);
    saveRecipe.mockResolvedValue({
      ...sessionFixture.template,
      fields: [
        {
          ...sessionFixture.template.fields[0],
          label: "Applicant Legal Name",
        },
      ],
    });

    const { result } = renderHook(() =>
      useAnnotationWorkflows({
        pdfPath: "/tmp/sample.pdf",
        useExistingRecipe: true,
        workspaceRef,
      }),
    );

    act(() => {
      useAnnotationStore.getState().loadSession(sessionFixture);
      useAnnotationStore.getState().setDraftField({
        ...sessionFixture.template.fields[0],
        label: "Applicant Legal Name",
      });
    });

    await act(async () => {
      await result.current.handleSaveDraft();
    });

    expect(saveRecipe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipePath: SAMPLE_RECIPE_PATH,
      }),
    );
    expect(useAnnotationStore.getState().savedFields[0]?.label).toBe(
      "Applicant Legal Name",
    );
    expect(result.current.isSavingDraft).toBe(false);
    expect(result.current.errorMessage).toBeNull();
  });

  it("restores a saved local workspace snapshot for the same pdf fingerprint", async () => {
    const workspaceRef = createWorkspaceRef();
    startSession.mockResolvedValue({
      ...sessionFixture,
      template: {
        ...sessionFixture.template,
        fields: [],
      },
      recipe_path: null,
    });
    requestPreview.mockResolvedValue([previewFixture]);
    saveLocalWorkspaceSnapshot({
      pdfPath: sessionFixture.pdf_path,
      pdfInfo: sessionFixture.pdf_info,
      recipePath: "/tmp/restored.recipe.json",
      template: sessionFixture.template,
    });

    const { result } = renderHook(() =>
      useAnnotationWorkflows({
        pdfPath: "/tmp/sample.pdf",
        useExistingRecipe: false,
        workspaceRef,
      }),
    );

    await act(async () => {
      await result.current.loadWorkspace();
    });

    expect(useAnnotationStore.getState().savedFields).toHaveLength(1);
    expect(useUiSettings.getState().recipePath).toBe(
      "/tmp/restored.recipe.json",
    );
    expect(requestPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        template: sessionFixture.template,
      }),
    );
  });

  it("commits local-only saves and autosaves them without a recipe path", async () => {
    const workspaceRef = createWorkspaceRef();
    useUiSettings.setState({
      apiBaseUrl: "http://127.0.0.1:8000",
      recipePath: "",
    });
    requestPreview.mockResolvedValue([]);

    const { result } = renderHook(() =>
      useAnnotationWorkflows({
        pdfPath: "/tmp/sample.pdf",
        useExistingRecipe: false,
        workspaceRef,
      }),
    );

    act(() => {
      useAnnotationStore.getState().loadSession(sessionFixture);
      useAnnotationStore.getState().setDraftField({
        ...sessionFixture.template.fields[0],
        label: "Applicant Local Only",
      });
    });

    await act(async () => {
      await result.current.handleSaveDraft();
    });

    expect(saveRecipe).not.toHaveBeenCalled();
    expect(useAnnotationStore.getState().savedFields[0]?.label).toBe(
      "Applicant Local Only",
    );
    const snapshotStore = JSON.parse(
      window.localStorage.getItem("acord-ui-local-workspaces") ?? "{}",
    ) as {
      snapshots?: Record<
        string,
        {
          recipePath: string | null;
          template: { fields: Array<{ label: string }> };
        }
      >;
    };
    expect(snapshotStore.snapshots?.abc?.recipePath).toBeNull();
    expect(snapshotStore.snapshots?.abc?.template.fields[0]?.label).toBe(
      "Applicant Local Only",
    );
  });

  it("exports the current workspace and remembers the chosen file name", async () => {
    const workspaceRef = createWorkspaceRef();
    exportRecipeToFile.mockResolvedValue({
      fileName: "custom-export.recipe.json",
      method: "download",
    });

    const { result } = renderHook(() =>
      useAnnotationWorkflows({
        pdfPath: "/tmp/sample.pdf",
        useExistingRecipe: false,
        workspaceRef,
      }),
    );

    act(() => {
      useAnnotationStore.getState().loadSession(sessionFixture);
    });

    await act(async () => {
      await result.current.handleExportRecipe();
    });

    expect(exportRecipeToFile).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestedFileName: "acord-125.recipe.json",
      }),
    );
    const snapshotStore = JSON.parse(
      window.localStorage.getItem("acord-ui-local-workspaces") ?? "{}",
    ) as {
      snapshots?: Record<string, { preferredRecipeFileName?: string | null }>;
    };
    expect(snapshotStore.snapshots?.abc?.preferredRecipeFileName).toBe(
      "custom-export.recipe.json",
    );
  });

  it("previews the active draft through workflow state", async () => {
    const workspaceRef = createWorkspaceRef();
    requestPreview.mockResolvedValue([previewFixture]);

    renderHook(() =>
      useAnnotationWorkflows({
        pdfPath: "/tmp/sample.pdf",
        useExistingRecipe: false,
        workspaceRef,
      }),
    );

    act(() => {
      useAnnotationStore.getState().loadSession(sessionFixture);
      useAnnotationStore
        .getState()
        .setDraftField(sessionFixture.template.fields[0]);
    });

    await waitFor(() => {
      expect(useAnnotationStore.getState().draftPreview?.field_id).toBe(
        "fld_applicant_name_001",
      );
    });
  });
});
