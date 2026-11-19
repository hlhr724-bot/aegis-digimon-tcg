import { getCardDefinition, parseTriggerKey, type DecisionRequest, type PlayerState } from "@aegis/shared";
import { Zone } from "@aegis/shared/schema/enums";
import { triggerCardId } from "../../boardModel";
import { triggerClauseSummary } from "../../decisionPresentation";
import { playerFacingEffectClause, type TriggerDetail } from "../../overlay";
import type { Translate } from "../../../i18n";
import { findTriggerSource, type TriggerSource } from "@/game/screen/model/findTriggerSource";
import { formatFieldReference } from "@/design/fieldReference/formatFieldReference";

export function triggerDetailsFor({
  decision,
  viewer,
  opponent,
  handInstanceIds,
  t,
  getCardName = (cardId) => getCardDefinition(cardId)?.nameEn ?? cardId,
  showFieldReferences = false,
}: {
  decision: DecisionRequest | undefined;
  viewer: PlayerState;
  opponent: PlayerState;
  handInstanceIds: readonly string[];
  t: Translate;
  getCardName?: (cardId: string) => string;
  showFieldReferences?: boolean;
}): TriggerDetail[] {
  if (decision?.kind !== "orderTriggers") return [];
  return (decision.options?.triggerKeys ?? []).map((key, index) => {
    const source = findTriggerSource({
      instanceId: parseTriggerKey(key).instanceId,
      players: [viewer, opponent],
      handInstanceIds,
    });
    const cardId = decision.options?.triggerCardIds?.[index] ?? triggerCardId(key);
    const presentsAsInherited = decision.options?.triggerIsInherited?.[index] !== false;
    const clause =
      playerFacingEffectClause({
        cardId,
        timing: decision.options?.triggerTimings?.[index] || decision.options?.timing,
        description: decision.options?.triggerDescriptions?.[index],
        isInherited: decision.options?.triggerIsInherited?.[index] === true,
      }) ?? getCardDefinition(cardId)?.effectText;
    const fieldReference =
      source?.zone === Zone.BattleArea && (showFieldReferences || source.copies > 1)
        ? formatFieldReference(source.permanentId)
        : undefined;
    const subject = findTriggerSubject({
      permanentId: decision.options?.triggerSubjectPermanentIds?.[index],
      players: [viewer, opponent],
    });
    const subjectFieldReference =
      subject && (showFieldReferences || subject.copies > 1) ? formatFieldReference(subject.permanentId) : undefined;
    return {
      ...(subject
        ? {
            subjectCardId: subject.cardId,
            subjectLabel: t("overlay.triggerSubject", {
              name: [getCardName(subject.cardId), subjectFieldReference].filter(Boolean).join(" "),
            }),
          }
        : {}),
      ...(subjectFieldReference ? { subjectFieldReference } : {}),
      sourceLabel: getTriggerSourceLabel(source, presentsAsInherited, t, getCardName, fieldReference),
      ...(source?.zone === Zone.BattleArea && source.copies > 1 ? { sourceShowsCopy: true } : {}),
      summary: triggerClauseSummary(clause),
      ...(fieldReference ? { fieldReference } : {}),
      ...(source?.zone === Zone.BattleArea && source.inherited ? { hostCardId: source.hostCardId } : {}),
      ...(isControlledByOpponent(decision, index) ? { controlledByOpponent: true } : {}),
    };
  });
}

type FindTriggerSubjectParams = {
  permanentId: string | undefined;
  players: readonly PlayerState[];
};

function findTriggerSubject({
  permanentId,
  players,
}: FindTriggerSubjectParams): { permanentId: string; cardId: string; copies: number } | undefined {
  if (!permanentId) {
    return undefined;
  }
  for (const player of players) {
    const permanents = [...player.battleArea, ...(player.breeding ? [player.breeding] : [])];
    const subject = permanents.find((permanent) => permanent?.permanentId === permanentId);
    const cardId = subject?.topCard?.cardId;
    if (cardId) {
      return {
        permanentId,
        cardId,
        copies: player.battleArea.filter((permanent) => permanent?.topCard?.cardId === cardId).length,
      };
    }
  }
  return undefined;
}

function isControlledByOpponent(decision: DecisionRequest, index: number): boolean {
  const controllerSeat = decision.options?.triggerControllerSeats?.[index];
  return controllerSeat !== undefined && controllerSeat !== decision.seat;
}

function withCopy(
  label: string,
  source: { copy: number; copies: number },
  t: Translate,
  fieldReference: string | undefined,
): string {
  if (source.copies <= 1) {
    return label;
  }
  return fieldReference ? `${label} ${fieldReference}` : t("log.copySuffix", { label, n: source.copy });
}

function getTriggerSourceLabel(
  source: TriggerSource | undefined,
  presentsAsInherited: boolean,
  t: Translate,
  getCardName: (cardId: string) => string,
  fieldReference: string | undefined,
): string | undefined {
  if (!source) {
    return undefined;
  }
  switch (source.zone) {
    case Zone.BattleArea:
      return source.inherited && presentsAsInherited
        ? t("overlay.triggerSourceInherited", {
            name: withCopy(getCardName(source.hostCardId), source, t, fieldReference),
          })
        : withCopy(t("overlay.triggerSourceField"), source, t, fieldReference);
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
