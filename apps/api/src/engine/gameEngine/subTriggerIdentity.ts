import type { Permanent } from "@aegis/shared";
import { isTamer, lookupDefinition } from "../cards/cardData.js";
import type { EffectContext, TriggerInfo } from "../effects/EffectContext.js";
import type { SubTriggerSubscription } from "../effects/subtriggers.js";

/**
 * A watcher's identity ACROSS continuous recomputes. Every recompute clears the continuous
 * subscriptions and re-installs them, so `sub.id` is stable only within one recompute cycle;
 * the (event, anchor, description, per-turn identity) tuple is what distinguishes the same
 * watcher across reinstalls while preserving separately conferred copies (BT10-011 Q1943).
 */
export function subTriggerIdentity(sub: SubTriggerSubscription, trigger?: TriggerInfo): string {
  const identity = [
    sub.event,
    sub.sourcePermanentId ?? "",
    sub.sourceInstanceId ?? "",
    sub.description,
    sub.oncePerTurnKey ?? "",
    sub.dedupeKey ?? "",
  ].join("|");
  if (trigger !== undefined && sub.event === "whenLinked") {
    const linked = trigger.linkedCardInstanceIds ?? trigger.linkedInstanceIds ?? [];
    if (linked.length > 0)
      return `${identity}|link:${trigger.subjectPermanentId ?? ""}:${[...linked].sort().join(",")}`;
  }
  if (trigger !== undefined && (sub.event === "whenAnyDigivolves" || sub.event === "whenOneOfYoursDigivolves")) {
    if (trigger.digivolvedInstanceId !== undefined)
      return `${identity}|digivolve:${trigger.subjectPermanentId ?? ""}:${trigger.digivolvedInstanceId}`;
  }
  // Entry windows and their trailing bus publish the same play twice. Deduplicate
  // that publication, not every play inside the enclosing effect: a nested On Play
  // can play another Digimon while the original arrival watcher is still pending.
  if (trigger !== undefined && (sub.event === "whenPlayed" || sub.event === "onEnterFieldAnyone")) {
    const subjects = trigger.subjectPermanentIds ?? (trigger.subjectPermanentId ? [trigger.subjectPermanentId] : []);
    if (subjects.length > 0) return `${identity}|entry:${[...subjects].sort().join(",")}`;
  }
  // Deleting another permanent in a later effect is a new occurrence even when
  // both effects resolve inside the same outer timing window. A declined OPT has
  // not spent its turn budget; only republication of the same deletion is consumed.
  if (trigger !== undefined && (sub.event === "onDeletionOf" || sub.event === "whenLeavesPlay")) {
    const subject = trigger.deletedPermanentId ?? trigger.subjectPermanentId;
    if (subject !== undefined) return `${identity}|leave:${subject}`;
  }
  // Suspending another permanent later is a new occurrence too. An effect-ordered attack keeps
  // its ordering effect's window open, so without the subject a declined Vortexdramon trigger
  // on the attack's suspension also consumed its own block's suspension
  // (Discord 1557002713047502968). One suspend action publishes all its subjects in one event.
  if (trigger !== undefined && (sub.event === "whenSuspended" || sub.event === "whenEffectSuspends")) {
    const subjects =
      trigger.subjectPermanentIds ?? (trigger.suspendedPermanentId ? [trigger.suspendedPermanentId] : []);
    if (subjects.length > 0) return `${identity}|suspend:${[...subjects].sort().join(",")}`;
  }
  if (trigger?.securityRemovalEventId !== undefined && sub.event === "whenSecurityRemoved") {
    return `${identity}|securityRemovalEvent:${trigger.securityRemovalEventId}`;
  }
  if (trigger?.securityInstanceId !== undefined && sub.event === "whenSecurityRemoved") {
    return `${identity}|securityRemoved:${trigger.securityInstanceId}`;
  }
  if (trigger !== undefined && (sub.event === "whenHandTrashed" || sub.event === "whenTrashedFromHand")) {
    const trashed = trigger.handTrashedInstanceIds ?? [];
    if (trashed.length > 0)
      return `${identity}|handTrash:${trigger.handTrashedSeat ?? ""}:${[...trashed].sort().join(",")}`;
  }
  return identity;
}

/**
 * A single printed `[Once Per Turn]` watcher can observe several simultaneous subjects of one
 * effect (for example, MoonMillenniummon deletes two Tamers). They are separate bus events, but
 * they are not separate activations that the player may order: only one copy of that exact
 * watcher may enter the pending-trigger UI. Keep distinct action paths, which carry different
 * `dedupeKey`s, independently selectable for cards whose one printed OPT genuinely contains
 * multiple triggered clauses.
 */
export function uniqueOncePerTurnWatcherOccurrences(items: readonly ArmedSubTrigger[]): ArmedSubTrigger[] {
  const kept = new Map<string, ArmedSubTrigger>();
  const identityOf = (item: ArmedSubTrigger): string =>
    // A later Link or digivolution inside the same outer window is a new event.
    // Preserve it while an older occurrence waits; the OPT ledger still prevents
    // both from activating successfully in the same turn.
    subTriggerIdentity(
      item.sub,
      item.sub.event === "whenLinked" ||
        item.sub.event === "whenAnyDigivolves" ||
        item.sub.event === "whenOneOfYoursDigivolves" ||
        item.sub.event === "whenHandTrashed" ||
        item.sub.event === "whenTrashedFromHand"
        ? item.ctx.trigger
        : undefined,
    );
  for (const item of items) {
    if (item.sub.oncePerTurnKey === undefined) continue;
    const identity = identityOf(item);
    const earlier = kept.get(identity);
    const laterBattleWin =
      earlier !== undefined &&
      item.sub.event === "whenBattleWon" &&
      earlier.occurrence.windowToken !== item.occurrence.windowToken;
    if (earlier === undefined || laterBattleWin) kept.set(identity, item);
  }
  return items.filter((item) => item.sub.oncePerTurnKey === undefined || kept.get(identityOf(item)) === item);
}

/**
 * Whether the card directly beneath this permanent's top — the base it just digivolved from —
 * is a Tamer.
 *
 * KB Q6708 (BT23-101 Hudiemon, which may digivolve from a Tamer): "Digivolve from the Tamer as
 * such, and do not treat it as if it is a digivolving Digimon", so a watcher that reads "when a
 * Digimon digivolves" must not fire. The digivolving card's own [When Digivolving] window and
 * the digivolution bonus draw (Q6709) are unaffected — only the Digimon-digivolve watchers are.
 *
 * `stack` is ordered bottom..just-below-top (see `pushDigivolution`), so `at(-1)` is the base.
 */
export function digivolvedFromTamerBase(permanent: Permanent | undefined): boolean {
  const base = permanent?.stack.at(-1);
  if (base === undefined) return false;
  const definition = lookupDefinition(base.cardId);
  return definition !== undefined && isTamer(definition);
}

/**
 * A watcher's description as the players should read it. A player-scoped watcher tags its
 * description with the instance that installed it, so it can be told apart from the copy
 * conferred on another card; that tag is bookkeeping and never belongs in an announcement.
 */
export function subTriggerDescriptionFor(sub: SubTriggerSubscription, ctx: EffectContext): string {
  const tag = ` [${ctx.source.instanceId}]`;
  return sub.description.endsWith(tag) ? sub.description.slice(0, -tag.length) : sub.description;
}

/** A watcher that triggered, with the EffectContext bound at the moment its event fired. */
export interface ArmedSubTrigger {
  /** One pending activation, shared by every resolver that can see this occurrence. */
  activationStarted?: boolean;
  sub: SubTriggerSubscription;
  /** Context as of the event — what the ordering prompt is built from (controller, card). */
  ctx: EffectContext;
  /**
   * Context to run the body against, resolved when this watcher's turn actually comes. The
   * ordering prompt runs BETWEEN bodies, so an earlier body may have moved the board: a watcher
   * whose trigger condition stopped being met by then can no longer activate (CR §15-4-4-5), and
   * `fireSnapshot` drops it by re-checking `matches` against this fresh context. The deferred
   * paths pass the context bound when their event happened instead, because their trigger has
   * already activated (KB Q2611/Q2629).
   */
  contextAtFireTime: () => EffectContext | undefined;
  /** Unique occurrence captured by one `armedSubTriggers` call. */
  occurrence: {
    /** Identity of the causing body at trigger time, before a deferred watcher resolves. */
    windowToken?: number;
    /** Once-per-turn keys that were unused when this event snapshot was armed. */
    oncePerTurnSnapshotKeys: ReadonlySet<string>;
    /** Shared success ledger for ordered bodies resolving this same event snapshot. */
    oncePerTurnSuccessfulKeys: Set<string>;
    /** Exact watcher bodies already retired from this event, including declined activations. */
    resolvedWatcherKeys: Set<string>;
  };
  /**
   * The trash arrival of a source that this event just put in the trash ("when this card is
   * trashed from ..."). The watcher activates from the trash, so a different arrival means the
   * card left the trash while its trigger was pending (KB Q5160, Q6383, Q6396).
   */
  sourceTrashArrival?: number;
}
