import { useSyncExternalStore } from "react";
import type { ArenaEnvironment } from "@/game/arena3d/ArenaEnvironment";

export type ArenaEnvironmentPreviews = Readonly<Partial<Record<ArenaEnvironment, string>>>;

const EMPTY_PREVIEWS: ArenaEnvironmentPreviews = {};
const listeners = new Set<() => void>();
let currentKey: string | undefined;
let previews: ArenaEnvironmentPreviews = EMPTY_PREVIEWS;

function read(colorsKey: string): ArenaEnvironmentPreviews {
  return colorsKey === currentKey ? previews : EMPTY_PREVIEWS;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const arenaEnvironmentPreviewStore = {
  record(colorsKey: string, environment: ArenaEnvironment, url: string) {
    const base = colorsKey === currentKey ? previews : EMPTY_PREVIEWS;
    currentKey = colorsKey;
    previews = { ...base, [environment]: url };
    for (const listener of listeners) {
      listener();
    }
  },
  usePreviews(colorsKey: string): ArenaEnvironmentPreviews {
    return useSyncExternalStore(
      subscribe,
      () => read(colorsKey),
      () => EMPTY_PREVIEWS,
    );
  },
};
