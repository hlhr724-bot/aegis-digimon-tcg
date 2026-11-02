import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";
import { resolveDerivedDuringAttackStep } from "#api/engine/gameEngine/resolveDerivedDuringAttackStep";
import { buildSubTriggerEffectKey } from "#api/engine/gameEngine/buildSubTriggerEffectKey";
import { observeEffectActivation } from "../effects/activationPresentation.js";
import { EffectTiming, KEYWORDS, type Seat } from "@aegis/shared";
import { rootZoneOfLooseInstance } from "../effects/primitives.js";
import { type SubTriggerSubscription, type SubTriggerTurnLedger } from "../effects/subtriggers.js";
import { permanentIdentityOf } from "../effects/index.js";
import type { CardSource } from "../effects/CardSource.js";
import type { CollectedEffect } from "../effects/collect.js";
import type {
  DiscardedStackSourceProof,
  EffectContext,
  TriggerInfo,
  SubTriggerEventName,
  SubTriggerSourceScope,
} from "../effects/EffectContext.js";
import {
  subTriggerDescriptionFor,
  subTriggerIdentity,
  uniqueOncePerTurnWatcherOccurrences,
  type ArmedSubTrigger,
} from "./subTriggerIdentity.js";
import { findLooseInstance } from "./intents.js";
import {
  isInternalDescription,
  soleLinkingClause,
  soleWatcherLine,
  triggerLabel,
} from "../effects/interpreter/describe.js";
import { trashArrivalOf } from "../state/access.js";
import type { GameEngine } from "../GameEngine.js";
import { shouldDeferNestedTiming, withTriggeredMutations } from "./windows.js";
import { buildEffectContext, cardSourceOf } from "./effectContext.js";
import { drainPendingAttackTriggers, runPendingTimingWindow } from "#api/engine/gameEngine/timing/fire";
import { ResolutionPlan } from "../decisions/resolutionPlan.js";
import { applyEntryGrants } from "#api/engine/gameEngine/applyEntryGrants";

/**
 * @param sourceScope Restricts the fire to the event subject's own "when this Digimon is
 *   deleted" clauses (`selfSourceOnly`) or to every other watcher (`excludeSelfSource`).
 *   Omitted => every armed watcher runs, which is what all callers but the deletion seam want.
 */
export async function fireSubTrigger(
  engine: GameEngine,
  event: SubTriggerEventName,
  payload: TriggerInfo = {},
  sourceScope?: SubTriggerSourceScope,
): Promise<void> {
  if (event === "whenSecurityRemoved" && payload.securityRemovalEventId === undefined) {
    payload = { ...payload, securityRemovalEventId: ++engine.securityRemovalEventSeq };
  }
  const scopedOut = (sub: SubTriggerSubscription): boolean => {
    if (sourceScope === undefined) return false;
    // A class watcher that merely includes its own host ("one of your [Chessmon]") is not a
    // self clause: it must wait until the deletion is final (Q2311).
    const isSelfSource = sub.watchesSelf === true && sub.sourcePermanentId === payload.deletedPermanentId;
    return sourceScope === "selfSourceOnly" ? !isSelfSource : isSelfSource;
  };
  if (event === "onEnterFieldAnyone" && payload.subjectPermanentId !== undefined) {
    await applyEntryGrants(engine, [payload.subjectPermanentId]);
  }
  const subscriptionsFor = (): SubTriggerSubscription[] =>
    engine.subTriggers.subscriptionsFor(event).filter((sub) => !scopedOut(sub));
  const deletedPermanent =
    payload.deletedPermanentId === undefined ? undefined : engine.access.permanentById(payload.deletedPermanentId);
  if (deletedPermanent !== undefined) {
    payload = {
      deletedControllerSeat: deletedPermanent.controllerSeat,
      deletedTopCardId: deletedPermanent.topCard?.cardId,
      deletedDigivolutionCardCount: deletedPermanent.stack.length,
      deletedEffectiveKeywords: KEYWORDS.filter((keyword) =>
        engine.continuous.hasKeyword(deletedPermanent.permanentId, keyword),
      ),
      ...payload,
    };
  }
  if (engine.ruleProcessing && !engine.resolvingBarrierSecurityCost) {
    const subscriptions = subscriptionsFor();
    const contexts = new Map<number, EffectContext>();
    for (const sub of subscriptions) {
      const context = buildSubTriggerContext(engine, sub, payload);
      if (context !== undefined) contexts.set(sub.id, context);
    }
    const armed = armedSubTriggers(engine, subscriptions, payload, contexts).map((item) => {
      // A triggered effect granted to the Digimon being deleted has to retain that
      // Digimon's last live context (BT15-039). Other watchers have only met their
      // trigger condition: they have not activated yet, so their source must still
      // exist after the rule-process fixpoint (BT25-084/Q6399).
      if (event === "onDeletionOf" && item.sub.sourcePermanentId === payload.deletedPermanentId) return item;
      return {
        ...item,
        contextAtFireTime: () => buildSubTriggerContext(engine, item.sub, payload),
      };
    });
    engine.deferredRuleSubTriggers.push({
      event,
      payload: {
        turnSeat: engine.state.turnSeat,
        ...payload,
      },
      armed,
    });
    return;
  }
  // A third-party "when [something] is deleted" watcher and the deleted cards'
  // [On Deletion] effects trigger from the same deletion event (CR §15-4). Capture the
  // watcher while the subject is still on the field, where its source filter can inspect
  // the subject's last live state, but let the ensuing OnDestroyedAnyone window activate
  // both effects from one ordered pool. A permanent's own "when this Digimon is deleted"
  // clauses are deliberately excluded: the deletion verb runs those before leave prevention
  // (EX3-013/Q2212).
  if (event === "onDeletionOf" && sourceScope === "excludeSelfSource") {
    const subscriptions = subscriptionsFor();
    const contexts = new Map<number, EffectContext>();
    for (const sub of subscriptions) {
      const context = buildSubTriggerContext(engine, sub, payload);
      if (context !== undefined) contexts.set(sub.id, context);
    }
    engine.pendingDeletionSubTriggers.push(...armedSubTriggers(engine, subscriptions, payload, contexts));
    return;
  }
  // The event subject can leave the board before a pending watcher activates. Bind each
  // context now, at trigger time, so the pending activation keeps the subject snapshot
  // required by CR §15-4-4 instead of re-running its filter against an already-moved card.
  const armWithTriggerTimeContexts = (): ArmedSubTrigger[] => {
    const subscriptions = subscriptionsFor();
    const contexts = new Map<number, EffectContext>();
    for (const sub of subscriptions) {
      const ctx = buildSubTriggerContext(engine, sub, payload);
      if (ctx !== undefined) contexts.set(sub.id, ctx);
    }
    return armedSubTriggers(engine, subscriptions, payload, contexts);
  };
  if (engine.digivolveCostSubTriggers !== undefined && event !== "wouldBeReturned" && event !== "onDeletionOf") {
    engine.digivolveCostSubTriggers.push(...armWithTriggerTimeContexts());
    return;
  }
  if (
    event === "whenSecurityRemoved" &&
    engine.mainVerbContinuationsInFlight > 0 &&
    engine.activeWindowToken === undefined &&
    engine.effectResolutionDepth === 0 &&
    !engine.resolvingBarrierSecurityCost &&
    !engine.flushingDeferredSecurityRemovalTriggers
  ) {
    engine.pendingWindowSubTriggers.push(...armWithTriggerTimeContexts());
    return;
  }
  // A security card removed while another effect is resolving creates a pending trigger;
  // it does not interrupt that effect. Dynasmon BT6-044 must finish revealing its 6 cards
  // before its Recovery reaction can consume the next deck card (KB Q1430/Q1432).
  // Security effects and their replacements can resolve before a timing window opens;
  // their body depth still makes the removal pending until the Security checkpoint.
  if (
    event === "whenSecurityRemoved" &&
    (engine.activeWindowToken !== undefined || engine.effectResolutionDepth > 0) &&
    !engine.resolvingBarrierSecurityCost &&
    !engine.flushingDeferredSecurityRemovalTriggers
  ) {
    const pending = [...engine.subTriggers.subscriptionsFor(event)];
    const boundPayload = { ...payload };
    const contexts = new Map<number, EffectContext>();
    for (const sub of pending) {
      const ctx = buildSubTriggerContext(engine, sub, boundPayload);
      if (ctx !== undefined) contexts.set(sub.id, ctx);
    }
    engine.deferredSecurityRemovalTriggers.push({
      payload: boundPayload,
      subscriptions: pending,
      contexts,
    });
    return;
  }
  // A would-be-returned reaction interrupts the causing effect before its target moves
  // (CR 15-8-5; BT20-074 Q4400). Deferring it loses the original Digimon first.
  if (event !== "wouldBeReturned" && shouldDeferNestedTiming(engine) && !engine.resolvingBarrierSecurityCost) {
    engine.pendingWindowSubTriggers.push(...armWithTriggerTimeContexts());
    return;
  }
  // A SubTrigger body is a triggered, duration-scoped effect even when its watcher was
  // discovered while the engine was re-deriving continuous effects (see
  // {@link withTriggeredMutations}).
  await withTriggeredMutations(engine, async () => {
    // One event can arm SEVERAL watchers at once: two copies of Xeno EX11-066 both watch
    // "when your Digimon digivolves", and a link operation arms both the recipient's watchers
    // and the newly linked card's [When Linking] face. Simultaneous triggers of one player are
    // ordered BY THAT PLAYER (CR §15-4), so snapshot the matching watchers and let the
    // controller pick the next one exactly like a normal timing window. `whenLinked` always
    // takes engine path — its ordering is observable for BT26-084/Q7128, whose link face can
    // recursively link a card mid-window.
    //
    // An ordered window resolves ONLY what its snapshot armed: a body can drive a continuous
    // recompute, which tears down and RE-INSTALLS every continuous watcher under fresh ids, so
    // a second pass over a re-queried list would fire the same watcher twice. The set of
    // simultaneous triggers is fixed when the event happens anyway. The single-watcher case
    // keeps the plain pass below — no snapshot, no prompt, and a `matches` gate that only
    // becomes true once an earlier body has resolved still gets its chance.
    const subscriptions = subscriptionsFor();
    const armed = armedSubTriggers(engine, subscriptions, payload);
    if (engine.activeWindowToken === undefined && armed.length > 0) {
      await runPendingTimingWindow(engine, armedAsPendingCollected(engine, armed));
      await fireContextlessSubTriggers(engine, subscriptions, payload);
    } else if (event === "whenLinked" || armed.length > 1) {
      await runSubTriggersInChosenOrder(engine, armed);
    } else {
      await engine.subTriggers.fire(
        event,
        (sub) => buildSubTriggerContext(engine, sub, payload),
        undefined,
        // Deduplicate simultaneous plays from one body (Q2814), while allowing each
        // separately resolving body in this timing pool to trigger the watcher again.
        // Primitive-only callers fall back to their enclosing window identity.
        engine.effectBodyTokens.at(-1) ?? engine.activeWindowToken,
        subTriggerTurnLedger(engine),
        (sub) => scopedOut(sub) || engine.consumedSubTriggerKeys.has(subTriggerIdentity(sub, payload)),
        (sub, ctx) => announceSubTrigger(engine, sub, ctx),
      );
    }
  });
  // A watcher body may have moved/deleted permanents; refresh the continuous tier so a
  // subsequent read sees the post-fire board (mirrors fireTiming's trailing recompute).
  // A batch stack-card event is immediately followed by one per-card event at the same
  // primitive seam. Keep continuous inherited watchers installed until those per-card events
  // have had a chance to fire; recomputing here would remove a source card that has already
  // moved and erase its exact-card watcher before the canonical event (P-167/BT10-006).
  if (event !== "onDigivolutionCardsDiscardedBatch") await engine.recomputeContinuousEffects();
}

/**
 * Capture the watchers armed when an event occurs, then return a deferred activation.
 * This is distinct from a nested timing deferral: combat deliberately resolves its
 * System-A [When Attacking] window before the System-B watcher bus, but both systems
 * observe the same attack declaration. A watcher installed by an earlier System-A
 * effect therefore must not retroactively join that declaration (BT24-078/Q5775).
 */
export function prepareSubTrigger(
  engine: GameEngine,
  event: SubTriggerEventName,
  payload: TriggerInfo,
): () => Promise<void> {
  const boundPayload = { ...payload };
  const subscriptions = [...engine.subTriggers.subscriptionsFor(event)];
  const contexts = new Map<number, EffectContext>();
  for (const sub of subscriptions) {
    const ctx = buildSubTriggerContext(engine, sub, boundPayload);
    if (ctx !== undefined) contexts.set(sub.id, ctx);
  }
  return async () => {
    await withTriggeredMutations(engine, async () => {
      await fireSubTriggerSnapshot(engine, subscriptions, boundPayload, contexts);
    });
  };
}

/** CR 9-1-9 / Q5422: use triggers before Main, but activation waits for its routing. */
export function prepareOptionUsed(
  engine: GameEngine,
  usedInstanceId: string,
  usedOptionCost?: number,
): () => Promise<void> {
  const payload = { subjectPermanentId: usedInstanceId, usedOptionCost };
  const armed = armedSubTriggers(engine, engine.subTriggers.subscriptionsFor("whenOptionUsed"), payload);
  return async () => {
    const pending = armed.filter((item) => pendingWatcherSourceStillResident(engine, item));
    if (engine.optionResolutionDepth > 0 || shouldDeferNestedTiming(engine)) {
      engine.pendingWindowSubTriggers.push(...pending);
      return;
    }
    await withTriggeredMutations(engine, () => runSubTriggersInChosenOrder(engine, pending));
    await engine.recomputeContinuousEffects();
  };
}

/**
 * One rule process can give several permanents the same event at once (CR §6-2: the unsuspend
 * phase flips them all simultaneously), while the bus publishes it one subject at a time. A
 * [Once Per Turn] watcher that more than one of those subjects satisfies still activates only
 * once, and its controller chooses which of those Digimon it affects (KB Q3328). Fire each such
 * watcher once over every subject it matches, so `sourceRef: "triggerSubject"` offers the whole
 * group; the per-subject publications that follow then find its turn budget spent.
 */
export async function fireOncePerTurnWatchersOverSimultaneousSubjects(
  engine: GameEngine,
  event: SubTriggerEventName,
  subjectIds: readonly string[],
  payloadFor: (subjectId: string) => TriggerInfo,
): Promise<void> {
  if (subjectIds.length < 2) return;
  const matchesSubject = (sub: SubTriggerSubscription, subjectId: string): boolean => {
    const ctx = buildSubTriggerContext(engine, sub, payloadFor(subjectId));
    return ctx !== undefined && (sub.matches === undefined || sub.matches(ctx));
  };
  const groups = engine.subTriggers
    .subscriptionsFor(event)
    .filter((sub) => sub.oncePerTurnKey !== undefined)
    .map((sub) => ({ sub, subjects: subjectIds.filter((subjectId) => matchesSubject(sub, subjectId)) }))
    .filter(({ subjects }) => subjects.length > 1);
  for (const { sub, subjects } of groups) {
    if (engine.tracker.count(sub.oncePerTurnKey!, "subtrigger") > 0) continue;
    const payload: TriggerInfo = { subjectPermanentIds: subjects, subjectPermanentId: subjects[0] };
    await withTriggeredMutations(engine, () => fireSubTriggerSnapshot(engine, [sub], payload));
  }
}

/**
 * Arm an event's watchers now and activate them later, after windows that may remove the
 * event's subject. The subject's identity was settled when the event happened, so `matches`
 * is not re-read; the watcher's own source must still be present, and `canFire` is re-checked
 * when it activates (Q2670: the Digimon moved from breeding may already be deleted at 0 DP).
 */
export function prepareSubjectFrozenSubTrigger(
  engine: GameEngine,
  event: SubTriggerEventName,
  payload: TriggerInfo,
): () => Promise<void> {
  const boundPayload = { ...payload };
  const armed = armedSubTriggers(engine, engine.subTriggers.subscriptionsFor(event), boundPayload).map(({ sub }) => ({
    ...sub,
    matches: undefined,
  }));
  return async () => {
    if (armed.length === 0) return;
    await withTriggeredMutations(engine, () => fireSubTriggerSnapshot(engine, armed, boundPayload));
  };
}

/**
 * Capture a SubTrigger's eligibility at the event boundary and defer only its activation.
 *
 * Battle deletion has a small but important ordering seam: the losing permanent must leave
 * the field before continuous effects are refreshed (so a conditional ＜Piercing＞ can become
 * active), while the battle's `whenBattleWon`/`onDeletionOf` reactions must not be allowed to
 * mutate that refreshed state before Piercing is captured. The ordinary `prepareSubTrigger`
 * path intentionally re-checks `matches`/`canFire` when its callback runs; that is correct for
 * attack watchers, but would make a deletion watcher observe the post-removal board. This
 * variant freezes those two event predicates and the source context immediately, then runs
 * the already-armed body later.
 *
 * The cloned subscription clears only the live predicates. It retains the original id and all
 * lifecycle/once fields, so `fireSnapshot` still enforces once-per-turn and once-per-timing
 * ledgers, while the bound context allows a watcher whose source was just deleted to resolve.
 */
export function prepareFrozenSubTrigger(
  engine: GameEngine,
  event: SubTriggerEventName,
  payload: TriggerInfo,
): (options?: { deferIntoDeletionWindow?: boolean }) => Promise<void> {
  let boundPayload = { ...payload };
  const deletedPermanent =
    payload.deletedPermanentId === undefined ? undefined : engine.access.permanentById(payload.deletedPermanentId);
  if (deletedPermanent !== undefined) {
    boundPayload = {
      deletedControllerSeat: deletedPermanent.controllerSeat,
      deletedTopCardId: deletedPermanent.topCard?.cardId,
      deletedDigivolutionCardCount: deletedPermanent.stack.length,
      ...boundPayload,
    };
  }

  const subscriptions = [...engine.subTriggers.subscriptionsFor(event)];
  const contexts = new Map<number, EffectContext>();
  for (const sub of subscriptions) {
    const context = buildSubTriggerContext(engine, sub, boundPayload);
    if (context !== undefined) contexts.set(sub.id, context);
  }

  // `armedSubTriggers` is deliberately called NOW: it evaluates matches/canFire against the
  // live event state and captures the shared Once Per Turn occurrence. A later continuous
  // recompute or reaction must not add a watcher to engine event or make an unarmed one eligible.
  const frozen = armedSubTriggers(engine, subscriptions, boundPayload, contexts).map((item) => ({
    ...item,
    // `runSubTriggersInChosenOrder` performs its normal liveness re-check before every body,
    // and `fireSnapshot` checks `matches` again. For engine event-locked path those predicates
    // have already been evaluated above; clearing them on the private snapshot preserves the
    // event result without mutating the registry's original subscription.
    sub: { ...item.sub, matches: undefined, canFire: undefined },
    contextAtFireTime: () => {
      // A watcher on a surviving Digimon is still only pending. Another effect in
      // this simultaneous deletion group may remove its source before it activates.
      // Only a watcher on the very Digimon this event deletes keeps its last-live source;
      // one whose host dies beside that Digimon in the same battle cannot activate (Q2602).
      const sourceId = item.sub.sourcePermanentId;
      if (
        (event === "onDeletionOf" || event === "whenLeavesPlay" || event === "whenDeletesInBattle") &&
        sourceId !== undefined &&
        !(sourceId === boundPayload.deletedPermanentId && boundPayload.deletedPermanentIds?.includes(sourceId)) &&
        buildSubTriggerContext(engine, item.sub, boundPayload) === undefined
      )
        return undefined;
      return item.ctx;
    },
  }));

  return async (options) => {
    if (frozen.length === 0) return;
    if (options?.deferIntoDeletionWindow === true && engine.ruleTriggerPool === undefined) {
      // Keep this separate from ordinary deletion watchers. Those watchers are resolved
      // by the deletion window itself; only this explicitly simultaneous battle result
      // must be offered alongside it as an already-armed pending effect.
      const claimed = new Set(
        engine.pendingBattleWonSubTriggers.map((item) => subTriggerIdentity(item.sub, item.ctx.trigger)),
      );
      for (const item of frozen) {
        const key = subTriggerIdentity(item.sub, item.ctx.trigger);
        if (claimed.has(key) || engine.consumedSubTriggerKeys.has(key)) continue;
        engine.pendingBattleWonSubTriggers.push(item);
        claimed.add(key);
      }
      return;
    }
    if ((event === "onDeletionOf" || event === "whenLeavesPlay") && engine.ruleTriggerPool === undefined) {
      // Battle captures these watchers while the deleted subjects are still live, then
      // calls their callbacks after moving the entire deletion batch. They belong to
      // that batch's On Deletion window, alongside the deleted cards' printed effects.
      // A watcher may match both combatants; one deletion event activates it once.
      const claimed = new Set(
        engine.pendingDeletionSubTriggers.map((item) => subTriggerIdentity(item.sub, item.ctx.trigger)),
      );
      for (const item of frozen) {
        const key = subTriggerIdentity(item.sub, item.ctx.trigger);
        if (claimed.has(key) || engine.consumedSubTriggerKeys.has(key)) continue;
        engine.pendingDeletionSubTriggers.push(item);
        claimed.add(key);
      }
      return;
    }
    // A battle started by a resolving effect (EX13-045 "may battle") must not interrupt it:
    // the battle-result watchers join the pool that already holds the same effect's attack
    // declaration triggers, and the turn player orders them together (CR §15-4, Q7366).
    if (shouldDeferNestedTiming(engine) && !engine.resolvingBarrierSecurityCost) {
      const hostStillResident = (item: ArmedSubTrigger): boolean =>
        event !== "whenDeletesInBattle" ||
        item.sub.sourcePermanentId === undefined ||
        engine.access.permanentById(item.sub.sourcePermanentId) !== undefined;
      engine.pendingWindowSubTriggers.push(
        ...frozen
          .filter((item) => !engine.consumedSubTriggerKeys.has(subTriggerIdentity(item.sub, item.ctx.trigger)))
          .map((item) => ({
            ...item,
            contextAtFireTime: () => (hostStillResident(item) ? item.contextAtFireTime() : undefined),
          })),
      );
      return;
    }
    await withTriggeredMutations(engine, async () => {
      const remaining = frozen.filter(
        (item) =>
          !engine.consumedSubTriggerKeys.has(subTriggerIdentity(item.sub, item.ctx.trigger)) &&
          // Unlike [On Deletion], this is an external battle-result watcher. Its trigger
          // subject may have traded with the opponent, but the permanent hosting the watcher
          // must still exist when the effect activates (Q7339).
          (event !== "whenDeletesInBattle" ||
            item.sub.sourcePermanentId === undefined ||
            engine.access.permanentById(item.sub.sourcePermanentId) !== undefined),
      );
      if (remaining.length > 0) {
        // Combat prepares one frozen deletion reaction per deleted permanent so filters can
        // inspect each subject's last live state. They are nevertheless one simultaneous
        // deletion event: a watcher that matched the first subject must not activate again
        // from the second subject with the same batch payload. Keep the event identity claimed
        // until the surrounding timing window closes; watchers that only match a later subject
        // remain unclaimed and can still activate there.
        for (const item of remaining) engine.consumedSubTriggerKeys.add(subTriggerIdentity(item.sub, item.ctx.trigger));
        await runSubTriggersInChosenOrder(engine, remaining);
      }
    });
    await engine.recomputeContinuousEffects();
  };
}

/**
 * The watchers in `subs` that ACTUALLY trigger for `payload`, each paired with the context
 * bound at the moment the event fired. Filters what the ordering prompt must not offer: a
 * watcher already consumed by the surrounding timing window, one whose `[Once Per Turn]`
 * ledger entry is spent, one whose anchor is gone, one whose `matches` gate rejects the
 * event, and one that could not act anyway (`canFire`, e.g. a ＜Delay＞ played this turn).
 */
export function armedSubTriggers(
  engine: GameEngine,
  subs: readonly SubTriggerSubscription[],
  payload: TriggerInfo,
  boundContexts?: ReadonlyMap<number, EffectContext>,
): ArmedSubTrigger[] {
  const armed: ArmedSubTrigger[] = [];

  // Capture the per-turn budget at the event boundary. Distinct action-path clauses sharing
  // one printed [Once Per Turn] are simultaneous and all remain eligible in engine snapshot
  // (EX4-014/Q3456), even after the first body provisionally marks the shared key. A later
  // event gets a fresh snapshot and therefore sees the consumed ledger entry.
  const oncePerTurnSnapshotKeys = new Set(
    subs
      .filter((sub) => sub.oncePerTurnKey !== undefined && engine.tracker.count(sub.oncePerTurnKey, "subtrigger") === 0)
      .map((sub) => sub.oncePerTurnKey!)
      .filter((key, index, keys) => keys.indexOf(key) === index),
  );
  const occurrence = {
    windowToken: engine.effectBodyTokens.at(-1) ?? engine.activeWindowToken,
    oncePerTurnSnapshotKeys,
    oncePerTurnSuccessfulKeys: new Set<string>(),
    resolvedWatcherKeys: new Set<string>(),
  };

  for (const sub of subs) {
    if (engine.consumedSubTriggerKeys.has(subTriggerIdentity(sub, payload))) continue;
    if (sub.oncePerTurnKey !== undefined && engine.tracker.count(sub.oncePerTurnKey, "subtrigger") > 0) continue;
    const ctx = boundContexts?.get(sub.id) ?? buildSubTriggerContext(engine, sub, payload);
    if (ctx === undefined) continue;
    if (sub.matches !== undefined && !sub.matches(ctx)) continue;
    if (sub.canFire !== undefined && !sub.canFire(ctx)) continue;
    const selfTrashedInstanceId = selfTrashedSourceInstanceId(sub, payload);
    armed.push({
      sub,
      ctx,
      occurrence,
      ...(selfTrashedInstanceId === undefined
        ? {}
        : { sourceTrashArrival: trashArrivalOf(engine.state, selfTrashedInstanceId) }),
      contextAtFireTime: () =>
        boundContexts?.get(sub.id) === undefined
          ? buildSubTriggerContext(engine, sub, payload)
          : boundContexts.get(sub.id),
    });
  }

  return armed;
}

/**
 * `oncePerTurnKey` ledger: reuses the SAME per-turn UseTracker the kernel's maxPerTurn and the
 * leave-prevention "replacement" keys use, namespaced with "subtrigger" so the three ledgers
 * never collide. Resets with everything else at `ownerTurnStart` (see `clearDurations`).
 */
export function subTriggerTurnLedger(engine: GameEngine): SubTriggerTurnLedger {
  return {
    hasFired: (key) => engine.tracker.count(key, "subtrigger") > 0,
    markFired: (key) => engine.tracker.register(key, "subtrigger"),
    unmarkFired: (key) => engine.tracker.unregister(key, "subtrigger"),
  };
}

/**
 * Resolve simultaneous watchers one at a time, letting the controller pick the next one
 * (CR §15-4: the turn player orders their own simultaneous triggers first, then the
 * opponent theirs). A lone watcher resolves without a prompt.
 */
export async function runSubTriggersInChosenOrder(
  engine: GameEngine,
  armed: readonly ArmedSubTrigger[],
): Promise<void> {
  if (engine.activeWindowToken === undefined) {
    await runPendingTimingWindow(engine, armedAsPendingCollected(engine, armed));
    return;
  }
  // Nested resolution can expose the same armed watcher through both the
  // enclosing deletion window and its resumed remainder. A printed
  // [Once Per Turn] effect is still one occurrence in that simultaneous
  // group; distinct clauses remain separate because their identity carries
  // a different dedupeKey.
  const remaining = uniqueOncePerTurnWatcherOccurrences(armed);
  const plan = new ResolutionPlan();
  // A watcher body that orders an attack pauses at the declaration (CR 11-1-4, KB Q819/Q3625):
  // the attack's [When Attacking] effects and then the watchers still pending from this same
  // event resolve before Counter Timing. The attack reaches this loop through the watcher
  // context's `drainCurrentTimingWindow`, which empties `remaining` so nothing re-fires after
  // combat.
  const drainRemaining = async (): Promise<void> => {
    await drainPendingAttackTriggers(engine);
    await resolveRemaining();
  };
  const resolveRemaining = async (): Promise<void> => {
    while (remaining.length > 0) {
      // Drop watchers whose trigger condition lapsed while an earlier one resolved, so the
      // ordering prompt never offers an effect that can no longer activate (CR §15-4-4-5).
      for (let index = remaining.length - 1; index >= 0; index -= 1) {
        if (!subTriggerStillPending(engine, remaining[index]!)) remaining.splice(index, 1);
      }
      const activatable = remaining.filter(subTriggerHasLegalOutcome);
      if (activatable.length === 0) {
        for (const item of remaining) announceWithoutLegalOutcome(engine, item);
        break;
      }
      const orderingSeatOfArmed = (item: ArmedSubTrigger): Seat =>
        item.sub.orderedByTurnPlayer === true ? engine.state.turnSeat : item.ctx.source.ownerSeat;
      const prioritySeat = activatable.some((item) => orderingSeatOfArmed(item) === engine.state.turnSeat)
        ? engine.state.turnSeat
        : orderingSeatOfArmed(activatable[0]!);
      const sameController = activatable.filter((item) => orderingSeatOfArmed(item) === prioritySeat);
      const offered = sameController.map((item) => subTriggerAsCollected(engine, item));
      let chosenIndex = 0;
      if (sameController.length > 1) {
        const index = await engine.resolverDecisions.chooseOrder(prioritySeat, offered, undefined, plan);
        if (index !== null && sameController[index] !== undefined) chosenIndex = index;
      }
      const chosen = sameController[chosenIndex]!;
      remaining.splice(remaining.indexOf(chosen), 1);
      const olderWatchers = new Set(engine.pendingWindowSubTriggers);
      const olderNested = new Set(engine.pendingNestedTimingEffects);
      await fireOneSubTrigger(engine, chosen, {
        drainCurrentTimingWindow: drainRemaining,
        presetOptionalAnswer: plan.presetFor(plan.keyFor(offered[chosenIndex]!)),
      });
      await resolveDerivedDuringAttackStep({ engine, olderWatchers, olderNested });
    }
  };
  await resolveRemaining();
}

/**
 * The watchers armed for the enclosing window's event, as collected effects the resolver can
 * order against the printed ones. Each keeps its own body: the resolver builds a context from
 * the watcher's source for the ordering prompt, but the watcher runs through
 * `fireOneSubTrigger`, so its `matches` / `once` / `oncePerTiming` / `[Once Per Turn]` ledgers
 * behave exactly as they do on the SubTrigger bus.
 */
/**
 * CR §15-4-4-3/-5 at the between-windows boundary: a parked trigger whose source card is no
 * longer the same thing on the same permanent it was when the trigger was collected can no
 * longer activate. A source that was never on a permanent (a trash- or hand-resident clause,
 * or an [On Deletion] whose card is already gone) makes no residency claim and is left alone —
 * the play-cost deletion list (`pendingPlayCostDeletionEffects`) is deliberately not filtered
 * here at all, since its source was deleted to pay the cost by design (Q5131).
 */
export function nestedTriggerSourceStillResident(engine: GameEngine, pending: CollectedEffect): boolean {
  // §15-8-3-5: an inherited [On Deletion] effect is pending for the former top card of the
  // deleted stack. Its permanent identity necessarily changes/disappears, but engine exception
  // is valid only when the event snapshot still proves that exact source/host relationship.
  const trigger = pending.triggerInfo;
  const deletedHostId = trigger?.deletedHostInstanceByInstanceId?.[pending.source.instanceId];
  const inheritedDeletedSource =
    pending.timing === EffectTiming.OnDestroyedAnyone &&
    pending.effect.isInherited === true &&
    trigger?.deletedWasStackInstanceIds?.includes(pending.source.instanceId) === true &&
    trigger.deletedInstanceIds?.includes(pending.source.instanceId) === true &&
    deletedHostId !== undefined &&
    trigger.deletedInstanceIds?.includes(deletedHostId) === true &&
    rootZoneOfLooseInstance(engine.state, pending.source.instanceId) === "trash" &&
    rootZoneOfLooseInstance(engine.state, deletedHostId) === "trash";
  if (inheritedDeletedSource) return true;
  const identityAtDefer = pending.sourceIdentityAtDefer;
  if (identityAtDefer === undefined || identityAtDefer === null) return true;
  return permanentIdentityOf(pending.source) === identityAtDefer;
}

/** Armed watchers as collected effects the resolver can order against the printed ones. */
export function armedAsPendingCollected(engine: GameEngine, items: readonly ArmedSubTrigger[]): CollectedEffect[] {
  return items.map((item) => {
    const collected = subTriggerAsCollected(engine, item);
    let sourceDeparted = false;
    const stillPending = (): boolean => {
      sourceDeparted ||= !pendingWatcherSourceStillResident(engine, item);
      return (
        !item.activationStarted &&
        !sourceDeparted &&
        !subTriggerOccurrenceResolved(item) &&
        !oncePerTurnSpentByAnotherOccurrence(engine, item)
      );
    };
    return {
      ...collected,
      // The resolver announces what it resolves, so engine body must not announce itself.
      effect: {
        ...collected.effect,
        canActivate: () => stillPending() && subTriggerHasLegalOutcome(item),
        lacksLegalOutcome: () => stillPending() && !subTriggerHasLegalOutcome(item),
        resolve: async (resolverCtx: EffectContext) => {
          // Retire the pending trigger before its body can open another window, mirroring
          // `resolutionDeps.onResolving` for the printed half of the same pool.
          engine.parkedEntrySubTriggers = engine.parkedEntrySubTriggers.filter((entry) => entry !== item);
          engine.pendingWindowSubTriggers = engine.pendingWindowSubTriggers.filter((entry) => entry !== item);
          await fireOneSubTrigger(engine, item, {
            announce: false,
            presetOptionalAnswer: resolverCtx.presetOptionalAnswer,
            drainCurrentTimingWindow: resolverCtx.drainCurrentTimingWindow,
            onActivationChosen: resolverCtx.onActivationChosen,
            isActivationPending: resolverCtx.isActivationPending,
          });
        },
      },
    };
  });
}

/** A frozen event does not keep its pending watcher's field source alive (CR 15-4-4-3/4). */
function pendingWatcherSourceStillResident(engine: GameEngine, item: ArmedSubTrigger): boolean {
  const { sub } = item;
  // A deferred hand-trash watcher cannot activate after its battlefield host
  // leaves in the same rule-check fixpoint (BT25-084/Q6399). Self deletion
  // grants deliberately activate from their deleted host (BT15-039).
  if (sub.event === "onDeletionOf" && sub.sourcePermanentId === item.ctx.trigger.deletedPermanentId) return true;
  // "When this card is trashed from ..." activates from the trash. A card that left the trash
  // before activation can't activate it, even if it came back: a used Option is in no area
  // until it is trashed again (Q5160, Q6383, Q6396).
  const selfTrashedInstanceId = selfTrashedSourceInstanceId(sub, item.ctx.trigger);
  if (selfTrashedInstanceId !== undefined) {
    const arrival = trashArrivalOf(engine.state, selfTrashedInstanceId);
    return arrival !== undefined && arrival === item.sourceTrashArrival;
  }
  // Every pending field watcher loses activation when its exact source leaves or
  // loses its placement, including nested play/digivolution snapshots (CR 15-4-4-3/4).
  // The event subject snapshot remains valid; it does not preserve the watcher source.
  const live = buildSubTriggerSourceContext(engine, sub, item.ctx.trigger);
  if (live === undefined) return false;
  // The discard event explicitly authorizes this exact inherited source after it moved.
  if (live.discardedStackSourceProof !== undefined) return true;
  if (sub.sourcePermanentId === undefined || sub.sourceInstanceId === undefined) return true;
  const permanent = engine.access.permanentById(sub.sourcePermanentId);
  if (permanent === undefined) return false;
  if (sub.isInheritedSource === true) return permanent.stack.some((card) => card.instanceId === sub.sourceInstanceId);
  if (sub.isLinkedSource === true) return permanent.linked.some((card) => card.instanceId === sub.sourceInstanceId);
  return permanent.topCard?.instanceId === sub.sourceInstanceId;
}

/** The watcher's own source card, when the event is that card being trashed. */
function selfTrashedSourceInstanceId(sub: SubTriggerSubscription, payload: TriggerInfo): string | undefined {
  const sourceInstanceId = sub.sourceInstanceId;
  if (sourceInstanceId === undefined) return undefined;
  switch (sub.event) {
    case "whenTrashedFromDeck":
      return payload.trashedFromDeckInstanceId === sourceInstanceId ? sourceInstanceId : undefined;
    case "whenTrashedFromHand":
      return payload.trashedFromHandInstanceId === sourceInstanceId ? sourceInstanceId : undefined;
    case "onDigivolutionCardDiscarded":
      return payload.trashedDigivolutionInstanceId === sourceInstanceId ? sourceInstanceId : undefined;
    case "onDigivolutionCardsDiscardedBatch":
    case "onDigiBurstCardDiscarded":
      return payload.trashedDigivolutionInstanceIds?.includes(sourceInstanceId) === true ? sourceInstanceId : undefined;
    default:
      return undefined;
  }
}

/**
 * The parked half of an entry event (see {@link parkArmedForEnclosingWindow}). Offered to EVERY
 * resolution loop, outermost or not: unlike the enclosing window's own watchers these belong to
 * an event that already happened inside the running body, and the loop that drains them is not
 * always the outermost one (a replacement play's loop, EX11-058). A parked watcher already
 * claimed its identity, so the consumed-key filter would hide it and is not applied here.
 */
export function parkedEntryCollected(
  engine: GameEngine,
  excluded: ReadonlySet<ArmedSubTrigger> = new Set(),
): CollectedEffect[] {
  return armedAsPendingCollected(
    engine,
    engine.parkedEntrySubTriggers.filter(
      (item) =>
        !excluded.has(item) &&
        // Entry-event watchers have only triggered; they have not activated yet. If an
        // earlier simultaneous effect removes their field source, they must leave the pool.
        // Keep this residency rule scoped to parked entry watchers: frozen deletion watchers
        // intentionally retain their last-live source context after that source is deleted.
        (item.sub.sourcePermanentId === undefined ||
          engine.access.permanentById(item.sub.sourcePermanentId) !== undefined) &&
        subTriggerStillPending(engine, item),
    ),
  );
}

/**
 * Sub-trigger events whose SUBJECT is a breeding-area permanent by definition. They are the
 * "effects that explicitly specify or reference breeding areas" exception in Comprehensive
 * Rules §3-4-5-6, so the breeding-visibility guard below must never drop them.
 */
const BREEDING_SUBJECT_EVENTS: ReadonlySet<SubTriggerEventName> = new Set([
  "whenHatch",
  "whenMovedFromBreeding",
  "whenOpponentMovedFromBreeding",
]);

export function pendingWindowCollected(engine: GameEngine): CollectedEffect[] {
  return [
    ...engine.pendingNestedTimingEffects.filter((pending) => nestedTriggerSourceStillResident(engine, pending)),
    ...parkedEntryCollected(engine),
    ...pendingWindowWatchersCollected(engine),
  ];
}

/** The enclosing window's own armed watchers, without the parked or printed pending halves. */
export function pendingWindowWatchersCollected(
  engine: GameEngine,
  excluded: ReadonlySet<ArmedSubTrigger> = new Set(),
): CollectedEffect[] {
  return armedAsPendingCollected(
    engine,
    uniqueOncePerTurnWatcherOccurrences(
      engine.pendingWindowSubTriggers.filter(
        (item) =>
          !excluded.has(item) &&
          !engine.consumedSubTriggerKeys.has(subTriggerIdentity(item.sub, item.ctx.trigger)) &&
          subTriggerStillPending(engine, item),
      ),
    ),
  );
}

function isContextlessOneShot(sub: SubTriggerSubscription): boolean {
  return (
    sub.sourcePermanentId === undefined &&
    sub.sourceInstanceId === undefined &&
    sub.activationContext === undefined &&
    sub.matches === undefined
  );
}

async function fireContextlessSubTriggers(
  engine: GameEngine,
  subscriptions: readonly SubTriggerSubscription[],
  payload: TriggerInfo = {},
): Promise<void> {
  const pending = subscriptions.filter(
    (sub) => isContextlessOneShot(sub) && engine.subTriggers.subscriptionsFor(sub.event).includes(sub),
  );
  if (pending.length === 0) return;
  await engine.subTriggers.fireSnapshot(
    pending,
    () => undefined,
    engine.effectBodyTokens.at(-1) ?? engine.activeWindowToken,
    subTriggerTurnLedger(engine),
    (sub) => engine.consumedSubTriggerKeys.has(subTriggerIdentity(sub, payload)),
    (sub, ctx) => announceSubTrigger(engine, sub, ctx),
  );
}

/**
 * Run `fireWindows` — the timing windows for one event — with that event's SubTrigger watchers
 * folded into them, so one player orders their printed effects and their watchers in a SINGLE
 * prompt and can interleave them (CR §15-4). Mirrors the reference implementation, where a
 * digivolution stacks every triggered effect into one list and resolves it one at a time.
 *
 * Whatever the windows did not resolve fires afterwards, still ordered. By default, the trailing
 * bus also sees subscriptions installed during the windows; event seams that snapshot watchers
 * at trigger time pass `onlyInitiallyArmed` to exclude those later subscriptions.
 */
export async function withPendingSubTriggers(
  engine: GameEngine,
  events: readonly SubTriggerEventName[],
  payload: TriggerInfo | undefined,
  fireWindows: () => Promise<void>,
  opts: {
    busTrigger?: () => TriggerInfo | undefined;
    onlyInitiallyArmed?: boolean;
    /**
     * True when engine event's OWN printed effects were parked for the enclosing window
     * instead of resolving here (see {@link shouldDeferNestedTiming}). The watchers armed by
     * the SAME event are simultaneous with those printed effects (CR §15-4), so they must be
     * parked next to them rather than fired on the trailing bus, which would run them first.
     */
    parkArmedToEnclosingWindow?: () => boolean;
    /** Watchers armed by an earlier event of the same batch, such as a digivolution's costs. */
    alsoArmed?: readonly ArmedSubTrigger[];
  } = {},
): Promise<void> {
  // A rule sweep parks watchers wholesale (see fireSubTrigger); leave that path alone.
  const ruleSweepDefersWatchers = engine.ruleProcessing;
  const armed = [
    ...(ruleSweepDefersWatchers || payload === undefined
      ? []
      : events.flatMap((event) => armedSubTriggers(engine, engine.subTriggers.subscriptionsFor(event), payload))),
    ...(opts.alsoArmed ?? []),
  ];
  // An anchor-less delayed one-shot (BT1-021's end-of-turn memory loss) has no context, so
  // `armedSubTriggers` cannot snapshot it. It still belongs to the event it was set up before.
  const initialContextless =
    opts.onlyInitiallyArmed === true
      ? events.flatMap((event) => engine.subTriggers.subscriptionsFor(event).filter(isContextlessOneShot))
      : [];
  const busFire = async (): Promise<void> => {
    if (opts.onlyInitiallyArmed === true && !ruleSweepDefersWatchers) {
      const remaining = armed.filter(
        (item) => !engine.consumedSubTriggerKeys.has(subTriggerIdentity(item.sub, item.ctx.trigger)),
      );
      await withTriggeredMutations(engine, async () => {
        await runSubTriggersInChosenOrder(engine, remaining);
        await fireContextlessSubTriggers(engine, initialContextless, payload);
      });
      return;
    }
    const alsoRemaining = (opts.alsoArmed ?? []).filter(
      (item) => !engine.consumedSubTriggerKeys.has(subTriggerIdentity(item.sub, item.ctx.trigger)),
    );
    if (alsoRemaining.length > 0)
      await withTriggeredMutations(engine, () => runSubTriggersInChosenOrder(engine, alsoRemaining));
    const trigger = opts.busTrigger === undefined ? payload : opts.busTrigger();
    if (trigger === undefined) return;
    for (const event of events) await engine.fireSubTrigger(event, trigger);
  };
  if (armed.length === 0) {
    await fireWindows();
    await busFire();
    return;
  }
  const enclosing = engine.pendingWindowSubTriggers;
  engine.pendingWindowSubTriggers = [...enclosing, ...armed];
  engine.subTriggerWindowDepth += 1;
  try {
    try {
      await fireWindows();
    } finally {
      engine.pendingWindowSubTriggers = enclosing;
    }
    // A play made inside a resolving effect's body only triggers its watchers; they activate
    // after that effect finishes (CR §15-4), so the body's later clauses apply first
    // (EX13-060: the played card gains ＜Rush＞ before its "may attack" watcher resolves).
    // The pool-draining loop on the stack re-collects the parked watchers after the body
    // returns, including when the play came from a replacement (EX11-058 Decode).
    if (opts.parkArmedToEnclosingWindow?.() === true && engine.pendingPoolDrainDepth > 0) {
      parkArmedForEnclosingWindow(engine, armed);
      return;
    }
    // The bus still runs: normally it resolves the armed watchers the windows did not reach
    // and any watcher armed while they were resolving. Entry windows opt into the trigger-time
    // snapshot because an inherited effect acquired during engine very play event did not exist
    // when the event happened and cannot retroactively trigger (BT13-013, Q2272).
    //
    // It runs INSIDE the window depth so whatever it fires is recorded as consumed: a play seam
    // publishes its play event twice (engine entry window, then the trailing `whenPlayed` bus that
    // a multi-card play needs), and without that record the second publication fires the same
    // watcher again (BT20-028 Q4321).
    await busFire();
  } finally {
    engine.subTriggerWindowDepth -= 1;
  }
  if (engine.subTriggerWindowDepth === 0 && engine.parkedEntrySubTriggers.length === 0)
    engine.consumedSubTriggerKeys.clear();
}

/**
 * Hand watchers armed by one event to the window that is holding that event's printed
 * effects, so both halves stay simultaneous and the turn player orders them together
 * (CR §15-4). They keep the `occurrence` captured when they were armed, so their shared
 * `[Once Per Turn]` budget stays keyed to their own event rather than to whichever window
 * ends up resolving them. Each is claimed as consumed on the way in: the same event is
 * republished by the play seam's trailing bus, which would otherwise arm a second copy for
 * the same window to resolve (P-098 Q4184).
 */
export function parkArmedForEnclosingWindow(engine: GameEngine, armed: readonly ArmedSubTrigger[]): void {
  const parked = armed.filter(
    (item) => !engine.consumedSubTriggerKeys.has(subTriggerIdentity(item.sub, item.ctx.trigger)),
  );
  for (const item of parked) engine.consumedSubTriggerKeys.add(subTriggerIdentity(item.sub, item.ctx.trigger));
  engine.parkedEntrySubTriggers.push(...parked);
}

/** Attack-declaration effects expire before Counter Timing, even with no legal outcome. */
export function retirePendingAttackWatchers(engine: GameEngine): void {
  const isAttackWatcher = (item: ArmedSubTrigger): boolean =>
    item.sub.event === "whenAttacking" || item.sub.event === "whenOpponentAttacks";
  for (const item of [...engine.parkedEntrySubTriggers, ...engine.pendingWindowSubTriggers]) {
    if (isAttackWatcher(item)) engine.consumedSubTriggerKeys.add(subTriggerIdentity(item.sub, item.ctx.trigger));
  }
  engine.parkedEntrySubTriggers = engine.parkedEntrySubTriggers.filter((item) => !isAttackWatcher(item));
  engine.pendingWindowSubTriggers = engine.pendingWindowSubTriggers.filter((item) => !isAttackWatcher(item));
}

/**
 * Is engine armed watcher still activatable RIGHT NOW? A pending trigger whose condition stops
 * being met before it activates can no longer activate (CR §15-4-4-5): two copies of Hina
 * Kurihara EX3-065 both trigger on one digivolution, but if the first one's resolution removes
 * the evolved Digimon, the second has nothing to react to (KB Q3430). Re-checked between
 * resolutions — the SubTrigger bus gets engine for free by evaluating `matches` at fire time.
 */
export function subTriggerStillActivatable(engine: GameEngine, item: ArmedSubTrigger): boolean {
  return subTriggerStillPending(engine, item) && subTriggerHasLegalOutcome(item);
}

/**
 * Is the watcher's trigger still pending, regardless of whether its body could do anything right
 * now? A pending pool keeps a watcher only while this holds, and the resolver retires for the
 * rest of the window any effect that drops out of its pool once (CR §15-4-4-5).
 */
export function subTriggerStillPending(engine: GameEngine, item: ArmedSubTrigger): boolean {
  if (item.activationStarted === true || subTriggerOccurrenceResolved(item)) return false;
  if (
    (item.sub.isInheritedSource === true || item.sub.isLinkedSource === true) &&
    !pendingWatcherSourceStillResident(engine, item)
  )
    return false;
  const ctx = item.contextAtFireTime();
  if (ctx === undefined) return false;
  if (item.sub.matches !== undefined && !item.sub.matches(ctx)) return false;
  if (oncePerTurnSpentByAnotherOccurrence(engine, item)) return false;
  return item.sub.canFire === undefined || item.sub.canFire(ctx);
}

function subTriggerOccurrenceResolved(item: ArmedSubTrigger): boolean {
  return item.occurrence.resolvedWatcherKeys.has(resolvedWatcherKey(item.sub, item.ctx.trigger));
}

function resolvedWatcherKey(sub: SubTriggerSubscription, trigger: TriggerInfo): string {
  // Anonymous subscriptions with identical prose can still be independent effects.
  // Printed OPT watchers need the stable identity that survives continuous recomputes.
  return sub.oncePerTurnKey === undefined ? `subscription/${sub.id}` : subTriggerIdentity(sub, trigger);
}

/**
 * Lacking a legal outcome is not a lapsed trigger condition: another simultaneous effect that
 * resolves first can still create one (Q2889). Two inherited "may digivolve into a [Titan] card
 * in the trash" watchers trigger on one hand trash; the first digivolves into Plutomon, whose
 * [When Digivolving] then trashes the only card the second watcher can digivolve into.
 */
function subTriggerHasLegalOutcome(item: ArmedSubTrigger): boolean {
  const ctx = item.contextAtFireTime();
  return ctx !== undefined && (item.sub.hasLegalOutcome === undefined || item.sub.hasLegalOutcome(ctx));
}

/**
 * Once-per-turn siblings share only their own event occurrence. When a different occurrence
 * consumed the live ledger, this one can no longer activate; the per-occurrence success set is
 * what distinguishes an allowed same-event sibling from a later event or group.
 */
function oncePerTurnSpentByAnotherOccurrence(engine: GameEngine, item: ArmedSubTrigger): boolean {
  const oncePerTurnKey = item.sub.oncePerTurnKey;
  return (
    oncePerTurnKey !== undefined &&
    engine.tracker.count(oncePerTurnKey, "subtrigger") > 0 &&
    !item.occurrence.oncePerTurnSuccessfulKeys.has(oncePerTurnKey)
  );
}

/**
 * The condition clause of a watcher ("When effects trash cards from under this Tamer"), shown
 * beside the printed text the prompt displays. Only needed when that text is the whole printed
 * clause, which may list several conditions that each pend separately.
 */
function triggerReasonOf(sub: SubTriggerSubscription): { triggerReason?: string } {
  if (sub.printedClause === undefined || sub.description === undefined) return {};
  const condition = /^\s*(when\b[^,]*)/i.exec(sub.description)?.[1]?.trim();
  return condition === undefined ? {} : { triggerReason: condition };
}

/**
 * What players read for a watcher: its printed clause, else its description unless that is
 * engine bookkeeping ("whenPlayed"), in which case the card's one watcher line or a sentence
 * naming the trigger and the card.
 */
export function playerFacingWatcherClause(sub: SubTriggerSubscription, ctx: EffectContext): string {
  if (sub.printedClause !== undefined) return sub.printedClause;
  const description = subTriggerDescriptionFor(sub, ctx);
  if (!isInternalDescription(description)) return description;
  const definition = ctx.source.definition;
  const box =
    sub.isLinkedSource === true
      ? definition.linkEffect
      : sub.isInheritedSource === true
        ? definition.inheritedEffectText
        : definition.effectText;
  if (sub.isLinkedSource === true && sub.event === "whenLinked") {
    const clause = soleLinkingClause(box);
    if (clause !== undefined) return clause;
  }
  const optionSideLine =
    sub.isLinkedSource === true || sub.isInheritedSource === true
      ? undefined
      : soleWatcherLine(definition.optionEffect);
  return soleWatcherLine(box) ?? optionSideLine ?? `${triggerLabel(sub.event)}: ${definition.nameEn}`;
}

/** Present a watcher to the ordering prompt as an ordinary collected effect. */
export function subTriggerAsCollected(engine: GameEngine, { sub, ctx, occurrence }: ArmedSubTrigger): CollectedEffect {
  return {
    source: ctx.source,
    activationIdentity: occurrence,
    ...(sub.event === "onDeletionOf" ||
    sub.event === "whenLeavesPlay" ||
    sub.event === "whenLinked" ||
    sub.event === "whenAnyDigivolves" ||
    sub.event === "whenOneOfYoursDigivolves"
      ? { triggerOccurrence: subTriggerIdentity(sub, ctx.trigger) }
      : {}),
    watcherEventIdentity: subTriggerIdentity(sub, ctx.trigger),
    ...(sub.orderedByTurnPlayer === true ? { orderingSeat: engine.state.turnSeat } : {}),
    // The stack resolver re-creates a context for every collected effect. Carry the event
    // snapshot along with engine watcher so placement guards and action filters see the same
    // exact payload that armed it (especially a stack source already moved to trash).
    triggerInfo: ctx.trigger,
    discardedStackSourceProof: ctx.discardedStackSourceProof,
    timingLabel: sub.event,
    printedTiming: sub.printedTiming,
    ...triggerReasonOf(sub),
    effect: {
      effectKey: buildSubTriggerEffectKey(sub),
      decisionSummary: sub.decisionSummary,
      activationDeferred: sub.activationDeferred,
      ...(sub.activationContext !== undefined &&
      sub.sourcePermanentId === undefined &&
      sub.sourceInstanceId === undefined
        ? { isActivatedConsequence: true }
        : {}),
      description: playerFacingWatcherClause(sub, ctx),
      optional: false,
      isInherited: sub.isInheritedSource === true || ctx.discardedStackSourceProof !== undefined,
      isSecurity: false,
      isLinked: sub.isLinkedSource === true,
      maxPerTurn: -1,
      canTrigger: () => true,
      canActivate: () => true,
      resolve: sub.run,
    },
  };
}

/**
 * Announce a watcher body as it starts, the way the effect stack announces the printed
 * effects it resolves (`resolutionDeps.onResolving`). A watcher IS a triggered effect: it can
 * stop the game to ask its controller for a choice, and the players are owed the clause that
 * asked before the wait — a security-removal reaction ("when your opponent's security stack is
 * removed from") activates mid-check, so without engine the board simply froze on the check with
 * nothing said. Watchers folded into a timing window are announced by the resolver instead, so
 * that path passes no announcer and neither announces twice.
 */
export function announceSubTrigger(
  engine: GameEngine,
  sub: SubTriggerSubscription,
  ctx: EffectContext | undefined,
): void | (() => void) {
  if (ctx === undefined) return;
  const effectKey = buildSubTriggerEffectKey(sub);
  ctx.activeEffectKey = effectKey;
  let announced = false;
  const presentation = observeEffectActivation(ctx, sub.activationDeferred === true, () => {
    const announcementKey = `${engine.state.turnCount}:${effectKey}`;
    if (sub.oncePerTurnKey !== undefined && engine.announcedSubTriggerEffectKeys.has(announcementKey)) return;
    if (sub.oncePerTurnKey !== undefined) engine.announcedSubTriggerEffectKeys.add(announcementKey);
    announced = true;
    const description = playerFacingWatcherClause(sub, ctx);
    engine.hooks.emit({
      kind: "effectTriggered",
      seat: ctx.source.ownerSeat,
      sourceCardId: ctx.source.cardId,
      sourceInstanceId: ctx.source.instanceId,
      sourcePermanentId: ctx.source.permanent()?.permanentId,
      effectKey,
      description,
      timing: sub.event,
      ...(sub.printedTiming !== undefined ? { printedTiming: sub.printedTiming } : {}),
      ...(sub.isInheritedSource === true ? { isInherited: true } : {}),
      // `securityChecked` closes the check AFTER these bodies have run, so the client needs
      // engine to hold the announcement until the checked card's reveal has been shown.
      ...(engine.securityCheckDepth > 0 ? { duringSecurityCheck: true } : {}),
    });
  });
  return () => {
    presentation.restore();
    if (!announced) return;
    const description = playerFacingWatcherClause(sub, ctx);
    engine.hooks.emit({
      kind: "effectResolved",
      seat: ctx.source.ownerSeat,
      sourceCardId: ctx.source.cardId,
      sourceInstanceId: ctx.source.instanceId,
      sourcePermanentId: ctx.source.permanent()?.permanentId,
      effectKey,
      description,
      timing: sub.event,
      ...(sub.isInheritedSource === true ? { isInherited: true } : {}),
    });
  };
}

/**
 * A watcher that triggered but stayed without a legal outcome is never offered, and declining
 * it would leave its [Once Per Turn] unused (KB Q1818), so it opens no effect lifecycle. The
 * log still owes the players a line, or the trigger looks ignored (Discord 1557481090870939840).
 */
function announceWithoutLegalOutcome(engine: GameEngine, item: ArmedSubTrigger): void {
  const ctx = item.contextAtFireTime();
  if (ctx === undefined) return;
  const { sub } = item;
  engine.hooks.emit({
    kind: "effectHadNoEffect",
    seat: ctx.source.ownerSeat,
    sourceCardId: ctx.source.cardId,
    sourceInstanceId: ctx.source.instanceId,
    sourcePermanentId: ctx.source.permanent()?.permanentId,
    effectKey: buildSubTriggerEffectKey(sub),
    description: playerFacingWatcherClause(sub, ctx),
    timing: sub.event,
    ...(sub.isInheritedSource === true ? { isInherited: true } : {}),
  });
}

/**
 * Run one armed watcher. `contextAtFireTime` decides which board it sees: the immediate path
 * rebuilds the context now (so `fireSnapshot`'s own `matches` re-check can still drop a watcher
 * whose condition lapsed), while the deferred paths hand back the context bound when their
 * event happened, because their trigger has already activated (KB Q2611/Q2629).
 */
export async function fireOneSubTrigger(
  engine: GameEngine,
  item: ArmedSubTrigger,
  opts: {
    announce?: boolean;
    drainCurrentTimingWindow?: () => Promise<void>;
    presetOptionalAnswer?: boolean;
    onActivationChosen?: () => void;
    isActivationPending?: () => boolean;
  } = {},
): Promise<void> {
  if (item.activationStarted === true) return;
  // A forced attack drains the enclosing pending pool reentrantly. Retire this
  // exact activation before its body runs; shared OPT sibling clauses still
  // have separate armed entries and retain their own resolution.
  item.activationStarted = true;
  const { sub, ctx: armedContext, contextAtFireTime, occurrence } = item;
  // Nested attack windows can resolve a watcher held in an enclosing pool. That pool may
  // restore its earlier array afterwards; the shared OPT success key permits sibling action
  // paths, but must never reactivate the exact body that already resolved (Discord 1556798361435373630).
  const watcherKey = resolvedWatcherKey(sub, armedContext.trigger);
  if (occurrence.resolvedWatcherKeys.has(watcherKey)) return;
  occurrence.resolvedWatcherKeys.add(watcherKey);
  if (engine.subTriggerWindowDepth > 0)
    engine.consumedSubTriggerKeys.add(subTriggerIdentity(sub, armedContext.trigger));
  const drainCurrentTimingWindow = opts.drainCurrentTimingWindow;
  await engine.subTriggers.fireSnapshot(
    [sub],
    () => {
      const ctx = contextAtFireTime();
      if (ctx !== undefined) {
        ctx.activeEffectKey = buildSubTriggerEffectKey(sub);
      }
      if (ctx !== undefined && drainCurrentTimingWindow !== undefined) {
        ctx.drainCurrentTimingWindow = drainCurrentTimingWindow;
      }
      if (ctx !== undefined && opts.onActivationChosen !== undefined) {
        ctx.onActivationChosen = opts.onActivationChosen;
        ctx.isActivationPending = opts.isActivationPending;
      }
      if (ctx !== undefined && opts.presetOptionalAnswer !== undefined) {
        ctx.presetOptionalAnswer = opts.presetOptionalAnswer;
      }
      return ctx;
    },
    occurrence.windowToken,
    subTriggerTurnLedger(engine),
    undefined,
    opts.announce === false ? undefined : (fired, ctx) => announceSubTrigger(engine, fired, ctx),
    occurrence.oncePerTurnSnapshotKeys,
    occurrence.oncePerTurnSuccessfulKeys,
  );
}

/**
 * Anchor a watcher's context on its OWN source permanent (so its body's "engine Digimon" and
 * controller scope resolve correctly) with the event `payload` in `ctx.trigger`. Preserves the
 * exact card that installed the watcher: for an inherited effect whose source card is later
 * trashed from the host's stack, the body still means "engine card", not the host's current top
 * card. Returns undefined — skipping the watcher — when its anchor has left the field (the
 * subscription should already have been dropped on leave; guard defensively) or when the
 * breeding-area rule hides the event's subject from it.
 */
export function buildSubTriggerContext(
  engine: GameEngine,
  sub: SubTriggerSubscription,
  payload: TriggerInfo,
): EffectContext | undefined {
  const context = buildSubTriggerSourceContext(engine, sub, payload);
  if (context === undefined) return undefined;
  context.activeSingleHandCostBenefit = undefined;
  context.activeDecisionSummary = sub.decisionSummary;
  context.activeDecisionSelectionGoal = undefined;
  return breedingHidesSubjectFrom(engine, sub.event, payload, context.source) ? undefined : context;
}

/**
 * Preserve the placement proof for an inherited source that was just discarded from a live
 * host. The normal inherited placement guard intentionally rejects an off-field source; these
 * three discard events are the only seams that carry an exact stack-card identity after the
 * move. Enrich only the bound context (never the shared payload) and require the card to be in
 * trash and the event subject to be the anchored host, so a returned/unrelated card cannot be
 * resurrected as an inherited effect.
 */
export function discardedStackSourceContextPayload(
  engine: GameEngine,
  sub: SubTriggerSubscription,
  payload: TriggerInfo,
): { payload: TriggerInfo; proof: DiscardedStackSourceProof } | undefined {
  const sourceInstanceId = sub.sourceInstanceId;
  if (sourceInstanceId === undefined) return undefined;
  if (
    sub.event !== "onDigiBurstCardDiscarded" &&
    sub.event !== "onDigivolutionCardsDiscardedBatch" &&
    sub.event !== "onDigivolutionCardDiscarded"
  )
    return undefined;
  if (payload.subjectPermanentId === undefined) return undefined;
  const activatesFromDiscardedCard =
    sub.watchesSelf === true &&
    sub.sourcePermanentId === undefined &&
    payload.trashedDigivolutionHost?.permanentId === payload.subjectPermanentId &&
    payload.trashedDigivolutionHost.stack.some((card) => card.instanceId === sourceInstanceId);
  if (!activatesFromDiscardedCard && engine.access.permanentById(payload.subjectPermanentId) === undefined) {
    return undefined;
  }
  if (sub.sourcePermanentId !== undefined && payload.subjectPermanentId !== sub.sourcePermanentId) return undefined;
  const listed =
    sub.event === "onDigivolutionCardDiscarded"
      ? payload.trashedDigivolutionInstanceId === sourceInstanceId
      : (payload.trashedDigivolutionInstanceIds ?? []).includes(sourceInstanceId);
  if (!listed || rootZoneOfLooseInstance(engine.state, sourceInstanceId) !== "trash") return undefined;
  return {
    payload,
    proof: { sourceInstanceId, hostPermanentId: payload.subjectPermanentId, activatesFromDiscardedCard },
  };
}

export function buildSubTriggerSourceContext(
  engine: GameEngine,
  sub: SubTriggerSubscription,
  payload: TriggerInfo,
): EffectContext | undefined {
  if (sub.sourcePermanentId !== undefined) {
    const srcPerm = engine.access.permanentById(sub.sourcePermanentId);
    if (srcPerm?.topCard === undefined) return undefined;
    const sourceInstance = [srcPerm.topCard, ...srcPerm.stack, ...srcPerm.linked].find(
      (card) => card.instanceId === sub.sourceInstanceId,
    );
    if (sub.sourceInstanceId !== undefined && sourceInstance === undefined) {
      // A stack-card watcher can retain the host as its lifecycle anchor while its printed
      // source has just moved to trash. Rebind only to the exact card named by engine discard
      // event; a generic loose-zone lookup here would resurrect unrelated/returned cards.
      const discarded = discardedStackSourceContextPayload(engine, sub, payload);
      if (discarded === undefined) return undefined;
      const discardedSource = findLooseInstance(engine, sub.sourceInstanceId);
      if (discardedSource === undefined) return undefined;
      const context = buildEffectContext(engine, cardSourceOf(engine, discardedSource), discarded.payload);
      context.discardedStackSourceProof = discarded.proof;
      return context;
    }
    return buildEffectContext(engine, cardSourceOf(engine, sourceInstance ?? srcPerm.topCard), payload);
  }
  if (sub.sourceInstanceId !== undefined) {
    // `findLooseInstance` searches EVERY zone, so the zone recorded at install time is the
    // only thing keeping a trash/hand/security watcher from firing after its card moved
    // (CR §15-4-4-3; KB Q2671, Q2805). Checked before the lookup so a security card flipped
    // face-down — which `findLooseInstance` simply stops seeing — still latches as departed.
    // A hand-resident watcher for "when engine card is trashed from your hand" activates
    // because its source JUST moved from hand to trash. Preserve that one event's source
    // through context construction; every later event still observes the departed hand
    // root and drops the watcher normally.
    const activatesFromItsOwnHandTrash =
      sub.event === "whenTrashedFromHand" && payload.trashedFromHandInstanceId === sub.sourceInstanceId;
    if (!activatesFromItsOwnHandTrash && looseSourceLeftInstallZone(engine, sub, sub.sourceInstanceId))
      return undefined;
    const loose = findLooseInstance(engine, sub.sourceInstanceId);
    if (loose === undefined) return undefined;
    const discarded = discardedStackSourceContextPayload(engine, sub, payload);
    const context = buildEffectContext(engine, cardSourceOf(engine, loose), discarded?.payload ?? payload);
    if (discarded !== undefined) context.discardedStackSourceProof = discarded.proof;
    return context;
  }
  if (sub.activationContext !== undefined) {
    const context = {
      ...sub.activationContext,
      trigger: payload,
      selections: new Map(),
    };
    engine.runtimeObjects.track({ value: context, key: EngineRuntimeObjectKind.EFFECT_CONTEXT.value });
    return context;
  }
  return undefined;
}

/**
 * Has engine loose-anchored watcher's source card left the root zone it was installed from?
 * CR §15-4-4-3 (KB Q2671, Q2805): the card must still be in the trash, still in the hand, or
 * still in security AND face-up — otherwise the pending effect can no longer activate.
 *
 * Only a zone-resident watcher carries a recorded zone (see `SubTriggerSubscription`'s
 * `sourceRootZone`); everything else is never dropped by engine check — an already-activated
 * effect's one-shot consequence (Q1495), a source in no nameable zone (§9-1-4), and a
 * permanent-anchored watcher, whose lifecycle `dropPermanent` already owns.
 *
 * Departure LATCHES: once observed, the watcher stays dead even if the card returns, so a
 * trash -> hand -> trash round trip inside one window cannot revive it (§15-4-4-3) — the same
 * one-way semantics as `everCollected`/`departed` in `effects/stack.ts`. Like those sets, engine
 * can only observe moves that happen BETWEEN context builds: a move made and undone inside a
 * single effect body is invisible to it (see the note in `stack.test.ts`).
 */
export function looseSourceLeftInstallZone(
  engine: GameEngine,
  sub: SubTriggerSubscription,
  sourceInstanceId: string,
): boolean {
  if (sub.sourceRootZone === undefined) return false;
  if (sub.sourceRootZoneDeparted === true) return true;
  if (rootZoneOfLooseInstance(engine.state, sourceInstanceId) === sub.sourceRootZone) return false;
  sub.sourceRootZoneDeparted = true;
  return true;
}

/**
 * Fire a DEFERRED snapshot: watchers whose event already happened but whose activation waited
 * for the resolving effect (a security removal) or the rule fixpoint to finish. They are still
 * simultaneous triggers of one event, so several of them are ordered by their controller just
 * like an immediate fire.
 */
export async function fireSubTriggerSnapshot(
  engine: GameEngine,
  subscriptions: readonly SubTriggerSubscription[],
  payload: TriggerInfo,
  boundContexts?: ReadonlyMap<number, EffectContext>,
): Promise<void> {
  const armed = armedSubTriggers(engine, subscriptions, payload, boundContexts);
  if (engine.activeWindowToken === undefined && armed.length > 0) {
    await runPendingTimingWindow(engine, armedAsPendingCollected(engine, armed));
    await fireContextlessSubTriggers(engine, subscriptions, payload);
  } else if (armed.length > 1) {
    await runSubTriggersInChosenOrder(engine, armed);
  } else {
    await engine.subTriggers.fireSnapshot(
      subscriptions,
      (sub) => boundContexts?.get(sub.id) ?? buildSubTriggerContext(engine, sub, payload),
      engine.effectBodyTokens.at(-1) ?? engine.activeWindowToken,
      subTriggerTurnLedger(engine),
      (sub) => engine.consumedSubTriggerKeys.has(subTriggerIdentity(sub, payload)),
      (sub, ctx) => announceSubTrigger(engine, sub, ctx),
    );
  }
  await engine.recomputeContinuousEffects();
}

/**
 * Comprehensive Rules §3-4-5-6: "Trigger conditions can't be met by cards in breeding areas,
 * except for effects that explicitly specify or reference breeding areas." Its own example is
 * a Tamer's "[Your Turn] When your Digimon digivolves, by suspending engine Tamer, <Draw 1>",
 * which does NOT trigger off a breeding-area digivolution (KB Q870/Q1038; Q4428: only the word
 * "field" spans both areas, "your Digimon" is the battle area alone).
 *
 * The engine still FIRES the digivolve/play/place-under events for a breeding-area subject —
 * a [Breeding] effect on the breeding permanent itself legitimately watches them — so the rule
 * is enforced per WATCHER: one whose source is not itself in the breeding area cannot see a
 * breeding-area subject, and is skipped exactly like a watcher whose source left the field.
 */
export function breedingHidesSubjectFrom(
  engine: GameEngine,
  event: SubTriggerEventName,
  payload: TriggerInfo,
  watcherSource: CardSource,
): boolean {
  if (BREEDING_SUBJECT_EVENTS.has(event)) return false;
  const subjectId = payload.subjectPermanentId;
  if (subjectId === undefined) return false;
  if (engine.access.permanentById(subjectId)?.inBreeding !== true) return false;
  return watcherSource.isOnBreedingArea?.() !== true;
}
