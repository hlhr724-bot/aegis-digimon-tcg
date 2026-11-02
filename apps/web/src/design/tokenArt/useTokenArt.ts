import { useSyncExternalStore } from "react";
import { tokenArtStore } from "@/design/tokenArt/tokenArtStore";

export function useTokenArt(cardId: string | undefined): string | undefined {
  return useSyncExternalStore(
    tokenArtStore.subscribe,
    () => tokenArtStore.get(cardId),
    () => undefined,
  );
}
