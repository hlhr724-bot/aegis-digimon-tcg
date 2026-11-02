import { locateMoveOrigins } from "#api/engine/effects/verbs/locateMoveOrigins";
import { groupCardsByOrigin } from "#api/engine/effects/verbs/groupCardsByOrigin";
import { CardKind, Zone, requireCardDefinition, CardInstance, type Seat } from "@aegis/shared";
import { DecisionSelectionGoal } from "@aegis/shared/protocol/DecisionSelectionGoal";
import { pushOnStack, takeTop, unshiftOnStack } from "../../state/access.js";
import { digiXrosMatches, materialSaveCountOf } from "../../combat/keywords.js";
import { hostOfLinkedInstance, peekLooseInstance, removeLooseInstance } from "../verbs/looseInstances.js";

import type { PrimitivesContext } from "./context.js";

/**
 * Placing cards under a permanent, from hand, deck or a material save.
 */

export function createPlaceUnderVerbs(pc: PrimitivesContext) {
  const { engine, access, continuous, effectSeatStack, player, state, ledger } = pc;

  const moveLooseCardsUnder = async (
    targetPermanentId: string,
    instanceIds: string[],
    opts?: { belowTop?: boolean; faceUp?: boolean },
  ): Promise<{ placed: CardInstance[]; securitySources: Set<Seat> }> => {
    const placed: CardInstance[] = [];
    const securitySources = new Set<Seat>();
    const permanent = access.permanentById(targetPermanentId);
    if (permanent?.topCard === undefined || requireCardDefinition(permanent.topCard.cardId).isToken) {
      return { placed, securitySources };
    }
    // Validate the complete physical batch before moving anything. A duplicate can
    // otherwise remove the first card again from the destination stack itself.
    if (
      new Set(instanceIds).size !== instanceIds.length ||
      instanceIds.some((id) => peekLooseInstance(state, id) === undefined)
    ) {
      return { placed, securitySources };
    }
    const origins = locateMoveOrigins({ state, instanceIds });
    for (const instanceId of instanceIds) {
      for (const owner of state.players) {
        if (owner.security.some((card) => card.instanceId === instanceId)) securitySources.add(owner.seat);
      }
      const linkedHostId = hostOfLinkedInstance(state, instanceId);
      const instance = removeLooseInstance(state, instanceId);
      if (instance === undefined) continue;
      if (linkedHostId !== undefined) {
        ledger.recomputeDP(state, linkedHostId);
      }
      instance.faceUp = opts?.faceUp ?? true;
      if (opts?.belowTop) pushOnStack(permanent, instance);
      else unshiftOnStack(permanent, instance);
      placed.push(instance);
    }
    if (placed.length > 0) {
      for (const { cards, ...origin } of groupCardsByOrigin({ origins, cards: placed })) {
        engine.emit({
          kind: "cardsMoved",
          instanceIds: cards.map((card) => card.instanceId),
          ...origin,
          to: Zone.BattleArea,
          placedUnder: { permanentId: targetPermanentId },
          ...(opts?.faceUp !== false
            ? {
                cardIds: cards.map((card) => card.cardId),
                artIds: cards.map((card) => card.artId || card.cardId),
                seat: cards[0]!.ownerSeat,
              }
            : {}),
          ...(opts?.faceUp === false && origin.from === Zone.Deck && origin.fromSeat !== undefined
            ? {
                deckToUnder: { seat: origin.fromSeat, permanentId: targetPermanentId, count: cards.length },
              }
            : {}),
        });
      }
      // Continuous properties derived from the new stack must be live before
      // placement reactions and the next action read them (BT8-084 colors).
      await engine.recomputeContinuousEffects?.();
    }
    return { placed, securitySources };
  };

  const placeUnder = async (
    targetPermanentId: string,
    instanceIds: string[],
    opts?: { belowTop?: boolean; faceUp?: boolean },
  ): Promise<CardInstance[]> => {
    const { placed, securitySources } = await moveLooseCardsUnder(targetPermanentId, instanceIds, opts);
    if (placed.length > 0) {
      // SubTrigger bus: "when [Tamer] cards are placed in this Digimon's digivolution cards"
      // watchers. No co-located EffectTiming analogue (a fresh fire point per RESEARCH A1).
      // The permanent that GAINED the cards is the event subject; a watcher's sourceFilter
      // ("under one of YOUR Digimon") gates on it.
      await engine.fireSubTrigger?.("onAddDigivolutionCards", {
        subjectPermanentId: targetPermanentId,
        addedDigivolutionCardInstanceIds: placed.map((card) => card.instanceId),
        addedDigivolutionCardsPosition: opts?.belowTop ? "top" : "bottom",
        ...(effectSeatStack.at(-1) !== undefined ? { byEffectSeat: effectSeatStack.at(-1) } : {}),
      });
      for (const seat of securitySources) {
        await engine.fireSubTrigger?.("whenEffectRemovesFromSecurity", { removedFromSecuritySeat: seat });
        await engine.fireSubTrigger?.("whenSecurityRemoved", {
          removedFromSecuritySeat: seat,
          securityRemovedByEffect: true,
        });
      }
    }
    return placed;
  };

  const placePlayMaterialsUnder = async (targetPermanentId: string, instanceIds: string[]): Promise<CardInstance[]> =>
    (await moveLooseCardsUnder(targetPermanentId, instanceIds)).placed;

  const placeUnderFromDeck = async (targetPermanentId: string, seat: Seat): Promise<CardInstance | undefined> => {
    const permanent = access.permanentById(targetPermanentId);
    if (permanent?.topCard === undefined || requireCardDefinition(permanent.topCard.cardId).isToken) {
      return undefined;
    }
    const card = takeTop(player(seat), Zone.Deck);
    if (card === undefined) return undefined;
    card.faceUp = false;
    unshiftOnStack(permanent, card);
    engine.emit({
      kind: "cardsMoved",
      instanceIds: [card.instanceId],
      from: Zone.Deck,
      to: Zone.BattleArea,
      deckToUnder: { seat, permanentId: targetPermanentId, count: 1 },
    });
    // The newly added card may change the host's inherited/static effect set. Refresh that
    // derived state before the placement watcher opens, matching the ordinary placeUnder path.
    await engine.recomputeContinuousEffects?.();
    await engine.fireSubTrigger?.("onAddDigivolutionCards", {
      subjectPermanentId: targetPermanentId,
      addedDigivolutionCardInstanceIds: [card.instanceId],
      addedDigivolutionCardsPosition: "bottom",
      ...(effectSeatStack.at(-1) !== undefined ? { byEffectSeat: effectSeatStack.at(-1) } : {}),
    });
    return card;
  };

  /**
   * ＜Material Save N＞'s reaction (Comprehensive Rules §16-21): when `permanentId` (a Digimon
   * with this keyword) is deleted, place up to N of its own specified DigiXros-requirement
   * digivolution cards under 1 of the controller's Tamers INSTEAD of trashing them
   * (§16-21-3: optional activation, but mandatory maximize once accepted). Must be called
   * BEFORE the permanent's cards actually move to trash — it relocates the chosen stack cards
   * out from under the still-live permanent, so the deletion movement never reaches them.
   * Shared between the effect-deletion path (below) and the combat battle-death path (via the
   * `materialSave` CombatPort/hook), since this is a plain "when deleted" reaction with no
   * cause restriction. Returns true when it fired.
   */
  const materialSave = async (permanentId: string): Promise<boolean> => {
    if (!continuous.hasKeyword(permanentId, "MaterialSave")) return false;
    const perm = access.permanentById(permanentId);
    if (perm === undefined || perm.topCard === undefined) return false;
    const n = materialSaveCountOf(perm.topCard.cardId);
    if (n === undefined || n === 0) return false;
    const eligible = perm.stack.filter((c) => digiXrosMatches(perm.topCard!.cardId, c.cardId));
    if (eligible.length === 0) return false;
    const tamers = access
      .battleAreaPermanents(perm.controllerSeat)
      .filter((p) => p.topCard !== undefined && requireCardDefinition(p.topCard.cardId).kinds.includes(CardKind.Tamer));
    if (tamers.length === 0) return false;
    const source = {
      sourceCardId: perm.topCard.cardId,
      sourceInstanceId: perm.topCard.instanceId,
      sourcePermanentId: permanentId,
      timing: "MaterialSave",
      effectText: `＜Material Save ${n}＞: When this Digimon would be deleted, you may place up to ${n} of its specified digivolution cards under one of your Tamers.`,
    };
    const accept = await engine.ask.selectInstances(
      perm.controllerSeat,
      [eligible[0]!.instanceId],
      0,
      1,
      `＜Material Save ${n}＞: place up to ${n} of this Digimon's specified digivolution cards under 1 of your Tamers?`,
      {
        ...source,
        selectionContext: "materialSaveActivation",
        visibleInstanceIds: eligible.map((card) => card.instanceId),
        selectionGoal: DecisionSelectionGoal.PROTECT.value,
      },
    );
    if (accept.length === 0) return false;
    let tamerId = tamers[0]!.permanentId;
    if (tamers.length > 1) {
      const chosenTamer = await engine.ask.selectInstances(
        perm.controllerSeat,
        tamers.map((t) => t.topCard!.instanceId),
        1,
        1,
        "＜Material Save＞: place the cards under which Tamer?",
        source,
      );
      const found = tamers.find((t) => t.topCard?.instanceId === chosenTamer[0]);
      if (found !== undefined) tamerId = found.permanentId;
    }
    // Once the optional processing is accepted, §16-21-3 requires the specified
    // number whenever possible, but §16-21-1 leaves the choice of eligible cards
    // to the controller. Ask for that choice explicitly instead of taking the
    // first cards in stack order; the response order is also the processing order
    // required by §16-21-4.
    const requiredCount = Math.min(n, eligible.length);
    const selectedIds = await engine.ask.selectInstances(
      perm.controllerSeat,
      eligible.map((card) => card.instanceId),
      requiredCount,
      requiredCount,
      `＜Material Save ${n}＞: choose ${requiredCount} specified digivolution card${requiredCount === 1 ? "" : "s"} to place under the Tamer, in order.`,
      source,
    );
    const eligibleIds = new Set(eligible.map((card) => card.instanceId));
    if (
      selectedIds.length !== requiredCount ||
      new Set(selectedIds).size !== requiredCount ||
      selectedIds.some((instanceId) => !eligibleIds.has(instanceId))
    ) {
      return false;
    }
    const toPlaceIds = selectedIds;
    await placeUnder(tamerId, toPlaceIds);
    return true;
  };

  /**
   * Move a whole battle-area permanent under another as digivolution cards.
   * The source permanent is removed from the field; its top, stack, and linked
   * cards are attached to the destination's digivolution stack.
   *
   * `shedOwnCards` opts into a placement rule where "as soon as a card from the battle area is
   * to be placed under a card", that card is removed from the battle area and any cards under it
   * are trashed. Only the source's TOP card becomes a material; its own digivolution stack is
   * trashed, and so is its link card (§4-8-6 — the resulting card is new). DigiXros uses this
   * rule under §7-2-2-7, and card-specific placements such as BT12-083 and BT12-102 require the
   * same source-stack shedding. Effects that merely place a permanent under another and whose
   * ruling keeps the stack (for example §4-16, KB Q4250/Q4251/Q4256/Q4257) leave the flag unset;
   * the caller opts in only when the applicable placement rule requires shedding.
   */

  return { placeUnder, placePlayMaterialsUnder, placeUnderFromDeck, materialSave };
}
