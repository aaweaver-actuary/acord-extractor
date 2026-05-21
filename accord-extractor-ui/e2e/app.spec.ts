import { expect, test } from "@playwright/test";
import { copyFile, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SAMPLE_PDF_PATH, SAMPLE_RECIPE_PATH } from "../src/lib/samplePaths";

const SAMPLE_RECIPE_SOURCE_PATH = path.resolve("..", SAMPLE_RECIPE_PATH);

async function createTempRecipeCopy(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "acord-ui-e2e-"));
  const recipePath = path.join(directory, "acord-125.recipe.json");
  await copyFile(SAMPLE_RECIPE_SOURCE_PATH, recipePath);
  return recipePath;
}

async function loadWorkspace(
  page: Parameters<typeof test>[0]["page"],
  recipePath: string,
  options?: {
    useExistingRecipe?: boolean;
    expectSavedFields?: boolean;
  },
) {
  await page.goto("/");
  await page.getByLabel("Recipe path").fill(recipePath);
  await page.getByLabel("PDF path").fill(SAMPLE_PDF_PATH);
  if (options?.useExistingRecipe) {
    await page.getByRole("checkbox", { name: "Use recipe on load" }).check();
  }
  await page.getByRole("button", { name: "Load workspace" }).click();

  await expect(page.getByText("Loading PDF…")).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.locator(".react-pdf__Page__canvas").last()).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByRole("heading", { name: "Saved annotations" }),
  ).toBeVisible();
  if (options?.expectSavedFields) {
    await expect(page.locator(".field-row").first()).toBeVisible();
  } else {
    await expect(
      page.getByText(
        "No saved annotations yet. Draw the first box on the PDF to begin.",
      ),
    ).toBeVisible();
  }
}

async function readRecipe(recipePath: string) {
  return JSON.parse(await readFile(recipePath, "utf8")) as {
    fields: Array<{
      id: string;
      name: string;
      label: string | null;
      page: number;
      field_type: string;
      extraction_method: string;
    }>;
  };
}

async function drawDraftField(
  page: Parameters<typeof test>[0]["page"],
  offsets: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  },
) {
  const overlay = page.locator(".overlay-stage .konvajs-content");
  await overlay.scrollIntoViewIfNeeded();
  await expect(overlay).toBeVisible();
  const bounds = await overlay.boundingBox();
  expect(bounds).not.toBeNull();

  const startX = (bounds?.x ?? 0) + offsets.startX;
  const startY = (bounds?.y ?? 0) + offsets.startY;
  const endX = (bounds?.x ?? 0) + offsets.endX;
  const endY = (bounds?.y ?? 0) + offsets.endY;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.mouse.up();

  await expect(page.getByRole("button", { name: "Save field" })).toBeVisible();
}

async function fillDraftMetadata(
  page: Parameters<typeof test>[0]["page"],
  values: {
    name: string;
    label: string;
    fieldType: string;
    extractionMethod: string;
  },
) {
  await page.getByLabel("Name").fill(values.name);
  await page.getByLabel("Label").fill(values.label);
  await page.getByLabel("Field type").selectOption(values.fieldType);
  await page.getByLabel("Extraction").selectOption(values.extractionMethod);
}

async function saveDraftField(
  page: Parameters<typeof test>[0]["page"],
  fieldRowName: RegExp,
) {
  await page.getByRole("button", { name: "Save field" }).click();
  await expect(page.getByRole("button", { name: fieldRowName })).toBeVisible();
  await expect(page.locator(".react-pdf__Page__canvas").last()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Failed to load PDF file.")).toHaveCount(0);
}

test("loads the sample workspace and keeps page plus zoom controls responsive", async ({
  page,
}) => {
  const recipePath = await createTempRecipeCopy();

  await loadWorkspace(page, recipePath, {
    useExistingRecipe: true,
    expectSavedFields: true,
  });

  await page.getByText("View").click();
  await expect(
    page.getByRole("button", { name: "Previous page" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByRole("spinbutton", { name: "Page" })).toHaveValue("2");
  await page.getByRole("button", { name: "Previous page" }).click();
  await expect(page.getByRole("spinbutton", { name: "Page" })).toHaveValue("1");

  await page.getByRole("button", { name: "125%" }).dispatchEvent("click");
  await expect(page.getByRole("button", { name: "125%" })).toHaveClass(
    /chip-active/,
  );
  await page.getByRole("button", { name: "150%" }).dispatchEvent("click");
  await expect(page.getByRole("button", { name: "150%" })).toHaveClass(
    /chip-active/,
  );

  await expect(page.locator(".field-row").first()).toBeVisible();
});

test("selects an existing field, previews it, and saves edits back to the recipe", async ({
  page,
  browserName,
}) => {
  const recipePath = await createTempRecipeCopy();
  const initialRecipe = await readRecipe(recipePath);
  const existingField = initialRecipe.fields[0];

  expect(existingField).toBeDefined();
  if (!existingField) {
    throw new Error(
      "Expected the copied recipe to contain at least one field.",
    );
  }

  await loadWorkspace(page, recipePath, {
    useExistingRecipe: true,
    expectSavedFields: true,
  });

  await page.locator(".field-row").first().click();

  await expect(page.getByText("Field annotator")).toBeVisible();
  await expect(
    page.getByText(new RegExp(`Page ${existingField.page} .* ID`, "i")),
  ).toBeVisible();
  await expect(page.getByLabel("Label")).toHaveValue(
    existingField.label ?? existingField.name,
  );
  await expect(page.locator(".preview-panel .status-pill")).toBeVisible();

  await page.getByLabel("Name").fill("owner_interest_label_e2e");
  await page.getByLabel("Label").fill("OWNER E2E");
  await page.getByLabel("Pad left").fill("1.5");

  await page.keyboard.press(
    browserName === "webkit" ? "Control+Enter" : "Meta+Enter",
  );

  await expect(
    page.getByRole("button", {
      name: /OWNER E2E.*owner_interest_label_e2e/i,
    }),
  ).toBeVisible();

  const savedRecipe = await readRecipe(recipePath);
  expect(savedRecipe.fields).toContainEqual(
    expect.objectContaining({
      name: "owner_interest_label_e2e",
      label: "OWNER E2E",
      page: existingField.page,
    }),
  );
});

test("creates and saves a new field from the PDF overlay", async ({ page }) => {
  const recipePath = await createTempRecipeCopy();

  await loadWorkspace(page, recipePath);

  await drawDraftField(page, {
    startX: 140,
    startY: 140,
    endX: 260,
    endY: 220,
  });

  await expect(page.getByText("Field annotator")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save field" })).toBeEnabled();
  await expect(page.locator(".preview-panel .status-pill")).toContainText(
    /waiting|empty/i,
  );

  await fillDraftMetadata(page, {
    name: "drawn_field_e2e",
    label: "Drawn Field E2E",
    fieldType: "text",
    extractionMethod: "embedded_text",
  });
  await saveDraftField(page, /Drawn Field E2E.*drawn_field_e2e/i);

  const savedRecipe = await readRecipe(recipePath);
  expect(savedRecipe.fields).toContainEqual(
    expect.objectContaining({
      name: "drawn_field_e2e",
      label: "Drawn Field E2E",
      page: 1,
    }),
  );
});

test("draws and saves a business auto checkbox field", async ({ page }) => {
  const recipePath = await createTempRecipeCopy();

  await loadWorkspace(page, recipePath);

  await drawDraftField(page, {
    startX: 90,
    startY: 180,
    endX: 112,
    endY: 204,
  });
  await fillDraftMetadata(page, {
    name: "business_auto_included_e2e",
    label: "Business Auto Included",
    fieldType: "checkbox",
    extractionMethod: "checkbox_image",
  });
  await saveDraftField(
    page,
    /Business Auto Included.*business_auto_included_e2e/i,
  );

  const savedRecipe = await readRecipe(recipePath);
  expect(savedRecipe.fields).toContainEqual(
    expect.objectContaining({
      name: "business_auto_included_e2e",
      label: "Business Auto Included",
      page: 1,
      field_type: "checkbox",
      extraction_method: "checkbox_image",
    }),
  );
});

test("saves a checkbox field and then immediately draws and saves a premium field", async ({
  page,
}) => {
  const recipePath = await createTempRecipeCopy();

  await loadWorkspace(page, recipePath);

  await drawDraftField(page, {
    startX: 90,
    startY: 180,
    endX: 112,
    endY: 204,
  });
  await fillDraftMetadata(page, {
    name: "business_auto_included_e2e",
    label: "Business Auto Included",
    fieldType: "checkbox",
    extractionMethod: "checkbox_image",
  });
  await saveDraftField(
    page,
    /Business Auto Included.*business_auto_included_e2e/i,
  );

  await drawDraftField(page, {
    startX: 180,
    startY: 175,
    endX: 300,
    endY: 215,
  });
  await fillDraftMetadata(page, {
    name: "business_auto_premium_e2e",
    label: "Business Auto Premium",
    fieldType: "money",
    extractionMethod: "embedded_text",
  });
  await saveDraftField(
    page,
    /Business Auto Premium.*business_auto_premium_e2e/i,
  );

  const savedRecipe = await readRecipe(recipePath);
  expect(savedRecipe.fields).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "business_auto_included_e2e",
        label: "Business Auto Included",
        page: 1,
        field_type: "checkbox",
        extraction_method: "checkbox_image",
      }),
      expect.objectContaining({
        name: "business_auto_premium_e2e",
        label: "Business Auto Premium",
        page: 1,
        field_type: "money",
        extraction_method: "embedded_text",
      }),
    ]),
  );
});
