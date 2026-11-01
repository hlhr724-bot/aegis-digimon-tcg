import type { Arena3dDeviceClassEntry } from "@/game/arena3d/quality/Arena3dDeviceClass";
import { getArena3dDeviceClass } from "@/game/arena3d/quality/getArena3dDeviceClass";
import { readArena3dDeviceSignals } from "@/game/arena3d/quality/readArena3dDeviceSignals";

export function readArena3dDeviceClass(): Arena3dDeviceClassEntry {
  return getArena3dDeviceClass(readArena3dDeviceSignals());
}
