import type {
  FieldPreview,
  FormTemplate,
  SessionStartResponse,
} from "../types";

function buildUrl(
  apiBaseUrl: string,
  path: string,
  searchParams?: Record<string, string>,
): string {
  const url = new URL(
    path,
    apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`,
  );
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function requestJson<T>(
  input: RequestInfo,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export function buildPdfFileUrl(apiBaseUrl: string, pdfPath: string): string {
  return buildUrl(apiBaseUrl, "/pdf/file", { pdf_path: pdfPath });
}

export async function startSession(options: {
  apiBaseUrl: string;
  pdfPath: string;
  recipePath?: string;
}): Promise<SessionStartResponse> {
  return requestJson<SessionStartResponse>(
    buildUrl(options.apiBaseUrl, "/session/start"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pdf_path: options.pdfPath,
        recipe_path: options.recipePath || undefined,
      }),
    },
  );
}

export async function requestPreview(options: {
  apiBaseUrl: string;
  pdfPath: string;
  template: FormTemplate;
  fieldId?: string;
}): Promise<FieldPreview[]> {
  return requestJson<FieldPreview[]>(buildUrl(options.apiBaseUrl, "/preview"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pdf_path: options.pdfPath,
      template: options.template,
      field_id: options.fieldId,
    }),
  });
}

export async function saveRecipe(options: {
  apiBaseUrl: string;
  recipePath: string;
  template: FormTemplate;
}): Promise<FormTemplate> {
  return requestJson<FormTemplate>(
    buildUrl(options.apiBaseUrl, "/recipe/save"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipe_path: options.recipePath,
        template: options.template,
      }),
    },
  );
}
