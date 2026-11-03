import type { ReactNode } from "react";
import { ViewerCardArtIdsContext } from "@/screens/cardLanguage/ViewerCardArtIdsContext";

const NO_VIEWER_ART_IDS: ReadonlySet<string> = new Set();

type ViewerCardLanguageParams = { children: ReactNode };

export function ViewerCardLanguage({ children }: ViewerCardLanguageParams) {
  return <ViewerCardArtIdsContext.Provider value={NO_VIEWER_ART_IDS}>{children}</ViewerCardArtIdsContext.Provider>;
}
