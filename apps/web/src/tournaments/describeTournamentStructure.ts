import type { Translate } from "@/i18n/translationTypes";
import { structureKey } from "@/tournaments/labels";
import type { TournamentListing } from "@/tournaments/types";

type DescribeTournamentStructureParams = {
  detail: Pick<TournamentListing, "structure" | "topCutEnabled" | "topCutSize">;
  t: Translate;
};

export function describeTournamentStructure({ detail, t }: DescribeTournamentStructureParams): string {
  const structure = t(structureKey(detail.structure));
  if (!detail.topCutEnabled) {
    return structure;
  }
  if (detail.topCutSize === 0) {
    return `${structure} · ${t("tournaments.badge.noTopCut")}`;
  }
  if (detail.topCutSize === null) {
    return `${structure} + ${t("tournaments.badge.topCut")}`;
  }
  return `${structure} + ${t("tournaments.format.topCutSize", { count: detail.topCutSize })}`;
}
