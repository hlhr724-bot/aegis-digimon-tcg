import { locateMoveOrigins } from "#api/engine/effects/verbs/locateMoveOrigins";
import { groupCardsByOrigin } from "#api/engine/effects/verbs/groupCardsByOrigin";
import { CardMovePosition } from "@aegis/shared/protocol/CardMovePosition";
import { Zone, EffectTiming, requireCardDefinition, CardInstance } from "@aegis/shared";
import {
  applyOverflow,
  extractPermanentAt,
  insertCard,
  linkCard,
  placePermanent as appendPermanent,
  replaceStack,
  setBreeding,
  unshiftOnStack,
} from "../../state/access.js";
import type { Primitives } from "../EffectContext.js";
import { peekLooseInstance, removeLooseInstance } from "../verbs/looseInstances.js";

import type { InternalVerbs, PrimitivesContext } from "./context.js";

/**
 * Mixed-material placement, breeding/battle movement, and ＜Link＞.
 */

export function createLinkingVerbs(pc: PrimitivesContext) {
  const { engine, access, continuous, dropPermanentLedgers, effectSeatStack, ledger, player, state, subTriggers } = pc;
  // Reached through the context because these are built in sibling modules: the
  // whole set exists before any of it runs, so forwarding at call time is safe.
  const isRestricted: PrimitivesContext["helpers"]["isRestricted"] = (...args) => pc.helpers.isRestricted(...args);
  const relocatePermanent: InternalVerbs["relocatePermanent"] = (...args) => pc.fx.relocatePermanent(...args);

  const placeMixedMaterialsUnder: NonNullable<Primitives["placeMixedMaterialsUnder"]> = async (hostId, orderedIds) => {
    const host = access.permanentById(hostId);
    if (host?.topCard === undefined || orderedIds.length === 0 || new Set(orderedIds).size !== orderedIds.length)
      return [];
    const materials = orderedIds.map((id) => {
      const source = [...state.players]
        .flatMap((owner) => [...owner.battleArea])
        .find((permanent) => permanent.topCard?.instanceId === id);
      if (source !== undefined) {
        if (source.permanentId === hostId || isRestricted(source.permanentId, "leaveBattleAreaExceptByDeletion"))
          return undefined;
        return { card: source.topCard!, source };
      }
      const card = peekLooseInstance(state, id);
      return card === undefined ? undefined : { card, source: undefined };
    });
    if (materials.some((material) => material === undefined)) return [];
    const movedPhysicalIds = materials.flatMap((material) =>
      material?.source === undefined
        ? material === undefined
          ? []
          : [material.card.instanceId]
        : [material.source.topCard!, ...material.source.stack, ...material.source.linked].map(
            (card) => card.instanceId,
          ),
    );
    // Whole-permanent materials already include their attached cards; a loose
    // material inside another selected source cannot be paid independently again.
    if (new Set(movedPhysicalIds).size !== movedPhysicalIds.length) return [];
    const origins = locateMoveOrigins({ state, instanceIds: movedPhysicalIds });
    const existingStack = [...host.stack];
    const existingIds = new Set([
      host.topCard.instanceId,
      ...host.stack.map((card) => card.instanceId),
      ...host.linked.map((card) => card.instanceId),
    ]);
    if (movedPhysicalIds.some((id) => existingIds.has(id))) return [];
    const orderedCards = materials.flatMap((material) =>
      material?.source === undefined
        ? material === undefined
          ? []
          : [material.card]
        : [...material.source.stack, ...material.source.linked, material.card],
    );
    // No awaits until every validated material moves; callbacks see the complete batch.
    for (const material of [...materials].reverse()) {
      if (material === undefined) return [];
      if (material.source !== undefined) {
        if (!relocatePermanent(hostId, material.source.permanentId, { belowTop: false, faceUp: true }, false))
          return [];
      } else {
        const moved = removeLooseInstance(state, material.card.instanceId);
        if (moved === undefined) return [];
        moved.faceUp = true;
        unshiftOnStack(host, moved);
      }
    }
    replaceStack(host, [...orderedCards, ...existingStack]);
    const addedIds = host.stack.filter((card) => !existingIds.has(card.instanceId)).map((card) => card.instanceId);
    for (const { cards, ...origin } of groupCardsByOrigin({ origins, cards: orderedCards })) {
      engine.emit({
        kind: "cardsMoved",
        instanceIds: cards.map((card) => card.instanceId),
        ...origin,
        to: Zone.BattleArea,
        placedUnder: { permanentId: hostId },
      });
    }
    await engine.recomputeContinuousEffects?.();
    await engine.fireSubTrigger?.("onAddDigivolutionCards", {
      subjectPermanentId: hostId,
      addedDigivolutionCardInstanceIds: addedIds,
      addedDigivolutionCardsPosition: "bottom",
      ...(effectSeatStack.at(-1) !== undefined ? { byEffectSeat: effectSeatStack.at(-1) } : {}),
    });
    return materials.flatMap((material) => (material === undefined ? [] : [material.card]));
  };

  /**
   * Move a whole permanent (top + digivolution stack + linked cards) across the
   * breeding/battle boundary as a card EFFECT — preserving identity, stack, linked
   * cards and suspended state. Digivolution cards are NOT trashed and ＜Overflow＞ is NOT
   * processed (Comprehensive Rules §4-16; KB P-143 Q4250/Q4251/Q4256/Q4257). NOT the
   * breeding-phase player verb (no Phase.Breeding gate, no once-per-turn limit).
   *   - "toBreeding": the battle-area permanent moves into the EMPTY breeding slot; it
   *     becomes inert for the continuous/targeting layer (recompute scans battleArea only).
   *   - "toBattle": the breeding permanent enters the battle area; the next continuous
   *     recompute re-derives its statics.
   */
  const movePermanentZone = async (permanentId: string, direction: "toBreeding" | "toBattle"): Promise<boolean> => {
    if (direction === "toBreeding") {
      for (const owner of state.players) {
        const idx = owner.battleArea.findIndex((perm) => perm.permanentId === permanentId);
        if (idx < 0) continue;
        if (owner.breeding !== undefined) return false; // destination occupied (defensive)
        const permanent = owner.battleArea[idx]!;
        const effectSeat = effectSeatStack.at(-1) ?? owner.seat;
        if (
          permanent.topCard !== undefined &&
          continuous.isPlayBlocked(effectSeat, requireCardDefinition(permanent.topCard.cardId), "move", true)
        )
          return false;
        if (isRestricted(permanentId, "leaveBattleAreaExceptByDeletion")) return false;
        const cause = "byEffect" as const;
        const prevented = await engine.consultLeavePrevention?.([permanentId], cause, effectSeat, { isBounce: true });
        if (prevented?.has(permanentId)) return false;
        const extracted = extractPermanentAt(owner, idx)!;
        // Comprehensive Rules §3-4-5-2: a Digimon in the breeding area can't be affected
        // by (and its battle-area effects don't run) effects unless they reference breeding.
        // It stays the same Digimon, so the modifier and continuous entries it was given are
        // kept and apply again if it returns within their duration (P-143 KB Q4252). Its
        // SubTrigger subscriptions are dropped: the fire seam already excludes breeding
        // sources (permanentById scans battleArea only), but the costReductionFor/
        // replacementsFor reads filter on id alone — without this drop a breeding source's
        // stale reduceCost would still discount while its watchers can't fire, the silent
        // inconsistency WR-02 flagged. SubTrigger re-install on return is a separate
        // pre-existing gap (subTriggers are not recomputed).
        subTriggers.dropPermanent(permanentId);
        extracted.inBreeding = true;
        setBreeding(owner, extracted);
        ledger.recomputeDP(state, extracted.permanentId);
        engine.emit({
          kind: "cardsMoved",
          instanceIds: extracted.topCard ? [extracted.topCard.instanceId] : [],
          from: Zone.BattleArea,
          to: Zone.Breeding,
        });
        return true;
      }
      return false;
    }
    for (const owner of state.players) {
      if (owner.breeding === undefined || owner.breeding.permanentId !== permanentId) continue;
      const permanent = owner.breeding;
      setBreeding(owner, undefined);
      permanent.inBreeding = false;
      appendPermanent(owner, permanent);
      ledger.recomputeDP(state, permanent.permanentId);
      engine.emit({
        kind: "cardsMoved",
        instanceIds: permanent.topCard ? [permanent.topCard.instanceId] : [],
        from: Zone.Breeding,
        to: Zone.BattleArea,
      });
      // A breeding -> battle move fires the OnMove timing (P-130's [Your Turn] reaction).
      await engine.fireTiming?.(EffectTiming.OnMove, { movedPermanentId: permanent.permanentId });
      // Effect-driven movement is the same physical event as the breeding-phase move verb:
      // notify both sides' reactive watchers after the move timing has resolved.
      await engine.fireSubTrigger?.("whenMovedFromBreeding", { subjectPermanentId: permanent.permanentId });
      await engine.fireSubTrigger?.("whenOpponentMovedFromBreeding", { subjectPermanentId: permanent.permanentId });
      return true;
    }
    return false;
  };

  /**
   * §10-1-1: "A card from the hand OR BATTLE AREA can be linked to a Digimon in the battle
   * area." When `instanceId` is a battle-area permanent's own top card (not a loose hand/stack/
   * linked card `removeLooseInstance` already covers), detach that whole permanent so its top
   * card can become the link card: the permanent ceases to exist and its slot frees immediately.
   *
   * INFERENCE, not a direct ruling — I searched the KB Q&A and found none settling what happens
   * to the detached permanent's OWN digivolution stack and link card. This follows the §7-2-2-7
   * DigiXros principle by analogy ("as soon as a card from the battle area is removed... any
   * cards under it are trashed") — the same shape `relocatePermanent`'s `shedOwnCards` already
   * applies for DigiXros placement — and trashes both: the stack per that analogy, and the link
   * card per §4-8-6 (a card that "becomes a new card" loses its link card; here the host carrying
   * it is removed from the field entirely, so nothing remains to hold it). Re-check against a
   * ruling if one surfaces. Deletion timings do NOT fire (this is a removal, not a delete: no
   * WhenPermanentWouldBeDeleted/OnDeletion window), but ＜Overflow＞ (§4-18-1/-3/-4) DOES apply to
   * every card that leaves here — the top card becomes a link card, which §4-8-4 says "isn't
   * considered to be a card on the field" (a genuine leave), and the shed stack/linked cards
   * leave for the trash (also a genuine leave, not "under a card").
   */
  const detachTopCardForLink = (instanceId: string): CardInstance | undefined => {
    for (const owner of state.players) {
      const idx = owner.battleArea.findIndex((p) => p.topCard?.instanceId === instanceId);
      if (idx < 0) continue;
      const sourcePermanentId = owner.battleArea[idx]?.permanentId;
      if (sourcePermanentId === undefined || isRestricted(sourcePermanentId, "leaveBattleAreaExceptByDeletion")) {
        return undefined;
      }
      const source = extractPermanentAt(owner, idx);
      if (source === undefined || source.topCard === undefined) return undefined;
      dropPermanentLedgers(source.permanentId);
      const shed = [...source.stack, ...source.linked];
      for (const card of shed) {
        insertCard(player(card.ownerSeat), Zone.Trash, card);
      }
      if (shed.length > 0) {
        engine.emit({
          kind: "cardsMoved",
          instanceIds: shed.map((c) => c.instanceId),
          from: Zone.BattleArea,
          to: Zone.Trash,
        });
      }
      applyOverflow(engine.memory, [source.topCard, ...shed], state.turnSeat);
      return source.topCard;
    }
    return undefined;
  };

  /** Link loose cards, or a battle-area permanent's own top card (§10-1-1), to a permanent (the Link mechanic). */
  const link = async (targetPermanentId: string, instanceIds: string[]): Promise<CardInstance[]> => {
    const permanent = access.permanentById(targetPermanentId);
    if (permanent === undefined) return [];
    const linked: CardInstance[] = [];
    const origins = locateMoveOrigins({ state, instanceIds });
    for (const instanceId of instanceIds) {
      // Never detach the link's OWN target: no real card links a permanent onto itself, and
      // doing so would rip the recipient's own top card out from under the very `permanent`
      // reference this loop is about to push onto.
      const instance =
        instanceId === permanent.topCard?.instanceId
          ? removeLooseInstance(state, instanceId)
          : (detachTopCardForLink(instanceId) ?? removeLooseInstance(state, instanceId));
      if (instance === undefined) continue;
      instance.faceUp = true;
      // CR 10-1-2-1: a new link card is plugged in at the BOTTOM of the existing ones,
      // mirroring the digivolution stack's own bottom-insert convention.
      linkCard(permanent, instance);
      linked.push(instance);
    }
    if (linked.length > 0) {
      // CR 4-9-5: these cards are the newly linked ones, so the over-limit rule check must
      // trash EXISTING link cards instead of them (see PrimitivesEngine.noteLinked).
      engine.noteLinked?.(linked.map((c) => c.instanceId));
      // CR 4-2-4: a linked card contributes its printed linkDp, so the DP tier must be
      // re-derived here the way digivolve does after it stacks a card.
      ledger.recomputeDP(state, permanent.permanentId);
      for (const { cards, ...origin } of groupCardsByOrigin({ origins, cards: linked })) {
        engine.emit({
          kind: "cardsMoved",
          instanceIds: cards.map((card) => card.instanceId),
          cardIds: cards.map((card) => card.cardId),
          seat: permanent.controllerSeat,
          ...origin,
          to: CardMovePosition.LINKED_CARDS.value,
        });
      }
      // Recompute after mutation so the newly linked cards can install their own
      // [When Linking] subscriptions. Publishing host and linked-card identities through ONE
      // SubTrigger dispatch makes those effects simultaneous with "this Digimon gets linked"
      // watchers and therefore eligible for the controller's normal orderTriggers choice.
      await engine.recomputeContinuousEffects?.();
      if (engine.fireLinkEvent !== undefined) {
        await engine.fireLinkEvent(
          linked.map((card) => card.instanceId),
          targetPermanentId,
        );
      } else {
        await engine.fireSubTrigger?.("whenLinked", {
          subjectPermanentId: targetPermanentId,
          linkedCardInstanceIds: linked.map((card) => card.instanceId),
        });
      }
    }
    return linked;
  };

  return { placeMixedMaterialsUnder, movePermanentZone, link };
}
