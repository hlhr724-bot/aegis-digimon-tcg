import type { RuntimeCallbackRegistry } from "#api/engine/snapshot/RuntimeCallbackRegistry";
import { EngineRuntimeCallbackKind } from "#api/engine/snapshot/context/EngineRuntimeCallbackKind";
import { TimingWindowState } from "#api/engine/effects/resolution/TimingWindowState";
import type { TimingWindowResume } from "#api/engine/effects/resolution/TimingWindowResume";
import type { TimingWindowRuntime } from "#api/engine/effects/resolution/TimingWindowRuntime";
import type { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";
import { trashArrivalOf } from "#api/engine/state/access";
import { EffectTiming } from "@aegis/shared";
import type { Seat } from "@aegis/shared";
import type { CardSource } from "./CardSource.js";
import type { EffectContext } from "./EffectContext.js";
import { effectProvenanceKinds } from "./effectProvenance.js";
import type { CollectedEffect } from "./collect.js";
import { UseTracker, canActivate } from "./kernel.js";
import { observeEffectActivation } from "./activationPresentation.js";
import { ResolutionPlan } from "../decisions/resolutionPlan.js";

/** One effect paired with the source that produced it (collection output). */
export type { CollectedEffect } from "./collect.js";

/**
 * Hard cap on resolution passes for one timing window (one pass == one effect
 * resolved or one all-optional group declined). Far above any real chain depth; it
 * exists only to convert a buggy never-terminating effect into a thrown error
 * instead of a hung match.
 */
export const MAX_RESOLUTION_PASSES = 1000;

/**
 * How many times the resolver will try to STOP a detected loop (Comprehensive Rules §18-3-3)
 * before falling back to §18-3-2's draw. Each attempt grants a fresh `MAX_RESOLUTION_PASSES`
 * budget, so a loop whose optional links keep being replaced by fresh ones still terminates.
 */
export const MAX_LOOP_STOP_ATTEMPTS = 3;

/**
 * Order collected effects so the turn player's effects resolve before the
 * opponent's (rulebook: simultaneous triggers resolve turn-player-first). Stable
 * within each side, so same-side ordering is preserved until the controller is
 * asked to reorder their own. Mirrors `ActivateMultipleSkills` splitting the
 * triggered list into `TurnPlayerSkillInfos` then `NonTurnPlayerSkillInfos` and
 * resolving the turn player's bucket first.
 */
export function orderTurnPlayerFirst(collected: readonly CollectedEffect[], turnSeat: Seat): CollectedEffect[] {
  const mine: CollectedEffect[] = [];
  const theirs: CollectedEffect[] = [];
  for (const item of collected) {
    if (orderingSeatOf(item) === turnSeat) mine.push(item);
    else theirs.push(item);
  }
  return [...mine, ...theirs];
}

/**
 * The seat that gets to order this entry among the simultaneous ones: its controller, unless
 * the entry is pending processing that carries an explicit {@link CollectedEffect.orderingSeat}.
 */
export function orderingSeatOf(collected: CollectedEffect): Seat {
  return collected.orderingSeat ?? collected.source.ownerSeat;
}

/**
 * The environment the resolver runs against. It is deliberately decoupled from the
 * concrete engine so the loop is pure and unit-testable: the engine supplies these
 * functions (bound to authoritative GameState via the effect-framework's
 * `gatherTriggeredEffects` + `createEffectContext`), and tests supply fakes.
 */
export interface ResolutionEnv {
  runtimeCallbacks?: RuntimeCallbackRegistry;
  runtimeObjects?: RuntimeObjectRegistry;
  onTimingWindowCreated?: (window: TimingWindowRuntime) => void;
  registerPendingEffects?: (read: () => readonly CollectedEffect[]) => () => void;
  /** The active player; used for turn-player-first ordering. */
  readonly turnSeat: Seat;
  /** Per-turn use ledger (maxPerTurn accounting). Engine-owned; reset each turn. */
  readonly tracker: UseTracker;

  /**
   * Collect the effects that TRIGGER at `timing` right now (kernel `canTrigger`
   * already applied), each paired with its source. The framework half
   * (`gatherTriggeredEffects`). Re-invoked after every resolution to pick up
   * effects newly triggered during resolution.
   */
  collect(timing: EffectTiming): CollectedEffect[];

  /** Bind the runtime EffectContext for a collected effect (trigger data + game + fx + ask). */
  makeContext(collected: CollectedEffect): EffectContext;

  /**
   * State-based-action sweep run after each resolution (and once up front). The TS
   * analogue of documented behavior `RuleProcess` (trash DP-0 Digimon, discard
   * non-Digimon from breeding, link-condition checks, loss resolution, ...). The
   * deep rule set is owned by other subsystems; the resolver only needs the seam so
   * ordering and re-scan match the source. Returns when state is quiet.
   */
  ruleProcess(): Promise<void>;

  /** Has the match ended? When true the resolver stops immediately (source `endGame` guard). */
  isGameOver(): boolean;

  /**
   * Resolve the match to a draw and stop. Comprehensive Rules §18-3-2: "If an infinite
   * loop occurs and neither player has the ability to stop it, that game ends in a
   * draw." Called instead of throwing when the pass cap below is exceeded, wired to
   * `WinCheck.declareDraw`. Optional so a `ResolutionEnv` that doesn't supply it (e.g.
   * an older/test caller) keeps today's throw-on-overflow behavior — still a real
   * safety net against a genuinely buggy card effect, just not the rules-correct
   * terminal outcome.
   */
  declareDraw?(): Promise<void>;

  /**
   * Ask the controller which simultaneously-activatable effect to resolve next,
   * returning its index into `active`. Called only when multiple effects share the
   * controller's activation window; a lone effect has no ordering decision. Return
   * `null` to decline resolving the remaining effects — only honored when every
   * remaining effect is optional (source
   * `CanNoSelect = active.All(s => s.CardEffect.IsSkippable(...))`).
   * `plan` holds the controller's resolution plan for this window; a prompt it already
   * answers is skipped. `waiting` lists the controller's older pending effects, which only
   * resolve after this group (§15-4-5-2/3); the prompt shows them but never offers them.
   */
  chooseOrder(
    seat: Seat,
    active: readonly CollectedEffect[],
    timing: EffectTiming,
    plan?: ResolutionPlan,
    waiting?: readonly CollectedEffect[],
  ): Promise<number | null>;

  /**
   * Ask the controller whether to use an optional effect (source
   * `Activate_Optional` -> `OptionalSkill.SelectOptional`). Called only for effects
   * whose `optional` flag is set. Returns true to resolve it, false to skip. A preset in
   * `plan` answers without asking.
   */
  askOptional(seat: Seat, collected: CollectedEffect, plan?: ResolutionPlan): Promise<boolean>;

  /**
   * Settle everything the effect that just resolved left pending, BEFORE the next one is
   * offered. The reference implementation runs `RuleProcess()` and then re-enters
   * `TriggeredSkillProcess()` after every single activation, so a trigger DERIVED from the
   * effect that just resolved activates ahead of the effects that were already pending
   * (Comprehensive Rules §15-4-5-2/3). In this engine the derived ones that reach the next
   * `collect` pass on their own are already handled by the re-collect; this hook covers the
   * queues the engine parks instead — a deletion window deferred out of a resolving effect and
   * the deferred security-removal reactions. Wired only for the OUTERMOST resolution loop: at a
   * nested one the effect that armed those queues is still mid-body, which is exactly what the
   * deferral protects (KB Q1430/Q1432).
   *
   * Optional: an env without it keeps the queues parked until its caller drains them.
   */
  betweenEffects?: () => Promise<void>;

  /**
   * Notify that a triggered effect finished resolving (body ran; declined optionals do
   * NOT fire this). Optional observability seam used by the engine to surface a
   * transient "what just resolved" overlay; the pure resolver never depends on it.
   */
  onResolved?(timing: EffectTiming, collected: CollectedEffect): void;

  /**
   * Notify that a triggered effect is about to resolve — before its optional
   * prompt and before any decision its body opens. Optional observability seam
   * used by the engine to announce the effect ahead of the wait it may cause.
   */
  onResolving?(timing: EffectTiming, collected: CollectedEffect): void;

  /** Public narration starts only once the resolving clause accepts its processing. */
  onActivating?(timing: EffectTiming, collected: CollectedEffect): void;

  /**
   * The window closed with this effect still pending but never offered, because it had no
   * legal outcome (`Effect.lacksLegalOutcome`). Called once per pending activation.
   */
  onWithoutLegalOutcome?(timing: EffectTiming, collected: CollectedEffect): void;
}

/**
 * What the effect's source card currently IS on the board: which permanent holds it, and in
 * what role — top card, digivolution card, or linked card. `undefined` when the card sits on
 * no permanent at all (hand, trash, security, a resolving Option).
 *
 * Comprehensive Rules §15-4-4-3: a card with a pending effect that becomes a new card before
 * the effect activates can no longer activate it. A card can become a new card WITHOUT leaving
 * the battle area, and those cases are invisible to a residency check — `isOnBattleArea()` is
 * true for a top card, a digivolution card, and a linked card alike:
 *
 *  - Digivolving on top of the source turns the top card into a digivolution card. Q2738
 *    (BT17-012): resolve the [When Attacking] effect and digivolve, and the ＜Raid＞ effect that
 *    triggered alongside it "can no longer be activated". Q2769 (BT17-023) says the same for
 *    that card's two [When Attacking] effects.
 *  - Being placed under, or played out of, a different permanent moves the card to another
 *    permanent while the role may not change at all. Q2805 (BT17-050): once the card with the
 *    pending [All Turns] inherited effect is played, that effect can no longer be activated.
 *
 * Role is deliberately keyed on what the card is to its permanent rather than on stack contents:
 * a digivolution card whose host digivolves again is still the same digivolution card of the
 * same permanent, so an inherited effect survives its own stack growing.
 */
export function permanentIdentityOf(source: CardSource): string | undefined {
  const permanent = source.permanent();
  if (permanent === undefined) return undefined;
  if (source.gainedOnPermanentId === permanent.permanentId) return `${permanent.permanentId} gained`;
  const role =
    permanent.topCard?.instanceId === source.instanceId
      ? "top"
      : permanent.linked.some((card) => card.instanceId === source.instanceId)
        ? "linked"
        : "stack";
  return `${permanent.permanentId} ${role}`;
}

/**
 * Resolve every effect that fires at `timing`, including effects that trigger during
 * resolution.
 *
 * Faithful port of `the engine.TriggeredSkillProcess` ->
 * `MultipleSkills.ActivateMultipleSkills`: collect the triggered effects, resolve
 * the turn player's before the opponent's, and after EACH single resolution run the
 * rule sweep and RE-COLLECT across both players (the source `TriggeredSkillProcess`
 * re-entry) so effects triggered during resolution — either player's — are folded in
 * and still ordered turn-player-first.
 *
 * Implemented as one fixpoint loop rather than two sequential buckets precisely so a
 * cross-player re-trigger (e.g. the turn player's effect triggers an opponent's) is
 * not missed: every pass re-derives the full activatable set, re-orders it, and
 * resolves the frontmost effect.
 */
export async function resolveTiming(
  timing: EffectTiming,
  env: ResolutionEnv,
  resume?: TimingWindowResume,
): Promise<void> {
  // Up-front rule sweep mirrors AutoProcessCheck running RuleProcess before
  // TriggeredSkillProcess.
  if (resume === undefined) {
    await env.ruleProcess();
  }
  if (env.isGameOver()) return;
  const state = resume?.state ?? new TimingWindowState({ timing, passBudget: MAX_RESOLUTION_PASSES });
  if (state.timing !== timing || state.scopeOpen || state.activeDrains > 0 || state.inProgress.size > 0) {
    throw new Error("Cannot resume an active or mismatched timing window");
  }
  env.runtimeObjects?.track({ value: state, key: EngineRuntimeObjectKind.TIMING_WINDOW.value });
  env.runtimeObjects?.track({ value: state.plan, key: EngineRuntimeObjectKind.RESOLUTION_PLAN.value });

  // Optionals the controller has declined THIS window. We re-collect every pass, so
  // without this a declined optional would be re-collected and re-offered forever.
  // Watcher occurrences have independent identities even when their source/effect match.
  // Per-turn use accounting remains shared in the tracker; declining or resolving one
  // occurrence only retires that occurrence from this window.
  const declined = state.declined;
  const plan = state.plan;
  // An effect printed under two timings ("[When Digivolving] [When Attacking]") keeps one
  // effectKey. When an effect-driven attack parks its [When Attacking] trigger in this
  // [When Digivolving] window, that trigger is a separate pending activation: it must not
  // inherit the older trigger's tier or be retired when the older one resolves (§15-4-5).
  const foreignTimingOf = (c: CollectedEffect): string =>
    c.timing === undefined || c.timing === timing ? "" : String(c.timing);
  const declineKey = (c: CollectedEffect): string =>
    `${plan.keyFor(c)} ${c.conferralGranterInstanceId ?? ""} ${foreignTimingOf(c)}`;

  // Effect keys retired by the §18-3-3 infinite-loop stop below. Keyed on the EFFECT, not on
  // (instance, effect) like `declined`: the loop the stop has to break is a repeating
  // PROCESSING, and the instance carrying it is typically a fresh one each cycle (a card
  // replayed, recreated, or a new copy), so an instance-keyed latch would not stop anything.
  // Retiring the effect key is §18-3-3-3's "it will not be possible to perform the actions
  // for the same infinite loop again", scoped to this window.
  const loopStopped = state.loopStopped;

  // Effects already RESOLVED this window. A triggered effect activates once per
  // trigger (Comprehensive Rules §15-4-4-2) — the source `StackSkillInfos` removes
  // a resolved skill from the pending-activation list. Because we re-collect every
  // pass to fold in effects triggered DURING resolution, an UNLIMITED mandatory
  // effect (maxPerTurn = -1, the common case) would otherwise re-trigger forever (its
  // standing canTrigger/canActivate guard never clears and there is no use limit to
  // stop it). Tracking resolved (instanceId, effectKey) here drops each one out after
  // it resolves, exactly as the source does, while still admitting genuinely
  // newly-triggered effects (a distinct source, effect, or captured occurrence).
  const resolved = state.resolved;
  // The currently executing effect remains collectable until its body returns and
  // is registered as resolved. A re-entrant drain must exclude it while still
  // allowing every other pending effect in this same window to proceed.
  const inProgress = state.inProgress;

  // Preserve the activation tier assigned when an effect first becomes active.
  // Every derived batch must finish before returning to older pending effects
  // (§15-4-5-2/3, EX9-069 Q4830), not only its first chosen member. New effects
  // interrupt the current tier; remaining members retain their tier on re-collection.
  // Turn-player priority applies only within the newest active tier.
  const activationTiers = state.activationTiers;

  // Effects seen in SOME earlier collection pass this window (before the canActivate filter),
  // and the subset of those that have since stopped being collected at all.
  //
  // Comprehensive Rules §15-4-4-3: "When a card with an effect that's pending activation becomes
  // a new card before the effect activates, the effect can no longer be activated" — a card that
  // leaves its area is a new card when it comes back. §15-4-4-5 says the same for an effect whose
  // trigger conditions stop being met before it activates. Both show up here identically: the
  // effect drops out of `collect(timing)`, which re-queries live state every pass. Without a
  // record of the departure, a card that leaves and returns inside one window — or a condition
  // that flickers off and back on — silently revives its pending trigger, because the fixpoint
  // re-derives the activatable set purely from the current board.
  //
  // `inProgress` is excluded: the effect currently executing routinely removes its own source
  // (a "by trashing this card" cost) and must not mark itself departed mid-body — it is dropped
  // by `resolved` when it finishes instead.
  const everCollected = state.everCollected;
  const departed = state.departed;

  // The permanent identity each effect's source card had when the effect was FIRST collected
  // this window (see `permanentIdentityOf`). The presence diff above cannot see a card that
  // "becomes a new card" (§15-4-4-3) without leaving the battle area; this map can, so a change
  // of identity retires the pending effect through the same `departed` latch.
  //
  // Why here rather than in the `onField` base guard (builders.ts): the guard is re-evaluated
  // from live state on every pass and holds no memory, so it can only say "not activatable right
  // now" — a card that is buried and then promoted back to top card would revive its pending
  // trigger, which §15-4-4-3 forbids. It also never sees SubTrigger watchers, which reach the
  // resolver as collected effects through `collectPending` rather than through a timing builder.
  // The presence diff is the one place both kinds already pass through once per pass, and it
  // already owns the one-way "departed" semantics this needs.
  const identityAtFirstCollect = state.identityAtFirstCollect;

  // Defensive bound. The source loop relies entirely on canActivate / maxPerTurn /
  // declines to terminate; a mis-implemented card with an unlimited, always-activatable
  // mandatory effect would otherwise spin forever and hang the match. Throwing (vs
  // silently stopping) surfaces the bug as a turn-loop error the engine reports. It is
  // also the loop DETECTOR the §18-3 handling below hangs off: a window that is still
  // producing activatable effects after this many passes is an infinite loop (§18-3-1).

  const sourceArrivals = state.sourceArrivals;
  const hasCurrentTrashSource = (collected: CollectedEffect, ctx: EffectContext): boolean => {
    const proof = sourceArrivals.get(declineKey(collected));
    const hostId = ctx.trigger?.deletedHostInstanceByInstanceId?.[collected.source.instanceId];
    const pendsForDeletedHost = hostId !== undefined && hostId !== collected.source.instanceId;
    if (
      !pendsForDeletedHost &&
      proof?.source !== undefined &&
      trashArrivalOf(ctx.game.state, collected.source.instanceId) !== proof.source
    ) {
      return false;
    }
    if (hostId !== undefined && proof?.host !== undefined && trashArrivalOf(ctx.game.state, hostId) !== proof.host) {
      return false;
    }
    return true;
  };
  const readPendingEffects = (): CollectedEffect[] =>
    state.lastCollected.flatMap((collected) => {
      const key = declineKey(collected);
      if (
        declined.has(key) ||
        resolved.has(key) ||
        inProgress.has(key) ||
        departed.has(key) ||
        loopStopped.has(collected.effect.effectKey)
      ) {
        return [];
      }
      const ctx = env.makeContext(collected);
      if (!hasCurrentTrashSource(collected, ctx)) {
        return [];
      }
      return canActivate(collected.effect, ctx, env.tracker) ? [{ ...collected, triggerInfo: ctx.trigger }] : [];
    });
  const unregisterPending = resume === undefined ? env.registerPendingEffects?.(readPendingEffects) : undefined;

  // A re-entrant drain runs inside an effect whose derived processing can still enable a
  // pending effect (CR 15-4-3-4, 15-4-5-2/3), so
  // only the outermost drain, with nothing in progress, reports what stayed without one.
  const reportedWithoutLegalOutcome = state.reportedWithoutLegalOutcome;
  const reportWithoutLegalOutcome = (collectedThisPass: readonly CollectedEffect[]): void => {
    for (const c of collectedThisPass) {
      const key = declineKey(c);
      if (
        reportedWithoutLegalOutcome.has(key) ||
        declined.has(key) ||
        resolved.has(key) ||
        departed.has(key) ||
        loopStopped.has(c.effect.effectKey) ||
        c.effect.lacksLegalOutcome?.() !== true
      )
        continue;
      reportedWithoutLegalOutcome.add(key);
      env.onWithoutLegalOutcome?.(timing, c);
    }
  };

  const drainCurrentTimingWindow = async (options?: { retireUnactivatable?: boolean }): Promise<void> => {
    state.activeDrains++;
    try {
      while (true) {
        if (env.isGameOver()) return;

        // Re-collect every pass: this is the TriggeredSkillProcess re-entry.
        const collectedThisPass = env.collect(timing);
        state.lastCollected = collectedThisPass;
        for (const collected of collectedThisPass) {
          const key = declineKey(collected);
          if (!sourceArrivals.has(key)) {
            const ctx = env.makeContext(collected);
            const hostId = ctx.trigger?.deletedHostInstanceByInstanceId?.[collected.source.instanceId];
            sourceArrivals.set(key, {
              source:
                ctx.game?.state === undefined ? undefined : trashArrivalOf(ctx.game.state, collected.source.instanceId),
              host:
                hostId === undefined || ctx.game?.state === undefined
                  ? undefined
                  : trashArrivalOf(ctx.game.state, hostId),
            });
          }
        }

        // Retire anything that was collectable earlier this window and is not any more (§15-4-4-3
        // / §15-4-4-5, see `departed` above). Recorded before the activatable filter so a card
        // that leaves and returns cannot come back with its pending trigger intact.
        const presentKeys = new Set(collectedThisPass.map(declineKey));
        for (const key of everCollected) {
          if (!presentKeys.has(key) && !inProgress.has(key)) departed.add(key);
        }
        for (const key of presentKeys) everCollected.add(key);

        // ...and anything still collectable whose source card is no longer the same thing on the
        // same permanent it was when the effect was first collected (§15-4-4-3, see
        // `permanentIdentityOf`). Same exclusions as the presence diff: the effect currently
        // executing may legitimately move its own source card as part of its body.
        for (const c of collectedThisPass) {
          if (c.effect.isActivatedConsequence === true) continue;
          const identity = permanentIdentityOf(c.source);
          if (identity === undefined) continue;
          const key = declineKey(c);
          const first = identityAtFirstCollect.get(key);
          if (first === undefined) identityAtFirstCollect.set(key, identity);
          else if (first !== identity && !inProgress.has(key)) departed.add(key);
        }

        // One pending activation per key. Two collection paths can hand in the same effect for
        // the same trigger (an inherited [On Deletion] reached both from the deleted stack and
        // from the window parked for it), and `resolved` retires the key after the first one
        // runs, so the copy could only ever sit in the order prompt as a choice that never runs
        // (Discord 1555741214014447737: BT26-005 Pinamon listed twice under Ravemon).
        const activeKeys = new Set<string>();
        const pending = collectedThisPass.filter((c) => {
          const key = declineKey(c);
          if (activeKeys.has(key)) return false;
          const activatable =
            !declined.has(key) &&
            !resolved.has(key) &&
            !inProgress.has(key) &&
            !departed.has(key) &&
            !loopStopped.has(c.effect.effectKey);
          if (activatable) activeKeys.add(key);
          return activatable;
        });
        const newlyPending = pending.filter((c) => !activationTiers.has(declineKey(c)));
        if (newlyPending.length > 0) {
          state.newestTier += 1;
          for (const c of newlyPending) {
            activationTiers.set(declineKey(c), state.newestTier);
          }
        }
        const active = pending.filter((c) => {
          const ctx = env.makeContext(c);
          return hasCurrentTrashSource(c, ctx) && canActivate(c.effect, ctx, env.tracker);
        });
        const highestActiveTier = Math.max(0, ...active.map((c) => activationTiers.get(declineKey(c))!));
        const highestUnfinishedTier = Math.max(
          highestActiveTier,
          ...[...inProgress].map((key) => activationTiers.get(key) ?? 0),
        );
        const exhausted = pending.filter((c) => activationTiers.get(declineKey(c))! > highestUnfinishedTier);
        if (inProgress.size === 0 && options?.retireUnactivatable !== true) {
          reportWithoutLegalOutcome(exhausted);
        }
        for (const c of exhausted) {
          departed.add(declineKey(c));
        }
        if (active.length === 0) {
          // At the completed pre-Counter boundary the parent window is exhausted. A cost
          // that becomes payable during security cannot revive this occurrence. Ordinary
          // re-entrant drains leave it pending: an unfinished effect may still enable it.
          if (options?.retireUnactivatable) {
            for (const c of collectedThisPass) {
              const key = declineKey(c);
              if (!inProgress.has(key)) departed.add(key);
            }
          }
          if (inProgress.size === 0) reportWithoutLegalOutcome(collectedThisPass);
          return;
        }

        // §18-3 Infinite Loops. The window is still handing out activatable effects after
        // `passBudget` passes, which no legitimate chain reaches — so this is §18-3-1's
        // "set of processing [that] will continue infinitely".
        //
        // §18-3-3 applies when one of the players HAS the ability to stop the loop; §18-3-2
        // (draw) applies only when NEITHER does. The stop ability the resolver can see is an
        // optional link in the cycle: an effect the controller may decline. So an optional
        // effect among the still-active set means the loop is stoppable.
        //
        // What §18-3-3 prescribes is: each player declares a repeat count (turn player first,
        // §18-3-3-1/-2), the processing runs at least that many times, and then "the player
        // stops the processing when possible" (§18-3-3-3), after which the same loop may not
        // be performed again. The declared repeat count only chooses HOW MANY redundant
        // iterations happen before the stop; the terminal state it reaches is identical either
        // way — the loop stops, with the optional link declined and unable to re-enter. This
        // resolver therefore implements the end state directly: retire the optional link through
        // `loopStopped` (see above), which both declines it now and forbids the same processing
        // from being performed again in this window — §18-3-3-3 exactly.
        //
        // The declaration prompt itself is the piece deliberately not built: it is a
        // player-facing count with no observable consequence here, and the protocol has no
        // decision kind for it (see conformance/ch18-other-information.test.ts).
        //
        // If retiring the optional links does not converge (a cycle threading several distinct
        // optional effects, each only revealed once the previous is gone), the attempt budget is
        // finite and the §18-3-2 draw below is still reached.
        //
        // Reachability: no card in the current corpus can build a stoppable loop — every
        // candidate cycle (self-replay from trash, the AD1-001/AD1-010 free-digivolve mirror,
        // memory-gain engines) consumes memory, hand, trash, security, or deck, or is capped by
        // [Once Per Turn]. This branch is therefore a correctness floor for future card sets, not
        // live behavior; it is covered by synthetic effects in the conformance test.
        if (++state.passes > state.passBudget) {
          const stoppable = active.filter((c) => c.effect.optional);
          if (stoppable.length > 0 && state.stopAttempts < MAX_LOOP_STOP_ATTEMPTS) {
            state.stopAttempts += 1;
            state.passBudget = state.passes + MAX_RESOLUTION_PASSES;
            for (const c of stoppable) loopStopped.add(c.effect.effectKey);
            continue;
          }
          // §18-3-2: neither player can stop it — the game ends in a draw.
          if (env.declareDraw !== undefined) {
            await env.declareDraw();
            return;
          }
          throw new Error(
            `resolveTiming(${String(timing)}): exceeded ${MAX_RESOLUTION_PASSES} resolution passes — ` +
              "likely a card effect that never clears its trigger/activation guard.",
          );
        }

        const activeTier = Math.max(...active.map((c) => activationTiers.get(declineKey(c))!));
        const ordered = orderTurnPlayerFirst(
          active.filter((c) => activationTiers.get(declineKey(c)) === activeTier),
          env.turnSeat,
        );

        // The frontmost contiguous group sharing the frontmost controller is the set of
        // that player's simultaneous triggers they may order among (rulebook: the turn
        // player orders all their own simultaneous triggers first, then the opponent
        // theirs). Cross-player ordering is fixed by orderTurnPlayerFirst, so we only ever
        // prompt within one controller's group.
        const frontSeat = orderingSeatOf(ordered[0]!);
        const group = ordered.filter((c) => orderingSeatOf(c) === frontSeat);
        const waiting = active.filter((c) => !group.includes(c) && orderingSeatOf(c) === frontSeat);

        const choice = await pickNext(frontSeat, group, timing, env, plan, waiting);
        if (choice === null) {
          // Decline is only returned when every effect in the group is optional. Mark them
          // declined so the loop can progress to the other player's effects (or finish).
          for (const c of group) declined.add(declineKey(c));
          continue;
        }

        const chosen = group[choice];
        if (chosen === undefined) return; // defensive: out-of-range index

        const chosenKey = declineKey(chosen);
        env.onResolving?.(timing, chosen);
        inProgress.add(chosenKey);
        let wasResolved: boolean;
        try {
          wasResolved = await resolveOne(
            chosen,
            env,
            timing,
            plan,
            () => declined.add(chosenKey),
            drainCurrentTimingWindow,
          );
        } finally {
          inProgress.delete(chosenKey);
        }
        // A resolved (non-declined) triggered effect leaves the pending list for this
        // window so the next re-collection does not re-offer it (single-trigger rule).
        if (wasResolved) {
          resolved.add(declineKey(chosen));
          env.onResolved?.(timing, chosen);
        }

        // State-based actions between effects (RuleProcess). The next loop iteration
        // re-collects, surfacing anything triggered during this resolution.
        await env.ruleProcess();
        // ...and the queues the engine parked while that effect was resolving, so a derived
        // trigger activates before the effects already pending in this window (§15-4-5-2/3).
        await env.betweenEffects?.();
      }
    } finally {
      state.activeDrains--;
    }
  };

  env.runtimeCallbacks?.track({
    callback: drainCurrentTimingWindow,
    key: EngineRuntimeCallbackKind.TIMING_DRAIN.value,
    payload: { timing, state, environment: env },
  });
  state.scopeOpen = true;
  try {
    env.onTimingWindowCreated?.({ state, drain: drainCurrentTimingWindow });
    await drainCurrentTimingWindow(resume?.options);
  } finally {
    state.scopeOpen = false;
    unregisterPending?.();
  }
}

/**
 * Choose the next effect to resolve from a single controller's simultaneously-
 * activatable group.
 *  - Exactly one: proceed directly; an optional effect still gets its existing
 *    accept/decline decision in `resolveOne`, while a mandatory effect resolves.
 *  - More than one: ask the controller (`chooseOrder`). A `null` (decline) is only
 *    valid when every effect in the group is optional; otherwise the controller MUST
 *    pick one, so a `null` is coerced to index 0 to keep mandatory triggers from
 *    being silently dropped.
 */
async function pickNext(
  seat: Seat,
  group: readonly CollectedEffect[],
  timing: EffectTiming,
  env: ResolutionEnv,
  plan: ResolutionPlan,
  waiting: readonly CollectedEffect[],
): Promise<number | null> {
  if (group.length === 1) return 0;

  const allOptional = group.every((c) => c.effect.optional);
  const picked = await env.chooseOrder(seat, group, timing, plan, waiting);

  if (picked === null) return allOptional ? null : 0;
  if (picked < 0 || picked >= group.length) return allOptional ? null : 0;
  return picked;
}

/**
 * Resolve a single effect: ask the optional question when needed, run the body, and
 * record the use for maxPerTurn accounting.
 *
 * Mirrors `Activate_Optional_Effect_Execute`: an optional effect first asks the
 * controller; if declined the body is skipped and NO use is recorded (source only
 * registers the use inside `OnProcessCallbuck`, invoked from `Activate_Execute`,
 * which runs only when `UseOptional || !IsOptional`). The kernel `canActivate` gate
 * was already checked by the caller, matching the `cardEffect.CanActivate(hashtable)`
 * re-check inside the source `Activate(...)` local function.
 */
async function resolveOne(
  collected: CollectedEffect,
  env: ResolutionEnv,
  timing: EffectTiming,
  plan: ResolutionPlan,
  onDeclined: () => void,
  drainCurrentTimingWindow: NonNullable<EffectContext["drainCurrentTimingWindow"]>,
): Promise<boolean> {
  const { source, effect } = collected;
  const ctx = env.makeContext(collected);
  ctx.drainCurrentTimingWindow = drainCurrentTimingWindow;
  const preset = plan.presetFor(plan.keyFor(collected));
  if (preset !== undefined) ctx.presetOptionalAnswer = preset;

  if (effect.optional) {
    const use = await env.askOptional(source.ownerSeat, collected, plan);
    if (!use) {
      // A declined optional must not be re-collected and re-offered this window
      // (source removes it from the bucket). No use is recorded.
      onDeclined();
      return false;
    }
    if (effect.canCancelBeforeTargets !== true) {
      ctx.oncePerTurnActivationChosen = true;
    }
  }

  const presentation = observeEffectActivation(
    ctx,
    effect.activationDeferred === true && (!effect.optional || effect.canCancelBeforeTargets === true),
    () => env.onActivating?.(timing, collected),
  );
  const sourceKinds = effectProvenanceKinds(ctx, { isLinked: effect.isLinked });
  ctx.effectSourceKinds = sourceKinds;
  // source RegisterUseEffectThisTurn(cardEffect): identity is (instanceId, effectKey). The use
  // counts from activation, not from the end of the body: a timing the body opens (Planet Punch
  // attacking inside EX12-077's [When Digivolving]) must see the shared [Once Per Turn] spent.
  // A body that declines its own "you may", or that fails, gives the use back.
  const countsUse = timing !== EffectTiming.None;
  if (countsUse) env.tracker.register(source.instanceId, effect.effectKey);
  let completed = false;
  ctx.fx.enterEffectResolution?.(source.ownerSeat, sourceKinds, source.permanent()?.permanentId);
  try {
    await effect.resolve(ctx);
    completed = true;
  } finally {
    ctx.fx.leaveEffectResolution?.();
    presentation.restore();
    if (countsUse && (!completed || ctx.oncePerTurnActivationDeclined === true)) {
      env.tracker.unregister(source.instanceId, effect.effectKey);
    }
  }
  return true;
}
