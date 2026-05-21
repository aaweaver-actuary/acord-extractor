import type {
  FormTemplate,
  PdfDocumentInfo,
  SessionStartResponse,
} from "../types";

const STORAGE_KEY = "acord-ui-local-workspaces";
const STORAGE_VERSION = 1;
const MAX_SNAPSHOTS = 20;

interface LocalWorkspaceSnapshotStore {
  version: number;
  snapshots: Record<string, LocalWorkspaceSnapshot>;
}

export interface LocalWorkspaceSnapshot {
  version: number;
  pdfFingerprint: string;
  pdfPath: string;
  recipePath: string | null;
  preferredRecipeFileName?: string | null;
  template: FormTemplate;
  updatedAt: string;
}

function stripUploadPrefix(fileName: string): string {
  return fileName.replace(/^[0-9a-f]{32}-(.+)$/i, "$1");
}

function getLeafName(pathValue: string | null | undefined): string | null {
  const trimmed = pathValue?.trim();
  if (!trimmed) {
    return null;
  }

  const segments = trimmed.split(/[\\/]/).filter(Boolean);
  const leafName = segments.at(-1);
  return leafName ? stripUploadPrefix(leafName) : null;
}

export function deriveRecipeExportFileName(options: {
  pdfPath: string;
  recipePath?: string | null;
  preferredRecipeFileName?: string | null;
}): string {
  const preferredName = getLeafName(options.preferredRecipeFileName);
  if (preferredName) {
    return preferredName;
  }

  const recipeLeafName = getLeafName(options.recipePath);
  if (recipeLeafName) {
    return recipeLeafName;
  }

  const pdfLeafName = getLeafName(options.pdfPath) ?? "acord-template.pdf";
  const pdfStem = pdfLeafName.replace(/\.pdf$/i, "") || "acord-template";
  return `${pdfStem}.recipe.json`;
}

const fallbackStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

function getStorage() {
  try {
    if (
      typeof localStorage !== "undefined" &&
      typeof localStorage.getItem === "function" &&
      typeof localStorage.setItem === "function" &&
      typeof localStorage.removeItem === "function"
    ) {
      return localStorage;
    }
  } catch {
    return fallbackStorage;
  }

  return fallbackStorage;
}

export function getPdfWorkspaceFingerprint(
  pdfPath: string,
  pdfInfo: PdfDocumentInfo,
): string {
  return pdfInfo.metadata.sha256?.trim() || pdfPath.trim();
}

function readSnapshotStore(): LocalWorkspaceSnapshotStore {
  const storage = getStorage();
  const rawValue = storage.getItem(STORAGE_KEY);
  if (!rawValue) {
    return { version: STORAGE_VERSION, snapshots: {} };
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<LocalWorkspaceSnapshotStore>;
    return {
      version: STORAGE_VERSION,
      snapshots: parsed.snapshots ?? {},
    };
  } catch {
    return { version: STORAGE_VERSION, snapshots: {} };
  }
}

function writeSnapshotStore(store: LocalWorkspaceSnapshotStore) {
  const storage = getStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function pruneSnapshots(
  snapshots: Record<string, LocalWorkspaceSnapshot>,
): Record<string, LocalWorkspaceSnapshot> {
  const entries = Object.entries(snapshots).sort(
    (left, right) =>
      Date.parse(right[1].updatedAt) - Date.parse(left[1].updatedAt),
  );

  return Object.fromEntries(entries.slice(0, MAX_SNAPSHOTS));
}

export function getLocalWorkspaceSnapshotForSession(
  session: Pick<SessionStartResponse, "pdf_path" | "pdf_info">,
): LocalWorkspaceSnapshot | null {
  const store = readSnapshotStore();
  const fingerprint = getPdfWorkspaceFingerprint(
    session.pdf_path,
    session.pdf_info,
  );

  return store.snapshots[fingerprint] ?? null;
}

export function saveLocalWorkspaceSnapshot(options: {
  pdfPath: string;
  pdfInfo: PdfDocumentInfo;
  recipePath?: string | null;
  preferredRecipeFileName?: string | null;
  template: FormTemplate;
}): LocalWorkspaceSnapshot {
  const fingerprint = getPdfWorkspaceFingerprint(
    options.pdfPath,
    options.pdfInfo,
  );
  const snapshot: LocalWorkspaceSnapshot = {
    version: STORAGE_VERSION,
    pdfFingerprint: fingerprint,
    pdfPath: options.pdfPath,
    recipePath: options.recipePath?.trim() || null,
    preferredRecipeFileName: options.preferredRecipeFileName?.trim() || null,
    template: options.template,
    updatedAt: new Date().toISOString(),
  };

  const store = readSnapshotStore();
  store.snapshots[fingerprint] = snapshot;
  writeSnapshotStore({
    version: STORAGE_VERSION,
    snapshots: pruneSnapshots(store.snapshots),
  });

  return snapshot;
}
