import { useSyncExternalStore } from "react";

const STORAGE_KEY = "aegis.profile-stats";
const SHOWN = "shown";
const HIDDEN = "hidden";

const listeners = new Set<() => void>();

function readProfileStatsShown(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== HIDDEN;
  } catch {
    return true;
  }
}

function storeProfileStatsShown(shown: boolean): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, shown ? SHOWN : HIDDEN);
    return true;
  } catch {
    return false;
  }
}

let currentShown = readProfileStatsShown();

export function areProfileStatsShown(): boolean {
  return currentShown;
}

export function setProfileStatsShown(next: boolean): void {
  currentShown = next;
  storeProfileStatsShown(next);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useProfileStatsShown(): boolean {
  return useSyncExternalStore(subscribe, areProfileStatsShown, () => true);
}
