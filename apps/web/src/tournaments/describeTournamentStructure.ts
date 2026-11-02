import type { Translate } from "@/i18n/translationTypes";
import { structureKey } from "@/tournaments/labels";
import type { TournamentDetail } from "@/tournaments/types";

type DescribeTournamentStructureParams = {
  detail: Pick<TournamentDetail, "structure" | "topCutEnabled">;
  t: Translate;
};

export function describeTournamentStructure({ detail, t }: DescribeTournamentStructureParams): string {
  const structure = t(structureKey(detail.structure));
  return detail.topCutEnabled ? `${structure} + ${t("tournaments.badge.topCut")}` : structure;
}
