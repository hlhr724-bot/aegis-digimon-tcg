import { CardKind, Zone, requireCardDefinition, CardInstance, type Seat } from "@aegis/shared";
import { applyOverflow, insertCard, popFromStack, setTopCard, unshiftOnStack } from "../../state/access.js";
import type { Primitives } from "../EffectContext.js";
import { removeLooseInstance } from "../verbs/looseInstances.js";

import type { PrimitivesContext } from "./context.js";

/**
 * The top cards of a digivolution stack: peeling, de-digivolving, trashing,
 * purging armor and ascending to security.
 */

export function createStackTopsVerbs(pc: PrimitivesContext) {
  const { engine, access, continuous, effectSeatStack, ledger, player, promotedTopNeedsInvalidRuleTrash, state } = pc;
  // Reached through the context because these are built in sibling modules: the
  // whole set exists before any of it runs, so forwarding at call time is safe.
  const isRestricted: PrimitivesContext["helpers"]["isRestricted"] = (...args) => pc.helpers.isRestricted(...args);

  const peelStackTops = async (
    permanentId: string,
    n: number,
    opts?: { byEffectSeat?: Seat; byEffectCardId?: string; stopAtLevel?: number; stackedCards?: boolean },
  ): Promise<CardInstance[]> => {
    const permanent = access.permanentById(permanentId);
    if (permanent === undefined) return [];
    // EX10-029 whenLinked grant (rule implementation): a Digimon with this restriction
    // is immune to De-Digivolve effects for the duration of the grant.
    if (!opts?.stackedCards && isRestricted(permanentId, "cantBeDeDigivolved")) return [];
    // EX11-070 stacked-trash-lock (KB Q5943 explicitly names <De-Digivolve>): an OPPONENT effect
    // may not strip the host's stacked cards. <De-Digivolve> demotes the top by removing a source,
    // so a locked host is immune to an opponent's <De-Digivolve> (the controller's own still works).
    if (opts?.byEffectSeat !== undefined && continuous.stackTrashLocked(permanentId)) {
      if (opts.byEffectSeat !== permanent.controllerSeat) return [];
    }
    const controllerSeat = permanent.controllerSeat;
    const moved: CardInstance[] = [];
    const sequenceId = engine.recomputeContinuousDerivedEffects
      ? `${permanentId}/strip/${++pc.sequences.stripSequence}`
      : undefined;
    const levelFloor = opts?.stopAtLevel ?? 3;
    for (let i = 0; i < n; i++) {
      if (permanent.stack.length === 0) break; // no source to revert to
      const currentTopDefinition =
        permanent.topCard !== undefined ? requireCardDefinition(permanent.topCard.cardId) : undefined;
      // CR 16-12-6: one declared De-Digivolve N continues even when an intermediate
      // top changes category. Only a NEW instance must start on a Digimon; separate
      // De-Digivolve 1 repetitions recheck the target between calls (16-12-7/8).
      if (
        i === 0 &&
        !opts?.stackedCards &&
        currentTopDefinition !== undefined &&
        !currentTopDefinition.kinds.includes(CardKind.Digimon) &&
        !currentTopDefinition.kinds.includes(CardKind.DigiEgg)
      )
        break;
      // De-Digivolve may promote a level-N card, then must stop once that card is
      // the current top. Checking the prospective new top stopped one step too
      // early (a level-4 top never reached level 3). An unusually ordered stack
      // may legally expose a Digi-Egg before a buried level-3 card is reached.
      const currentTopLevel = currentTopDefinition?.level;
      if (!opts?.stackedCards && currentTopLevel !== undefined && currentTopLevel <= levelFloor) break;
      const oldTop = permanent.topCard;
      const newTop = popFromStack(permanent);
      if (newTop === undefined) break;
      setTopCard(permanent, newTop);
      if (oldTop !== undefined) {
        continuous.reanchorCustomEffectGrants(oldTop.instanceId, newTop.instanceId);
        oldTop.faceUp = true;
        insertCard(player(oldTop.ownerSeat), Zone.Trash, oldTop);
        moved.push(oldTop);
      }
      const def = requireCardDefinition(newTop.cardId);
      const dp = def.kinds.includes(CardKind.Digimon) || def.kinds.includes(CardKind.DigiEgg) ? def.dp : 0;
      permanent.baseDP = dp;
      // De-Digivolve can expose a no-DP Digi-Egg in an unusually ordered stack.
      // CR 17-1-3-2-1 trashes that remnant by rule; it is not a zero-DP deletion.
      permanent.invalidNoDpStackTop = promotedTopNeedsInvalidRuleTrash(def);
      ledger.recomputeDP(state, permanent.permanentId);
      if (oldTop !== undefined) {
        // Publish the real physical move before yielding. An intermediate patch must
        // not expose the promoted artwork before the client can hold the departing top.
        engine.emit({
          kind: "cardsMoved",
          instanceIds: [oldTop.instanceId],
          cardIds: [oldTop.cardId],
          artIds: [oldTop.artId || oldTop.cardId],
          seat: controllerSeat,
          from: Zone.BattleArea,
          to: Zone.Trash,
          strippedStackTops: {
            permanentId,
            reason: opts?.stackedCards ? "trashTop" : "deDigivolve",
            ...(sequenceId !== undefined ? { sequenceId } : {}),
            ...(opts?.byEffectCardId !== undefined ? { sourceCardId: opts.byEffectCardId } : {}),
          },
        });
        if (sequenceId !== undefined) {
          await engine.recomputeContinuousDerivedEffects!();
          engine.emit({
            kind: "stackTopResolved",
            sequenceId,
            permanentId,
            strippedInstanceId: oldTop.instanceId,
            topInstanceId: newTop.instanceId,
            baseDP: permanent.baseDP,
            currentDP: permanent.currentDP,
          });
        }
      }
    }
    // <Overflow> (CR §4-18): each demoted `oldTop` just left the field for the trash —
    // a genuine leave (it was the top card, not moving to under-a-card; it's being REPLACED
    // by the promoted stack card, not stacked itself).
    applyOverflow(engine.memory, moved, state.turnSeat);
    if (moved.length > 0) await engine.recomputeContinuousEffects?.();
    for (const card of moved) {
      if (!requireCardDefinition(card.cardId).kinds.includes(CardKind.Digimon)) continue;
      await engine.fireSubTrigger?.("whenDigimonTopTrashed", {
        subjectPermanentId: permanentId,
        trashedDigimonTop: { permanentId, controllerSeat, cardId: card.cardId },
        ...(opts?.byEffectSeat !== undefined ? { byEffectSeat: opts.byEffectSeat } : {}),
      });
    }
    return moved;
  };

  const deDigivolve: Primitives["deDigivolve"] = (permanentId, n, opts) => peelStackTops(permanentId, n, opts);
  const trashStackTops: Primitives["trashStackTops"] = (permanentId, n, opts) =>
    peelStackTops(permanentId, n, { ...opts, stackedCards: true });

  /**
   * ＜Armor Purge＞'s cost (Comprehensive Rules §16-19-1): trash this permanent's own CURRENT
   * top card, promoting the digivolution card directly beneath it to the new top — the
   * permanent stays in play, "purged" of its armor layer, instead of being deleted outright.
   * Requires >= 1 digivolution card to promote (with none, there is nothing to reveal and the
   * cost is unpayable — the caller must check `permanent.stack.length` before offering it).
   * Like `deDigivolve`, the old top goes to trash, but this is paid as a deletion-prevention
   * cost rather than applied as an effect to revert the Digimon.
   */
  const armorPurge = async (permanentId: string): Promise<CardInstance | undefined> => {
    const permanent = access.permanentById(permanentId);
    if (permanent === undefined || permanent.topCard === undefined) return undefined;
    const newTop = popFromStack(permanent);
    if (newTop === undefined) return undefined;
    const oldTop = permanent.topCard;
    const controllerSeat = permanent.controllerSeat;
    setTopCard(permanent, newTop);
    continuous.reanchorCustomEffectGrants(oldTop.instanceId, newTop.instanceId);
    newTop.faceUp = true;
    oldTop.faceUp = true;
    insertCard(player(oldTop.ownerSeat), Zone.Trash, oldTop);
    const def = requireCardDefinition(newTop.cardId);
    permanent.baseDP = def.kinds.includes(CardKind.Digimon) || def.kinds.includes(CardKind.DigiEgg) ? def.dp : 0;
    permanent.invalidNoDpStackTop = promotedTopNeedsInvalidRuleTrash(def);
    ledger.recomputeDP(state, permanentId);
    // Publish the physical move before yielding: a continuous-effect recalculation can
    // send another batch whose patch already exposes the promoted top.
    engine.emit({
      kind: "cardsMoved",
      instanceIds: [oldTop.instanceId],
      cardIds: [oldTop.cardId],
      artIds: [oldTop.artId || oldTop.cardId],
      seat: controllerSeat,
      from: Zone.BattleArea,
      to: Zone.Trash,
      strippedStackTops: { permanentId, reason: "armorPurge" },
    });
    // The promoted card is now the permanent's active top card. Re-derive its static
    // keywords/effects before the deletion-prevention window continues (BT8 Armor Purge
    // chains must expose the promoted card's own Armor Purge immediately).
    await engine.recomputeContinuousEffects?.();
    // <Overflow> (CR §4-18): the old top card just left the battle area for trash — a genuine
    // leave, distinct from the permanent as a whole (which is NOT being deleted).
    applyOverflow(engine.memory, [oldTop], state.turnSeat);
    if (requireCardDefinition(oldTop.cardId).kinds.includes(CardKind.Digimon)) {
      await engine.fireSubTrigger?.("whenDigimonTopTrashed", {
        subjectPermanentId: permanentId,
        trashedDigimonTop: { permanentId, controllerSeat, cardId: oldTop.cardId },
      });
    }
    return oldTop;
  };

  /**
   * ＜Ascension＞'s reaction (Comprehensive Rules §16-43-1): after the holder's card has
   * already been trashed by its deletion, the controller may place that SAME card instance at
   * the TOP of their security stack instead of leaving it in trash. Called post-movement (the
   * card must already be loose in trash) — mirrors ＜Fortitude＞'s replay-from-trash pattern.
   */
  const ascendToSecurity = async (instanceId: string): Promise<boolean> => {
    const removed = removeLooseInstance(state, instanceId);
    if (removed === undefined) return false;
    removed.faceUp = false;
    insertCard(player(removed.ownerSeat), Zone.Security, removed, "top");
    engine.emit({
      kind: "cardsMoved",
      instanceIds: [removed.instanceId],
      from: Zone.Trash,
      to: Zone.Security,
      seat: removed.ownerSeat,
    });
    if (engine.fireSubTrigger) {
      await engine.fireSubTrigger("whenAddSecurity", {
        addedToSecuritySeat: removed.ownerSeat,
        addedToSecurityInstanceIds: [removed.instanceId],
      });
    }
    return true;
  };

  /**
   * "Place this Digimon's top card as its bottom digivolution card" (BT22-043/044 inherited
   * BOTTOM of its own digivolution stack and the topmost digivolution card is promoted to the
   * new top (the Digimon stays in play, one stage rotated). Requires >= 1 digivolution card to
   * promote; returns false (cost unpayable) otherwise.
   */
  const placeOwnTopAtStackBottom = async (permanentId: string): Promise<boolean> => {
    const permanent = access.permanentById(permanentId);
    if (permanent === undefined || permanent.topCard === undefined) return false;
    if (permanent.stack.length === 0) return false;
    const oldTop = permanent.topCard;
    const newTop = popFromStack(permanent);
    if (newTop === undefined) return false;
    setTopCard(permanent, newTop);
    continuous.reanchorCustomEffectGrants(oldTop.instanceId, newTop.instanceId);
    unshiftOnStack(permanent, oldTop); // bottom of the digivolution cards
    const def = requireCardDefinition(newTop.cardId);
    permanent.baseDP = def.kinds.includes(CardKind.Digimon) || def.kinds.includes(CardKind.DigiEgg) ? def.dp : 0;
    // KB Q5774: rotating a Digimon that digivolved from a Tamer leaves that Tamer in play on top.
    permanent.invalidNoDpStackTop = promotedTopNeedsInvalidRuleTrash(def);
    ledger.recomputeDP(state, permanent.permanentId);
    engine.emit({
      kind: "cardsMoved",
      instanceIds: [oldTop.instanceId],
      from: Zone.BattleArea,
      to: Zone.BattleArea,
    });
    // The promoted card's continuous watcher must exist before the placement event opens.
    // BT22-054 Q4907 explicitly permits the newly revealed Hagurumon to observe this same
    // rotation, while the old top is the CS card just added to its digivolution cards.
    await engine.recomputeContinuousEffects?.();
    await engine.fireSubTrigger?.("onAddDigivolutionCards", {
      subjectPermanentId: permanentId,
      addedDigivolutionCardInstanceIds: [oldTop.instanceId],
      addedDigivolutionCardsPosition: "bottom",
      placedOwnTopAtStackBottom: true,
      ...(effectSeatStack.at(-1) !== undefined ? { byEffectSeat: effectSeatStack.at(-1) } : {}),
    });
    return true;
  };

  /**
   * Place loose cards under `targetPermanentId` as digivolution cards. By default the
   * cards go to the BOTTOM of the stack ("place as the bottom digivolution card");
   * `belowTop` inserts them directly beneath the current top instead.
   */

  return { deDigivolve, trashStackTops, armorPurge, ascendToSecurity, placeOwnTopAtStackBottom };
}
