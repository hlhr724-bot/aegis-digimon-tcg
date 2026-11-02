import { useSyncExternalStore } from "react";

const STORAGE_KEY = "aegis.inspector-sources-width";
const MIN_WIDTH = 192;
const MAX_WIDTH = 520;
const DEFAULT_WIDTH = 272;

const listeners = new Set<() => void>();

function clampWidth(width: number): number {
  return Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)));
}

function readStoredWidth(): number {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return stored ? clampWidth(stored) : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

let currentWidth = readStoredWidth();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setWidth(next: number, persist = true): void {
  currentWidth = clampWidth(next);
  for (const listener of listeners) listener();
  if (!persist) return;
  try {
    localStorage.setItem(STORAGE_KEY, String(currentWidth));
  } catch {
    return;
  }
}

export function useInspectorSourcesWidth() {
  const width = useSyncExternalStore(
    subscribe,
    () => currentWidth,
    () => DEFAULT_WIDTH,
  );
  return { width, minWidth: MIN_WIDTH, maxWidth: MAX_WIDTH, defaultWidth: DEFAULT_WIDTH, setWidth };
}
