import { useSyncExternalStore } from "react";
import { HAND_SORT_DIRECTIONS, HandSortDirection } from "@/game/HandSortDirection";

const STORAGE_KEY = "aegis.hand.sort-direction";
const DEFAULT_DIRECTION: HandSortDirection = HandSortDirection.ASCENDING.value;

const listeners = new Set<() => void>();

function readHandSortDirection(): HandSortDirection {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return HAND_SORT_DIRECTIONS.find((direction) => direction === stored) ?? DEFAULT_DIRECTION;
  } catch {
    return DEFAULT_DIRECTION;
  }
}

function persistHandSortDirection(next: HandSortDirection): void {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    return;
  }
}

let current = readHandSortDirection();

export function getHandSortDirection(): HandSortDirection {
  return current;
}

export function setHandSortDirection(next: HandSortDirection): void {
  current = next;
  persistHandSortDirection(next);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHandSortDirection(): HandSortDirection {
  return useSyncExternalStore(subscribe, getHandSortDirection, () => DEFAULT_DIRECTION);
}
