import { getLogCardName } from "@/game/log/getLogCardName";
import { CardMovePosition } from "@aegis/shared/protocol/CardMovePosition";
import { Zone, type Seat } from "@aegis/shared/schema/enums";
import type { DecisionRequest, ServerEvent } from "@aegis/shared/protocol/events";
import type { Translate } from "@/i18n/translationTypes";
import { otherSeat } from "./boardModel";

import { getSeatNames } from "@/game/log/getSeatNames";
import type { SeatNames } from "@/game/log/SeatNames";
import { describeZone } from "@/game/log/describeZone";
import { createLogCursor } from "@/game/log/createLogCursor";
import { appendLogEvent } from "@/game/log/appendLogEvent";
import { flushPendingLogMemory } from "@/game/log/flushPendingLogMemory";
import { flattenRecentLogEntries } from "@/game/log/flattenRecentLogEntries";
import type { LogKind, LogLine } from "@/game/log/LogEntry";

const cardName = (cardId: string): string => getLogCardName({ cardId });

export function lastEffectSource(events: ServerEvent[], seat: Seat): string | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i]!;
    if ((e.kind === "effectActivated" || e.kind === "effectResolved") && e.seat === seat) return e.sourceCardId;
    if (e.kind === "cardPlayed" && e.seat === seat) return e.cardId;
  }
  return undefined;
}

export function decisionEffectSource(request: DecisionRequest, events: ServerEvent[]): string | undefined {
  if (request.sourceCardId !== undefined) return request.sourceCardId;
  if (request.kind === "orderTriggers") return undefined;
  return lastEffectSource(events, request.seat);
}

export function buildMatchLog(
  events: readonly ServerEvent[],
  viewerSeat: Seat,
  instanceIndex: Map<string, string>,
  t: Translate,
  limit = 30,
  seatNames = getSeatNames({ players: [], viewerSeat, t }),
): LogLine[] {
  const cursor = createLogCursor({ instanceIndex });
  for (const event of events) {
    appendLogEvent({ cursor, event, viewerSeat, seatNames, t });
  }
  flushPendingLogMemory({ cursor, seatNames, t });
  return flattenRecentLogEntries({ entries: cursor.entries, limit });
}

type DescribeEventParams = {
  event: ServerEvent;
  viewerSeat: Seat;
  identities: ReadonlyMap<string, string>;
  t: Translate;
  seatNames?: SeatNames;
  turnSeat?: Seat;
};

export function describeEvent({
  event,
  viewerSeat,
  identities,
  t,
  seatNames = getSeatNames({ players: [], viewerSeat, t }),
  turnSeat = viewerSeat,
}: DescribeEventParams): (LogLine & { actorSeat?: Seat }) | null {
  const mine = (seat: Seat): LogKind => (seat === viewerSeat ? "you" : "opp");
  switch (event.kind) {
    case "matchStarted":
      return { text: t("log.matchStarted", { player: seatNames[event.firstSeat] }), kind: "sys" };
    case "phaseChanged":
      return null;
    case "turnEnded":
      return {
        text: t("log.turnEnded", { player: seatNames[event.endingSeat], nextPlayer: seatNames[event.nextSeat] }),
        kind: mine(event.endingSeat),
        actorSeat: event.endingSeat,
      };
    case "cardPlayed":
      return {
        text: t("log.played", {
          player: seatNames[event.seat],
          card: getLogCardName({ cardId: event.cardId, permanentId: event.permanentId }),
        }),
        kind: mine(event.seat),
        actorSeat: event.seat,
        cardIds: [event.cardId],
      };
    case "hatched":
      return {
        text: t("log.hatched", {
          player: seatNames[event.seat],
          card: getLogCardName({ cardId: event.cardId, permanentId: event.permanentId }),
        }),
        kind: mine(event.seat),
        actorSeat: event.seat,
        cardIds: [event.cardId],
      };
    case "movedFromBreeding":
      return {
        text: t("log.movedFromBreeding", {
          player: seatNames[event.seat],
          card: getLogCardName({ cardId: event.cardId, permanentId: event.permanentId }),
        }),
        kind: mine(event.seat),
        actorSeat: event.seat,
        cardIds: [event.cardId],
      };
    case "digivolved":
      return {
        text: t("log.digivolvedInto", {
          player: seatNames[event.seat],
          card: getLogCardName({ cardId: event.cardId, permanentId: event.permanentId }),
        }),
        kind: mine(event.seat),
        actorSeat: event.seat,
        cardIds: [event.cardId],
      };
    case "memoryChanged":
      if (event.reason === "passTurn") {
        return null;
      }
      return {
        text: t("log.memoryOfPlayer", { player: seatNames[turnSeat], from: event.from, to: event.to }),
        kind: "sys",
      };
    case "attackDeclared": {
      const targetCardId = event.target.kind === "player" ? undefined : event.targetCardId;
      const target =
        event.target.kind === "player"
          ? t("log.targetSecurity")
          : targetCardId === undefined
            ? t("log.targetDigimon")
            : getLogCardName({
                cardId: targetCardId,
                permanentId: event.target.kind === "permanent" ? event.target.permanentId : undefined,
              });
      return {
        text:
          event.redirected === true
            ? t("log.attackTargetSwitched", { target })
            : t("log.attackOnBy", {
                player: seatNames[event.seat],
                target,
                card: getLogCardName({ cardId: event.attackerCardId, permanentId: event.attackerPermanentId }),
              }),
        kind: "sys",

        cardIds: [event.attackerCardId, targetCardId].filter((id): id is string => id !== undefined),
      };
    }
    case "blockWindowOpened":
      return { text: t("log.blockWindow"), kind: "sys" };
    case "blocked":
      return { text: t("log.blocked"), kind: "sys" };
    case "blockDeclined":
      return { text: t("log.blockDeclined"), kind: "sys" };
    case "counterResolved":
      return event.activated ? { text: t("log.counterActivated"), kind: "sys" } : null;
    case "evadeResolved": {
      if (!event.accepted) return null;
      const cardId = identities.get(event.permanentId);
      return {
        text: t("log.evadeUsed", {
          card:
            cardId === undefined ? t("log.targetDigimon") : getLogCardName({ cardId, permanentId: event.permanentId }),
        }),
        kind: "sys",
        ...(cardId === undefined ? {} : { cardIds: [cardId] }),
      };
    }
    case "barrierResolved": {
      if (!event.accepted) return null;
      const cardId = identities.get(event.permanentId);
      return {
        text: t("log.barrierUsed", {
          card:
            cardId === undefined ? t("log.targetDigimon") : getLogCardName({ cardId, permanentId: event.permanentId }),
        }),
        kind: "sys",
        ...(cardId === undefined ? {} : { cardIds: [cardId] }),
      };
    }
    case "combatResolved": {
      const deleted = event.deletedPermanentIds.map((id) => identities.get(id));
      const named = deleted.filter((id): id is string => id !== undefined);

      if (named.length > 0 && named.length === deleted.length) {
        return {
          text: t("log.combatResolvedDeletedNamed", {
            cards: event.deletedPermanentIds
              .map((permanentId) => getLogCardName({ cardId: identities.get(permanentId)!, permanentId }))
              .join(", "),
          }),
          kind: "sys",
          cardIds: named,
        };
      }
      return {
        text: deleted.length ? t("log.combatResolvedDeleted", { count: deleted.length }) : t("log.combatResolved"),
        kind: "sys",
      };
    }
    case "deletionPrevented": {
      const cardId = event.cardId ?? identities.get(event.permanentId);
      return {
        text: t("log.deletionPrevented", {
          keyword: event.keyword,
          card:
            cardId === undefined ? t("log.targetDigimon") : getLogCardName({ cardId, permanentId: event.permanentId }),
        }),
        kind: "sys",
        ...(cardId === undefined ? {} : { cardIds: [cardId] }),
      };
    }
    case "securityChecked":
      return {
        text: t("log.securityCheck", {
          player: seatNames[event.seat],
          card: cardName(event.revealedCardId),
          resolution: event.resolution,
        }),
        kind: mine(otherSeat(event.seat)),
        cardIds: [event.revealedCardId],
      };
    case "securityRecovered":
      return {
        text: t("log.recovery", { player: seatNames[event.seat], count: event.amount }),
        kind: mine(event.seat),
      };
    case "cardRevealed": {
      const source = event.sourceCardId === undefined ? undefined : cardName(event.sourceCardId);
      return {
        text: t(source === undefined ? "log.cardRevealed" : "log.cardRevealedBy", {
          player: seatNames[event.seat],
          card: cardName(event.cardId),
          source: source ?? "",
        }),
        kind: mine(event.seat),
        actorSeat: event.seat,
        cardIds: [event.cardId, event.sourceCardId].filter((id): id is string => id !== undefined),
      };
    }
    case "effectActivated":
      if (event.receiptOnly === true) return null;

      return {
        text: t("log.effectActivated", { card: cardName(event.sourceCardId), description: event.description }),
        kind: "sys",
        cardIds: [event.sourceCardId],
      };
    case "effectTriggered":
    case "effectResolved":
      return {
        text: t(
          event.kind === "effectTriggered"
            ? "log.effectTriggered"
            : event.digivolutionPerformed === false
              ? "log.effectResolvedWithoutDigivolution"
              : "log.effectResolved",
          { card: getLogCardName({ cardId: event.sourceCardId, permanentId: event.sourcePermanentId }) },
        ),
        kind: "sys",
        cardIds: [event.sourceCardId],
      };
    case "effectHadNoEffect":
      return {
        text: t("log.effectHadNoEffect", {
          card: getLogCardName({ cardId: event.sourceCardId, permanentId: event.sourcePermanentId }),
        }),
        kind: "sys",
        cardIds: [event.sourceCardId],
      };
    case "cardsMoved": {
      if (event.handAddition === "staging") {
        return null;
      }
      if (
        (event.to === Zone.BattleArea || event.to === Zone.Breeding) &&
        !event.placedUnder &&
        !event.deckToUnder &&
        !event.strippedStackTops &&
        !event.trashedSources &&
        !event.returnedPermanents &&
        !event.fromHost
      ) {
        return null;
      }

      if (event.turnEndDeletion !== undefined) {
        const { sourceCardId, deletedCardId } = event.turnEndDeletion;
        return {
          text: t("log.turnEndDeletion", { card: cardName(deletedCardId), source: cardName(sourceCardId) }),
          kind: "sys",
          cardIds: [deletedCardId, sourceCardId],
        };
      }
      const permanent = event.deletedPermanents?.[0] ?? event.returnedPermanents?.[0] ?? event.trashedPermanents?.[0];
      if (permanent && event.deckReturnOrder === undefined) {
        let key: "log.deleted" | "log.deletedInBattle" | "log.returned" | "log.trashedPermanent" =
          "log.trashedPermanent";
        if (event.deletedPermanents?.length) {
          key = event.battleDeletion ? "log.deletedInBattle" : "log.deleted";
        } else if (event.returnedPermanents?.length) {
          key = "log.returned";
        }
        return {
          text: t(key, {
            player: seatNames[permanent.seat],
            card: getLogCardName({ cardId: permanent.cardId, permanentId: permanent.permanentId }),
            to: describeZone({ zone: event.to, seat: event.seat ?? permanent.seat, viewerSeat, seatNames, t }),
          }),
          kind: mine(permanent.seat),
          actorSeat: permanent.seat,
          cardIds: [permanent.cardId],
        };
      }
      if (event.handAddition === "draw" && event.seat !== undefined) {
        return {
          text: t("log.drew", { player: seatNames[event.seat], count: event.instanceIds.length }),
          kind: mine(event.seat),
          actorSeat: event.seat,
        };
      }
      const publicOrigin =
        event.from === Zone.BattleArea ||
        event.from === Zone.Trash ||
        event.to === Zone.Trash ||
        event.from === CardMovePosition.DIGIVOLUTION_CARDS.value ||
        event.from === CardMovePosition.LINKED_CARDS.value ||
        event.from === CardMovePosition.SUSPENDED.value ||
        event.from === CardMovePosition.UNSUSPENDED.value;
      const movedIds =
        event.cardIds ??
        (publicOrigin && event.deckReturnOrder !== true
          ? event.instanceIds.map((id) => identities.get(id)).filter((id): id is string => id !== undefined)
          : []);
      const movedName =
        movedIds
          .map((cardId, index) =>
            getLogCardName({
              cardId,
              permanentId:
                event.returnedPermanents?.find((returned) => returned.instanceId === event.instanceIds[index])
                  ?.permanentId ??
                (event.to === CardMovePosition.SUSPENDED.value || event.to === CardMovePosition.UNSUSPENDED.value
                  ? event.instanceIds[index]
                  : undefined),
            }),
          )
          .join(", ") || String(event.instanceIds.length);
      const underPermanentId =
        event.placedUnder?.permanentId ?? event.trashedSources?.permanentId ?? event.strippedStackTops?.permanentId;
      if (underPermanentId) {
        const hostCardId = event.trashedSources?.hostCardId ?? identities.get(underPermanentId);
        return {
          text: t(event.placedUnder ? "log.placedUnder" : "log.trashedFromUnder", {
            cards: movedName,
            host: hostCardId
              ? getLogCardName({ cardId: hostCardId, permanentId: underPermanentId })
              : t("log.targetDigimon"),
          }),
          kind: "sys",
          actorSeat: event.seat,
          cardIds: [...movedIds, ...(hostCardId ? [hostCardId] : [])],
        };
      }
      if (event.optionUsed) {
        return {
          text: t("log.optionResolved", { card: movedName }),
          kind: "sys",
          actorSeat: event.seat,
          cardIds: movedIds,
        };
      }
      if (event.to === "suspended" || event.to === "unsuspended") {
        return {
          text: t(event.to === "suspended" ? "log.suspended" : "log.unsuspended", { card: movedName }),
          kind: "sys",
          actorSeat: event.seat,
          cardIds: movedIds,
        };
      }
      const from = describeZone({
        zone: event.from,
        seat: event.fromSeat,
        hostCardId: event.fromHost?.hostCardId,
        viewerSeat,
        seatNames,
        t,
      });
      const destination =
        event.deckReturnOrder === true && event.to === Zone.Deck ? CardMovePosition.DECK_TOP.value : event.to;
      const to = describeZone({ zone: destination, seat: event.seat, viewerSeat, seatNames, t });

      const hostCardIds = event.fromHost ? [event.fromHost.hostCardId] : [];
      const completeIdentities = movedIds.length === event.instanceIds.length;
      if (event.deckReturnOrder !== undefined) {
        const cards = completeIdentities ? movedName : String(event.instanceIds.length);
        return {
          text: t(completeIdentities ? "log.returnedCardsInOrder" : "log.returnedCardsInOrderHidden", {
            cards,
            count: event.instanceIds.length,
            to,
          }),
          kind: "sys",
          cardIds: completeIdentities ? movedIds : [],
        };
      }
      if (completeIdentities && movedIds.length > 1) {
        return {
          text: t("log.cardsMovedNamed", { cards: movedName, from, to }),
          kind: "sys",
          cardIds: [...movedIds, ...hostCardIds],
        };
      }
      const movedCardId = completeIdentities ? movedIds[0] : undefined;
      if (movedCardId !== undefined) {
        return {
          text: t("log.cardMovedNamed", { card: cardName(movedCardId), from, to }),
          kind: "sys",
          cardIds: [...new Set([movedCardId, ...hostCardIds])],
        };
      }
      return {
        text: t(event.instanceIds.length === 1 ? "log.cardMoved" : "log.cardsMoved", {
          count: event.instanceIds.length,
          from,
          to,
        }),
        kind: "sys",
        cardIds: hostCardIds,
      };
    }
    case "gameOver": {
      if (event.result.outcome === "draw") {
        return { text: t("log.gameOverDraw", { reason: event.reason }), kind: "sys" };
      }
      const won = event.result.winnerSeat === viewerSeat;
      return {
        text: t(won ? "log.gameOverWin" : "log.gameOverLoss", { reason: event.reason }),
        kind: won ? "you" : "opp",
      };
    }
    case "actionRejected":
      return null;
    default:
      return null;
  }
}
