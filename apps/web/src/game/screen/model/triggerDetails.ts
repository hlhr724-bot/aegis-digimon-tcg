import { getCardDefinition, parseTriggerKey, type DecisionRequest, type PlayerState } from "@aegis/shared";
import { Zone } from "@aegis/shared/schema/enums";
import { triggerCardId } from "../../boardModel";
import { triggerClauseSummary } from "../../decisionPresentation";
import { playerFacingEffectClause, type TriggerDetail } from "../../overlay";
import type { Translate } from "../../../i18n";
import { findTriggerSource, type TriggerSource } from "@/game/screen/model/findTriggerSource";

export function triggerDetailsFor({
  decision,
  viewer,
  opponent,
  handInstanceIds,
  t,
  getCardName = (cardId) => getCardDefinition(cardId)?.nameEn ?? cardId,
}: {
  decision: DecisionRequest | undefined;
  viewer: PlayerState;
  opponent: PlayerState;
  handInstanceIds: readonly string[];
  t: Translate;
  getCardName?: (cardId: string) => string;
}): TriggerDetail[] {
  if (decision?.kind !== "orderTriggers") return [];
  return (decision.options?.triggerKeys ?? []).map((key, index) => {
    const source = findTriggerSource({
      instanceId: parseTriggerKey(key).instanceId,
      players: [viewer, opponent],
      handInstanceIds,
    });
    const cardId = decision.options?.triggerCardIds?.[index] ?? triggerCardId(key);
    const clause =
      playerFacingEffectClause({
        cardId,
        timing: decision.options?.triggerTimings?.[index] || decision.options?.timing,
        description: decision.options?.triggerDescriptions?.[index],
        isInherited: decision.options?.triggerIsInherited?.[index] === true,
      }) ?? getCardDefinition(cardId)?.effectText;
    return {
      sourceLabel: getTriggerSourceLabel(source, t, getCardName),
      summary: triggerClauseSummary(clause),
      ...(source?.zone === Zone.BattleArea && source.inherited ? { hostCardId: source.hostCardId } : {}),
    };
  });
}

function withCopy(label: string, source: { copy: number; copies: number }, t: Translate): string {
  return source.copies > 1 ? t("log.copySuffix", { label, n: source.copy }) : label;
}

function getTriggerSourceLabel(
  source: TriggerSource | undefined,
  t: Translate,
  getCardName: (cardId: string) => string,
): string | undefined {
  if (!source) {
    return undefined;
  }
  switch (source.zone) {
    case Zone.BattleArea:
      return source.inherited
        ? t("overlay.triggerSourceInherited", { name: withCopy(getCardName(source.hostCardId), source, t) })
        : withCopy(t("overlay.triggerSourceField"), source, t);
    case Zone.Hand:
      return t("overlay.triggerSourceHand", { position: source.position });
    case Zone.Breeding:
      return t("overlay.triggerSourceBreeding");
    case Zone.Trash:
      return t("overlay.triggerSourceTrash");
    case Zone.Delay:
      return t("overlay.triggerSourceDelay");
    case Zone.Security:
      return t("overlay.triggerSourceSecurity");
  }
}
