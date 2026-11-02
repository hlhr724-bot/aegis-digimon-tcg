import { uniqueOncePerTurnWatcherOccurrences, type ArmedSubTrigger } from "./subTriggerIdentity.js";
import { EffectTiming, Permanent, type CardInstance } from "@aegis/shared";
import { rootZoneOfLooseInstance } from "../effects/primitives.js";
import { trashArrivalOf } from "../state/access.js";
import type { CollectedEffect } from "../effects/collect.js";
import type { EffectContext } from "../effects/EffectContext.js";
import { mergeRuleDeletions, type PooledRuleDeletion } from "./ruleDeletions.js";
import { subTriggerIdentity } from "./subTriggerIdentity.js";
import { findInstance, findLooseInstance } from "./intents.js";
import { resolveDeletionReactions, runTimingWindow } from "./timing.js";
import { armedAsPendingCollected, runSubTriggersInChosenOrder, subTriggerStillActivatable } from "./subTriggers.js";
import type { GameEngine } from "../GameEngine.js";
import { collectNestedTimingEffects, takeLeaveReplacementPending, withTriggeredMutations } from "./windows.js";
import { cardSourceOf } from "./effectContext.js";
import { runPendingTimingWindow } from "./timing/fire.js";

/**
 * Defensive pass cap for the rule fixpoint, mirroring the resolver's
 * `MAX_RESOLUTION_PASSES`. Each pass strictly removes at least one permanent (a deleted
 * card cannot re-enter the same condition), so termination is structural; the cap only
 * guards against an unforeseen non-decreasing pass (a crafted board hanging the server —
 * RESEARCH Pitfall 3 / threat T-02-03).
 *
 * A holder rather than a bare const: ch18-other-information lowers the cap to 0 so the
 * §18-3-2 draw branch is reached deterministically instead of by building 1000 real passes.
 */
export const rulePassCap = { max: 1000 };

/**
 * The state-based-action sweep: a faithful port of `the engine.RuleProcess`'s
 * `while (DoRuleProcess()) { ... }` fixpoint. Each pass runs the sub-processes below,
 * cited by Comprehensive Rules §17-1-3 subsection (the local KB `comprehensive.md`
 * chunk verified against `node tools/kb/query.mjs rules "rule check"`):
 *
 *   - §17-1-3-2-3 (trash):  a non-Digimon/non-DigiEgg card in the breeding slot.
 *   - §17-1-3-2-4 (trash):  a permanent whose TOP card is face-down.
 *   - §17-1-3-2-5 (trash):  linked cards beyond a Digimon's effective link limit.
 *   - §17-1-3-2-6/§17-1-3-2-7 (trash): a linked card whose own compiled `linkRequirement`
 *     (names/traits) the live host no longer satisfies.
 *   - §17-1-3-2-2 (trash): an Option-kind battle-area permanent NOT placed there by an
 *     effect (`Permanent.placedByEffect`, packages/shared — set by the one path that
 *     creates an Option permanent, `placeOptionAsPermanent` in effects/primitives.ts).
 *
 * plus the EndGame loss-flag resolution (Ch.18, run first each pass, mirroring the
 * source `AutoProcessCheck` ordering). Deliberately NOT implemented: "Battle as Tamer"
 * (no such rule located in Chapter 17 or elsewhere).
 *
 * All deletion routes through the existing `deletePermanent` primitive with cause
 * `byRule`, keeping OnDeletion + leave-prevention (and the now-live `onDeletionOf` bus)
 * single-sourced (RESEARCH "Don't Hand-Roll"); the link-excess trim routes through the
 * `trash` primitive (a link card is trashed individually, not the whole permanent).
 *
 * §17-1-2 note: rule checks aren't performed during rule processing (§17-1-2-1) or
 * during effect processing (§17-1-2-2). The `ruleProcessing` latch below satisfies
 * §17-1-2-1 (a re-entrant call, e.g. from an [On Deletion] triggered BY engine sweep's own
 * deletePermanent, returns false from `doRuleProcess` until engine pass finishes). §17-1-2-2
 * is satisfied by construction of `resolveTiming` (stack.ts): the sweep runs only before a
 * timing window starts and after each single triggered effect FULLY resolves — never
 * between two instructions inside one effect's own body, matching the rule's own worked
 * example (a "-3000 DP and <Security A. -1>" effect is checked only after BOTH clauses
 * apply). A timing window opened by a rule-produced movement cannot start a second sweep:
 * the active outer fixpoint owns the rule work and the pending triggers until it converges.
 */
export async function ruleProcess(engine: GameEngine): Promise<void> {
  // A timing window opened by a rule-produced deletion can re-enter engine method while
  // the outer state-based-action sweep is still active. The outer invocation owns both
  // the fixpoint and its deferred SubTrigger queue. A nested invocation must return
  // immediately: attempting to flush that queue here would dequeue each item, call
  // fireSubTrigger while `ruleProcessing` is still true, and enqueue the same item again
  // forever (BT25-084 / Q6399).
  if (engine.ruleProcessing) return;
  // Deletions performed by ANY sweep of engine fixpoint collect here instead of resolving,
  // so the whole pass produces one simultaneous trigger group (§17-1-3, §15-4-3-3).
  const pool: PooledRuleDeletion[] = [];
  engine.ruleTriggerPool = pool;
  try {
    await runRuleProcessFixpoint(engine);
  } finally {
    engine.ruleTriggerPool = undefined;
  }
  if (engine.state.gameOver) return;
  await flushRuleTriggerPool(engine, pool);
}

/**
 * Run the movement half of a rule check while retaining its reactions for a later
 * trigger window. Arts Digivolve needs engine split: a Digimon reduced to 0 DP by the
 * used Option is deleted after the digivolution placement, and that deletion's
 * reactions trigger at the same time as the new card's [When Digivolving] effects
 * (BT26-031 Q6998). The turn player's entry effects therefore resolve first, while
 * the opponent's retained [On Deletion] reactions follow from the same checkpoint.
 */
export async function collectRuleProcessMovements(engine: GameEngine): Promise<PooledRuleDeletion[]> {
  if (engine.ruleProcessing || engine.ruleTriggerPool !== undefined) return [];
  const pool: PooledRuleDeletion[] = [];
  engine.ruleTriggerPool = pool;
  try {
    await runRuleProcessFixpoint(engine);
  } finally {
    engine.ruleTriggerPool = undefined;
  }
  return pool;
}

/** A synchronous quiet-board gate that avoids adding awaits to ordinary timing windows. */
export function hasRuleProcessPending(engine: GameEngine): boolean {
  if (engine.ruleProcessing || engine.ruleTriggerPool !== undefined || engine.drawingDigivolutionBonus) return false;
  return engine.deferredRuleSubTriggers.length > 0 || engine.ruleChecks.doRuleProcess();
}

/** Stage rule-check reactions in the timing window that opened this checkpoint. */
export async function collectRuleProcessPending(engine: GameEngine): Promise<CollectedEffect[]> {
  // A nested timing window opened by a replacement cost can reach this collector
  // while the outer rule-check fixpoint is still moving cards. Leave its watcher
  // queue with that fixpoint; reactions cannot activate between rule-check passes.
  if (engine.ruleProcessing || engine.ruleTriggerPool !== undefined || engine.drawingDigivolutionBonus) return [];
  const pool = await collectRuleProcessMovements(engine);
  const watcherEvents = engine.deferredRuleSubTriggers.splice(0);
  const pending = collectDeletionPending(engine, pool);
  const armed = uniqueOncePerTurnWatcherOccurrences(watcherEvents.flatMap(({ armed: items }) => items));
  pending.push(...ruleWatchersAsPending(engine, armed));
  pending.push(...takeLeaveReplacementPending(engine));
  return pending;
}

function ruleWatchersAsPending(engine: GameEngine, armed: readonly ArmedSubTrigger[]): CollectedEffect[] {
  return armedAsPendingCollected(engine, armed).map((collected, index) => {
    const canActivate = collected.effect.canActivate;
    return {
      ...collected,
      effect: {
        ...collected.effect,
        canActivate: (ctx: EffectContext) => subTriggerStillActivatable(engine, armed[index]!) && canActivate(ctx),
      },
    };
  });
}

/** Collect deletion reactions without opening a competing timing window. */
export function collectDeletionPending(engine: GameEngine, pool: readonly PooledRuleDeletion[]): CollectedEffect[] {
  const pending: CollectedEffect[] = [];
  if (pool.length > 0) {
    const merged = mergeRuleDeletions(pool);
    const candidates = listCandidateInstances(engine);
    const candidateIds = new Set(candidates.map(({ instanceId }) => instanceId));
    const transientIds = new Set<string>();
    // A deletion snapshot can also contain a Digi-Egg already present in trash.
    // Union physical sources so its inherited effect is offered only once. Only
    // absent sources are transient and exempt from the normal trash-residency guard.
    for (const card of merged.transientCandidates) {
      if (candidateIds.has(card.instanceId)) continue;
      candidates.push(card);
      candidateIds.add(card.instanceId);
      transientIds.add(card.instanceId);
    }
    pending.push(
      ...collectNestedTimingEffects(engine, EffectTiming.OnDestroyedAnyone, merged.trigger, candidates).map(
        (collected) => {
          const instanceId = collected.source.instanceId;
          if (!merged.trigger.deletedInstanceIds?.includes(instanceId) || transientIds.has(instanceId))
            return collected;
          const canActivate = collected.effect.canActivate;
          const deletedHostId = merged.trigger.deletedHostInstanceByInstanceId?.[instanceId];
          const sourceArrival = trashArrivalOf(engine.state, instanceId);
          const hostArrival = deletedHostId === undefined ? undefined : trashArrivalOf(engine.state, deletedHostId);
          return {
            ...collected,
            effect: {
              ...collected.effect,
              // CR 15-4-4-3: replaying/evolving and returning to trash is a new card,
              // even if both moves happen inside one body between collection passes.
              canActivate: (ctx: EffectContext) =>
                sourceArrival !== undefined &&
                trashArrivalOf(engine.state, instanceId) === sourceArrival &&
                (deletedHostId === undefined ||
                  (hostArrival !== undefined && trashArrivalOf(engine.state, deletedHostId) === hostArrival)) &&
                canActivate(ctx),
            },
          };
        },
      ),
    );
    for (const { instanceId, seat } of merged.ascensionCandidates) {
      const card = findLooseInstance(engine, instanceId);
      if (card === undefined) continue;
      pending.push({
        source: cardSourceOf(engine, card),
        timing: EffectTiming.OnDestroyedAnyone,
        timingLabel: "Ascension",
        effect: {
          effectKey: `ascension/${instanceId}`,
          description: "＜Ascension＞: you may place this card at the top of your security stack.",
          optional: false,
          isInherited: false,
          isSecurity: false,
          isLinked: false,
          maxPerTurn: -1,
          canTrigger: () => true,
          canActivate: () => rootZoneOfLooseInstance(engine.state, instanceId) === "trash",
          resolve: async (ctx) => {
            if (ctx.presetOptionalAnswer === false) return;
            if (ctx.presetOptionalAnswer === true) {
              await engine.primitives.ascendToSecurity(instanceId);
              return;
            }
            const response = await engine.decisions.request({
              seat,
              kind: "optional",
              promptText: "Activate ＜Ascension＞?",
              sourceCardId: card.cardId,
              sourceInstanceId: instanceId,
              options: {
                timing: "Ascension",
                effectText:
                  "＜Ascension＞: When this card is deleted, you may place it at the top of your security stack.",
              },
            });
            if (response.kind === "optional" && response.accept) {
              await engine.primitives.ascendToSecurity(instanceId);
            }
          },
        },
      });
    }
  }
  return pending;
}

/**
 * The `while (doRuleProcess())` fixpoint itself: run every sweep, pass after pass, until
 * the board holds no rule violation. Returns without reacting to anything it removed —
 * the pass's triggers are pooled (see {@link ruleTriggerPool}).
 */
export async function runRuleProcessFixpoint(engine: GameEngine): Promise<void> {
  let passes = 0;
  while (engine.ruleChecks.doRuleProcess()) {
    if (++passes > rulePassCap.max) {
      // CR 18-3-2: an infinite loop neither player can stop ends the game in a draw.
      // A non-converging state-based-action fixpoint is exactly that, so resolve the
      // match rather than throwing an error the players cannot act on.
      //
      // §18-3-3 (a player CAN stop it, so they declare a repeat count instead) has no
      // application here: every sweep in engine fixpoint is a mandatory rule check
      // (§17-1-3) with no optional link and no player choice, so neither player has a
      // stop ability inside the cycle. The stoppable case lives one tier out, in the
      // resolver's timing window (effects/stack.ts), where optional effects exist.
      engine.win.declareDraw("effect");
      return;
    }
    // §17-1-3/§15-4-3-3: a rule check only processes the board; the triggers it raises join
    // those already pending and activate after it. A "would be deleted" window the sweep
    // opens must not resolve watchers already waiting around it, such as those of the play
    // that brought a 0-DP Digimon in (Q2342, Q2856, Q3523). They rejoin their pool after.
    const heldWindowSubTriggers = engine.pendingWindowSubTriggers;
    const heldParkedEntrySubTriggers = engine.parkedEntrySubTriggers;
    engine.pendingWindowSubTriggers = [];
    engine.parkedEntrySubTriggers = [];
    engine.ruleProcessing = true;
    try {
      // EndGameProcess — any player at a loss condition ⇒ EndGame, then return.
      if (engine.ruleChecks.runEndGameProcess()) return;
      // BT26-060 Q7082: peeling a Digimon stack down to a no-DP card trashes the invalid
      // remnant at rule-check timing; a normally played Tamer remains a legal permanent.
      await engine.ruleChecks.trashInvalidNoDpStackTops();
      await engine.ruleChecks.deleteZeroDpDigimon();
      // §17-1-3-2-3 TrashNonDigimonPermanentProcess — a non-Digimon/non-DigiEgg card in the
      // breeding slot (a Digi-Egg is NOT a violation — CR §4-2-1 treats it as a Digimon).
      await engine.ruleChecks.trashBreedingNonDigimon();
      // §17-1-3-2-4 CardFaceDownProcess — a permanent whose top card is face-down.
      await engine.ruleChecks.trashFaceDownTopCards();
      // §17-1-3-2-5 DigimonLackLinkMaxCountProcess — linked cards beyond the effective link
      // limit (only the excess is trashed, not the whole permanent).
      await engine.ruleChecks.trashExcessLinkCards();
      // §17-1-3-2-6 / §17-1-3-2-7 — a linked card whose own printed <Link> requirement
      // (names/traits) its live host no longer (or never did) satisfy.
      await engine.ruleChecks.trashInvalidLinkedCards();
      // §17-1-3-2-2 — Option cards in the battle area, except Option cards placed there BY
      // AN EFFECT (`Permanent.placedByEffect`). BT7-102's <Delay> Option (placed via
      // primitives.ts' `placeOptionAsPermanent`, which sets the marker) survives engine sweep.
      await engine.ruleChecks.trashOptionsInBattleArea();
      // "Battle as Tamer" NOT IMPLEMENTED — no such rule was located in Comprehensive Rules
      // Chapter 17 (Rule Checks) or elsewhere. "Tamer cards can't attack" (glossary, CR §4-3)
      // is an attack-DECLARATION legality gate (combat/legality.ts), not a rule-check sweep
      // condition; inventing a deletion/trash behavior for it would not be faithful.
    } finally {
      engine.ruleProcessing = false;
      engine.pendingWindowSubTriggers = [...heldWindowSubTriggers, ...engine.pendingWindowSubTriggers];
      engine.parkedEntrySubTriggers = [...heldParkedEntrySubTriggers, ...engine.parkedEntrySubTriggers];
    }
  }
  // Even a quiet check establishes the current Link cards as existing cards for the next Link
  // operation, so the markers are kept through engine whole fixpoint and retired before its
  // deferred reactions can create a fresh batch of Links. A link is therefore protected only
  // through the rule-check boundary that immediately follows its linking action; sequential
  // later links can replace engine card once that boundary has completed.
  engine.justLinked.clear();
}

/**
 * React, ONCE, to everything the rule-check fixpoint just did: the pooled deletions of
 * every sweep and the watcher events they raised, as a single simultaneous group.
 *
 * §17-1-3 makes rule-check processing simultaneous and §15-4-3-3 makes the effects it
 * triggers simultaneous with each other; §15-4-3-4/-3-5 then have the turn player choose
 * an activation order for their own group and exhaust it before the opponent's. The
 * resolver already implements that ordering for one window, so the pass merges into one
 * window: the deleted sets are unioned (the [On Deletion] gate admits candidates by
 * `deletedInstanceIds`) and the deferred watchers ride along as pending triggers of the
 * same window — the seam `withPendingSubTriggers` uses for every other event. Sweep order
 * therefore stops being observable, which is why the sweeps keep their §17-1-3 order.
 *
 * The window runs through {@link runTimingWindow}: the fixpoint has converged and no card
 * body is on the stack, so the §15-4-4 "wait for the causing effect" deferral has nothing
 * left to wait for. Deletions caused INSIDE engine window are ordinary derived triggers and
 * take the normal deferral path again (the pool is already released).
 */
export async function flushRuleTriggerPool(engine: GameEngine, pool: readonly PooledRuleDeletion[]): Promise<void> {
  const watcherEvents = engine.deferredRuleSubTriggers.splice(0);
  const replacementPending = takeLeaveReplacementPending(engine);
  if (pool.length === 0 && watcherEvents.length === 0 && replacementPending.length === 0) return;
  const armed = watcherEvents.flatMap(({ armed: eventArmed }) => eventArmed);
  if (engine.optionResolutionDepth > 0 && engine.optionMainDepth === 0) {
    engine.pendingNestedTimingEffects.push(
      ...collectDeletionPending(engine, pool),
      ...ruleWatchersAsPending(engine, uniqueOncePerTurnWatcherOccurrences(armed)),
      ...replacementPending,
    );
    return;
  }
  const enclosing = engine.pendingWindowSubTriggers;
  engine.pendingWindowSubTriggers = [...enclosing, ...armed];
  // Raised for both branches below so a watcher engine flush resolves is recorded as consumed
  // and the trailing bus fire does not run it twice.
  engine.subTriggerWindowDepth += 1;
  try {
    if (pool.length === 0 && replacementPending.length === 0) {
      // No deletion window to fold them into, but they are still one simultaneous group and
      // must be ordered turn-player-first rather than drained in arrival order (§15-4-3-5).
      await withTriggeredMutations(engine, () => runSubTriggersInChosenOrder(engine, armed));
    } else if (pool.length === 0) {
      await runPendingTimingWindow(engine, [
        ...ruleWatchersAsPending(engine, uniqueOncePerTurnWatcherOccurrences(armed)),
        ...replacementPending,
      ]);
      await withTriggeredMutations(engine, () =>
        runSubTriggersInChosenOrder(
          engine,
          armed.filter((item) => !engine.consumedSubTriggerKeys.has(subTriggerIdentity(item.sub, item.ctx.trigger))),
        ),
      );
    } else {
      const merged = mergeRuleDeletions(pool);
      const nestedWindowWatchers =
        engine.activeWindowToken === undefined
          ? []
          : ruleWatchersAsPending(engine, uniqueOncePerTurnWatcherOccurrences(armed));
      await resolveDeletionReactions(
        engine,
        merged.trigger,
        merged.ascensionCandidates,
        (deletionTrigger, simultaneousPending = []) =>
          runTimingWindow(engine, EffectTiming.OnDestroyedAnyone, deletionTrigger, merged.transientCandidates, [
            ...simultaneousPending,
            ...nestedWindowWatchers,
            ...replacementPending,
          ]),
        merged.transientCandidates,
        false,
      );
      // A deletion can have no printed [On Deletion] candidates, in which case the empty
      // timing window never requests its pending watcher collection. The watcher was already
      // armed while its target was live; resolve any it did not consume in that window now.
      await withTriggeredMutations(engine, () =>
        runSubTriggersInChosenOrder(
          engine,
          armed.filter((item) => !engine.consumedSubTriggerKeys.has(subTriggerIdentity(item.sub, item.ctx.trigger))),
        ),
      );
    }
  } finally {
    engine.pendingWindowSubTriggers = enclosing;
    engine.subTriggerWindowDepth -= 1;
  }
  // Whatever the window did not reach still activates, on the bus, under the ordinary
  // ordering rules — the already-consumed watchers are skipped by identity.
  for (const { event, payload } of watcherEvents) await engine.fireSubTrigger(event, payload);
  if (engine.subTriggerWindowDepth === 0) engine.consumedSubTriggerKeys.clear();
}

/**
 * The card instances that could contribute an effect at a timing — the union of the
 * zones the source `GetSkillInfos` (documented behavior) scans: each player's field
 * permanents (top card + digivolution stack + linked cards), hand, trash, and
 * face-up security, for BOTH players. The framework's `gatherTriggeredEffects`
 * then applies the per-effect timing/`when`/per-turn-limit filter, so over-listing
 * here is harmless (a card with no effect at the timing contributes nothing).
 */
export function listCandidateInstances(engine: GameEngine): CardInstance[] {
  const out: CardInstance[] = [];
  for (const player of engine.state.players) {
    if (player === undefined) continue;
    for (const permanent of player.battleArea) collectPermanentInstances(engine, permanent, out);
    if (player.breeding !== undefined) collectPermanentInstances(engine, player.breeding, out);
    for (const card of player.hand) out.push(card);
    for (const card of player.trash) out.push(card);
    for (const card of player.security) if (card.faceUp) out.push(card);
    // §9-1-4: a used Option between activation and resolution of its 1st [Main]
    // effect is in NO zone, so it isn't in player.trash above — but its own
    // effect still needs to resolve against it as the source. PlayerState.
    // resolvingOption is exactly that transient, non-zone slot; fold it in here.
    if (player.resolvingOption !== undefined) out.push(player.resolvingOption);
  }
  return out;
}

/**
 * Identify the exact effect-source role occupied by an instance. Phase-boundary
 * windows snapshot engine value so an instance that was merely present in a stack,
 * linked slot, or loose zone cannot gain a newly available printed effect after it
 * moves during resolution of that same physical boundary.
 */
export function candidateSourceLocation(engine: GameEngine, instanceId: string): string | undefined {
  for (const [seat, player] of engine.state.players.entries()) {
    if (player === undefined) continue;
    const permanentLocation = (area: "battle" | "breeding", permanent: Permanent): string | undefined => {
      if (permanent.topCard?.instanceId === instanceId) return `${seat}:${area}:${permanent.permanentId}:top`;
      if (permanent.stack.some((card) => card.instanceId === instanceId)) {
        return `${seat}:${area}:${permanent.permanentId}:stack`;
      }
      if (permanent.linked.some((card) => card.instanceId === instanceId)) {
        return `${seat}:${area}:${permanent.permanentId}:linked`;
      }
      return undefined;
    };
    for (const permanent of player.battleArea) {
      const location = permanentLocation("battle", permanent);
      if (location !== undefined) return location;
    }
    if (player.breeding !== undefined) {
      const location = permanentLocation("breeding", player.breeding);
      if (location !== undefined) return location;
    }
    if (player.hand.some((card) => card.instanceId === instanceId)) return `${seat}:hand`;
    if (player.trash.some((card) => card.instanceId === instanceId)) return `${seat}:trash`;
    if (player.security.some((card) => card.instanceId === instanceId && card.faceUp)) return `${seat}:security`;
    if (player.resolvingOption?.instanceId === instanceId) return `${seat}:resolvingOption`;
  }
  return undefined;
}

/** Push a permanent's top card, digivolution-stack cards, and linked cards. */
export function collectPermanentInstances(engine: GameEngine, permanent: Permanent, out: CardInstance[]): void {
  if (permanent.topCard !== undefined) out.push(permanent.topCard);
  for (const card of permanent.stack) out.push(card);
  for (const card of permanent.linked) out.push(card);
}

/** Resolve a set of instance ids to live CardInstances anywhere on the board. */
export function instancesById(engine: GameEngine, instanceIds: readonly string[]): CardInstance[] {
  const wanted = new Set(instanceIds);
  return listCandidateInstances(engine).filter((c) => wanted.has(c.instanceId));
}

/** Allocate a permanentId unique within the match (subsystem: play-card / digivolve). */
export function nextPermanentId(engine: GameEngine): string {
  let candidate: string;
  do {
    engine.permanentSeq += 1;
    candidate = `perm-${engine.permanentSeq}`;
  } while (engine.access.permanentById(candidate) !== undefined);
  return candidate;
}

export function nextInstanceId(engine: GameEngine): string {
  let candidate: string;
  do {
    engine.instanceSeq += 1;
    candidate = `inst-${engine.instanceSeq}`;
  } while (findInstance(engine, candidate) !== undefined);
  return candidate;
}
