import { beforeEach, describe, expect, it } from "vitest";

import { useAnnotationStore } from "./useAnnotationStore";
import type { SessionStartResponse } from "../types";

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

describe("useAnnotationStore", () => {
  beforeEach(() => {
    useAnnotationStore.getState().reset();
  });

  it("loads a session and hydrates saved fields", () => {
    useAnnotationStore.getState().loadSession(sessionFixture);

    const state = useAnnotationStore.getState();
    expect(state.pdfInfo?.page_count).toBe(2);
    expect(state.savedFields).toHaveLength(1);
    expect(state.currentPage).toBe(1);
  });

  it("tracks transient, draft, and saved field states separately", () => {
    const store = useAnnotationStore.getState();
    store.loadSession(sessionFixture);
    store.setTransientRect({ x: 10, y: 20, width: 30, height: 40 });
    store.openDraftField(sessionFixture.template.fields[0]);

    const state = useAnnotationStore.getState();
    expect(state.savedFields).toHaveLength(1);
    expect(state.draftField?.id).toBe("fld_applicant_name_001");
    expect(state.transientRect).toBeNull();
    expect(state.selectedFieldId).toBe("fld_applicant_name_001");
  });

  it("selects a field for editing and syncs the current page", () => {
    const store = useAnnotationStore.getState();
    store.loadSession(sessionFixture);
    store.setCurrentPage(2);

    store.selectFieldForEditing(sessionFixture.template.fields[0]);

    const state = useAnnotationStore.getState();
    expect(state.currentPage).toBe(1);
    expect(state.draftField?.id).toBe("fld_applicant_name_001");
    expect(state.selectedFieldId).toBe("fld_applicant_name_001");
  });

  it("indexes preview results by field id", () => {
    const store = useAnnotationStore.getState();
    store.loadSession(sessionFixture);
    store.setPreviews([
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

    expect(
      useAnnotationStore.getState().previewByFieldId.fld_applicant_name_001
        ?.status,
    ).toBe("ok");
  });
});
