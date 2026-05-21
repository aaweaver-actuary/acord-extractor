import type {
  FileBrowserResponse,
  FieldPreview,
  FormTemplate,
  SessionStartResponse,
  UploadedWorkspaceFile,
} from "../types";
import { normalizeApiBaseUrl } from "./apiBaseUrl";

function resolveApiBaseUrl(apiBaseUrl: string): URL {
  const normalizedApiBaseUrl = normalizeApiBaseUrl(apiBaseUrl);

  if (/^https?:\/\//i.test(normalizedApiBaseUrl)) {
    return new URL(normalizedApiBaseUrl);
  }

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "http://127.0.0.1:8009";
  const pathname = normalizedApiBaseUrl.startsWith("/")
    ? normalizedApiBaseUrl
    : `/${normalizedApiBaseUrl}`;
  return new URL(pathname, origin);
}

function buildUrl(
  apiBaseUrl: string,
  path: string,
  searchParams?: Record<string, string>,
): string {
  const url = resolveApiBaseUrl(apiBaseUrl);
  const basePath = url.pathname.replace(/\/$/, "");
  const nextPath = path.replace(/^\//, "");

  url.pathname = `${basePath}/${nextPath}`.replace(/\/+/g, "/");
  url.search = "";
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
    if (detail) {
      let message = detail;
      try {
        const payload = JSON.parse(detail) as { detail?: string };
        if (typeof payload.detail === "string") {
          message = payload.detail;
        }
      } catch {
        // Fall back to the raw response body when the server did not return JSON.
      }
      throw new Error(message);
    }
    throw new Error(`Request failed with status ${response.status}`);
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

export async function listFileEntries(options: {
  apiBaseUrl: string;
  path?: string;
  extensions?: string[];
}): Promise<FileBrowserResponse> {
  const searchParams: Record<string, string> = {};
  if (options.path) {
    searchParams.path = options.path;
  }
  if (options.extensions?.length) {
    searchParams.extensions = options.extensions.join(",");
  }

  return requestJson<FileBrowserResponse>(
    buildUrl(options.apiBaseUrl, "/filesystem/list", searchParams),
  );
}

export async function uploadWorkspaceFile(options: {
  apiBaseUrl: string;
  file: File;
  fileKind: "pdf" | "recipe";
}): Promise<UploadedWorkspaceFile> {
  const formData = new FormData();
  formData.set("file", options.file);

  return requestJson<UploadedWorkspaceFile>(
    buildUrl(options.apiBaseUrl, "/filesystem/upload", {
      file_kind: options.fileKind,
    }),
    {
      method: "POST",
      body: formData,
    },
  );
}
