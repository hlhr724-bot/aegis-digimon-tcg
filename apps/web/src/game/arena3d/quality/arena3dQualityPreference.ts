import { useSyncExternalStore } from "react";
import { AUTO_ARENA_3D_QUALITY, type Arena3dQualityChoice } from "@/game/arena3d/quality/Arena3dQualityChoice";
import { findArena3dQualityEntry } from "@/game/arena3d/quality/findArena3dQualityEntry";

const STORAGE_KEY = "aegis.arena-3d-quality";
const DEFAULT_CHOICE: Arena3dQualityChoice = AUTO_ARENA_3D_QUALITY;
const listeners = new Set<() => void>();

function parseChoice(value: unknown): Arena3dQualityChoice | undefined {
  if (value === AUTO_ARENA_3D_QUALITY) {
    return AUTO_ARENA_3D_QUALITY;
  }
  return findArena3dQualityEntry(value)?.value;
}

function readChoice(): Arena3dQualityChoice {
  try {
    return parseChoice(localStorage.getItem(STORAGE_KEY)) ?? DEFAULT_CHOICE;
  } catch {
    return DEFAULT_CHOICE;
  }
}

function storeChoice(choice: Arena3dQualityChoice) {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    return;
  }
}

let current = readChoice();

function getChoice(): Arena3dQualityChoice {
  return current;
}

function setChoice(next: Arena3dQualityChoice) {
  const parsed = parseChoice(next);
  if (!parsed) {
    return;
  }
  current = parsed;
  storeChoice(parsed);
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function useChoice(): Arena3dQualityChoice {
  return useSyncExternalStore(subscribe, getChoice, () => DEFAULT_CHOICE);
}

export const arena3dQualityPreference = { getChoice, setChoice, subscribe, useChoice };
