import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  LEGACY_SAMPLE_RECIPE_PATH,
  SAMPLE_RECIPE_PATH,
} from "../lib/samplePaths";

const DEFAULT_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const DEFAULT_RECIPE_PATH = SAMPLE_RECIPE_PATH;

interface UiSettingsState {
  apiBaseUrl: string;
  recipePath: string;
  setApiBaseUrl: (value: string) => void;
  setRecipePath: (value: string) => void;
}

const fallbackStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

function getPersistStorage() {
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

export const useUiSettings = create<UiSettingsState>()(
  persist(
    (set) => ({
      apiBaseUrl: DEFAULT_API_BASE_URL,
      recipePath: DEFAULT_RECIPE_PATH,
      setApiBaseUrl: (value) => set({ apiBaseUrl: value }),
      setRecipePath: (value) => set({ recipePath: value }),
    }),
    {
      name: "acord-ui-settings",
      storage: createJSONStorage(getPersistStorage),
      version: 2,
      migrate: (persistedState) => {
        const state = (persistedState ?? {}) as Partial<UiSettingsState>;

        return {
          apiBaseUrl: state.apiBaseUrl ?? DEFAULT_API_BASE_URL,
          recipePath:
            state.recipePath === LEGACY_SAMPLE_RECIPE_PATH
              ? DEFAULT_RECIPE_PATH
              : (state.recipePath ?? DEFAULT_RECIPE_PATH),
        };
      },
    },
  ),
);
