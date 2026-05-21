interface ApiBaseUrlRuntime {
  configuredApiBaseUrl?: string;
  isDev?: boolean;
}

const PROXY_API_BASE_URL = "/api";

function resolveConfiguredApiBaseUrl(
  runtime: ApiBaseUrlRuntime,
): string | undefined {
  const configuredApiBaseUrl =
    runtime.configuredApiBaseUrl ?? import.meta.env.VITE_API_BASE_URL;
  const trimmedApiBaseUrl = configuredApiBaseUrl?.trim();

  return trimmedApiBaseUrl ? trimmedApiBaseUrl : undefined;
}

function resolveIsDev(runtime: ApiBaseUrlRuntime): boolean {
  return runtime.isDev ?? import.meta.env.DEV;
}

export function getDefaultApiBaseUrl(runtime: ApiBaseUrlRuntime = {}): string {
  return (
    resolveConfiguredApiBaseUrl(runtime) ??
    (resolveIsDev(runtime) ? PROXY_API_BASE_URL : "")
  );
}

export function normalizeApiBaseUrl(
  apiBaseUrl: string | null | undefined,
  runtime: ApiBaseUrlRuntime = {},
): string {
  const trimmedApiBaseUrl = apiBaseUrl?.trim() ?? "";

  if (!trimmedApiBaseUrl) {
    return getDefaultApiBaseUrl(runtime);
  }

  if (
    trimmedApiBaseUrl === PROXY_API_BASE_URL &&
    !resolveIsDev(runtime) &&
    !resolveConfiguredApiBaseUrl(runtime)
  ) {
    return "";
  }

  return trimmedApiBaseUrl;
}
