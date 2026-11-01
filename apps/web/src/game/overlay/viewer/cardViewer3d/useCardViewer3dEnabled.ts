import { useSyncExternalStore } from "react";
import { cardViewer3dPreference } from "@/game/overlay/viewer/cardViewer3d/cardViewer3dPreference";

export function useCardViewer3dEnabled() {
  return useSyncExternalStore(cardViewer3dPreference.subscribe, cardViewer3dPreference.isEnabled, () => true);
}
