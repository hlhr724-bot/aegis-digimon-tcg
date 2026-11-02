import { useSyncExternalStore } from "react";

const STORAGE_KEY = "aegis.card-zoom-printed-text";
const SHOWN = "shown";
const HIDDEN = "hidden";

const listeners = new Set<() => void>();

function readPrintedTextShown(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === SHOWN;
  } catch {
    return false;
  }
}

let currentShown = readPrintedTextShown();

function isPrintedTextShown(): boolean {
  return currentShown;
}

function persistPrintedTextShown(shown: boolean): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, shown ? SHOWN : HIDDEN);
    return true;
  } catch {
    return false;
  }
}

function setPrintedTextShown(next: boolean): void {
  currentShown = next;
  persistPrintedTextShown(next);
  for (const listener of listeners) listener();
}

function subscribePrintedText(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCardZoomPrintedText(): [boolean, (next: boolean) => void] {
  const shown = useSyncExternalStore(subscribePrintedText, isPrintedTextShown, () => false);
  return [shown, setPrintedTextShown];
}
