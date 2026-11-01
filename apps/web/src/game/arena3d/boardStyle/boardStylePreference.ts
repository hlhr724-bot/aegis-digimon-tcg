import { useSyncExternalStore } from "react";
import { BoardStyle } from "@/game/arena3d/boardStyle/BoardStyle";
import { findBoardStyleEntry } from "@/game/arena3d/boardStyle/findBoardStyleEntry";

const STORAGE_KEY = "aegis.board-style";
const DEFAULT_STYLE: BoardStyle = BoardStyle.CLASSIC.value;
const listeners = new Set<() => void>();

function readStyle(): BoardStyle {
  try {
    return findBoardStyleEntry(localStorage.getItem(STORAGE_KEY))?.value ?? DEFAULT_STYLE;
  } catch {
    return DEFAULT_STYLE;
  }
}

function storeStyle(style: BoardStyle) {
  try {
    localStorage.setItem(STORAGE_KEY, style);
  } catch {
    return;
  }
}

let current = readStyle();

function getStyle(): BoardStyle {
  return current;
}

function setStyle(next: BoardStyle) {
  const entry = findBoardStyleEntry(next);
  if (!entry) {
    return;
  }
  current = entry.value;
  storeStyle(entry.value);
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

function useStyle(): BoardStyle {
  return useSyncExternalStore(subscribe, getStyle, () => DEFAULT_STYLE);
}

export const boardStylePreference = { getStyle, setStyle, subscribe, useStyle };
