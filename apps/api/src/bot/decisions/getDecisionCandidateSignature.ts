import { getCardDefinition } from "@aegis/shared/cards/registry";
import type { CardDefinition } from "@aegis/shared/cards/types";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import type { BotUnit, BotView } from "#api/bot/view";

type Params = { view: BotView | undefined; request: DecisionRequest; instanceId: string };

function describeVanillaCard(definition: CardDefinition, visibleTraits: ReadonlySet<string>): string | undefined {
  if (definition.effectText || definition.inheritedEffectText || definition.securityEffectText) {
    return undefined;
  }
  return JSON.stringify([
    definition.kinds,
    definition.level,
    definition.playCost,
    definition.dp,
    definition.colors,
    definition.evoCosts,
    definition.forms,
    definition.attributes,
    (definition.types ?? []).filter((trait) => visibleTraits.has(trait)).sort(),
  ]);
}

function getOpponentVisibleTraits(view: BotView, unit: BotUnit): Set<string> {
  const peers = [
    ...view.opponentBoard.filter((peer) => peer !== unit).map((peer) => peer.definition),
    ...(view.opponentTrashCardIds ?? []).map((cardId) => getCardDefinition(cardId)),
  ];
  return new Set(peers.flatMap((peer) => peer?.types ?? []));
}

const CONTROLLER_TURN_KEYWORDS: ReadonlySet<string> = new Set(["Rush", "DigiXrosSubstitute"]);

function getActiveKeywords(view: BotView | undefined, unit: BotUnit, side: string): string[] {
  const controllerTurn = side === "own" ? view?.turnSeat === view?.seat : view?.turnSeat === view?.opponentSeat;
  return unit.keywords.filter((keyword) => controllerTurn !== false || !CONTROLLER_TURN_KEYWORDS.has(keyword));
}

function describeUnit(
  side: string,
  unit: BotUnit,
  identity = unit.cardId ?? "unknown",
  keywords = unit.keywords,
): string {
  return [
    side,
    identity,
    unit.dp,
    unit.level,
    unit.suspended,
    [...keywords].sort().join(","),
    unit.securityAttack ?? 1,
  ].join(":");
}

function isUnit(unit: BotUnit, instanceId: string): boolean {
  return unit.permanentId === instanceId || unit.topCardInstanceId === instanceId;
}

export function getDecisionCandidateSignature({ view, request, instanceId }: Params): string {
  const own = [...(view?.board ?? []), ...(view?.breeding === undefined ? [] : [view.breeding])].find((unit) =>
    isUnit(unit, instanceId),
  );
  if (own !== undefined) {
    return describeUnit("own", own, undefined, getActiveKeywords(view, own, "own"));
  }
  const opponent = view?.opponentBoard.find((unit) => isUnit(unit, instanceId));
  if (opponent !== undefined) {
    const vanilla =
      view === undefined || opponent.definition === undefined
        ? undefined
        : describeVanillaCard(opponent.definition, getOpponentVisibleTraits(view, opponent));
    return describeUnit(
      "opponent",
      opponent,
      vanilla === undefined ? undefined : `vanilla:${vanilla}`,
      getActiveKeywords(view, opponent, "opponent"),
    );
  }
  const handCard = view?.hand.find((card) => card.instanceId === instanceId);
  if (handCard !== undefined) {
    return `hand:${handCard.cardId}`;
  }
  const visible = request.options?.visibleCards?.find((card) => card.instanceId === instanceId);
  return visible === undefined ? "unknown" : `card:${visible.cardId}`;
}
