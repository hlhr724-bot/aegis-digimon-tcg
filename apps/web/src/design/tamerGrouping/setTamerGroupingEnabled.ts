import { TAMER_GROUPING_STORAGE_KEY, tamerGroupingStore } from "@/design/tamerGrouping/tamerGroupingStore";

export function setTamerGroupingEnabled(enabled: boolean): void {
  if (tamerGroupingStore.enabled === enabled) {
    return;
  }
  tamerGroupingStore.enabled = enabled;
  try {
    localStorage.setItem(TAMER_GROUPING_STORAGE_KEY, String(enabled));
  } catch {}
  for (const listener of tamerGroupingStore.listeners) {
    listener();
  }
}
