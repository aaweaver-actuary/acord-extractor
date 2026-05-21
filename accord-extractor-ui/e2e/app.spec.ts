import { expect, test } from "@playwright/test";
import { copyFile, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SAMPLE_PDF_PATH = "/Users/andy/acord-extractor/data/sample/acord-125.pdf";
const SAMPLE_RECIPE_PATH =
  "/Users/andy/acord-extractor/data/sample/acord-125.recipe.json";

async function createTempRecipeCopy(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "acord-ui-e2e-"));
  const recipePath = path.join(directory, "acord-125.recipe.json");
  await copyFile(SAMPLE_RECIPE_PATH, recipePath);
  return recipePath;
}

async function loadWorkspace(
  page: Parameters<typeof test>[0]["page"],
  recipePath: string,
) {
  await page.goto("/");
  await page.getByLabel("Recipe path").fill(recipePath);
  await page.getByLabel("PDF path").fill(SAMPLE_PDF_PATH);
  await page.getByRole("button", { name: "Load workspace" }).click();

  await expect(page.locator(".react-pdf__Page canvas").first()).toBeVisible();
  await expect(page.locator(".field-row")).toHaveCount(12);
  await expect(page.getByText("612 × 792 · rotation 0")).toBeVisible();
}

async function readRecipe(recipePath: string) {
  return JSON.parse(await readFile(recipePath, "utf8")) as {
    fields: Array<{
      id: string;
      name: string;
      label: string | null;
      page: number;
    }>;
  };
}

test("loads the sample workspace and keeps page plus zoom controls responsive", async ({
  page,
}) => {
  const recipePath = await createTempRecipeCopy();

  await loadWorkspace(page, recipePath);

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

  await expect(
    page.getByRole("button", {
      name: /ACORD 125 \(2011\/09\) form_footer_tag ok/i,
    }),
  ).toBeVisible();
});

test("selects an existing field, previews it, and saves edits back to the recipe", async ({
  page,
  browserName,
}) => {
  const recipePath = await createTempRecipeCopy();

  await loadWorkspace(page, recipePath);

  await page
    .getByRole("button", { name: /OWNER owner_interest_label ok/i })
    .click();

  await expect(page.getByText("Draft field")).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Page" })).toHaveValue("2");
  await expect(page.getByLabel("Label")).toHaveValue("OWNER");
  await expect(page.locator(".preview-panel .status-pill")).toContainText(
    /ok/i,
  );

  await page.getByLabel("Name").fill("owner_interest_label_e2e");
  await page.getByLabel("Label").fill("OWNER E2E");
  await page.getByLabel("Pad left").fill("1.5");

  await page.keyboard.press(
    browserName === "webkit" ? "Control+Enter" : "Meta+Enter",
  );

  await expect(
    page.getByRole("button", {
      name: /OWNER E2E owner_interest_label_e2e ok/i,
    }),
  ).toBeVisible();

  const savedRecipe = await readRecipe(recipePath);
  expect(savedRecipe.fields).toContainEqual(
    expect.objectContaining({
      name: "owner_interest_label_e2e",
      label: "OWNER E2E",
      page: 2,
    }),
  );
});

test("creates and saves a new field from the PDF overlay", async ({ page }) => {
  const recipePath = await createTempRecipeCopy();

  await loadWorkspace(page, recipePath);

  const overlay = page.locator(".overlay-stage .konvajs-content");
  const bounds = await overlay.boundingBox();
  expect(bounds).not.toBeNull();

  const startX = (bounds?.x ?? 0) + 140;
  const startY = (bounds?.y ?? 0) + 140;
  const endX = (bounds?.x ?? 0) + 260;
  const endY = (bounds?.y ?? 0) + 220;

  await overlay.dispatchEvent("mousedown", {
    button: 0,
    buttons: 1,
    clientX: startX,
    clientY: startY,
  });
  await overlay.dispatchEvent("mousemove", {
    buttons: 1,
    clientX: endX,
    clientY: endY,
  });
  await overlay.dispatchEvent("mouseup", {
    button: 0,
    buttons: 0,
    clientX: endX,
    clientY: endY,
  });

  await expect(page.getByText("Draft field")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save field" })).toBeEnabled();
  await expect(page.locator(".preview-panel .status-pill")).toContainText(
    /waiting|empty/i,
  );

  await page.getByLabel("Name").fill("drawn_field_e2e");
  await page.getByLabel("Label").fill("Drawn Field E2E");
  await page.getByRole("button", { name: "Save field" }).click();

  await expect(
    page.getByRole("button", { name: /Drawn Field E2E drawn_field_e2e/i }),
  ).toBeVisible();

  const savedRecipe = await readRecipe(recipePath);
  expect(savedRecipe.fields).toContainEqual(
    expect.objectContaining({
      name: "drawn_field_e2e",
      label: "Drawn Field E2E",
      page: 1,
    }),
  );
});
