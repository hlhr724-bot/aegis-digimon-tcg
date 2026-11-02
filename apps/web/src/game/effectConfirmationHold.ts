import { useSyncExternalStore } from "react";

const STORAGE_KEY = "aegis.effect-confirmation-hold.enabled";

const listeners = new Set<() => void>();

function readEffectConfirmationHold(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

let current = readEffectConfirmationHold();

export function isEffectConfirmationHoldEnabled(): boolean {
  return current;
}

export function setEffectConfirmationHoldEnabled(next: boolean): void {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    return;
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useEffectConfirmationHold(): boolean {
  return useSyncExternalStore(subscribe, isEffectConfirmationHoldEnabled, () => false);
}
