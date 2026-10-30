import { useSyncExternalStore } from "react";
import { ArenaEnvironment } from "@/game/arena3d/ArenaEnvironment";
import { RANDOM_ARENA_ENVIRONMENT, type ArenaEnvironmentChoice } from "@/game/arena3d/ArenaEnvironmentChoice";
import { findArenaEnvironmentEntry } from "@/game/arena3d/findArenaEnvironmentEntry";

const STORAGE_KEY = "aegis.arena-environment";
const DEFAULT_CHOICE: ArenaEnvironmentChoice = ArenaEnvironment.GRID.value;
const listeners = new Set<() => void>();

function parseChoice(value: unknown): ArenaEnvironmentChoice | undefined {
  if (value === RANDOM_ARENA_ENVIRONMENT) {
    return RANDOM_ARENA_ENVIRONMENT;
  }
  return findArenaEnvironmentEntry(value)?.value;
}

function readChoice(): ArenaEnvironmentChoice {
  try {
    return parseChoice(localStorage.getItem(STORAGE_KEY)) ?? DEFAULT_CHOICE;
  } catch {
    return DEFAULT_CHOICE;
  }
}

function storeChoice(choice: ArenaEnvironmentChoice) {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    return;
  }
}

let current = readChoice();

function getChoice(): ArenaEnvironmentChoice {
  return current;
}

function setChoice(next: ArenaEnvironmentChoice) {
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

function useChoice(): ArenaEnvironmentChoice {
  return useSyncExternalStore(subscribe, getChoice, () => DEFAULT_CHOICE);
}

export const arenaEnvironmentPreference = { getChoice, setChoice, subscribe, useChoice };
