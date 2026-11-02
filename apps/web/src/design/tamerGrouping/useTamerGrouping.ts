import { useSyncExternalStore } from "react";
import { tamerGroupingStore } from "@/design/tamerGrouping/tamerGroupingStore";

function getTamerGrouping(): boolean {
  return tamerGroupingStore.enabled;
}

function subscribeTamerGrouping(listener: () => void): () => void {
  tamerGroupingStore.listeners.add(listener);
  return () => tamerGroupingStore.listeners.delete(listener);
}

export function useTamerGrouping(): boolean {
  return useSyncExternalStore(subscribeTamerGrouping, getTamerGrouping, () => true);
}
