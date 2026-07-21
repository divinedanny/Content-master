"use client";

// Theme + contrast preferences. Default is "system" (follows the device),
// falling back to light. The user can override to light/dark and pick a
// contrast level in Settings. Choice is persisted per browser and applied by
// stamping data-theme / data-contrast on <html>.

export type ThemeChoice = "system" | "light" | "dark";
export type Contrast = "normal" | "high";

export const THEME_KEY = "cc_theme";
export const CONTRAST_KEY = "cc_contrast";

type Listener = () => void;
const listeners = new Set<Listener>();

function isBrowser() {
  return typeof window !== "undefined";
}

export function systemPrefersDark(): boolean {
  return isBrowser() && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function getThemeChoice(): ThemeChoice {
  if (!isBrowser()) return "system";
  const v = localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

export function getContrast(): Contrast {
  if (!isBrowser()) return "normal";
  return localStorage.getItem(CONTRAST_KEY) === "high" ? "high" : "normal";
}

/** The theme actually shown, resolving "system" via the OS setting. */
export function effectiveTheme(): "light" | "dark" {
  const choice = getThemeChoice();
  if (choice === "system") return systemPrefersDark() ? "dark" : "light";
  return choice;
}

export function apply() {
  if (!isBrowser()) return;
  const root = document.documentElement;
  root.dataset.theme = effectiveTheme();
  root.dataset.contrast = getContrast();
}

export function setThemeChoice(choice: ThemeChoice) {
  if (!isBrowser()) return;
  localStorage.setItem(THEME_KEY, choice);
  apply();
  listeners.forEach((l) => l());
}

export function setContrast(contrast: Contrast) {
  if (!isBrowser()) return;
  localStorage.setItem(CONTRAST_KEY, contrast);
  apply();
  listeners.forEach((l) => l());
}

export function subscribeTheme(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Call once on mount: apply current prefs and react to OS changes while on
 *  "system". Returns a cleanup function. */
export function initTheme(): () => void {
  if (!isBrowser()) return () => {};
  apply();
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (getThemeChoice() === "system") {
      apply();
      listeners.forEach((l) => l());
    }
  };
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
