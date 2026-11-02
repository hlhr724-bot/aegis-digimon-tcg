import { Permanent, Zone, CardInstance } from "@aegis/shared";
import { requireCardDefinition } from "@aegis/shared/cards/registry";
import {
  extractPermanentAt,
  insertCard,
  pushOnStack,
  setBreeding,
  takeTop,
  unshiftOnStack,
} from "../../state/access.js";
import type { Primitives } from "../EffectContext.js";

import type { PrimitivesContext } from "./context.js";

/**
 * Moving a whole permanent onto another one.
 */

export function createRelocateVerbs(pc: PrimitivesContext) {
  const { engine, access, dropPermanentLedgers, effectSeatStack, player, state } = pc;
  // Reached through the context because these are built in sibling modules: the
  // whole set exists before any of it runs, so forwarding at call time is safe.
  const isRestricted: PrimitivesContext["helpers"]["isRestricted"] = (...args) => pc.helpers.isRestricted(...args);
  const fireWhenPermanentsLeave: PrimitivesContext["helpers"]["fireWhenReturnedPermanentsLeave"] = (...args) =>
    pc.helpers.fireWhenReturnedPermanentsLeave(...args);

  const relocatePermanent = (
    destPermanentId: string,
    sourcePermanentId: string,
    opts?: { belowTop?: boolean; shedOwnCards?: boolean; faceUp?: boolean },
    emitMovementEvents = true,
  ): boolean => {
    if (destPermanentId === sourcePermanentId) return false;
    if (isRestricted(sourcePermanentId, "leaveBattleAreaExceptByDeletion")) return false;
    // The host may sit in the battle area OR the breeding area: BT13-007's [Breeding] effect
    // gathers battle-area [Royal Knight] Digimon UNDER the breeding-area King Drasil itself.
    // access.permanentById scans only the battle area, so fall back to the breeding slot.
    const dest =
      access.permanentById(destPermanentId) ??
      state.players.find((p) => p.breeding?.permanentId === destPermanentId)?.breeding;
    if (dest === undefined || dest.topCard === undefined || requireCardDefinition(dest.topCard.cardId).isToken) {
      return false;
    }

    let source: Permanent | undefined;
    for (const owner of state.players) {
      const idx = owner.battleArea.findIndex((p) => p.permanentId === sourcePermanentId);
      if (idx >= 0) {
        source = extractPermanentAt(owner, idx);
        break;
      }
      if (owner.breeding?.permanentId === sourcePermanentId) {
        source = owner.breeding;
        setBreeding(owner, undefined);
        break;
      }
    }
    if (source === undefined || source.topCard === undefined) return false;

    // A true leave: the source `permanentId` is spliced out and ceases to exist (its
    // cards re-attach under `dest`), so every subscription anchored to it is dead.
    dropPermanentLedgers(sourcePermanentId);

    const shed = opts?.shedOwnCards ?? false;
    const toShed: CardInstance[] = shed ? [...source.stack, ...source.linked] : [];
    for (const card of toShed) {
      insertCard(player(card.ownerSeat), Zone.Trash, card);
    }
    if (toShed.length > 0 && emitMovementEvents) {
      engine.emit({
        kind: "cardsMoved",
        instanceIds: toShed.map((c) => c.instanceId),
        from: Zone.BattleArea,
        to: Zone.Trash,
      });
    }

    const belowTop = opts?.belowTop ?? true;
    const toAttach: CardInstance[] = shed ? [source.topCard] : [source.topCard, ...source.stack, ...source.linked];
    for (const card of toAttach) {
      // Battle-area cards are public and stay face-up as digivolution cards (KB Q4250/Q4251);
      // forcing them face-down here withheld their cardId from the opponent's StateView for
      // the rest of the match, which rendered as card backs in the stack viewer.
      card.faceUp = opts?.faceUp ?? card.faceUp;
      if (belowTop) pushOnStack(dest, card);
      else unshiftOnStack(dest, card);
    }

    if (emitMovementEvents) {
      engine.emit({
        kind: "cardsMoved",
        instanceIds: toAttach.map((c) => c.instanceId),
        from: Zone.BattleArea,
        to: Zone.BattleArea,
      });
    }
    return true;
  };

  const relocatePermanentByEffect: NonNullable<Primitives["relocatePermanentByEffect"]> = async (
    destPermanentId,
    sourcePermanentId,
    opts,
  ) => {
    const sourceInBattle = access.permanentById(sourcePermanentId);
    const source =
      sourceInBattle ?? state.players.find((owner) => owner.breeding?.permanentId === sourcePermanentId)?.breeding;
    const destination =
      access.permanentById(destPermanentId) ??
      state.players.find((owner) => owner.breeding?.permanentId === destPermanentId)?.breeding;
    const selectedTopInstanceId = source?.topCard?.instanceId;
    const selectedDestinationTopInstanceId = destination?.topCard?.instanceId;
    if (
      source === undefined ||
      source.topCard === undefined ||
      destination?.topCard === undefined ||
      requireCardDefinition(destination.topCard.cardId).isToken ||
      sourcePermanentId === destPermanentId ||
      isRestricted(sourcePermanentId, "leaveBattleAreaExceptByDeletion")
    )
      return false;
    if (sourceInBattle !== undefined) {
      const resolvingSeat = effectSeatStack.at(-1) ?? source.controllerSeat;
      const cause = "byEffect" as const;
      const prevented = await engine.consultLeavePrevention?.([sourcePermanentId], cause, resolvingSeat, {
        isBounce: true,
      });
      if (prevented?.has(sourcePermanentId)) {
        const destinationAfterPrevention =
          access.permanentById(destPermanentId) ??
          state.players.find((owner) => owner.breeding?.permanentId === destPermanentId)?.breeding;
        if (destinationAfterPrevention?.stack.some((card) => card.instanceId === selectedTopInstanceId)) return true;
        return false;
      }
      // Placing a battle-area Digimon under a card leaves the battle area (Q5977/Q6117).
      if (selectedTopInstanceId !== undefined) await fireWhenPermanentsLeave([selectedTopInstanceId]);
    }

    const sourceAfterConsult =
      access.permanentById(sourcePermanentId) ??
      state.players.find((owner) => owner.breeding?.permanentId === sourcePermanentId)?.breeding;
    const destinationAfterConsult =
      access.permanentById(destPermanentId) ??
      state.players.find((owner) => owner.breeding?.permanentId === destPermanentId)?.breeding;
    // A leave-prevention replacement may pay this relocation recursively while the outer
    // effect is consulting replacements. In that case the source permanent is intentionally
    // gone, but its selected physical top card is already under the destination. Preserve the
    // successful payment result instead of allowing the outer consultation to undo protection.
    if (
      sourceAfterConsult === undefined &&
      destinationAfterConsult?.stack.some((card) => card.instanceId === selectedTopInstanceId)
    )
      return true;
    if (
      sourceAfterConsult?.topCard === undefined ||
      sourceAfterConsult?.topCard?.instanceId !== selectedTopInstanceId ||
      destinationAfterConsult?.topCard?.instanceId !== selectedDestinationTopInstanceId ||
      isRestricted(sourcePermanentId, "leaveBattleAreaExceptByDeletion")
    )
      return false;
    const movedCardIds = (
      opts?.shedOwnCards
        ? [sourceAfterConsult.topCard]
        : [sourceAfterConsult.topCard, ...sourceAfterConsult.stack, ...sourceAfterConsult.linked]
    )
      .filter((card): card is CardInstance => card !== undefined)
      .map((card) => card.instanceId);

    const moved = relocatePermanent(destPermanentId, sourcePermanentId, opts);
    if (moved) {
      await engine.recomputeContinuousEffects?.();
      // A whole permanent placed under another by an effect/cost is still one or more
      // digivolution cards being added. Share the same awaited event seam as `placeUnder`
      // so ST13-05/ST13-14 and every analogous watcher resolve before the parent continues.
      await engine.fireSubTrigger?.("onAddDigivolutionCards", {
        subjectPermanentId: destPermanentId,
        addedDigivolutionCardInstanceIds: movedCardIds,
        addedDigivolutionCardsPosition: opts?.belowTop === false ? "bottom" : "top",
        ...(effectSeatStack.at(-1) !== undefined ? { byEffectSeat: effectSeatStack.at(-1) } : {}),
      });
    }
    return moved;
  };

  const placeEggAndPermanentsUnder: NonNullable<Primitives["placeEggAndPermanentsUnder"]> = async (
    destPermanentId,
    orderedCards,
  ) => {
    const destination =
      access.permanentById(destPermanentId) ??
      state.players.find((owner) => owner.breeding?.permanentId === destPermanentId)?.breeding;
    if (destination?.topCard === undefined || requireCardDefinition(destination.topCard.cardId).isToken) {
      return;
    }
    const destinationTopId = destination.topCard.instanceId;
    const sourceIds = orderedCards
      .flatMap((card) => (card.permanentId === undefined ? [] : [card.permanentId]))
      .filter(
        (id) =>
          id !== destPermanentId &&
          access.permanentById(id) !== undefined &&
          !isRestricted(id, "leaveBattleAreaExceptByDeletion"),
      );
    // The stack order is a placement choice, not an order of leave events. Consult
    // every impending leave while all sources (including Leopardmon) are still live.
    const prevented = await engine.consultLeavePrevention?.(
      sourceIds,
      "byEffect",
      effectSeatStack.at(-1) ?? destination.controllerSeat,
      { isBounce: true },
    );
    const destinationAfterConsult =
      access.permanentById(destPermanentId) ??
      state.players.find((owner) => owner.breeding?.permanentId === destPermanentId)?.breeding;
    if (destinationAfterConsult?.topCard?.instanceId !== destinationTopId) return;
    const eligible = orderedCards.filter(
      (card) =>
        card.permanentId !== undefined &&
        sourceIds.includes(card.permanentId) &&
        !prevented?.has(card.permanentId) &&
        access.permanentById(card.permanentId)?.topCard?.instanceId === card.instanceId &&
        !isRestricted(card.permanentId, "leaveBattleAreaExceptByDeletion"),
    );
    await fireWhenPermanentsLeave(eligible.map((card) => card.instanceId));
    const liveDestination =
      access.permanentById(destPermanentId) ??
      state.players.find((owner) => owner.breeding?.permanentId === destPermanentId)?.breeding;
    if (liveDestination?.topCard?.instanceId !== destinationTopId) return;
    const addedIds: string[] = [];
    for (const card of [...orderedCards].reverse()) {
      if (card.permanentId !== undefined) {
        if (!eligible.includes(card) || access.permanentById(card.permanentId)?.topCard?.instanceId !== card.instanceId)
          continue;
        if (relocatePermanent(destPermanentId, card.permanentId, { belowTop: false, shedOwnCards: true }))
          addedIds.push(card.instanceId);
      } else {
        const owner = player(liveDestination.controllerSeat);
        if (owner.eggDeck[0]?.instanceId !== card.instanceId) continue;
        const egg = takeTop(owner, Zone.EggDeck)!;
        egg.faceUp = true;
        unshiftOnStack(liveDestination, egg);
        addedIds.push(egg.instanceId);
        engine.emit({ kind: "cardsMoved", instanceIds: [egg.instanceId], from: Zone.EggDeck, to: Zone.BattleArea });
      }
    }
    if (addedIds.length === 0) return;
    await engine.recomputeContinuousEffects?.();
    await engine.fireSubTrigger?.("onAddDigivolutionCards", {
      subjectPermanentId: destPermanentId,
      addedDigivolutionCardInstanceIds: addedIds,
      addedDigivolutionCardsPosition: "bottom",
      byEffectSeat: effectSeatStack.at(-1) ?? destination.controllerSeat,
    });
  };

  const relocatePermanentsByEffect: NonNullable<Primitives["relocatePermanentsByEffect"]> = async (
    destPermanentId,
    sourcePermanentIds,
    opts,
  ) => {
    if (
      sourcePermanentIds.length === 0 ||
      new Set(sourcePermanentIds).size !== sourcePermanentIds.length ||
      sourcePermanentIds.includes(destPermanentId)
    )
      return [];

    const destination =
      access.permanentById(destPermanentId) ??
      state.players.find((owner) => owner.breeding?.permanentId === destPermanentId)?.breeding;
    if (destination?.topCard === undefined || requireCardDefinition(destination.topCard.cardId).isToken) {
      return [];
    }

    // Preflight the whole batch before calling the mutating primitive. This is the atomicity
    // seam for costs such as BT18-096: when source B is stale/protected/missing, source A is
    // not moved first and no stack, trash, or source ledger can be left half-paid.
    const sources = sourcePermanentIds.map((sourcePermanentId) => {
      const permanent =
        access.permanentById(sourcePermanentId) ??
        state.players.find((owner) => owner.breeding?.permanentId === sourcePermanentId)?.breeding;
      return permanent?.topCard === undefined ? undefined : permanent;
    });
    if (
      sources.some((source) => source === undefined) ||
      sourcePermanentIds.some((sourcePermanentId) => isRestricted(sourcePermanentId, "leaveBattleAreaExceptByDeletion"))
    ) {
      return [];
    }
    const sourceTopInstanceIds = sources.map((source) => source!.topCard!.instanceId);

    // The singular effect path consults leave replacements before the source is
    // removed. Do the same once for the complete batch: awaiting one source at
    // a time would permit a partial payment when a later source is protected.
    // Placement under another permanent is a leave, but not a deletion, so the
    // deletion-only replacement family must be excluded (`isBounce:true`).
    const battleSourceIds = sourcePermanentIds.filter((sourcePermanentId) =>
      state.players.some((owner) => owner.battleArea.some((permanent) => permanent.permanentId === sourcePermanentId)),
    );
    if (battleSourceIds.length > 0) {
      const resolvingSeat = effectSeatStack.at(-1) ?? sources.find((source) => source !== undefined)!.controllerSeat;
      const prevented = await engine.consultLeavePrevention?.(battleSourceIds, "byEffect", resolvingSeat, {
        isBounce: true,
      });
      if (prevented !== undefined && battleSourceIds.some((sourcePermanentId) => prevented.has(sourcePermanentId))) {
        return [];
      }
      await fireWhenPermanentsLeave(
        sources
          .filter((source) => battleSourceIds.includes(source!.permanentId))
          .map((source) => source!.topCard!.instanceId),
      );
    }

    // Replacement bodies may resolve effects of their own. Revalidate every
    // selected source and the destination after the await, including the top
    // instance identities that the payment selected.
    const destinationAfterConsult =
      access.permanentById(destPermanentId) ??
      state.players.find((owner) => owner.breeding?.permanentId === destPermanentId)?.breeding;
    if (destinationAfterConsult?.topCard === undefined) return [];
    const sourcesAfterConsult = sourcePermanentIds.map((sourcePermanentId, index) => {
      const permanent =
        access.permanentById(sourcePermanentId) ??
        state.players.find((owner) => owner.breeding?.permanentId === sourcePermanentId)?.breeding;
      return permanent?.topCard?.instanceId === sourceTopInstanceIds[index] ? permanent : undefined;
    });
    if (
      sourcesAfterConsult.some((source) => source === undefined) ||
      sourcePermanentIds.some((sourcePermanentId) => isRestricted(sourcePermanentId, "leaveBattleAreaExceptByDeletion"))
    ) {
      return [];
    }

    const movedCardIdsBySource = sourcesAfterConsult.map((source) =>
      (opts?.shedOwnCards ? [source!.topCard] : [source!.topCard, ...source!.stack, ...source!.linked])
        .filter((card): card is CardInstance => card !== undefined)
        .map((card) => card.instanceId),
    );

    // `relocatePermanent` is synchronous and the checks above cover every failure it can
    // report. Complete preflight means no async callback can interleave between source moves;
    // retain the all-or-nothing result check as a defensive guard at this seam.
    const moved: string[] = [];
    for (const sourcePermanentId of sourcePermanentIds) {
      if (!relocatePermanent(destPermanentId, sourcePermanentId, opts)) return [];
      moved.push(sourcePermanentId);
    }
    await engine.recomputeContinuousEffects?.();
    for (const movedCardIds of movedCardIdsBySource) {
      await engine.fireSubTrigger?.("onAddDigivolutionCards", {
        subjectPermanentId: destPermanentId,
        addedDigivolutionCardInstanceIds: movedCardIds,
        addedDigivolutionCardsPosition: opts?.belowTop === false ? "bottom" : "top",
        ...(effectSeatStack.at(-1) !== undefined ? { byEffectSeat: effectSeatStack.at(-1) } : {}),
      });
    }
    return moved;
  };

  return { relocatePermanent, relocatePermanentByEffect, relocatePermanentsByEffect, placeEggAndPermanentsUnder };
}
