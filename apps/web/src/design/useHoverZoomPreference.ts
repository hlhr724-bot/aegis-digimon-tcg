import { useSyncExternalStore } from "react";
import { hoverZoomPreference } from "@/design/hoverZoomPreference";

export function useHoverZoomPreference() {
  return useSyncExternalStore(hoverZoomPreference.subscribe, hoverZoomPreference.isEnabled, () => false);
}
