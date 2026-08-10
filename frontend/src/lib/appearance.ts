export type AppearancePreference = "system" | "light" | "dark";

export const appearanceStorageKey = "nemissive:appearance";
export const appearanceChangeEvent = "nemissive:appearance-change";

let isSystemListenerInstalled = false;

export function getAppearancePreference(): AppearancePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(appearanceStorageKey);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // Appearance persistence is optional when storage is unavailable.
  }
  return "system";
}

function applyAppearance(preference: AppearancePreference) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = preference === "system" ? (prefersDark ? "dark" : "light") : preference;
  document.documentElement.dataset.appearance = resolved;
  document.documentElement.dataset.appearancePreference = preference;
  document.documentElement.style.colorScheme = resolved;
}

export function setAppearancePreference(preference: AppearancePreference) {
  try {
    window.localStorage.setItem(appearanceStorageKey, preference);
  } catch {
    // The active appearance still works for this page when storage is unavailable.
  }
  applyAppearance(preference);
  window.dispatchEvent(new CustomEvent<AppearancePreference>(appearanceChangeEvent, { detail: preference }));
}

export function initializeAppearance() {
  if (typeof window === "undefined") return;
  applyAppearance(getAppearancePreference());
  if (isSystemListenerInstalled) return;
  isSystemListenerInstalled = true;
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getAppearancePreference() === "system") applyAppearance("system");
  });
}
