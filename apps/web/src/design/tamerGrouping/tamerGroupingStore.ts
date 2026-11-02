export const TAMER_GROUPING_STORAGE_KEY = "aegis.field.group-tamers";

function readTamerGrouping(): boolean {
  try {
    return localStorage.getItem(TAMER_GROUPING_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export const tamerGroupingStore = {
  enabled: readTamerGrouping(),
  listeners: new Set<() => void>(),
};
