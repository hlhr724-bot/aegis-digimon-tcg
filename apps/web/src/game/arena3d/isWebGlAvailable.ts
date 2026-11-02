import { readArena3dDeviceSignals } from "@/game/arena3d/quality/readArena3dDeviceSignals";

export function isWebGlAvailable(): boolean {
  return readArena3dDeviceSignals() !== undefined;
}
