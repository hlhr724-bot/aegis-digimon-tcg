import {
  CardKind,
  Permanent,
  Zone,
  requireCardDefinition,
  CardInstance,
  type CardDefinition,
  type Seat,
  type ZoneRef,
} from "@aegis/shared";
import { applyOverflow, insertCard, popFromStack, setTopCard } from "../../state/access.js";
import type { Restriction } from "../EffectContext.js";
import { normalizeCost } from "../verbs/cardPlacement.js";
import { hostOfStackInstance } from "../verbs/looseInstances.js";

import { inheritedDigimonHost } from "../kernel.js";
import { effectiveKinds } from "../continuous/effective.js";
import type { PrimitivesContext } from "./context.js";

/**
 * Logic more than one verb module needs, and that is not itself a verb: the
 * restriction reads, the return filters, and the snapshots a deletion leaves behind.
 */

export function createSharedHelpers(pc: PrimitivesContext) {
  const {
    engine,
    access,
    continuous,
    currentHandAddProvenance,
    dropPermanentLedgers,
    effectSeatStack,
    effectSourceKindsStack,
    ledger,
    player,
    promotedTopNeedsInvalidRuleTrash,
    state,
    subTriggers,
  } = pc;

  const effectDrivenPlayCost = async (
    instanceId: string,
    definition: CardDefinition,
    controllerSeat: Seat,
    explicitReduction = 0,
    useAsOption = false,
    explicitOverride?: number,
    originZone?: ZoneRef,
    projectOnly = false,
    simultaneousPlayCount = 1,
    reservedInstanceIds: readonly string[] = [],
  ): Promise<number> => {
    const printed = normalizeCost(definition.playCost);
    const reductionsBlocked = !useAsOption && continuous.blocksCostReduction(controllerSeat, "play");
    const overrideBlocked = reductionsBlocked && (explicitOverride ?? printed) < printed;
    const baseCost = overrideBlocked ? printed : (explicitOverride ?? printed);
    const adjusted = ledger.playCostFor({ def: definition, controllerSeat }, Math.max(0, baseCost));
    const allowedReduction = reductionsBlocked ? 0 : Math.max(0, explicitReduction);
    const reduced = Math.max(0, adjusted - allowedReduction);
    return (
      engine.finalizeEffectPlayCost?.(
        instanceId,
        reduced,
        useAsOption,
        originZone,
        projectOnly,
        simultaneousPlayCount,
        reservedInstanceIds,
      ) ?? reduced
    );
  };

  const adjustedEvoCost = (
    seat: Seat,
    target: Permanent,
    base: number,
    into: CardDefinition,
    costDelta = 0,
  ): number => {
    const reductionsBlocked = continuous.blocksCostReduction(seat, "digivolve");
    let cost = base;
    const adj = ledger.evoCostFor(target, into, { costDelta });
    if (adj !== undefined) {
      const adjusted = "fixed" in adj ? adj.fixed : cost + adj.delta;
      cost = reductionsBlocked ? Math.max(cost, adjusted) : adjusted;
    }
    return reductionsBlocked ? cost : cost - subTriggers.costReductionFor("wouldDigivolve", target, into);
  };

  /**
   * Effect-driven digivolve: stack a loose card (`sourceInstanceId`) onto
   * `targetPermanentId` as the new top, the prior top sliding under it. Mirrors the
   * placement of the digivolve action (digivolveState.pushDigivolution) but sourced
   * from an effect ("this Digimon may digivolve into [X] ... without paying the
   * cost"). Recomputes DP from the new top and carries the base's suspended state.
   */
  const permanentByTopInstance = (instanceId: string): string | undefined => {
    for (const owner of state.players) {
      for (const permanent of owner.battleArea) {
        if (permanent.topCard?.instanceId === instanceId) return permanent.permanentId;
      }
      if (owner.breeding?.topCard?.instanceId === instanceId) return owner.breeding.permanentId;
    }
    return undefined;
  };

  /**
   * Move card instances to their owners' trash from wherever they currently sit
   * (hand, security, deck, or as a permanent's top/stack/linked card). Mirrors the
   * source trash flows (Player.Trash*, IDiscardHands, ...). A card sitting as the
   * TOP card of a permanent cannot be trashed in isolation by this verb (that is a
   * delete, which moves the whole permanent) — such ids are skipped. Returns the
   * instances actually moved.
   */
  const snapshotDeletedPermanents = (permanentIds: readonly string[]) =>
    permanentIds.flatMap((permanentId) => {
      const permanent = access.permanentById(permanentId);
      return permanent?.topCard === undefined
        ? []
        : [
            {
              permanentId,
              controllerSeat: permanent.controllerSeat,
              topCardId: permanent.topCard.cardId,
              inheritedHostIsDigimon: inheritedDigimonHost({
                definition: requireCardDefinition(permanent.topCard.cardId),
                effectiveKinds: effectiveKinds(
                  continuous,
                  permanentId,
                  requireCardDefinition(permanent.topCard.cardId).kinds,
                ),
                inBattleArea: !permanent.inBreeding,
              }),
              stackInstanceIds: permanent.stack.map((card) => card.instanceId),
              faceDownSourceInstanceIds: [...permanent.stack, ...permanent.linked]
                .filter((card) => !card.faceUp)
                .map((card) => card.instanceId),
            },
          ];
    });

  const filterBouncePrevented = async (
    instanceIds: string[],
    destination: "hand" | "deck" | "security",
  ): Promise<string[]> => {
    const permByInstance = new Map<string, string>();
    for (const owner of state.players) {
      for (const p of owner.battleArea) {
        if (p.topCard !== undefined && instanceIds.includes(p.topCard.instanceId)) {
          permByInstance.set(p.topCard.instanceId, p.permanentId);
        }
      }
    }
    // Ordinary return protection and the broader BT16-051 Q2642 leave lock both funnel through
    // here. Hand/deck return immunity does not prevent security placement. Applied before the
    // prevent-reaction consult so a prohibited move never asks anyone
    // to pay a prevention cost. addSecurity also uses this seam for whole-permanent placement.
    instanceIds = instanceIds.filter((id) => {
      const permId = permByInstance.get(id);
      return (
        permId === undefined ||
        ((destination === "security" || !isRestricted(permId, "beReturned")) &&
          !isRestricted(permId, "leaveBattleAreaExceptByDeletion"))
      );
    });
    if (!engine.consultLeavePrevention) return instanceIds;
    for (const [instanceId] of [...permByInstance]) {
      if (!instanceIds.includes(instanceId)) permByInstance.delete(instanceId);
    }
    if (permByInstance.size === 0) return instanceIds;
    const prevented = await engine.consultLeavePrevention(
      [...permByInstance.values()],
      "byEffect",
      effectSeatStack.at(-1) ?? engine.controllerSeat(),
      { isBounce: true, destination },
    );
    const notPrevented = instanceIds.filter((id) => {
      const permId = permByInstance.get(id);
      return permId === undefined || !prevented.has(permId);
    });
    // An "instead" reaction may move the would-leave top card before the original bounce
    // resumes. Most importantly, DNA replacement effects turn it into a digivolution card of
    // a new Digimon (EX12-003 Q6727). Revalidate the snapshotted permanent identity: the old
    // operation must not chase that instance into its new stack and pull it to hand/deck.
    return notPrevented.filter((id) => {
      const originalPermanentId = permByInstance.get(id);
      if (originalPermanentId === undefined) return true;
      return access.permanentById(originalPermanentId)?.topCard?.instanceId === id;
    });
  };

  /**
   * A stack-return restriction covers an opponent effect returning an individual stacked card to
   * hand or deck (BT26-029). It deliberately does not protect against the host controller's own
   * effect, an unattributed rules move, or a bounce of the host's top card/permanent.
   */
  const filterLockedStackReturns = (instanceIds: string[], byEffectSeat?: Seat): string[] => {
    if (byEffectSeat === undefined) return instanceIds;
    return instanceIds.filter((instanceId) => {
      const host = hostOfStackInstance(state, instanceId);
      if (host === undefined) return true;
      const hostSeat = access.permanentById(host.hostPermanentId)?.controllerSeat;
      return !continuous.hasRestriction(host.hostPermanentId, "stackReturn", undefined, {
        byOpponentEffect: byEffectSeat !== hostSeat,
      });
    });
  };

  /**
   * Publish the generic leave event while a returned permanent is still observable.
   * `collectForReturn` removes the permanent and tears down its subscriptions, so every
   * hand/deck/egg-deck/security destination must cross this awaited boundary first.
   */
  const fireWhenReturnedPermanentsLeave = async (
    instanceIds: string[],
    opts?: { byEffectSeat?: Seat },
  ): Promise<void> => {
    if (engine.fireSubTrigger === undefined) return;
    const fired = new Set<string>();
    for (const instanceId of instanceIds) {
      let permanent: Permanent | undefined;
      for (const owner of state.players) {
        permanent = owner.battleArea.find((candidate) => candidate.topCard?.instanceId === instanceId);
        if (permanent !== undefined) break;
      }
      if (permanent === undefined || fired.has(permanent.permanentId)) continue;
      fired.add(permanent.permanentId);
      const byEffectSeat = opts?.byEffectSeat ?? effectSeatStack.at(-1);
      const deletedPermanentSnapshots = snapshotDeletedPermanents([permanent.permanentId]);
      await engine.fireSubTrigger("whenLeavesPlay", {
        deletedPermanentId: permanent.permanentId,
        deletedPermanentSnapshots,
        deletedControllerSeat: permanent.controllerSeat,
        deletedTopCardId: permanent.topCard.cardId,
        removalCause: byEffectSeat === undefined ? "byRule" : "byEffect",
        ...(byEffectSeat === undefined ? {} : { byEffectSeat }),
      });
    }
  };

  /**
   * Return only the visible top card of each selected stacked permanent. This is deliberately
   * distinct from a normal permanent bounce: the position remains in the battle area, so the
   * normal `wouldBeReturned` pre-move window is preserved but `whenLeavesPlay` is not emitted
   * while the underlying card is promoted. Bounce prevention still sees the detached top through
   * the common return filter before any stack mutation (BT13-107 Q2359/Q2360).
   */
  const detachPermanentTopsToHand = async (
    instanceIds: string[],
    opts?: { silent?: boolean; byEffectSeat?: Seat },
  ): Promise<CardInstance[]> => {
    instanceIds = filterLockedStackReturns(instanceIds, opts?.byEffectSeat ?? effectSeatStack.at(-1));
    instanceIds = await filterBouncePrevented(instanceIds, "hand");
    // Preserve the ordinary pre-move bounce reaction window. A replacement may move the
    // selected top card into another permanent, so bind each selection to its original permanent
    // and revalidate that identity before detaching. Unlike a whole-permanent bounce, the
    // successful detachment below deliberately does NOT fire `whenLeavesPlay`.
    const targetedPermanentByInstance = new Map<string, string>();
    if (engine.fireSubTrigger) {
      for (const instanceId of instanceIds) {
        let foundPermanent: Permanent | undefined;
        for (const owner of state.players) {
          foundPermanent = owner.battleArea.find(
            (candidate) => candidate.topCard?.instanceId === instanceId && candidate.stack.length > 0,
          );
          if (foundPermanent !== undefined) break;
        }
        if (foundPermanent === undefined) continue;
        targetedPermanentByInstance.set(instanceId, foundPermanent.permanentId);
        await engine.fireSubTrigger("wouldBeReturned", {
          subjectPermanentId: foundPermanent.permanentId,
          returnDestination: "hand",
        });
      }
    }
    instanceIds = instanceIds.filter((instanceId) => {
      const targetedPermanentId = targetedPermanentByInstance.get(instanceId);
      if (targetedPermanentId === undefined) return true;
      const permanent = access.permanentById(targetedPermanentId);
      return permanent?.topCard?.instanceId === instanceId && permanent.stack.length > 0;
    });
    const moved: CardInstance[] = [];
    const movedToHand: CardInstance[] = [];

    for (const instanceId of instanceIds) {
      let permanent: Permanent | undefined;
      for (const owner of state.players) {
        permanent = owner.battleArea.find(
          (candidate) => candidate.topCard?.instanceId === instanceId && candidate.stack.length > 0,
        );
        if (permanent !== undefined) break;
      }
      if (permanent === undefined || permanent.topCard === undefined) continue;
      const detached = permanent.topCard;
      const promoted = popFromStack(permanent);
      if (promoted === undefined) continue;

      setTopCard(permanent, promoted);
      promoted.faceUp = true;
      const promotedDefinition = requireCardDefinition(promoted.cardId);
      permanent.baseDP =
        promotedDefinition.kinds.includes(CardKind.Digimon) || promotedDefinition.kinds.includes(CardKind.DigiEgg)
          ? promotedDefinition.dp
          : 0;
      permanent.invalidNoDpStackTop = promotedTopNeedsInvalidRuleTrash(promotedDefinition);
      dropPermanentLedgers(permanent.permanentId);
      ledger.recomputeDP(state, permanent.permanentId);
      // Re-arm effects and restrictions from the promoted card before the next decision or rule
      // check observes the permanent (the same refresh boundary used by addSecurity detachment).
      await engine.recomputeContinuousEffects?.();

      detached.faceUp = true;
      const detachedDefinition = requireCardDefinition(detached.cardId);
      if (detachedDefinition.isToken === true) {
        // A token leaves the field successfully for cost accounting, then ceases to exist.
        ledger.dropSourceInstances(state, [detached.instanceId]);
        moved.push(detached);
        continue;
      }
      if (detachedDefinition.kinds.includes(CardKind.DigiEgg)) {
        detached.faceUp = false;
        insertCard(player(detached.ownerSeat), Zone.EggDeck, detached);
        ledger.dropSourceInstances(state, [detached.instanceId]);
        moved.push(detached);
        continue;
      }
      insertCard(player(detached.ownerSeat), Zone.Hand, detached);
      ledger.dropSourceInstances(state, [detached.instanceId]);
      moved.push(detached);
      movedToHand.push(detached);
    }

    // The detached card itself left the field, even though the permanent did not. This keeps
    // Overflow and hand-addition semantics aligned with a normal return while intentionally
    // omitting the permanent leave event above.
    applyOverflow(engine.memory, moved, state.turnSeat);
    if (movedToHand.length > 0) {
      const groups: { seat: Seat; cards: CardInstance[] }[] = [];
      for (const card of movedToHand) {
        const last = groups.at(-1);
        if (last?.seat === card.ownerSeat) last.cards.push(card);
        else groups.push({ seat: card.ownerSeat, cards: [card] });
      }
      for (const { seat, cards } of groups)
        engine.emit({
          kind: "cardsMoved",
          instanceIds: cards.map((card) => card.instanceId),
          from: Zone.BattleArea,
          to: Zone.Hand,
          seat,
          handAddition: opts?.silent === true ? "staging" : "transfer",
        });
      await engine.recomputeContinuousEffects?.();
      if (opts?.silent !== true) {
        const recipientSeats = new Set(movedToHand.map((card) => card.ownerSeat));
        for (const seat of recipientSeats) {
          const addedToHand = {
            instanceIds: movedToHand.filter((card) => card.ownerSeat === seat).map((card) => card.instanceId),
            byEffect: currentHandAddProvenance(),
          };
          await engine.fireSubTrigger?.("whenEffectAddsToOpponentHand", { effectAddedToHandSeat: seat, addedToHand });
          await engine.fireSubTrigger?.("whenEffectAddsToHand", { effectAddedToHandSeat: seat, addedToHand });
        }
        const returnedDigimon = movedToHand.filter((card) =>
          requireCardDefinition(card.cardId).kinds.includes(CardKind.Digimon),
        );
        for (const seat of new Set(returnedDigimon.map((card) => card.ownerSeat))) {
          await engine.fireSubTrigger?.("whenDigimonReturnsToHand", {
            returnedDigimonToHandSeat: seat,
            returnedDigimonToHandInstanceIds: returnedDigimon
              .filter((card) => card.ownerSeat === seat)
              .map((card) => card.instanceId),
          });
        }
      }
    }
    return moved;
  };

  /**
   * `effectSeat` names the seat of an effect that is not resolving yet, such as a cost
   * checked while its trigger is collected. Without it, the resolving seat is used.
   */
  const isOpponentEffectAgainst = (permanentId: string, effectSeat?: Seat): boolean | undefined => {
    const perm = access.permanentById(permanentId);
    if (perm === undefined) return undefined;
    // The resolution-owner stack is the accurate resolving seat when an effect pushed one; it
    // beats `controllerSeat()` (the turn seat), which misreads a [Counter] or [Opponent's Turn]
    // effect resolving on the other player's turn as an opponent's effect.
    const resolvingSeat = effectSeat ?? effectSeatStack.at(-1) ?? engine.controllerSeat();
    return resolvingSeat !== perm.controllerSeat;
  };

  /**
   * Shared gate for effect-driven mutations. In addition to the operation-specific rule,
   * honor `beAffected` against the physical kind(s) of the currently resolving source.
   */
  const isRestricted = (permanentId: string, restriction: Restriction, effectSeat?: Seat): boolean => {
    const byOpponentEffect = isOpponentEffectAgainst(permanentId, effectSeat);
    if (continuous.hasRestriction(permanentId, restriction, undefined, { byOpponentEffect })) return true;
    if (byOpponentEffect === undefined) return false;
    // Target selection may preserve an immune target so downstream clauses can observe
    // a failed mutation. Progress must therefore also protect the mutation itself.
    if (
      byOpponentEffect &&
      continuous.hasKeyword(permanentId, "Progress") &&
      engine.combat?.currentAttackerId === permanentId
    )
      return true;
    const sourceKinds = effectSourceKindsStack.at(-1) ?? [];
    if (sourceKinds.length === 0) {
      return continuous.hasRestriction(permanentId, "beAffected", undefined, { byOpponentEffect });
    }
    return sourceKinds.some((sourceKind) =>
      continuous.hasRestriction(permanentId, "beAffected", sourceKind, { byOpponentEffect }),
    );
  };

  return {
    effectDrivenPlayCost,
    adjustedEvoCost,
    permanentByTopInstance,
    snapshotDeletedPermanents,
    filterBouncePrevented,
    filterLockedStackReturns,
    fireWhenReturnedPermanentsLeave,
    detachPermanentTopsToHand,
    isOpponentEffectAgainst,
    isRestricted,
  };
}
