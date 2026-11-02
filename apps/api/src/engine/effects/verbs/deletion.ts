import {
  CardKind,
  EffectTiming,
  requireCardDefinition,
  type CardColor,
  type Permanent,
  type Seat,
} from "@aegis/shared";
import { fragmentCountOf } from "../../combat/keywords.js";
import { listDecoySources } from "#api/engine/effects/listDecoySources";
import { isDecoySourceProtecting } from "#api/engine/effects/isDecoySourceProtecting";
import type { Primitives } from "../EffectContext.js";
import { effectiveNames } from "../continuous.js";

import type { PrimitivesContext } from "./context.js";
import { emitEffectTargetsSelected } from "./emitEffectTargetsSelected.js";
import { createPartitionReactions } from "./partition.js";
import { isOptionPermanent } from "../../cards/cardData.js";
import { canPaySuspendCost } from "../../combat/legality.js";

type PayScapegoatDeletionParams = {
  holder: Permanent;
  sacrifice: Permanent;
};

/**
 * Deleting permanents: the prevention consult, the snapshots the deletion
 * triggers read, and the removal itself.
 */

function permanentSource(perm: Permanent) {
  return {
    sourceCardId: perm.topCard?.cardId,
    sourceInstanceId: perm.topCard?.instanceId,
    sourcePermanentId: perm.permanentId,
  };
}

export function createDeletionVerbs(pc: PrimitivesContext) {
  const partition = createPartitionReactions(pc);
  const {
    engine,
    access,
    continuous,
    decoyCostPermanentIds,
    dropPermanentLedgers,
    effectSeatStack,
    effectSourcePermanentIdStack,
    emitDeletionPrevented,
  } = pc;
  // Reached through the context because these are built in sibling modules: the
  // whole set exists before any of it runs, so forwarding at call time is safe.
  const isRestricted: PrimitivesContext["helpers"]["isRestricted"] = (...args) => pc.helpers.isRestricted(...args);
  const snapshotDeletedPermanents: PrimitivesContext["helpers"]["snapshotDeletedPermanents"] = (...args) =>
    pc.helpers.snapshotDeletedPermanents(...args);
  const armorPurge: Primitives["armorPurge"] = (...args) => pc.fx.armorPurge(...args);
  const ascendToSecurity: Primitives["ascendToSecurity"] = (...args) => pc.fx.ascendToSecurity(...args);
  const materialSave: Primitives["materialSave"] = (...args) => pc.fx.materialSave(...args);
  const playInstances: Primitives["playInstances"] = (...args) => pc.fx.playInstances(...args);
  const suspend: Primitives["suspend"] = (...args) => pc.fx.suspend(...args);
  const trashDigivolutionCards: Primitives["trashDigivolutionCards"] = (...args) =>
    pc.fx.trashDigivolutionCards(...args);

  async function payScapegoatDeletion({ holder, sacrifice }: PayScapegoatDeletionParams): Promise<number> {
    pc.fx.enterEffectResolution?.(holder.controllerSeat, [CardKind.Digimon], holder.permanentId);
    try {
      return await deletePermanent([sacrifice.permanentId], "byEffect");
    } finally {
      pc.fx.leaveEffectResolution?.();
    }
  }

  /**
   * The first ＜Decoy＞ source that can still save one of `endangered`: its battle-area
   * holders and the endangered Digimon its specifier accepts. Holders sharing a source
   * (same card and clause) are offered together, as one choice.
   */
  const nextDecoyOffer = (endangered: readonly Permanent[], closedSources: ReadonlySet<string>) => {
    const stillInPlay = endangered.filter(({ permanentId }) => access.permanentById(permanentId) !== undefined);
    for (const seat of new Set(stillInPlay.map(({ controllerSeat }) => controllerSeat))) {
      const targets = stillInPlay.filter(({ controllerSeat }) => controllerSeat === seat);
      const holders = access
        .battleAreaPermanents(seat)
        .filter(
          (holder) =>
            holder.topCard !== undefined &&
            access.isBattleAreaDigimon(holder) &&
            continuous.hasKeyword(holder.permanentId, "Decoy"),
        );
      const offers = new Map<
        string,
        {
          key: string;
          seat: Seat;
          sourceCardId: string;
          effectText: string;
          holders: Permanent[];
          protectable: Permanent[];
        }
      >();
      for (const holder of holders) {
        for (const source of listDecoySources(continuous, holder)) {
          const { sourceCardId, effectText } = source;
          const key = `${seat}\u0000${sourceCardId}\u0000${effectText}`;
          if (closedSources.has(key)) continue;
          const protectable = targets.filter(
            ({ permanentId, topCard }) =>
              permanentId !== holder.permanentId &&
              isDecoySourceProtecting(source, requireCardDefinition(topCard.cardId)),
          );
          if (protectable.length === 0) continue;
          const offer = offers.get(key) ?? { key, seat, sourceCardId, effectText, holders: [], protectable: [] };
          if (!offer.holders.includes(holder)) offer.holders.push(holder);
          for (const target of protectable) if (!offer.protectable.includes(target)) offer.protectable.push(target);
          offers.set(key, offer);
        }
      }
      const [first] = offers.values();
      if (first !== undefined) return first;
    }
    return undefined;
  };

  const deletePermanent = async (
    permanentIds: string[],
    cause: import("../EffectContext.js").RemovalCause = "byEffect",
    opts?: {
      mechanic?: "Overclock";
      turnEndDeletion?: { sourceCardId: string; deletedCardId: string };
      afterMovement?: (deletedPermanentIds: readonly string[]) => void;
    },
  ): Promise<number> => {
    // Snapshot the producer before prevention/replacement bodies can open nested effect frames.
    // A rule or battle deletion is not attributed to the currently resolving card effect here;
    // CombatController supplies the surviving battle participant on its own final event.
    const deletingPermanentId = cause === "byEffect" ? effectSourcePermanentIdStack.at(-1) : undefined;
    if (cause === "byEffect") {
      emitEffectTargetsSelected({ pc, permanentIds });
    }
    // "Can't be deleted" (Comprehensive Rules §15-1-3: a prohibiting effect takes precedence).
    // Filtered FIRST: an outright prohibition means the deletion never approaches, so neither
    // the would-be-deleted timing nor the ＜Evade＞/＜Barrier＞ cost prompts should fire for it.
    // Field-battle deaths use CombatController's dedicated replacement pipeline; security
    // battles and the no-controller force-battle fallback can reach this primitive as byBattle.
    // `beDeletedInBattle` therefore stays the battle-scoped kind while this prohibition check
    // covers byEffect + byRule.
    // A rule deletion has no controlling effect, so an opponent-scoped entry cannot apply to it.
    permanentIds = permanentIds.filter((permanentId) =>
      cause === "byRule" || cause === "byBattle"
        ? !continuous.hasRestriction(permanentId, "beDeleted", undefined, { byOpponentEffect: false, byEffect: false })
        : !isRestricted(permanentId, "beDeleted"),
    );
    if (permanentIds.length === 0) return 0;
    if (engine.fireTiming) {
      await Promise.all(
        permanentIds.map((permanentId) =>
          engine.fireTiming!(EffectTiming.WhenPermanentWouldBeDeleted, { deletedPermanentId: permanentId }),
        ),
      );
    }
    // Q2212 (EX3-013 under BT12-072): a leave-prevention replacement does NOT pre-empt the
    // deletion triggers OF THE PERMANENT IT SAVES. The ruling resolves that permanent's own
    // "if this Digimon is deleted, trash the top card of your opponent's security stack"
    // FIRST and then uses the prevention, so fire its "when this Digimon is deleted" clauses
    // over the whole endangered set, before any prevention can remove a permanent from it.
    //
    // Only "when this Digimon is deleted" clauses move: a THIRD party's "when a Digimon is
    // deleted" watcher (EX5-063 Leviamon's "gain 1 memory for each of your opponent's Digimon
    // deleted") must still see the permanents that actually left, and a prevented permanent
    // was never deleted (Q6030 pays the prevention for both of Leviamon's sequential deletions
    // and yields no memory). The same holds for a class watcher on the endangered permanent
    // itself (BT13-073's "one of your [Chessmon]", Q2311). Those fire below, over `toDelete`.
    // So do `whenLeavesPlay` / `whenTrashedByEffect`: a prevented permanent never leaves play.
    const deletionWatchersFired = new Set<string>();
    if (engine.fireSubTrigger && engine.consultLeavePrevention) {
      const endangeredSnapshots = snapshotDeletedPermanents(permanentIds);
      for (const permanentId of permanentIds) {
        const deleted = access.permanentById(permanentId);
        if (deleted?.topCard === undefined) continue;
        deletionWatchersFired.add(permanentId);
        await engine.fireSubTrigger(
          "onDeletionOf",
          {
            deletedPermanentId: permanentId,
            deletedPermanentIds: permanentIds,
            deletedPermanentSnapshots: endangeredSnapshots,
            deletedControllerSeat: deleted.controllerSeat,
            deletedTopCardId: deleted.topCard.cardId,
            removalCause: cause,
            removalMechanic: opts?.mechanic,
            deletedByDpZero: cause === "byRule" && deleted.currentDP === 0,
          },
          "selfSourceOnly",
        );
      }
    }
    // ＜Partition (...)＞ is a simultaneous "would be removed" reaction, so capture it from
    // the full endangered set BEFORE another effect can prevent the holder from leaving
    // (EX13-024 / BT23-047 Q7274). Its matched cards may later be loose in trash when the
    // holder leaves, or may still be under a holder saved by the simultaneous prevention.
    const partitionCandidates = partition.capture(permanentIds, cause);
    // Leave-the-battle-area PREVENT reactions: a card may prevent some of these effect-deletions
    // by paying a cost. Consult them and drop the prevented permanents from the deletion set.
    // Default-safe: the consult returns empty unless a matching prevent-replacement is active.
    let toDelete = permanentIds;
    if (engine.consultLeavePrevention) {
      // A nested effect may be resolving for the non-turn player (for example an
      // opponent's When Digivolving effect).  The turn seat is only the fallback;
      // leave-cause gates such as "other than by your effects" must see the effect
      // resolution owner that was pushed by the interpreter.
      const resolvingSeat = effectSeatStack.at(-1) ?? engine.controllerSeat();
      const prevented = await engine.consultLeavePrevention(permanentIds, cause, resolvingSeat, {
        keywordPreventions: { interruptsEffect: false },
      });
      if (prevented.size > 0) toDelete = permanentIds.filter((id) => !prevented.has(id));
    }
    // ＜Evade＞ keyword: when this Digimon would be deleted by an effect, you MAY suspend
    // it to prevent that deletion (Comprehensive Rules §16-22-3: an optional processing
    // condition, not a mandatory replacement — §15-8-5-1 "the effect CAN be activated").
    // Only usable when unsuspended (the suspension IS the cost). Each eligible permanent is
    // prompted one at a time (§15-8-5-4), through the same evadePrompt/respondEvade window
    // the combat (battle-loss) path uses, so the controller's decline is honored instead of
    // the deletion being silently prevented. The leave consult above already offered it,
    // ordered with the other reactions to this deletion, whenever that consult exists.
    if (!engine.consultLeavePrevention) {
      const evaded = new Set<string>();
      for (const permanentId of toDelete) {
        if (!continuous.hasKeyword(permanentId, "Evade")) continue;
        const perm = access.permanentById(permanentId);
        if (perm === undefined || !canPaySuspendCost(perm, continuous)) continue;
        if (!engine.combat) continue; // no prompt facility available; deletion proceeds
        const accepted = await engine.combat.runEvadeDecision(perm.controllerSeat, permanentId);
        if (!accepted) continue;
        const suspended = await suspend([permanentId], { byEffectSeat: perm.controllerSeat });
        if (suspended.length === 0) continue;
        evaded.add(permanentId);
      }
      if (evaded.size > 0) toDelete = toDelete.filter((id) => !evaded.has(id));
    }
    // ＜Barrier＞ keyword: when this Digimon would be deleted IN BATTLE, you MAY trash the top
    // card of your security stack to prevent that deletion (Comprehensive Rules §16-25-1/3:
    // Barrier is battle-only), with no once-per-turn limit. Prompted through the same
    // barrierPrompt/respondBarrier window as the combat (battle-loss) path.
    {
      const barriered = new Set<string>();
      for (const permanentId of cause === "byBattle" && !engine.consultLeavePrevention ? toDelete : []) {
        if (!continuous.hasKeyword(permanentId, "Barrier")) continue;
        const perm = access.permanentById(permanentId);
        if (perm === undefined) continue;
        if (access.securityCount(perm.controllerSeat) === 0) continue;
        if (!engine.combat) continue; // no prompt facility available; deletion proceeds
        const accepted = await engine.combat.runBarrierDecision(perm.controllerSeat, permanentId);
        if (!accepted) continue;
        if (engine.trashTopSecurityForBarrier !== undefined) {
          await engine.trashTopSecurityForBarrier(perm.controllerSeat);
        } else {
          access.flipTopSecurityToTrash(perm.controllerSeat);
        }
        barriered.add(permanentId);
      }
      if (barriered.size > 0) toDelete = toDelete.filter((id) => !barriered.has(id));
    }
    // ＜Decoy＞ keyword (Comprehensive Rules §16-18): when another of the controller's
    // SPECIFIED Digimon would be deleted by an OPPONENT's effect, by deleting the Digimon
    // with this effect, prevent that OTHER Digimon's deletion. Unlike ＜Evade＞/＜Barrier＞
    // (self-protection), this protects a DIFFERENT permanent, so it is keyed off the
    // endangered permanent's controller/card, not its own keyword. Scoped to `cause ===
    // "byEffect"` and an opposing resolving seat (§16-18-1's "by an opponent's effect") — a
    // battle death or the permanent's own controller's effect never activates it. One Decoy
    // saves "1 of those Digimon" (rules manual), so when several matching Digimon would be
    // deleted together, the controller picks which one (Discord 1555594986756767896).
    {
      const decoySaved = new Set<string>();
      if (cause === "byEffect" && !engine.consultLeavePrevention) {
        const resolvingSeat = effectSeatStack.at(-1) ?? engine.controllerSeat();
        const endangered = toDelete
          .filter((permanentId) => !decoyCostPermanentIds.has(permanentId))
          .map((permanentId) => access.permanentById(permanentId))
          .filter(
            (perm): perm is Permanent =>
              perm !== undefined && perm.topCard !== undefined && perm.controllerSeat !== resolvingSeat,
          );
        const closedSources = new Set<string>();
        for (;;) {
          const offer = nextDecoyOffer(
            endangered.filter(({ permanentId }) => !decoySaved.has(permanentId)),
            closedSources,
          );
          if (offer === undefined) break;
          const provenance = { sourceCardId: offer.sourceCardId, timing: "Static", effectText: offer.effectText };
          const chosenHolder = await engine.ask.selectInstances(
            offer.seat,
            offer.holders.map((holder) => holder.topCard.instanceId),
            0,
            1,
            "＜Decoy＞: delete this Digimon to prevent the other Digimon's deletion?",
            provenance,
          );
          const holder = offer.holders.find(({ topCard }) => topCard.instanceId === chosenHolder[0]);
          const protectable = offer.protectable.filter(({ permanentId }) => permanentId !== holder?.permanentId);
          if (holder === undefined || protectable.length === 0) {
            closedSources.add(offer.key);
            continue;
          }
          const chosenProtected =
            protectable.length === 1
              ? [protectable[0]!.topCard.instanceId]
              : await engine.ask.selectInstances(
                  offer.seat,
                  protectable.map(({ topCard }) => topCard.instanceId),
                  1,
                  1,
                  "＜Decoy＞: choose 1 Digimon to protect from deletion",
                  provenance,
                );
          const saved = protectable.find(({ topCard }) => topCard.instanceId === chosenProtected[0]) ?? protectable[0]!;
          // Delete the Decoy holder as the cost — routed back through this same primitive so
          // its own leave-prevention/Evade/Barrier/On-Deletion/Overflow all apply normally.
          decoyCostPermanentIds.add(holder.permanentId);
          let costDeleted = 0;
          try {
            costDeleted = await deletePermanent([holder.permanentId], "byEffect");
          } finally {
            decoyCostPermanentIds.delete(holder.permanentId);
          }
          if (costDeleted === 0) {
            closedSources.add(offer.key);
            continue;
          }
          emitDeletionPrevented("Decoy", saved, holder.permanentId, holder.topCard?.cardId);
          decoySaved.add(saved.permanentId);
        }
      }
      if (decoySaved.size > 0) toDelete = toDelete.filter((id) => !decoySaved.has(id));
    }
    // ＜Armor Purge＞ keyword (Comprehensive Rules §16-19): when this Digimon would be deleted,
    // you MAY trash its own current top card to prevent the deletion (§16-19-3: activation is
    // an optional processing condition; once activated the prevention is mandatory). Requires
    // >= 1 digivolution card to promote — with none, there is nothing to reveal underneath and
    // the deletion proceeds.
    if (!engine.consultLeavePrevention) {
      const armorPurged = new Set<string>();
      for (const permanentId of toDelete) {
        if (!continuous.hasKeyword(permanentId, "Armor Purge")) continue;
        const perm = access.permanentById(permanentId);
        if (perm === undefined || perm.topCard === undefined || perm.stack.length === 0) continue;
        const chosen = await engine.ask.selectInstances(
          perm.controllerSeat,
          [perm.topCard.instanceId],
          0,
          1,
          "＜Armor Purge＞: trash this Digimon's top card to prevent its deletion?",
          permanentSource(perm),
        );
        if (chosen.length === 0) continue;
        // Before the purge: it promotes the digivolution card underneath, so reading the top
        // card afterwards would name the card that replaced the holder, not the holder itself.
        emitDeletionPrevented("Armor Purge", perm);
        await armorPurge(permanentId);
        armorPurged.add(permanentId);
      }
      if (armorPurged.size > 0) toDelete = toDelete.filter((id) => !armorPurged.has(id));
    }
    // ＜Fragment (N)＞ keyword (Comprehensive Rules §16-37): when this Digimon would be
    // deleted, you MAY choose and trash N of ITS OWN digivolution cards to prevent the
    // deletion (§16-37-3: optional activation, all-or-nothing once accepted). Requires >= N
    // digivolution cards to pay the cost.
    if (!engine.consultLeavePrevention) {
      const fragmentSaved = new Set<string>();
      for (const permanentId of toDelete) {
        if (!continuous.hasKeyword(permanentId, "Fragment")) continue;
        const perm = access.permanentById(permanentId);
        if (perm === undefined || perm.topCard === undefined) continue;
        const n = fragmentCountOf(perm.topCard.cardId, continuous.grantedKeywords(permanentId));
        if (n === undefined || n === 0 || perm.stack.length < n) continue;
        const candidateIds = perm.stack.map((c) => c.instanceId);
        const chosen = await engine.ask.selectInstances(
          perm.controllerSeat,
          candidateIds,
          0,
          n,
          `＜Fragment (${n})＞: trash ${n} of this Digimon's digivolution cards to prevent its deletion?`,
          permanentSource(perm),
        );
        if (chosen.length < n) continue; // all-or-nothing: a partial pick is a decline
        // ＜Fragment＞ is a keyword effect, so "when effects trash" watchers must see this trash.
        await trashDigivolutionCards(permanentId, chosen, {
          byEffectSeat: perm.controllerSeat,
          byEffectCardId: perm.topCard.cardId,
        });
        emitDeletionPrevented("Fragment", perm);
        fragmentSaved.add(permanentId);
      }
      if (fragmentSaved.size > 0) toDelete = toDelete.filter((id) => !fragmentSaved.has(id));
    }
    // ＜Material Save N＞ keyword (Comprehensive Rules §16-21): when this Digimon IS deleted
    // (no longer preventable — every prevention layer above has already run), you MAY place up
    // to N of its own specified DigiXros-requirement digivolution cards under 1 of your Tamers
    // INSTEAD of trashing them (§16-21-3: optional activation, but mandatory maximize once
    // accepted). Run BEFORE the movement below so the redirected cards are already off this
    // permanent's stack and never reach trash. Shared with the combat (battle-death) path via
    // `engine.combat.materialSave`, since this is a plain "when deleted" reaction, not
    // scoped to effect-deletions.
    for (const permanentId of toDelete) {
      await materialSave(permanentId);
    }
    // ＜Scapegoat＞ keyword (Comprehensive Rules §16-32): when this Digimon would be deleted
    // OTHER THAN by one of its own controller's effects, by deleting 1 of the controller's
    // OTHER Digimon, prevent the deletion. "Other than by one of your effects" excludes only
    // an effect resolving under the deleted permanent's OWN controller — a rule-based
    // (`byRule`) or an opponent's-effect deletion both qualify.
    if (!engine.consultLeavePrevention) {
      const scapegoatSaved = new Set<string>();
      for (const permanentId of toDelete) {
        if (!continuous.hasKeyword(permanentId, "Scapegoat")) continue;
        const perm = access.permanentById(permanentId);
        if (perm === undefined) continue;
        const resolvingSeat = effectSeatStack.at(-1) ?? engine.controllerSeat();
        if (cause === "byEffect" && resolvingSeat === perm.controllerSeat) continue;
        const candidates = access
          .battleAreaPermanents(perm.controllerSeat)
          .filter((p) => p.permanentId !== permanentId && p.topCard !== undefined && access.isBattleAreaDigimon(p));
        if (candidates.length === 0) continue;
        const chosen = await engine.ask.selectInstances(
          perm.controllerSeat,
          candidates.map((p) => p.topCard!.instanceId),
          0,
          1,
          "＜Scapegoat＞: delete 1 of your other Digimon to prevent this deletion?",
          permanentSource(perm),
        );
        if (chosen.length === 0) continue;
        const sacrifice = candidates.find((p) => p.topCard?.instanceId === chosen[0]);
        if (sacrifice === undefined) continue;
        const costDeleted = await payScapegoatDeletion({ holder: perm, sacrifice });
        if (costDeleted === 0) continue;
        emitDeletionPrevented("Scapegoat", perm, sacrifice.permanentId, sacrifice.topCard?.cardId);
        scapegoatSaved.add(permanentId);
      }
      if (scapegoatSaved.size > 0) toDelete = toDelete.filter((id) => !scapegoatSaved.has(id));
    }
    const deletedPermanentSnapshots = snapshotDeletedPermanents(toDelete);
    const deletedEffectiveNamesByPermanentId = Object.fromEntries(
      toDelete.flatMap((permanentId) => {
        const permanent = access.permanentById(permanentId);
        if (permanent?.topCard === undefined) return [];
        const printedName = requireCardDefinition(permanent.topCard.cardId).nameEn ?? permanent.topCard.cardId;
        return [[permanentId, effectiveNames(continuous, permanent, printedName)]];
      }),
    );
    // SubTrigger bus (System B): "when [a matching Digimon] is deleted" watchers fire over
    // the to-be-deleted set, co-located with the deletion. Fired here — while each subject is
    // STILL a live permanent — so a watcher's captured sourceFilter ("a [Puppet] Digimon")
    // can resolve and gate on the deleted card's live traits/controller before it leaves the
    // field. The body (e.g. draw) runs immediately; OnDestroyedAnyone (System A) follows below.
    if (engine.fireSubTrigger) {
      for (const permanentId of toDelete) {
        const deleted = access.permanentById(permanentId);
        if (deleted?.topCard === undefined) continue;
        // The pre-prevention pass above already ran this permanent's own "when this Digimon is
        // deleted" clauses; every other watcher is still owed a fire.
        await engine.fireSubTrigger(
          "onDeletionOf",
          {
            deletedPermanentId: permanentId,
            deletedPermanentIds: toDelete,
            deletedPermanentSnapshots,
            deletedEffectiveNamesByPermanentId,
            deletedControllerSeat: deleted.controllerSeat,
            deletedTopCardId: deleted.topCard?.cardId,
            removalCause: cause,
            removalMechanic: opts?.mechanic,
            deletedByDpZero: cause === "byRule" && deleted.currentDP === 0,
          },
          deletionWatchersFired.has(permanentId) ? "excludeSelfSource" : undefined,
        );
        // whenLeavesPlay is the superset event (delete + bounce); deletion is one path.
        await engine.fireSubTrigger("whenLeavesPlay", {
          deletedPermanentId: permanentId,
          deletedPermanentSnapshots,
          deletedControllerSeat: deleted.controllerSeat,
          deletedTopCardId: deleted.topCard.cardId,
          removalCause: cause,
          ...(cause === "byEffect" ? { byEffectSeat: effectSeatStack.at(-1) ?? engine.controllerSeat() } : {}),
        });
        // whenTrashedByEffect (CAP-E8): fires only when this deletion was effect-driven.
        // The permanent is still live here so the watcher's sourceFilter.isSelfRef can match.
        if (cause === "byEffect") {
          await engine.fireSubTrigger("whenTrashedByEffect", { trashedByEffectPermanentId: permanentId });
        }
      }
    }
    const allMoved: string[] = [];
    const allStackInstanceIds: string[] = [];
    const allLinkedInstanceIds: string[] = [];
    const deletedLinkHostInstanceByLinkedInstanceId: Record<string, string> = {};
    const deletedHostInstanceByInstanceId: Record<string, string> = {};
    const deletedByDpZero =
      cause === "byRule" && toDelete.some((permanentId) => access.permanentById(permanentId)?.currentDP === 0);
    const deletedByDpZeroInstanceIds = toDelete
      .map((permanentId) => {
        const permanent = access.permanentById(permanentId);
        return cause === "byRule" && permanent?.currentDP === 0 ? permanent.topCard?.instanceId : undefined;
      })
      .filter((instanceId): instanceId is string => instanceId !== undefined);
    // The deleted COUNT = permanents that ACTUALLY left the field. A prevented (leave-prevention)
    // or immune permanent never enters `toDelete` / moves nothing, contributing 0 — the result a
    // gating "if this effect didn't delete" Condition reads (KB BT23-069 Q5338).
    let deletedCount = 0;
    // Record stack card instance IDs BEFORE deletion (per permanent) so the placement guard
    // can distinguish inherited effects (which require a stack position) from top-card
    // effects after the permanent is gone.
    const stackIdsByPermanent = toDelete.map(
      (permanentId) => access.permanentById(permanentId)?.stack.map((c) => c.instanceId) ?? [],
    );
    const linkedIdsByPermanent = toDelete.map(
      (permanentId) => access.permanentById(permanentId)?.linked.map((c) => c.instanceId) ?? [],
    );
    const topInstanceIdsByPermanent = toDelete.map(
      (permanentId) => access.permanentById(permanentId)?.topCard?.instanceId,
    );
    const topCardIdsByPermanent = toDelete.map((permanentId) => access.permanentById(permanentId)?.topCard?.cardId);
    const wasOptionPermanent = toDelete.map((permanentId) => {
      const permanent = access.permanentById(permanentId);
      return permanent !== undefined && isOptionPermanent(permanent);
    });
    const effectiveColorsByPermanent = toDelete.map((permanentId) => {
      const permanent = access.permanentById(permanentId);
      if (permanent?.topCard === undefined) return [] as CardColor[];
      return [
        ...new Set([
          ...requireCardDefinition(permanent.topCard.cardId).colors,
          ...continuous.grantedColors(permanentId),
        ]),
      ] as CardColor[];
    });
    // ＜Fortitude＞ keyword (Comprehensive Rules §16-27): "When a Digimon WITH DIGIVOLUTION
    // CARDS and this effect is deleted, you play this Digimon without paying the cost" —
    // mandatory (§16-27-3). Capture eligibility before movement; the replay joins the
    // ordinary deletion trigger pool so its controller can order it with other effects.
    const fortitudeReplays = toDelete
      .map((permanentId) => {
        const perm = access.permanentById(permanentId);
        if (perm === undefined || perm.topCard === undefined) return undefined;
        if (perm.stack.length === 0) return undefined;
        if (!continuous.hasKeyword(permanentId, "Fortitude")) return undefined;
        return perm.topCard.instanceId;
      })
      .filter((id): id is string => id !== undefined);
    // ＜Ascension＞ keyword (Comprehensive Rules §16-43): "when the card with this effect is
    // deleted, the player MAY place this card at the top of the security stack" — an optional
    // trigger-type reaction (§16-43-3), captured pre-deletion (same reason as Fortitude) so
    // the prompt fires for every candidate that actually leaves the field.
    const ascensionCandidates = toDelete
      .map((permanentId) => {
        const perm = access.permanentById(permanentId);
        if (perm === undefined || perm.topCard === undefined) return undefined;
        if (!continuous.hasKeyword(permanentId, "Ascension")) return undefined;
        return { instanceId: perm.topCard.instanceId, seat: perm.controllerSeat, cardId: perm.topCard.cardId };
      })
      .filter((c): c is { instanceId: string; seat: Seat; cardId: string } => c !== undefined);
    // `toDelete` is ONE simultaneous action (CR §4-18-5: "when multiple instances of
    // <Overflow> are processed simultaneously..."), so every permanent's cards must be moved
    // to trash and Overflow charged ONCE across the whole batch (turn-player-first), not once
    // per permanent in whatever order this array happens to be in — see
    // `deletePermanentsBatched`'s own doc for why per-permanent application can cross the
    // turn-player/non-turn-player boundary the wrong way and change the clamped result.
    const tokenDeletionIds = toDelete.flatMap((permanentId) => {
      const top = access.permanentById(permanentId)?.topCard;
      return top !== undefined && requireCardDefinition(top.cardId).isToken === true ? [top.instanceId] : [];
    });
    // Digi-Egg stack cards are returned face-down to eggDeck by deletion, which is not in
    // the normal timing candidate pool. Preserve those physical instances for inherited
    // [On Deletion] effects while retaining the normal by-effect cause (so Retaliation does
    // not recursively chain from a permanent deleted by Retaliation).
    const digiEggDeletionCandidates = toDelete.flatMap((permanentId) => {
      const permanent = access.permanentById(permanentId);
      if (permanent === undefined) return [];
      return [
        ...permanent.stack,
        ...(permanent.topCard === undefined ? [] : [permanent.topCard]),
        ...permanent.linked,
      ].filter((card) => requireCardDefinition(card.cardId).kinds.includes(CardKind.DigiEgg));
    });
    if (tokenDeletionIds.length > 0 && engine.fireTiming) {
      await engine.fireTiming(EffectTiming.OnDestroyedAnyone, {
        deletedInstanceIds: tokenDeletionIds,
        deletedPermanentSnapshots,
        removalCause: cause,
        removalMechanic: opts?.mechanic,
      });
    }
    // A deleted host retains effects it had already gained while its [On Deletion] triggers
    // are collected (BT12-072 Q2214). Capture grants before movement drops that permanent's
    // continuous ledgers; the post-removal timing window consumes this immutable event snapshot.
    const deletionGrantSnapshot = {
      stackEffectConferralsSnapshot: [...continuous.listStackEffectConferrals()],
      customEffectGrantsSnapshot: continuous.listCustomEffectGrants().map((grant) => {
        if (!topInstanceIdsByPermanent.includes(grant.instanceId)) return grant;
        // Aura immunity gates consult the live recipient. Preserve their event-time
        // result before removal makes that recipient unavailable (ST16-15 Q824).
        const activeAtDeletion = grant.isActive?.() ?? true;
        return { ...grant, isActive: () => activeAtDeletion };
      }),
      onDeletionAtEndOfAttackProjectionsSnapshot: continuous
        .listOnDeletionAtEndOfAttackProjections()
        .map((projection) => projection.permanentId),
    };
    const movedByPermanent = access.deletePermanentsBatched(toDelete, opts?.turnEndDeletion);
    const deletedEffectiveColorsByInstanceId: Record<string, CardColor[]> = {};
    const movedPermanentIds: string[] = [];
    for (let i = 0; i < toDelete.length; i++) {
      const permanentId = toDelete[i]!;
      const moved = movedByPermanent[i]!;
      if (moved.length === 0) continue;
      movedPermanentIds.push(permanentId);
      deletedCount += 1;
      allStackInstanceIds.push(...stackIdsByPermanent[i]!);
      allLinkedInstanceIds.push(...linkedIdsByPermanent[i]!);
      const hostInstanceId = topInstanceIdsByPermanent[i];
      if (hostInstanceId !== undefined) {
        if (!tokenDeletionIds.includes(hostInstanceId)) {
          for (const instanceId of moved) deletedHostInstanceByInstanceId[instanceId] = hostInstanceId;
        }
        for (const linkedInstanceId of linkedIdsByPermanent[i]!) {
          deletedLinkHostInstanceByLinkedInstanceId[linkedInstanceId] = hostInstanceId;
        }
      }
      // Drop ALL three per-permanent ledgers on the way off the field, mirroring the
      // DNA-digivolve material teardown above. The SubTrigger bus is now live, so a stale
      // reduceCost/prevent replacement or onDeletionOf/whenAttacking watcher anchored to a
      // deleted source must not survive to fire or discount after the source is gone.
      dropPermanentLedgers(permanentId);
      allMoved.push(...moved);
      for (const instanceId of moved) {
        deletedEffectiveColorsByInstanceId[instanceId] = effectiveColorsByPermanent[i]!;
      }
    }
    opts?.afterMovement?.(movedPermanentIds);
    // An Option in the battle area is never deleted, only trashed (CR 4-28, 17-1-3-2-2), so an
    // Option permanent that leaves here is an Option trashed from the battle area (BT23-059,
    // P-203 Q5198). ＜Delay＞ costs bypass this path through `trashDelaySource`.
    for (let i = 0; i < toDelete.length; i++) {
      const optionInstanceId = topInstanceIdsByPermanent[i];
      if (optionInstanceId === undefined || !wasOptionPermanent[i]) continue;
      if (!movedPermanentIds.includes(toDelete[i]!)) continue;
      await engine.fireSubTrigger?.("whenOptionInBattleAreaTrashed", { trashedOptionInstanceId: optionInstanceId });
    }
    // `deletePermanentsBatched` narrates the movement itself — it is the single layer every
    // deletion path shares, so this one must not narrate it a second time.
    // WhenPermanentWouldBeDeleted fired BEFORE movement (would-be-deleted); now that the
    // survivors of that window have actually left the field, fire OnDestroyedAnyone over
    // the deleted set (is-deleted). source stacks ONE OnDestroyedAnyone window over the
    // fixed deleted set (documented behavior); resolveTiming re-collects every
    // OnDeletion candidate from trash and orders turn-player-first, so a single fire batches
    // simultaneous deletions correctly. Pulled-from-field cards are now loose in trash, so
    // their [On Deletion] effects (e.g. ＜Save＞) become candidates and trigger.
    // Gate on allMoved (what actually left the field), not toDelete (what was requested): a
    // request to delete an already-off-field permanent moves nothing and must NOT open a
    // window. The combat and security deletion sites gate on their own actual-deleted sets
    // the same way, and never route through this primitive (each owns exactly one window).
    if (allMoved.length > 0 && engine.fireTiming) {
      const deletionTrigger = {
        ...deletionGrantSnapshot,
        deletedPermanentId: allMoved[0],
        deletedPermanentIds: toDelete,
        deletedControllerSeat: deletedPermanentSnapshots.find(({ permanentId }) => permanentId === allMoved[0])
          ?.controllerSeat,
        deletedPermanentSnapshots,
        deletedEffectiveNamesByPermanentId,
        deletedTopCardId: topCardIdsByPermanent.find((cardId) => cardId !== undefined),
        deletedEffectiveColorsByInstanceId,
        deletedByDpZero,
        deletedByDpZeroInstanceIds,
        // The actually-deleted card set: the [On Deletion] trigger gate (builders.onDeletion)
        // admits only these instances as candidates at this window.
        deletedInstanceIds: allMoved,
        // Stack-card subset so the placement guard can gate inherited effects (which require
        // a stack position) vs top-card effects after the permanent is gone.
        deletedWasStackInstanceIds: allStackInstanceIds,
        deletedWasLinkedInstanceIds: allLinkedInstanceIds,
        deletedLinkHostInstanceByLinkedInstanceId,
        deletedHostInstanceByInstanceId,
        fortitudeInstanceIds: fortitudeReplays.filter((instanceId) => allMoved.includes(instanceId)),
        ...(deletingPermanentId === undefined ? {} : { deletingPermanentId }),
        removalCause: cause,
        removalMechanic: opts?.mechanic,
      };
      if (engine.resolveDeletionReactions) {
        await engine.resolveDeletionReactions(
          deletionTrigger,
          ascensionCandidates.filter(({ instanceId }) => allMoved.includes(instanceId)),
          digiEggDeletionCandidates,
        );
      } else {
        await engine.fireTiming(EffectTiming.OnDestroyedAnyone, deletionTrigger);
      }
      // WhenTrashedFromBattleArea (CAP-F5, BT19-095): fires only when the deletion was
      // effect-driven (not combat or rule). The trashed cards are now in trash, matching
      // the same "post-removal" timing as OnDestroyedAnyone.
      if (cause === "byEffect") {
        await engine.fireTiming(EffectTiming.WhenTrashedFromBattleArea, {
          deletedPermanentId: allMoved[0],
          deletedInstanceIds: allMoved,
        });
      }
    }
    // Legacy primitive-only harnesses without a timing runner retain the mandatory replay.
    // Production replays exclusively through the collected Fortitude deletion effect.
    for (const instanceId of engine.fireTiming ? [] : fortitudeReplays) {
      if (!allMoved.includes(instanceId)) continue;
      await playInstances([instanceId]);
    }
    // ＜Ascension＞ reaction: only for cards that actually left the field (in allMoved). The
    // card is now loose in trash; `ascendToSecurity` relocates that same instance.
    for (const { instanceId, seat, cardId } of engine.resolveDeletionReactions ? [] : ascensionCandidates) {
      if (!allMoved.includes(instanceId)) continue;
      const chosen = await engine.ask.selectInstances(
        seat,
        [instanceId],
        0,
        1,
        "＜Ascension＞: place this card at the top of your security stack?",
        { sourceCardId: cardId, sourceInstanceId: instanceId },
      );
      if (chosen.length === 0) continue;
      await ascendToSecurity(instanceId);
    }
    // ＜Partition＞ reaction: the full matched set must still be available together, either
    // loose after the holder left or under the same holder after a simultaneous prevention.
    // Playing them is a "you may" choice (§16-29-3); accepting plays all at once (§16-29-4).
    await partition.resolve(partitionCandidates, allMoved);
    return deletedCount;
  };

  /**
   * Rule-check trash for a position whose top card cannot legally remain in the battle area.
   * This bypasses deletion timings, leave prevention, and "trashed from the battle area"
   * watchers (BT21-030 Q4541/Q4542; BT26-060 Q7082/Q7083).
   */

  return { deletePermanent };
}
