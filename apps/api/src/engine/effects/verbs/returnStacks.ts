import { locateMoveOrigins } from "#api/engine/effects/verbs/locateMoveOrigins";
import { groupCardsByOrigin } from "#api/engine/effects/verbs/groupCardsByOrigin";
import { CardKind, Zone, requireCardDefinition, CardInstance } from "@aegis/shared";
import { applyOverflow, insertCard, replaceStack, setTopCard } from "../../state/access.js";
import type { Primitives } from "../EffectContext.js";
import { collectForReturn } from "../verbs/looseInstances.js";

import type { PrimitivesContext } from "./context.js";

/**
 * Returning the top cards of a digivolution stack to a deck or egg deck.
 */

export function createReturnStacksVerbs(pc: PrimitivesContext) {
  const {
    engine,
    continuous,
    dropPermanentLedgers,
    effectSeatStack,
    ledger,
    player,
    promotedTopNeedsInvalidRuleTrash,
    state,
  } = pc;
  // Reached through the context because these are built in sibling modules: the
  // whole set exists before any of it runs, so forwarding at call time is safe.
  const fireWhenReturnedPermanentsLeave: PrimitivesContext["helpers"]["fireWhenReturnedPermanentsLeave"] = (...args) =>
    pc.helpers.fireWhenReturnedPermanentsLeave(...args);

  const returnStackTopsToDeck: Primitives["returnStackTopsToDeck"] = async (instanceIds, opts) => {
    const requested = new Set(instanceIds);
    const movedById = new Map<string, CardInstance>();
    const byEffectSeat = opts?.byEffectSeat ?? effectSeatStack.at(-1);

    for (const owner of state.players) {
      for (const permanent of owner.battleArea) {
        if (permanent.topCard === undefined) continue;
        const completeStack = [...permanent.stack, permanent.topCard];
        const selected = completeStack.filter((card) => requested.has(card.instanceId));
        if (selected.length === 0) continue;
        if (
          byEffectSeat !== undefined &&
          continuous.hasRestriction(permanent.permanentId, "stackReturn", undefined, {
            byOpponentEffect: byEffectSeat !== permanent.controllerSeat,
          })
        ) {
          continue;
        }

        const removableCount = Math.min(selected.length, completeStack.length - 1);
        const removable =
          opts?.position === "bottom" ? completeStack.slice(0, removableCount) : completeStack.slice(-removableCount);
        if (removableCount === 0 || removable.some((card) => !requested.has(card.instanceId))) continue;

        const remaining =
          opts?.position === "bottom" ? completeStack.slice(removableCount) : completeStack.slice(0, -removableCount);
        const promoted = remaining.at(-1);
        if (promoted === undefined) continue;
        const priorTop = permanent.topCard;
        replaceStack(permanent, remaining.slice(0, -1));
        setTopCard(permanent, promoted);
        continuous.reanchorCustomEffectGrants(priorTop.instanceId, promoted.instanceId);
        promoted.faceUp = true;
        const promotedDefinition = requireCardDefinition(promoted.cardId);
        permanent.baseDP =
          promotedDefinition.kinds.includes(CardKind.Digimon) || promotedDefinition.kinds.includes(CardKind.DigiEgg)
            ? promotedDefinition.dp
            : 0;
        permanent.invalidNoDpStackTop = promotedTopNeedsInvalidRuleTrash(promotedDefinition);
        ledger.recomputeDP(state, permanent.permanentId);
        for (const card of removable) movedById.set(card.instanceId, card);
      }
    }

    const moved = instanceIds.flatMap((instanceId) => {
      const card = movedById.get(instanceId);
      return card === undefined ? [] : [card];
    });
    for (const card of [...moved].reverse()) {
      card.faceUp = false;
      const definition = requireCardDefinition(card.cardId);
      const deckZone = definition.kinds.includes(CardKind.DigiEgg) ? Zone.EggDeck : Zone.Deck;
      insertCard(player(card.ownerSeat), deckZone, card, opts?.position === "bottom" ? "bottom" : "top");
    }
    if (moved.length === 0) return [];

    ledger.dropSourceInstances(
      state,
      moved.map((card) => card.instanceId),
    );
    applyOverflow(engine.memory, moved, state.turnSeat);
    engine.emit({
      kind: "cardsMoved",
      instanceIds: moved.map((card) => card.instanceId),
      from: Zone.BattleArea,
      to: Zone.Deck,
    });
    await engine.recomputeContinuousEffects?.();

    const recipientSeats = new Set(moved.map((card) => card.ownerSeat));
    for (const seat of recipientSeats) {
      await engine.fireSubTrigger?.("whenEffectAddsToDeck", {
        effectAddedToDeckSeat: seat,
        effectAddedToDeckBySeat: byEffectSeat ?? engine.controllerSeat(),
        ...(opts?.byEffectCardId !== undefined ? { byEffectCardId: opts.byEffectCardId } : {}),
      });
    }
    return moved;
  };

  /** Return loose cards to the bottom of their owners' Digi-Egg decks. */
  const returnToEggDeck = async (instanceIds: string[]): Promise<CardInstance[]> => {
    await fireWhenReturnedPermanentsLeave(instanceIds);
    const physicalIds = instanceIds.flatMap((id) => {
      const permanent = [...state.players]
        .flatMap((owner) => [...owner.battleArea, ...(owner.breeding ? [owner.breeding] : [])])
        .find((candidate) => candidate.topCard?.instanceId === id);
      return permanent
        ? [id, ...permanent.stack.map((card) => card.instanceId), ...permanent.linked.map((card) => card.instanceId)]
        : [id];
    });
    const origins = locateMoveOrigins({ state, instanceIds: physicalIds });
    const moved: CardInstance[] = [];
    for (const instanceId of instanceIds) {
      const collected = collectForReturn(state, instanceId, dropPermanentLedgers);
      if (collected === undefined) continue;
      for (const card of collected) {
        card.faceUp = false;
        insertCard(player(card.ownerSeat), Zone.EggDeck, card, "bottom");
        moved.push(card);
      }
    }
    for (const { cards, ...origin } of groupCardsByOrigin({ origins, cards: moved })) {
      engine.emit({
        kind: "cardsMoved",
        instanceIds: cards.map((card) => card.instanceId),
        ...origin,
        to: Zone.EggDeck,
      });
    }
    return moved;
  };

  return { returnStackTopsToDeck, returnToEggDeck };
}
