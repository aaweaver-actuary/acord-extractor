import { useEffect, useMemo, useRef, useState } from "react";

import { listFileEntries } from "../lib/api";
import type { FileBrowserEntry } from "../types";

interface PathPickerDialogProps {
  apiBaseUrl: string;
  allowedExtensions: string[];
  description: string;
  initialPath: string;
  onClose: () => void;
  onSelect: (path: string) => void;
  title: string;
}

function getInitialDirectoryPath(
  initialPath: string,
  allowedExtensions: string[],
): string | undefined {
  const trimmed = initialPath.trim();
  if (!trimmed) {
    return undefined;
  }

  const lowerPath = trimmed.toLowerCase();
  if (!allowedExtensions.some((extension) => lowerPath.endsWith(extension))) {
    return trimmed;
  }

  const separatorIndex = Math.max(
    trimmed.lastIndexOf("/"),
    trimmed.lastIndexOf("\\"),
  );
  if (separatorIndex <= 0) {
    return ".";
  }
  return trimmed.slice(0, separatorIndex);
}

export function PathPickerDialog(props: PathPickerDialogProps) {
  const {
    apiBaseUrl,
    allowedExtensions,
    description,
    initialPath,
    onClose,
    onSelect,
    title,
  } = props;
  const initialDirectoryPath = useMemo(
    () => getInitialDirectoryPath(initialPath, allowedExtensions),
    [allowedExtensions, initialPath],
  );
  const [requestedPath, setRequestedPath] = useState<string | undefined>(
    initialDirectoryPath,
  );
  const [resolvedPath, setResolvedPath] = useState(initialDirectoryPath ?? "");
  const [pathInput, setPathInput] = useState(initialDirectoryPath ?? "");
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<FileBrowserEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const pathInputRef = useRef(pathInput);
  const extensionsKey = useMemo(
    () => allowedExtensions.join(","),
    [allowedExtensions],
  );

  useEffect(() => {
    pathInputRef.current = pathInput;
  }, [pathInput]);

  useEffect(() => {
    let isCancelled = false;
    const requestedPathKey = requestedPath?.trim() ?? "";

    const loadEntries = async () => {
      setIsLoading(true);
      try {
        const response = await listFileEntries({
          apiBaseUrl,
          path: requestedPath,
          extensions: allowedExtensions,
        });
        if (isCancelled) {
          return;
        }
        setResolvedPath(response.current_path);
        if ((pathInputRef.current.trim() ?? "") === requestedPathKey) {
          setPathInput(response.current_path);
        }
        setParentPath(response.parent_path ?? null);
        setEntries(response.entries);
        setErrorMessage(null);
      } catch (error: unknown) {
        if (isCancelled) {
          return;
        }
        setEntries([]);
        setParentPath(null);
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to list files.",
        );
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadEntries();

    return () => {
      isCancelled = true;
    };
  }, [allowedExtensions, apiBaseUrl, extensionsKey, requestedPath]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="path-picker-backdrop" onClick={onClose}>
      <div
        aria-label={title}
        aria-modal="true"
        className="path-picker-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div>
          <p className="eyebrow">Path picker</p>
          <h2>{title}</h2>
          <p className="subtitle">{description}</p>
        </div>

        <div className="path-picker-toolbar">
          <div className="path-picker-location-row">
            <label>
              <span>Current path</span>
              <input
                value={pathInput}
                onChange={(event) => setPathInput(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="ghost-button"
              disabled={isLoading}
              onClick={() => {
                const nextPath = pathInput.trim() || undefined;
                setPathInput(nextPath ?? "");
                setRequestedPath(nextPath);
              }}
            >
              Go
            </button>
            <button
              type="button"
              className="ghost-button"
              disabled={!parentPath || isLoading}
              onClick={() => {
                const nextPath = parentPath ?? undefined;
                setPathInput(nextPath ?? "");
                setRequestedPath(nextPath);
              }}
            >
              Up
            </button>
          </div>

          {errorMessage ? (
            <p className="path-picker-status path-picker-status-error">
              {errorMessage}
            </p>
          ) : (
            <p className="path-picker-status">
              {isLoading ? "Loading files…" : resolvedPath}
            </p>
          )}
        </div>

        <ul className="path-picker-list">
          {entries.length ? (
            entries.map((entry) => (
              <li key={entry.path}>
                <button
                  type="button"
                  className="path-picker-entry"
                  onClick={() => {
                    if (entry.entry_type === "directory") {
                      setPathInput(entry.path);
                      setRequestedPath(entry.path);
                      return;
                    }

                    onSelect(entry.path);
                  }}
                >
                  <span className="path-picker-entry-title">
                    <strong>{entry.name}</strong>
                    <small>{entry.path}</small>
                  </span>
                  <span className="path-picker-entry-type">
                    {entry.entry_type === "directory" ? "Folder" : "File"}
                  </span>
                </button>
              </li>
            ))
          ) : (
            <li className="path-picker-empty">
              {isLoading
                ? "Loading available files…"
                : `No matching ${extensionsKey || "files"} found in this directory.`}
            </li>
          )}
        </ul>

        <div className="button-row">
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
