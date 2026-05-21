import type { FormTemplate } from "../types";

interface BrowserWritableFileStream {
  write: (data: Blob | string) => Promise<void>;
  close: () => Promise<void>;
}

interface BrowserFileHandle {
  name?: string;
  createWritable: () => Promise<BrowserWritableFileStream>;
}

interface BrowserSaveFilePickerOptions {
  suggestedName?: string;
  excludeAcceptAllOption?: boolean;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}

type SavePickerWindow = Window & {
  showSaveFilePicker?: (
    options?: BrowserSaveFilePickerOptions,
  ) => Promise<BrowserFileHandle>;
};

export interface RecipeExportResult {
  fileName: string;
  method: "file-system-access" | "download";
}

function pruneNullish<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => pruneNullish(item)) as T;
  }

  if (value && typeof value === "object") {
    const nextEntries = Object.entries(value as Record<string, unknown>)
      .filter(
        ([, entryValue]) => entryValue !== null && entryValue !== undefined,
      )
      .map(([entryKey, entryValue]) => [entryKey, pruneNullish(entryValue)]);
    return Object.fromEntries(nextEntries) as T;
  }

  return value;
}

export function serializeRecipeJson(template: FormTemplate): string {
  return `${JSON.stringify(pruneNullish(template), null, 2)}\n`;
}

function downloadRecipeFile(fileName: string, contents: string) {
  const blob = new Blob([contents], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export async function exportRecipeToFile(options: {
  template: FormTemplate;
  suggestedFileName: string;
}): Promise<RecipeExportResult | null> {
  const fileName = options.suggestedFileName;
  const contents = serializeRecipeJson(options.template);
  const picker = (window as SavePickerWindow).showSaveFilePicker;

  if (picker) {
    try {
      const handle = await picker({
        suggestedName: fileName,
        types: [
          {
            description: "ACORD recipe JSON",
            accept: {
              "application/json": [".json"],
            },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(contents);
      await writable.close();
      return {
        fileName: handle.name ?? fileName,
        method: "file-system-access",
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return null;
      }
      throw error;
    }
  }

  downloadRecipeFile(fileName, contents);
  return { fileName, method: "download" };
}
