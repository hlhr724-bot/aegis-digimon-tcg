import { useSyncExternalStore } from "react";
import { CardConfirmationMode } from "@/game/cardConfirmation/CardConfirmationMode";
import { isCardConfirmationMode } from "@/game/cardConfirmation/isCardConfirmationMode";

const STORAGE_KEY = "aegis.card-confirmation.mode";
const LEGACY_ENABLED_STORAGE_KEY = "aegis.action-confirmation.enabled";
const listeners = new Set<() => void>();

function readMode(): CardConfirmationMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isCardConfirmationMode(stored)) {
      return stored;
    }
    return localStorage.getItem(LEGACY_ENABLED_STORAGE_KEY) === "false"
      ? CardConfirmationMode.NEVER.value
      : CardConfirmationMode.ALWAYS.value;
  } catch {
    return CardConfirmationMode.ALWAYS.value;
  }
}

let current = readMode();

function getMode(): CardConfirmationMode {
  return current;
}

function setMode(next: CardConfirmationMode) {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    current = next;
  }
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useMode() {
  return useSyncExternalStore(subscribe, getMode, () => CardConfirmationMode.ALWAYS.value);
}

export const cardConfirmationPreference = { getMode, setMode, useMode };
