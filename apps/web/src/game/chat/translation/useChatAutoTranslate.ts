import { useSyncExternalStore } from "react";

const STORAGE_KEY = "aegis.chat.autoTranslate";
const ON = "on";
const OFF = "off";

const listeners = new Set<() => void>();

function readStoredPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === ON;
  } catch {
    return false;
  }
}

let currentEnabled = readStoredPreference();

function getEnabled(): boolean {
  return currentEnabled;
}

function persistPreference(next: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, next ? ON : OFF);
  } catch {
    return;
  }
}

function setEnabled(next: boolean): void {
  currentEnabled = next;
  persistPreference(next);
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useChatAutoTranslate(): [boolean, (next: boolean) => void] {
  return [useSyncExternalStore(subscribe, getEnabled, () => false), setEnabled];
}
