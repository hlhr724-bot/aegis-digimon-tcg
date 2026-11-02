import { Arena3dDeviceClass, type Arena3dDeviceClassEntry } from "@/game/arena3d/quality/Arena3dDeviceClass";
import type { Arena3dDeviceSignals } from "@/game/arena3d/quality/Arena3dDeviceSignals";

const TABLET_SHORT_SIDE = 600;

export function getArena3dDeviceClass(signals: Arena3dDeviceSignals | undefined): Arena3dDeviceClassEntry {
  if (!signals || !signals.coarsePointer || signals.finePointerAvailable) {
    return Arena3dDeviceClass.DESKTOP;
  }
  return signals.screenShortSide >= TABLET_SHORT_SIDE ? Arena3dDeviceClass.TABLET : Arena3dDeviceClass.PHONE;
}
