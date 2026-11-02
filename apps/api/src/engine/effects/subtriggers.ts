import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";
import type { RuntimeReferenceRegistry } from "#api/engine/snapshot/RuntimeReferenceRegistry";
import type { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import type { SubTriggerRegistryState } from "#api/engine/effects/SubTriggerRegistryState";
import type { RuntimeCallbackRegistry } from "#api/engine/snapshot/RuntimeCallbackRegistry";
import type { RuntimeGraphSnapshot } from "#api/engine/snapshot/RuntimeGraphSnapshot";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { decodeRuntimeGraph } from "#api/engine/snapshot/decodeRuntimeGraph";
import type { DecisionEffectSummary } from "@aegis/shared/protocol/DecisionEffectSummary";
import {
  type CardDefinition,
  type Condition,
  type Permanent,
  type PreventionKeyword,
  type Seat,
  type ZoneRef,
} from "@aegis/shared";
import type { EffectContext, RemovalCause, ReplacementEventName, SubTriggerEventName } from "./EffectContext.js";
import { effectProvenanceKinds } from "./effectProvenance.js";
import type { KeywordReactionId } from "#api/engine/effects/KeywordReaction";

export type ReplacementId = number | KeywordReactionId;

type RegisteredReplacement = ReplacementSubscription & { id: number };

/**
 * Sub-trigger / delayed-effect + replacement registry
 * (subsystem: delayed-and-rule-effects).
 *
 * Many cards arm a FUTURE effect from within a resolving effect: "When this
 * Digimon attacks, draw 1", "When this Digimon would leave the battle area, play
 * it from its digivolution cards instead". source these were registered as
 * delayed/auto effects on a per-permanent or global list and fired by
 * the engine when the matching event happened (or consulted as a replacement
 * before the event). This module is the TS analogue: a subscription store the
 * resolver consults at the relevant event.
 *
 * It is a REAL mechanism — a subscription survives in authoritative server-only
 * state and its `run`/`replace` body is dispatched when the engine fires the
 * matching event — not a silent no-op. The engine wiring that fires these at the
 * concrete event points (attack declared, permanent would leave play, ...) is the
 * combat / turn-state-machine seam; the interpreter installs subscriptions here so
 * the shapes are captured and executable once those seams call `fireSubTrigger` /
 * `consultReplacement`.
 */

/**
 * The zones a LOOSE (permanent-less) watcher source can keep residing in: trash, hand, or
 * face-up security — the three places a card with no Permanent can still show an effect.
 */
export type SubTriggerRootZone = "trash" | "hand" | "security";

/** A delayed/triggered sub-effect installed during resolution. */
export interface SubTriggerSubscription {
  decisionSummary?: DecisionEffectSummary;
  id: number;
  identicalInstallOrdinal?: number;
  event: SubTriggerEventName;
  attackRedirectTargetIds?: (ctx: EffectContext) => string[];
  attackRedirectRequiresSelfSuspend?: boolean;
  /** Printed timing of the clause that installed this watcher. */
  printedTiming?: string;
  /** The printed clause this watcher implements, for players; identity and prompts keep `description`. */
  printedClause?: string;
  /** The watcher body reports an accepted processing choice before its first result. */
  activationDeferred?: boolean;
  /** Public text of a temporary effect granted to this watcher's permanent. */
  grantedEffectText?: string;
  /** Server-resolved standing badge exposed while this granted watcher remains installed. */
  publicBadge?: "attackAtStartOfMainPhase";
  /** Effect provenance used to suppress the badge while its recipient is unaffected. */
  publicBadgeGrantingSeat?: Seat;
  publicBadgeSourceKinds?: ("Digimon" | "Option")[];
  /** Stable action identity used to collapse duplicate installs without collapsing
   * distinct clauses that intentionally share one once-per-turn budget. */
  dedupeKey?: string;
  /** Printed placement class of the effect that installed this watcher. */
  isInheritedSource?: boolean;
  isLinkedSource?: boolean;
  /**
   * The clause watches its own source ("when THIS Digimon is deleted"), not a class of
   * permanents that merely includes it ("when one of your [Chessmon] is deleted").
   */
  watchesSelf?: boolean;
  /** Permanent this subscription is anchored to (its source), when applicable. */
  sourcePermanentId?: string;
  /**
   * Anchor for a hand/trash-resident source with no live Permanent. See
   * {@link SubTriggerInstall.sourceInstanceId}. When both are present, the
   * permanent anchors the subscription lifecycle while the instance preserves
   * the printed source card (including an inherited card in a stack).
   */
  sourceInstanceId?: string;
  /**
   * The root zone the LOOSE source card occupied when this watcher was installed. Recorded only
   * for a CONTINUOUS install whose sole anchor is `sourceInstanceId` — the zone-resident family
   * (`{Trash}` / `[Your Turn]` / `[All Turns]` on a permanent-less card), where the watcher IS
   * the effect's pending trigger and Q5728 confines it to its zone. CR §15-4-4-3: a pending
   * effect whose source card changed zone "becomes a new card" and can no longer activate —
   * KB Q2671 (BT16-082), Q2805 (BT17-050). The engine compares this at activation time in
   * `GameEngine.buildSubTriggerSourceContext`.
   *
   * Absent => not zone-gated. Either no zone was nameable at install (a resolving Option holds
   * no zone at all, §9-1-4), or the install is a one-shot consequence of an effect that has
   * ALREADY activated, which stays live wherever its card ends up (Q1495 — BT6-111/BT23-028
   * arm `whenSecurityBattleEnded` and fire once the card has reached the trash).
   */
  sourceRootZone?: SubTriggerRootZone;
  /**
   * Latched the first time the engine observes the source card outside `sourceRootZone`.
   * A departed watcher stays dead even if the card comes back (trash -> hand -> trash inside
   * one window), which is the revival §15-4-4-3 exists to forbid — the same one-way semantics
   * as the window-scoped `everCollected`/`departed` sets in `stack.ts`.
   */
  sourceRootZoneDeparted?: boolean;
  /**
   * Live resolution context retained by a player-scoped, duration-limited watcher whose
   * source card no longer needs to remain in a zone (for example, an Option granting an
   * effect to all of its controller's Digimon for the turn, including Digimon that enter
   * later). The engine refreshes only `trigger` when the event fires; `game`, `fx`, `ask`,
   * and the activating source/controller remain the authoritative live objects captured at
   * resolution. Mutually exclusive with the two lifecycle anchors in normal use.
   */
  activationContext?: EffectContext;
  /** True for a one-shot sub-trigger that unsubscribes after it first fires. */
  once: boolean;
  /** The body to run when the event fires (bound to a fresh ctx by the engine). */
  run: (ctx: EffectContext) => Promise<void>;
  /**
   * Per-install predicate gating the FIRED event ("when you play a GREEN TAMER",
   * "when a [Puppet] Digimon is deleted"). Evaluated by `fire` against the freshly
   * bound context carrying the event payload (the played/deleted/linked card in
   * `ctx.trigger`). Absent => the subscription fires for every event of its type
   * (the unfiltered events, e.g. "when this attacks"). Carries the `action.sourceFilter`
   * captured at subscription time — dropping it would make a filtered watcher fire on
   * every event of its kind (RESEARCH BLK-01 "Model gap" / Pitfall 2).
   */
  matches?: (ctx: EffectContext) => boolean;
  /** Live activation gate, checked both before ordering and immediately before firing. */
  canFire?: (ctx: EffectContext) => boolean;
  /**
   * Whether the body has any legal outcome. Unlike `canFire`, this is never read when the
   * event arms the watcher: a deletion arms its watchers while the deleted card is still on
   * the field, so a body that uses that card from the trash has no outcome yet. A watcher that
   * fails it stays pending, because an earlier simultaneous effect may still make it activatable
   * (an unsuspended source for a "by suspending this Digimon" cost, Q4101). It is read when the
   * watcher is offered for ordering and immediately before it fires.
   */
  hasLegalOutcome?: (ctx: EffectContext) => boolean;
  /**
   * For a GRANTED timed watcher: the seat whose
   * turn-END drops this subscription. Absent => the watcher persists until its anchor leaves
   * the field (the usual `dropPermanent` teardown). Swept by `sweepExpired`.
   */
  expiresOnTurnEndOf?: Seat;
  /**
   * This watcher is PENDING PROCESSING scheduled by an effect that has already activated (a
   * delayed deletion), not an effect its source's controller activates now. §15-4-3-5 splits
   * simultaneous ACTIVATED effects turn-player-first; the rulings for a delayed end-of-turn
   * deletion (KB Q5564/Q5566/Q5568) instead put the whole simultaneous set, this deletion
   * included, in the TURN PLAYER's hands whoever controls the deleted Digimon. Ordering only:
   * the body still resolves with its own source and controller.
   */
  orderedByTurnPlayer?: boolean;
  appliesOnEntry?: boolean;
  /**
   * Produced by a PERSISTENT (static / `[Breeding]` / `EffectTiming.None`) effect that the
   * continuous-recompute pass re-derives every time it runs. The recompute clears these via
   * `clearContinuous` and re-installs them fresh, so they never accumulate. A one-shot install
   * from a triggered window (OnPlay / WhenDigivolving) is NOT continuous — it is recorded once
   * and lives until its anchor leaves the field or its `expiresOnTurnEndOf` boundary. Mirrors
   * ContinuousEffectLedger's `continuous` flag.
   */
  continuous?: boolean;
  /**
   * When true, the subscription fires at most ONCE per TIMING WINDOW — even when the
   * underlying event fires via several separate `fire()` calls belonging to the same
   * window (e.g. two same-named Digimon entering via token creation, each of which
   * fires its own "whenPlayed" call; KB Q2814 for BT2-053 says both plays "at the same
   * time during a single timing" trigger the inherited effect only once). The guard is
   * scoped by the `windowToken` a caller passes to `fire()` (see {@link
   * SubTriggerRegistry.fire}): calls sharing the SAME token dedupe against each other;
   * a later, genuinely distinct window (a different/absent token) fires again.
   */
  oncePerTiming?: boolean;
  /**
   * Stable identity for an `oncePerTiming` watcher that is cleared and reinstalled by
   * continuous recomputation inside the same timing window. Subscription ids are intentionally
   * fresh on each install, so persistent effects must provide this key to preserve the dedupe.
   */
  oncePerTimingIdentity?: string;
  /**
   * A stable per-TURN key gating this watcher to fire at most once per turn — the
   * printed `[Once Per Turn]` on a persistent (`[All Turns]` / `EffectTiming.None`)
   * effect's watcher. Unlike `oncePerTiming` (scoped to one resolving window) this is
   * scoped to the whole turn and, critically, must be a string STABLE across the
   * continuous-recompute pass that clears and reinstalls this subscription (its `id`
   * is NOT stable across recomputes — use the source cardId + an effect tag, e.g.
   * `${cardId}/effect-name`). Without this, a persistent effect's declared `maxPerTurn`
   * on its installing `staticModifier` only gates how often the INSTALL runs (which the
   * engine deliberately doesn't count for `EffectTiming.None` — see `GameEngine`'s
   * `EffectTiming.None` comment), not how often the installed watcher's `run` fires;
   * the watcher itself would fire unboundedly within the turn. Enforced by `fire` via
   * the per-turn ledger the caller supplies.
   */
  oncePerTurnKey?: string;
  /** Human description (log / diagnostics). */
  description: string;
}

/**
 * Told that a watcher body is about to run, once every gate has passed. A watcher is a
 * triggered effect and can stop the game to ask its controller something, so the caller uses
 * this to announce it to the players the way the effect stack announces the effects it
 * resolves. Called immediately before the body, never for a watcher that was skipped.
 */
/** Announces a watcher and may return the callback that closes its presentation after resolution. */
export type SubTriggerAnnounce = (sub: SubTriggerSubscription, ctx: EffectContext | undefined) => void | (() => void);

/** The per-turn firing ledger `fire` consults/updates for `oncePerTurnKey`-gated watchers. */
export interface SubTriggerTurnLedger {
  /** True when `key` has already fired a watcher this turn. */
  hasFired(key: string): boolean;
  /** Record that `key` fired a watcher this turn. */
  markFired(key: string): void;
  /** Undo a provisional mark when a printed optional activation was declined. */
  unmarkFired?(key: string): void;
}

/** Fields common to every mode of an installed replacement subscription. */
export interface ReplacementSubscriptionBase {
  id: ReplacementId;
  event: ReplacementEventName;
  sourcePermanentId?: string;
  /**
   * Anchor for a hand/trash-resident source with no live Permanent, mirroring
   * {@link SubTriggerSubscription.sourceInstanceId}. When both are present, the permanent anchors
   * the subscription lifecycle while the instance preserves the printed source card.
   */
  sourceInstanceId?: string;
  /** Stable compiled effect/action identity. Description is display text and must not identify rules uses. */
  activationIdentity?: string;
  /** The keyword a successful "prevent" names to the players (a ＜Delay＞ Option saving a Digimon). */
  preventionKeyword?: PreventionKeyword;
  /** Stable key used to consume a persistent replacement at most once in a turn. */
  oncePerTurnKey?: string;
  /**
   * The qualifier on the removal CAUSE this reaction watches. The consult passes the actual
   * cause + the seat whose effect drove the removal; `causeAllows` decides whether this
   * reaction may fire (e.g. "by an opponent's effect" must NOT fire on the controller's own
   * deletion). Absent => the reaction fires regardless of cause.
   */
  causeAllows?: (
    cause: RemovalCause,
    resolvingSeat: Seat | undefined,
    isBounce: boolean,
    destination?: ZoneRef,
  ) => boolean;
  /** Skip this replacement for the player-action material relocation in DigiXros. */
  exceptDigiXros?: boolean;
  /**
   * Produced by a PERSISTENT (static / `[Breeding]`) effect re-derived each continuous-recompute
   * pass. Cleared by `clearContinuous` and re-installed fresh so a Static/[Breeding] `reduceCost`
   * does not accumulate (N, 2N, 3N…) across the multiple recomputes per turn. A one-shot install
   * from a triggered window is NOT continuous. Mirrors ContinuousEffectLedger's `continuous` flag.
   */
  continuous?: boolean;
  /** Turn whose end expires a triggered, seat-scoped replacement. */
  expiresOnTurnEndOf?: Seat;
  description: string;
}

/** "reduceCost" returns a cost delta at the matching cost-computation seam; cannot prevent a removal. */
export interface ReplacementSubscriptionReduceCost extends ReplacementSubscriptionBase {
  mode: "reduceCost";
  /** Reinstallation of a resident clause, rather than a newly earned triggered grant. */
  residentReduction?: boolean;
  amount?: number;
  /** Mutually-exclusive reductions selected when this replacement is activated. */
  amountChoices?: { amount: number; condition?: Condition; raw?: string }[];
  /** Read-only projection of the currently eligible mutually-exclusive amount choice. */
  potentialAmount?: (target: Permanent, into: CardDefinition) => number;
  /**
   * Reduction computed from the card being digivolved INTO, for the forms that scale with a
   * property of the destination (e.g. "-1 for each of its colors"). Takes precedence over
   * `amount` whenever the destination is known.
   */
  amountForInto?: (def: CardDefinition) => number;
  /**
   * For mode "reduceCost" + event "wouldDigivolve": predicate gating the reduction to only
   * when the card being digivolved INTO satisfies this check. Absent ⇒ applies to all targets.
   */
  intoMatches?: (def: CardDefinition) => boolean;
  /**
   * Optional target predicate when `sourcePermanentId` is only the lifecycle anchor.
   * `baseAsDigimon` is the Digimon a Tamer digivolves as ("as if it is a level N Digimon",
   * KB Q1157), when the digivolving permanent is such a Tamer.
   */
  appliesTo?: (target: Permanent, originZone?: ZoneRef, baseAsDigimon?: CardDefinition) => boolean;
  /** For ＜Digisorption＞ redirect (BT3-056): the reduction's suspend cost targets the
   * OPPONENT's Digimon instead of the controller's. See `ReplacementInstallReduceCost`. */
  digisorptionRedirect?: boolean;
  /** Seat allowed to consume a triggered, non-permanent cost reduction. */
  controllerSeat?: Seat;
  /** Live context retained by one-shot reducers whose source is no longer a permanent. */
  activationContext?: EffectContext;
  /** Printed timing/provenance retained for an interactive reducer opened at play time. */
  activationTiming?: string;
  activationEffectText?: string;
  /** Interactive cost gate paid immediately before the memory cost is calculated. */
  activate?: (
    ctx: EffectContext,
    target: Permanent,
    into: CardDefinition,
    evolvingInstanceId?: string,
    materials?: readonly Permanent[],
    baseAsDigimon?: CardDefinition,
  ) => Promise<boolean | number>;
  /** Remove this replacement after its first successful activation. */
  consumeOnActivate?: boolean;
}

/** Memory gained after this source permanent is consumed as a successful DNA material. */
export interface ReplacementSubscriptionDnaMemory extends ReplacementSubscriptionBase {
  mode: "gainMemoryOnDna";
  amount: number;
  intoMatches?: (def: CardDefinition) => boolean;
  /** Printed timing of the installing clause, replayed as the label on its announcement. */
  activationTiming?: string;
}

/** One matched DNA memory reward, kept separate so each can be announced on its own material. */
export interface DnaMemoryGain {
  sourcePermanentId: string;
  amount: number;
  description: string;
  activationIdentity?: string;
  timing?: string;
}

/**
 * "instead": consulted by `leavePrevention.ts` alongside "prevent" — see `apply` below. Cannot
 * prevent a removal; runs a substitute side-effect body without gating whether the leave itself
 * happens (Comprehensive Rules §16-36 ＜Decode＞).
 */
export interface ReplacementSubscriptionInstead extends ReplacementSubscriptionBase {
  mode: "instead";
  /**
   * The reaction's body. REQUIRED — a `mode: "instead"` entry with no `apply` used to
   * typecheck and then be silently dropped by the consult (which only ran "prevent" entries
   * via `isPreventReplacement`), so the reaction never fired. Making the field mandatory turns
   * that class of bug into a compile error instead of a runtime no-op (see
   * `ReplacementSubscriptionPrevent`).
   */
  apply: (ctx: EffectContext) => Promise<void | boolean>;
  /** Does this reaction apply to `leavingPermanentId`? Absent => applies whenever the event
   * fires for the anchored source (self-reaction shape, e.g. ＜Decode＞). */
  appliesTo?: (ctx: EffectContext, leavingPermanentId: string) => boolean;
  /** Predicate for a pending `wouldBePlayed` target, which has no live permanent id yet. */
  appliesToPending?: (ctx: EffectContext, target: Permanent) => boolean;
  /** Stable per-turn key gating this reaction to ONCE PER TURN (BT20-091 "[Once Per Turn]"). */
  oncePerTurnKey?: string;
}

/**
 * "prevent": consulted by `leavePrevention.ts` when a permanent would leave/be deleted.
 * `preventCheck` is REQUIRED — a `mode: "prevent"` entry with no `preventCheck` used to
 * typecheck and then be silently dropped by the consult's `r.preventCheck !== undefined`
 * filter, so the reaction never ran. Making the field mandatory here turns that class of bug
 * into a compile error instead of a runtime no-op (see `ReplacementInstallPrevent`).
 */
export interface ReplacementSubscriptionPrevent extends ReplacementSubscriptionBase {
  mode: "prevent";
  /**
   * Does this replacement protect the permanent `leavingPermanentId` from leaving/being
   * deleted? (self-reaction => only its own source; a filtered reaction => any matching
   * permanent.) Evaluated by the engine's leave-prevention consult.
   */
  protects?: (ctx: EffectContext, leavingPermanentId: string) => boolean;
  /**
   * Prompt the controller and pay the prevention cost. Returns true when the removal of
   * `leavingPermanentId` is prevented (the cost was paid / the choice made).
   */
  preventCheck: (ctx: EffectContext, leavingPermanentId: string) => Promise<boolean>;
  preventOneOf?: (ctx: EffectContext, candidatePermanentIds: readonly string[]) => Promise<string | undefined>;
  /** Prevents ALL matching permanents on one activation ("they don't leave"). */
  affectsAll?: boolean;
  /**
   * Not offered once an earlier reaction already prevented this leave: ＜Evade＞ asks only
   * while the Digimon would still be deleted.
   */
  yieldsToEarlierPrevention?: boolean;
  /**
   * A stable per-turn key gating a printed [Once Per Turn] prevention effect. The consult skips the reaction when this key has already
   * prevented a removal this turn, and records the key after a successful prevent. The key
   * must be stable across the continuous re-derivation that re-installs the subscription (use
   * the source permanentId + an effect tag), and it resets with the per-turn use ledger.
   */
  oncePerTurnKey?: string;
}

/**
 * "redirect": consulted by `digivolutionTrashRedirect.ts` BEFORE a digivolution-card trash
 * selects which cards to take, swapping only the host permanent so the trashing site's own
 * top/bottom/choose/amount selection logic re-runs unmodified against the new host — see
 * `ReplacementInstallRedirect` (EffectContext.ts) for the full rationale. `redirectTo` is
 * REQUIRED for the same reason `preventCheck`/`apply` are on the sibling modes: a mode with no
 * body used to typecheck and then be silently dropped by the consult.
 */
export interface ReplacementSubscriptionRedirect extends ReplacementSubscriptionBase {
  mode: "redirect";
  /** Is every one of the operation's target hosts eligible for this reaction? */
  appliesTo?: (ctx: EffectContext, originalHostPermanentId: string) => boolean;
  /** Prompt the controller; returns the alternate host permanentId, or undefined when declined. */
  redirectTo: (ctx: EffectContext, originalHostPermanentIds: string[]) => Promise<string | undefined>;
}

export type ReplacementSubscription =
  | ReplacementSubscriptionReduceCost
  | ReplacementSubscriptionDnaMemory
  | ReplacementSubscriptionInstead
  | ReplacementSubscriptionPrevent
  | ReplacementSubscriptionRedirect;

/** Narrows a `ReplacementSubscription` to the "prevent" variant (with a real `preventCheck`). */
export function isPreventReplacement(r: ReplacementSubscription): r is ReplacementSubscriptionPrevent {
  return r.mode === "prevent";
}

/** Narrows a `ReplacementSubscription` to the "instead" variant (with a real `apply`). */
export function isInsteadReplacement(r: ReplacementSubscription): r is ReplacementSubscriptionInstead {
  return r.mode === "instead";
}

/** Narrows a `ReplacementSubscription` to the "redirect" variant (with a real `redirectTo`). */
export function isRedirectReplacement(r: ReplacementSubscription): r is ReplacementSubscriptionRedirect {
  return r.mode === "redirect";
}

/**
 * `Omit<Union, K>` does NOT distribute over a union's members — `keyof` a union is the
 * INTERSECTION of its members' keys, so `Omit<ReplacementSubscription, "id">` would collapse
 * to only the fields common to every mode, silently erasing `preventCheck`/`protects`/etc.
 * This distributes Omit member-by-member instead, preserving the discriminated union.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type SnapshotParams = {
  callbacks?: RuntimeCallbackRegistry;
  objects?: RuntimeObjectRegistry;
  references?: RuntimeReferenceRegistry;
};
type RestoreParams = {
  snapshot: RuntimeGraphSnapshot;
  callbacks?: RuntimeCallbackRegistry;
  objects?: RuntimeObjectRegistry;
  references?: RuntimeReferenceRegistry;
};

export class SubTriggerRegistry {
  private subs: SubTriggerSubscription[] = [];
  private replacements: RegisteredReplacement[] = [];
  private seq = 0;
  private activeResolutionDepth = 0;
  /**
   * The `windowToken` each `oncePerTiming` subscription last fired for (by subscription
   * id). Persists ACROSS `fire()` calls — unlike the rest of this registry's per-call
   * locals — so a subscription that already fired for windowToken W is skipped on a
   * later `fire()` call that shares W, and fires again once a genuinely different (or
   * absent) windowToken is passed. See {@link fire}.
   */
  private oncePerTimingFiredFor = new Map<number | string, unknown>();
  /**
   * [Once Per Turn] reducers whose activation is still paying its cost. The turn ledger is only
   * marked once `activate` returns, so a digivolution nested inside that cost would otherwise
   * be offered the same reducer again (BT25-087 Thomas H. Norstein, Discord 1555674174369042583).
   */
  private readonly activatingOncePerTurnKeys = new Set<string>();

  getRuntimeState(): SubTriggerRegistryState {
    this.assertSnapshotBoundary();
    return {
      subscriptions: this.subs,
      replacements: this.replacements,
      sequence: this.seq,
      oncePerTimingFiredFor: this.oncePerTimingFiredFor,
    };
  }

  snapshot({ callbacks, objects, references }: SnapshotParams = {}): RuntimeGraphSnapshot {
    return encodeRuntimeGraph({
      value: this.getRuntimeState(),
      describeCallback: callbacks?.describe.bind(callbacks),
      describeObject: objects?.describe.bind(objects),
      references,
    });
  }

  restore({ snapshot, callbacks, objects, references }: RestoreParams): void {
    this.assertSnapshotBoundary();
    this.restoreRuntimeState(
      decodeRuntimeGraph({
        snapshot,
        createCallback: callbacks?.create.bind(callbacks),
        objects,
        references,
      }),
    );
  }

  restoreRuntimeState(state: unknown): void {
    this.assertSnapshotBoundary();
    if (!isSubTriggerRegistryState(state)) {
      throw new Error("Invalid subtrigger registry snapshot");
    }
    this.subs = state.subscriptions;
    this.replacements = state.replacements;
    this.seq = state.sequence;
    this.oncePerTimingFiredFor = state.oncePerTimingFiredFor;
  }

  private assertSnapshotBoundary(): void {
    if (this.activeResolutionDepth !== 0 || this.activatingOncePerTurnKeys.size > 0) {
      throw new Error("Cannot snapshot or restore during a subtrigger resolution or cost payment");
    }
  }

  private oncePerTimingKey(sub: SubTriggerSubscription): number | string {
    return sub.oncePerTimingIdentity ?? sub.id;
  }

  /**
   * Install a delayed/triggered sub-effect. Returns its id (for manual removal).
   *
   * Throws when the subscription can NEVER fire: a `matches` predicate needs a bound
   * `ctx` to evaluate against, which requires an anchor (`sourcePermanentId` or
   * `sourceInstanceId`, or a retained `activationContext`); with none, `fire()` can only take the genuinely
   * anchor-less no-context path, which itself requires `matches` to be absent — so
   * "has `matches`, has no anchor" is a structurally dead subscription (the eighth
   * engine gap, the corresponding regression coverage). This used to
   * typecheck and then silently never fire; failing loudly at install time turns
   * that class of bug into an immediate crash instead of a mystery.
   */
  subscribe(sub: Omit<SubTriggerSubscription, "id" | "identicalInstallOrdinal">): number {
    if ("activationContext" in sub && sub.activationContext !== undefined) {
      sub.activationContext.game?.runtimeObjects?.track({
        value: sub.activationContext,
        key: EngineRuntimeObjectKind.EFFECT_CONTEXT.value,
      });
    }
    if (
      sub.matches !== undefined &&
      sub.sourcePermanentId === undefined &&
      sub.sourceInstanceId === undefined &&
      sub.activationContext === undefined
    ) {
      throw new Error(
        `SubTriggerRegistry.subscribe: "${sub.description}" installs a \`matches\` gate for event ` +
          `"${sub.event}" with no sourcePermanentId AND no sourceInstanceId — this subscription can ` +
          `never resolve a context and would silently never fire. Anchor it to the installing card's ` +
          `permanent/instance or retain the activating resolution context.`,
      );
    }
    if (sub.oncePerTurnKey !== undefined) {
      const existing = this.subs.find(
        (candidate) =>
          candidate.event === sub.event &&
          candidate.oncePerTurnKey === sub.oncePerTurnKey &&
          (candidate.dedupeKey ?? "") === (sub.dedupeKey ?? ""),
      );
      if (existing !== undefined) return existing.id;
    }
    const id = this.seq++;
    const ordinal = this.findFreeIdenticalInstallOrdinal(sub);
    this.subs.push({ ...sub, id, ...(ordinal > 1 ? { identicalInstallOrdinal: ordinal } : {}) });
    return id;
  }

  private findFreeIdenticalInstallOrdinal(sub: Omit<SubTriggerSubscription, "id">): number {
    const taken = new Set(
      this.subs
        .filter(
          (candidate) =>
            candidate.oncePerTurnKey === undefined &&
            candidate.event === sub.event &&
            candidate.sourcePermanentId === sub.sourcePermanentId &&
            candidate.sourceInstanceId === sub.sourceInstanceId &&
            candidate.dedupeKey === sub.dedupeKey &&
            candidate.description === sub.description,
        )
        .map((candidate) => candidate.identicalInstallOrdinal ?? 1),
    );
    let ordinal = 1;
    while (taken.has(ordinal)) {
      ordinal += 1;
    }
    return ordinal;
  }

  /** Install a replacement effect. Returns its id. */
  subscribeReplacement(sub: DistributiveOmit<ReplacementSubscription, "id">): number {
    if ("activationContext" in sub && sub.activationContext !== undefined) {
      sub.activationContext.game?.runtimeObjects?.track({
        value: sub.activationContext,
        key: EngineRuntimeObjectKind.EFFECT_CONTEXT.value,
      });
    }
    // Only interactive cost reductions can be consumed after activation. Narrow both
    // discriminated unions before reading that mode-specific field; DNA-memory, instead,
    // prevent, and redirect replacements intentionally do not carry it.
    const subConsumesOnActivate = sub.mode === "reduceCost" && sub.consumeOnActivate === true;
    // A declined resident cost remains installed between payment windows. Only explicit
    // registration provenance makes it reusable: printed timing also labels triggered grants.
    const residentReduction = sub.mode === "reduceCost" && sub.residentReduction === true;
    const existingIndex = this.replacements.findIndex(
      (replacement) =>
        replacement.event === sub.event &&
        replacement.mode === sub.mode &&
        replacement.sourcePermanentId === sub.sourcePermanentId &&
        replacement.sourceInstanceId === sub.sourceInstanceId &&
        sub.activationIdentity !== undefined &&
        (!subConsumesOnActivate || residentReduction) &&
        (!(replacement.mode === "reduceCost" && replacement.consumeOnActivate === true) ||
          (residentReduction && replacement.residentReduction === true)) &&
        replacement.activationIdentity === sub.activationIdentity,
    );
    const existing = this.replacements[existingIndex];
    if (existing !== undefined) {
      // A resident reduction is re-derived in every payment window, and its amount is a
      // snapshot of the board at registration ("reduce by 1 for each of this Digimon's
      // digivolution cards"). Keeping the earlier window's record would charge the old count
      // (BT13-007 paid for 1 source while holding 2), so the fresh derivation replaces it.
      if (residentReduction && existing.mode === "reduceCost" && existing.residentReduction === true) {
        this.replacements[existingIndex] = { ...sub, id: existing.id } as RegisteredReplacement;
      }
      return existing.id;
    }
    const id = this.seq++;
    // The spread below loses the sub/mode correlation TS tracks on the discriminated union
    // (it widens to the members' common shape) — `sub`'s own type already guarantees the
    // mode-specific fields (e.g. `preventCheck` on "prevent") are present, so re-assert it.
    this.replacements.push({ ...sub, id } as RegisteredReplacement);
    return id;
  }

  /** Active subscriptions for an event (optionally filtered to a source permanent). */
  subscriptionsFor(event: SubTriggerEventName, sourcePermanentId?: string): SubTriggerSubscription[] {
    return this.subs.filter(
      (s) =>
        s.event === event &&
        s.appliesOnEntry !== true &&
        (sourcePermanentId === undefined || s.sourcePermanentId === sourcePermanentId),
    );
  }

  entryGrants(): SubTriggerSubscription[] {
    return this.subs.filter((s) => s.appliesOnEntry === true);
  }

  /** Active granted effects anchored to a permanent, for its public inspector. */
  grantedEffectTextsFor(permanentId: string): string[] {
    return this.subs
      .filter((sub) => sub.sourcePermanentId === permanentId && sub.grantedEffectText !== undefined)
      .map((sub) => sub.grantedEffectText!);
  }

  /**
   * Fire every subscription matching `event` (and, when given, `sourcePermanentId`),
   * running each body with a freshly bound context the engine supplies. A subscription
   * carrying a `matches` predicate is skipped when that predicate returns false for the
   * fired event's payload (the captured `sourceFilter` gate — e.g. "a GREEN Tamer"); a
   * subscription without `matches` always fires. One-shot subscriptions are removed
   * after they fire. Returns how many actually ran (post-filter), not how many were
   * subscribed.
   *
   * @param windowToken Identifies the caller's notion of "one timing window" for
   *   `oncePerTiming` subscriptions (KB Q2814 / BT2-053): when TWO separate `fire()`
   *   calls for the same event pass the SAME `windowToken` (e.g. both plays of "play 2
   *   Diaboromon Tokens" tagged with that single resolving effect's identity), an
   *   `oncePerTiming` subscription runs at most once across both calls. Omitted (or a
   *   fresh value each call) means every call is its own window, so the subscription
   *   fires on each call that matches — this is the caller's responsibility to wire; the
   *   registry only enforces dedup for callers that supply a stable, shared token.
   * @param turnLedger Backs `oncePerTurnKey` gating (the printed `[Once Per Turn]` on a
   *   persistent effect's watcher). Omitted => `oncePerTurnKey` is not enforced (callers
   *   that never install such watchers need not wire it).
   */
  async fire(
    event: SubTriggerEventName,
    makeContext: (sub: SubTriggerSubscription) => EffectContext | undefined,
    sourcePermanentId?: string,
    windowToken?: unknown,
    turnLedger?: SubTriggerTurnLedger,
    skip?: (sub: SubTriggerSubscription) => boolean,
    announce?: SubTriggerAnnounce,
  ): Promise<number> {
    const matching = this.subscriptionsFor(event, sourcePermanentId);
    return this.fireSnapshot(matching, makeContext, windowToken, turnLedger, skip, announce);
  }

  /**
   * Fire subscriptions captured at the moment their event happened. Once an event has created a
   * pending trigger, a continuous-effect recompute must not erase it before the current effect
   * finishes resolving (BT6-044's security-trash cost followed by its six-card reveal).
   */
  async fireSnapshot(
    matching: readonly SubTriggerSubscription[],
    makeContext: (sub: SubTriggerSubscription) => EffectContext | undefined,
    windowToken?: unknown,
    turnLedger?: SubTriggerTurnLedger,
    skip?: (sub: SubTriggerSubscription) => boolean,
    announce?: SubTriggerAnnounce,
    oncePerTurnSnapshotKeys?: ReadonlySet<string>,
    oncePerTurnSuccessfulKeys?: Set<string>,
  ): Promise<number> {
    this.activeResolutionDepth++;
    try {
      let fired = 0;
      const successfulOncePerTurnKeys = oncePerTurnSuccessfulKeys ?? new Set<string>();
      // A snapshot represents one event. Capture shared [Once Per Turn] budget once at entry so
      // distinct action-path clauses with the same key can all resolve in this event; the ledger
      // remains authoritative for every later event. GameEngine passes its ordered-window capture
      // explicitly because those bodies resolve through separate fireSnapshot calls.
      const snapshotKeys =
        oncePerTurnSnapshotKeys ??
        new Set(
          matching
            .filter((sub) => sub.oncePerTurnKey !== undefined && !turnLedger?.hasFired(sub.oncePerTurnKey))
            .map((sub) => sub.oncePerTurnKey!)
            .filter((key, index, keys) => keys.indexOf(key) === index),
        );
      for (const sub of matching) {
        // Already resolved by the caller: the timing window that shares this event resolved it
        // through the same ledgers (GameEngine.withPendingSubTriggers). Filtered here rather than
        // by pre-filtering the caller's list, so the await chain reaching a body is unchanged.
        if (skip?.(sub) === true) continue;
        // oncePerTiming: skip when this subscription already fired for the SAME window
        // (persists across fire() calls, unlike a per-call local — see oncePerTimingFiredFor).
        if (
          sub.oncePerTiming &&
          windowToken !== undefined &&
          this.oncePerTimingFiredFor.get(this.oncePerTimingKey(sub)) === windowToken
        ) {
          continue;
        }
        // oncePerTurnKey: skip when this (stable, recompute-surviving) key already fired a
        // watcher this turn.
        if (
          sub.oncePerTurnKey !== undefined &&
          turnLedger?.hasFired(sub.oncePerTurnKey) &&
          !snapshotKeys.has(sub.oncePerTurnKey)
        )
          continue;
        // A watcher whose anchor source has left the field yields no context — skip it
        // (its subscription should already have been dropped on leave; this is a guard).
        const ctx = makeContext(sub);
        if (ctx === undefined) {
          // An ANCHOR-LESS delayed one-shot (no sourcePermanentId, no sourceInstanceId)
          // deliberately survives its installer's deletion (BT1-021's end-of-turn memory
          // loss; KB Q882: the effect "has already activated"). It needs no bound context and
          // carries no payload predicate, so run its body directly. Anchored watchers (either
          // form) keep the skip-on-missing-anchor guard instead — `subscribe()` guarantees a
          // `matches`-bearing sub always has one of the two anchors, so this branch is reached
          // by that combination only when it is the intentional, contextless BT1-021 shape.
          if (sub.sourcePermanentId === undefined && sub.sourceInstanceId === undefined && sub.matches === undefined) {
            this.markFired(sub, windowToken, turnLedger);
            const resolved = announce?.(sub, undefined);
            await sub.run(undefined as unknown as EffectContext);
            resolved?.();
            if (sub.oncePerTurnKey !== undefined) successfulOncePerTurnKeys.add(sub.oncePerTurnKey);
            fired += 1;
          }
          continue;
        }
        if (sub.matches !== undefined && !sub.matches(ctx)) {
          continue;
        }
        // A lone watcher bypasses the ordering path, so its live activation gates must also be
        // enforced here. Otherwise a self-suspending Tamer that is still suspended announces an
        // activation its body then fails to pay for.
        if (sub.canFire !== undefined && !sub.canFire(ctx)) continue;
        if (sub.hasLegalOutcome !== undefined && !sub.hasLegalOutcome(ctx)) continue;
        this.markFired(sub, windowToken, turnLedger);
        const resolved = announce?.(sub, ctx);
        // Every triggered watcher is an effect resolution. Keep the resolving seat/kinds on
        // the same stack used by ordinary timing effects so nested verbs retain effect
        // provenance (for example, a Tamer's PlaceUnder must publish byEffectSeat).
        const sourceKinds = effectProvenanceKinds(ctx, { isLinked: sub.isLinkedSource });
        ctx.effectSourceKinds = sourceKinds;
        ctx.fx?.enterEffectResolution?.(ctx.source.ownerSeat, sourceKinds, ctx.source.permanent?.()?.permanentId);
        try {
          await sub.run(ctx);
        } finally {
          ctx.fx?.leaveEffectResolution?.();
        }
        resolved?.();
        if (
          sub.oncePerTurnKey !== undefined &&
          ctx.oncePerTurnActivationDeclined === true &&
          ctx.oncePerTurnActivationChosen !== true
        ) {
          // A shared same-event snapshot may contain several action-path clauses. A declined
          // sibling rolls back only its provisional mark; once any sibling has succeeded, the
          // shared [Once Per Turn] budget must remain consumed even with a Set-backed ledger that
          // cannot represent multiple provisional marks.
          if (!successfulOncePerTurnKeys.has(sub.oncePerTurnKey)) turnLedger?.unmarkFired?.(sub.oncePerTurnKey);
          ctx.oncePerTurnActivationDeclined = false;
        } else if (sub.oncePerTurnKey !== undefined) {
          successfulOncePerTurnKeys.add(sub.oncePerTurnKey);
        }
        fired += 1;
      }
      return fired;
    } finally {
      this.activeResolutionDepth--;
    }
  }

  /**
   * Record that `sub` has fired. Called BEFORE its body runs, not after: a watcher body
   * can re-enter `fire()` for its own event (EX4-012's [Once Per Turn] "when an opponent's
   * Digimon is deleted, delete their highest-DP Digimon" runs a Delete, and
   * `deletePermanent` fires `onDeletionOf` over each subject while it is still a live
   * permanent). Marking afterwards leaves every gate open for the whole nested chain, so
   * the watcher re-fires itself without bound — unbounded ASYNC recursion, which allocates
   * on the heap instead of overflowing the stack and so exhausts the process rather than
   * throwing. A watcher has fired the moment its body starts, so marking here is also the
   * semantically correct point.
   */
  private markFired(
    sub: SubTriggerSubscription,
    windowToken: unknown,
    turnLedger: SubTriggerTurnLedger | undefined,
  ): void {
    if (sub.oncePerTiming && windowToken !== undefined) {
      this.oncePerTimingFiredFor.set(this.oncePerTimingKey(sub), windowToken);
    }
    if (sub.oncePerTurnKey !== undefined) turnLedger?.markFired(sub.oncePerTurnKey);
    if (sub.once) this.subs = this.subs.filter((s) => s.id !== sub.id);
  }

  /**
   * The net play/digivolve cost reduction from active replacement effects.
   * @param into For `wouldDigivolve`: the definition of the card being digivolved
   *   INTO. Replacements that carry an `intoMatches` predicate apply only when this
   *   definition satisfies it. Absent (or absent `intoMatches`) ⇒ no filtering.
   */
  costReductionFor(
    event: ReplacementEventName,
    source?: string | Permanent,
    into?: CardDefinition,
    turnBudget?: SubTriggerTurnLedger & { consume?: boolean },
  ): number {
    let sum = 0;
    const consumedKeys = new Set<string>();
    const consumedReplacementIds = new Set<number>();
    const sourcePermanentId = typeof source === "string" ? source : source?.permanentId;
    for (const r of this.replacements) {
      // Interactive reductions are activated by the pay-time play seam when a turn ledger is
      // supplied. A ledger-free registry read is also used as an observability/query seam for
      // resident replacements (including [Breeding] effects), where the installed reduction is
      // expected to be visible without consuming its once-per-turn activation.
      if (r.event !== event || r.mode !== "reduceCost" || (r.activate !== undefined && turnBudget !== undefined))
        continue;
      if (r.appliesTo !== undefined) {
        if (typeof source === "string") {
          if (r.sourcePermanentId !== source) continue;
        } else if (source === undefined || !r.appliesTo(source)) continue;
      } else if (sourcePermanentId !== undefined && r.sourcePermanentId !== sourcePermanentId) continue;
      if (r.intoMatches !== undefined && into !== undefined && !r.intoMatches(into)) continue;
      if (r.oncePerTurnKey !== undefined && turnBudget?.hasFired(r.oncePerTurnKey)) continue;
      const reduction = into !== undefined && r.amountForInto !== undefined ? r.amountForInto(into) : (r.amount ?? 0);
      sum += reduction;
      if (r.oncePerTurnKey !== undefined && reduction > 0) consumedKeys.add(r.oncePerTurnKey);
      if (r.consumeOnActivate === true && reduction > 0) consumedReplacementIds.add(r.id);
    }
    if (turnBudget?.consume === true) {
      for (const key of consumedKeys) turnBudget.markFired(key);
      if (consumedReplacementIds.size > 0) {
        this.replacements = this.replacements.filter((r) => !consumedReplacementIds.has(r.id));
      }
    }
    return sum;
  }

  /** Apply each global DNA cost modifier once when at least one material matches it. */
  dnaCostReductionFor(materials: readonly Permanent[], into: CardDefinition): number {
    return this.replacements.reduce((sum, replacement) => {
      if (replacement.event !== "wouldDigivolve" || replacement.mode !== "reduceCost") return sum;
      if (replacement.activate !== undefined) return sum;
      if (replacement.intoMatches !== undefined && !replacement.intoMatches(into)) return sum;
      if (replacement.appliesTo !== undefined) {
        return materials.some((material) => replacement.appliesTo!(material)) ? sum + (replacement.amount ?? 0) : sum;
      }
      return materials.some((material) => material.permanentId === replacement.sourcePermanentId)
        ? sum + (replacement.amount ?? 0)
        : sum;
    }, 0);
  }

  /** Memory rewards from material-anchored effects for a completed DNA digivolution, one per effect. */
  dnaMemoryGainsFor(materialPermanentIds: readonly string[], into: CardDefinition): DnaMemoryGain[] {
    const materials = new Set(materialPermanentIds);
    const gains: DnaMemoryGain[] = [];
    for (const replacement of this.replacements) {
      if (replacement.event !== "wouldDigivolve" || replacement.mode !== "gainMemoryOnDna") continue;
      if (replacement.sourcePermanentId === undefined || !materials.has(replacement.sourcePermanentId)) continue;
      if (replacement.intoMatches !== undefined && !replacement.intoMatches(into)) continue;
      gains.push({
        sourcePermanentId: replacement.sourcePermanentId,
        amount: replacement.amount,
        description: replacement.description,
        ...(replacement.activationIdentity === undefined ? {} : { activationIdentity: replacement.activationIdentity }),
        ...(replacement.activationTiming === undefined ? {} : { timing: replacement.activationTiming }),
      });
    }
    return gains;
  }

  /** Sum memory rewards from material-anchored effects for a completed DNA digivolution. */
  dnaMemoryGainFor(materialPermanentIds: readonly string[], into: CardDefinition): number {
    return this.dnaMemoryGainsFor(materialPermanentIds, into).reduce((sum, gain) => sum + gain.amount, 0);
  }

  /** Whether a passive reduction may affect pay-time affordability; does not consume it. */
  hasPassiveReductionsFor(event: ReplacementEventName): boolean {
    return this.replacements.some(
      (replacement) =>
        replacement.event === event && replacement.mode === "reduceCost" && replacement.activate === undefined,
    );
  }

  /** Read-only applicability check using the same target gates as play-time payment. */
  hasApplicablePlayReductions(
    seat: Seat,
    target: Permanent,
    into: CardDefinition,
    turnBudget: SubTriggerTurnLedger,
    originZone?: ZoneRef,
  ): boolean {
    return this.replacements.some((replacement) => {
      if (replacement.event !== "wouldBePlayed" || replacement.mode !== "reduceCost") return false;
      const interactive = replacement.activate !== undefined;
      if (interactive && replacement.controllerSeat !== seat) return false;
      if (replacement.oncePerTurnKey !== undefined && turnBudget.hasFired(replacement.oncePerTurnKey)) return false;
      if (replacement.appliesTo !== undefined) {
        if (!replacement.appliesTo(target, interactive ? originZone : undefined)) return false;
      } else if (
        (!interactive || replacement.sourcePermanentId !== undefined) &&
        replacement.sourcePermanentId !== target.permanentId
      )
        return false;
      return replacement.intoMatches === undefined || replacement.intoMatches(into);
    });
  }

  /** Potential reduction used only by the affordability gate before an interactive cost is paid. */
  hasInteractiveReductionsFor(event: ReplacementEventName, seat: Seat): boolean {
    return this.replacements.some(
      (replacement) =>
        replacement.event === event &&
        replacement.mode === "reduceCost" &&
        replacement.activate !== undefined &&
        replacement.controllerSeat === seat,
    );
  }

  hasInteractiveReductionForSource(
    event: ReplacementEventName,
    seat: Seat,
    sourceInstanceId: string,
    activationIdentityPrefix: string,
    turnBudget?: SubTriggerTurnLedger,
  ): boolean {
    return this.replacements.some(
      (replacement) =>
        replacement.event === event &&
        replacement.mode === "reduceCost" &&
        replacement.activate !== undefined &&
        replacement.controllerSeat === seat &&
        replacement.sourceInstanceId === sourceInstanceId &&
        replacement.activationIdentity?.startsWith(activationIdentityPrefix) === true &&
        (replacement.oncePerTurnKey === undefined || turnBudget?.hasFired(replacement.oncePerTurnKey) !== true),
    );
  }

  /** Potential reduction used only by the affordability gate before an interactive cost is paid. */
  potentialInteractiveReductionFor(
    event: ReplacementEventName,
    seat: Seat,
    target: Permanent,
    into: CardDefinition,
    turnBudget?: SubTriggerTurnLedger,
    originZone?: ZoneRef,
    baseAsDigimon?: CardDefinition,
  ): number {
    return this.replacements.reduce((sum, replacement) => {
      if (replacement.event !== event || replacement.mode !== "reduceCost") return sum;
      if (replacement.activate === undefined || replacement.controllerSeat !== seat) return sum;
      if (replacement.oncePerTurnKey !== undefined && turnBudget?.hasFired(replacement.oncePerTurnKey)) return sum;
      if (replacement.appliesTo !== undefined) {
        if (!replacement.appliesTo(target, originZone, baseAsDigimon)) return sum;
      } else if (replacement.sourcePermanentId !== undefined && replacement.sourcePermanentId !== target.permanentId)
        return sum;
      if (replacement.intoMatches !== undefined && !replacement.intoMatches(into)) return sum;
      return sum + (replacement.potentialAmount?.(target, into) ?? replacement.amount ?? 0);
    }, 0);
  }

  /** Pay and consume interactive reductions for the imminent digivolve. */
  async activateInteractiveReductionsFor(
    event: ReplacementEventName,
    seat: Seat,
    target: Permanent,
    into: CardDefinition,
    evolvingInstanceId: string | undefined,
    buildContext: (sourcePermanentId: string, sourceInstanceId?: string) => EffectContext | undefined,
    turnBudget?: SubTriggerTurnLedger,
    materials?: readonly Permanent[],
    originZone?: ZoneRef,
    baseAsDigimon?: CardDefinition,
  ): Promise<number> {
    this.activeResolutionDepth++;
    try {
      let reduction = 0;
      const consumed = new Set<number>();
      for (const replacement of this.replacements) {
        if (replacement.event !== event || replacement.mode !== "reduceCost") continue;
        if (replacement.activate === undefined || replacement.controllerSeat !== seat) continue;
        const oncePerTurnKey = replacement.oncePerTurnKey;
        if (
          oncePerTurnKey !== undefined &&
          (turnBudget?.hasFired(oncePerTurnKey) === true || this.activatingOncePerTurnKeys.has(oncePerTurnKey))
        )
          continue;
        if (replacement.appliesTo !== undefined) {
          if (!replacement.appliesTo(target, originZone, baseAsDigimon)) continue;
        } else if (replacement.sourcePermanentId !== undefined && replacement.sourcePermanentId !== target.permanentId)
          continue;
        if (replacement.intoMatches !== undefined && !replacement.intoMatches(into)) continue;
        const sourcePermanentId = replacement.sourcePermanentId;
        const ctx =
          sourcePermanentId === undefined
            ? replacement.activationContext
            : buildContext(sourcePermanentId, replacement.sourceInstanceId);
        if (ctx === undefined) continue;
        // Resident reducers survive a declined payment window. Their printed turn
        // restriction must still hold when a later play consults that subscription.
        // Triggered grants retain the duration established by their resolving effect.
        if (
          replacement.residentReduction === true &&
          ((replacement.activationTiming === "YourTurn" && ctx.game.state.turnSeat !== ctx.source.ownerSeat) ||
            (replacement.activationTiming === "OpponentsTurn" && ctx.game.state.turnSeat === ctx.source.ownerSeat))
        )
          continue;
        if (replacement.activationTiming !== undefined) ctx.activeTiming = replacement.activationTiming;
        if (replacement.activationEffectText !== undefined) ctx.activeEffectText = replacement.activationEffectText;
        if (oncePerTurnKey !== undefined) this.activatingOncePerTurnKeys.add(oncePerTurnKey);
        let activated: Awaited<ReturnType<typeof replacement.activate>>;
        try {
          activated = await replacement.activate(ctx, target, into, evolvingInstanceId, materials, baseAsDigimon);
        } finally {
          if (oncePerTurnKey !== undefined) this.activatingOncePerTurnKeys.delete(oncePerTurnKey);
        }
        if (!activated) {
          continue;
        }
        reduction += typeof activated === "number" ? activated : (replacement.amount ?? 0);
        if (oncePerTurnKey !== undefined) turnBudget?.markFired(oncePerTurnKey);
        if (replacement.consumeOnActivate === true) consumed.add(replacement.id);
      }
      if (consumed.size > 0)
        this.replacements = this.replacements.filter((replacement) => !consumed.has(replacement.id));
      return reduction;
    } finally {
      this.activeResolutionDepth--;
    }
  }

  /** Active "prevent"/"instead" replacements for an event. */
  replacementsFor(event: ReplacementEventName, sourcePermanentId?: string): ReplacementSubscription[] {
    return this.replacements.filter(
      (r) =>
        r.event === event &&
        r.mode !== "reduceCost" &&
        (sourcePermanentId === undefined || r.sourcePermanentId === sourcePermanentId),
    );
  }

  /** Resolve `instead` replacements at the pay-time `wouldBePlayed` seam. */
  async activateInsteadReplacementsFor(
    event: ReplacementEventName,
    target: Permanent | Permanent[],
    buildContext: (
      sourcePermanentId: string,
      sourceInstanceId?: string,
      targetInstanceId?: string,
    ) => EffectContext | undefined,
    turnBudget?: SubTriggerTurnLedger,
    onApplicable?: (replacement: ReplacementSubscriptionInstead, targetInstanceIds?: readonly string[]) => void,
  ): Promise<number> {
    this.activeResolutionDepth++;
    try {
      if (event !== "wouldBePlayed") return 0;
      const candidates = this.replacements.filter(
        (replacement): replacement is ReplacementSubscriptionInstead & { id: number } =>
          replacement.event === event && replacement.mode === "instead",
      );
      let activated = 0;
      const targets = Array.isArray(target) ? target : [target];
      for (const replacement of candidates) {
        const sourcePermanentId = replacement.sourcePermanentId;
        if (sourcePermanentId === undefined) continue;
        const qualifyingTargets: Permanent[] = [];
        const candidateInstanceIds = new Map<Permanent, string>();
        const candidateContexts = new Map<Permanent, EffectContext>();
        for (const candidate of targets) {
          const candidateContext = buildContext(
            sourcePermanentId,
            replacement.sourceInstanceId,
            candidate.topCard?.instanceId,
          );
          if (candidateContext === undefined) continue;
          candidateContexts.set(candidate, candidateContext);
          if (replacement.appliesToPending !== undefined && !replacement.appliesToPending(candidateContext, candidate))
            continue;
          if (
            replacement.appliesToPending === undefined &&
            replacement.appliesTo !== undefined &&
            !replacement.appliesTo(candidateContext, candidate.permanentId)
          )
            continue;
          qualifyingTargets.push(candidate);
          const candidateInstanceId =
            candidate.topCard?.instanceId ?? candidateContext.trigger?.wouldBePlayedInstanceId;
          if (candidateInstanceId !== undefined) candidateInstanceIds.set(candidate, candidateInstanceId);
        }
        if (qualifyingTargets.length === 0) continue;
        const qualifyingIds = qualifyingTargets
          .map((candidate) => candidateInstanceIds.get(candidate))
          .filter((id): id is string => id !== undefined);
        if (qualifyingIds.length === 0) continue;
        const ctx =
          candidateContexts.get(qualifyingTargets[0]!) ??
          buildContext(sourcePermanentId, replacement.sourceInstanceId, qualifyingIds[0]);
        if (ctx === undefined) continue;
        ctx.trigger = {
          ...(ctx.trigger ?? {}),
          wouldBePlayedInstanceId: qualifyingIds[0],
          wouldBePlayedInstanceIds: qualifyingIds,
        };
        onApplicable?.(replacement, qualifyingIds);
        if (replacement.oncePerTurnKey !== undefined && turnBudget?.hasFired(replacement.oncePerTurnKey)) continue;
        const result = await replacement.apply(ctx);
        if (result === false) continue;
        activated += 1;
        if (replacement.oncePerTurnKey !== undefined) turnBudget?.markFired(replacement.oncePerTurnKey);
      }
      return activated;
    } finally {
      this.activeResolutionDepth--;
    }
  }

  /** Drop every subscription anchored to a permanent (when it leaves the field). */
  dropPermanent(permanentId: string): void {
    for (const s of this.subs) {
      if (s.sourcePermanentId === permanentId) this.oncePerTimingFiredFor.delete(this.oncePerTimingKey(s));
    }
    this.subs = this.subs.filter((s) => s.sourcePermanentId !== permanentId);
    this.replacements = this.replacements.filter((r) => r.sourcePermanentId !== permanentId);
  }

  /**
   * Drop every GRANTED timed watcher whose `expiresOnTurnEndOf` seat's turn just ended
   *. Called by the engine's turn-end duration sweep,
   * mirroring the modifier/continuous ledgers' `sweep`. Watchers without an expiry are
   * untouched (they live until their anchor leaves the field).
   */
  sweepExpired(turnEndSeat: Seat): void {
    this.subs = this.subs.filter((s) => s.expiresOnTurnEndOf !== turnEndSeat);
    this.replacements = this.replacements.filter((r) => r.expiresOnTurnEndOf !== turnEndSeat);
  }

  /**
   * Drop every CONTINUOUS subscription (those re-derived by a persistent / static / `[Breeding]`
   * effect), leaving one-shot installs from triggered windows intact. Called at the start of the
   * engine's continuous-recompute pass so the static effects can be re-derived from a clean slate
   * without double-subscribing — mirroring `ContinuousEffectLedger.clearContinuous` and the
   * modifier ledger. Without this, a `Static`/`[Breeding]` `reduceCost` `Replacement` (and any
   * `SubTrigger` watcher) re-subscribes on every recompute and `costReductionFor` sums them to
   * N, 2N, 3N… across the multiple recomputes per turn. Granted/timed watchers (BT23-056's
   * `startOfYourMainPhase`, until-owner-turn-end installs) are NOT continuous and survive.
   */
  clearContinuous(): void {
    this.subs = this.subs.filter((s) => !s.continuous);
    this.replacements = this.replacements.filter((r) => !r.continuous);
  }

  /** Clear everything (fresh match). */
  reset(): void {
    this.subs = [];
    this.replacements = [];
    this.seq = 0;
    this.oncePerTimingFiredFor.clear();
  }
}

function isSubTriggerRegistryState(value: unknown): value is SubTriggerRegistryState {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const state = value as SubTriggerRegistryState;
  if (
    !Array.isArray(state.subscriptions) ||
    !Array.isArray(state.replacements) ||
    !(state.oncePerTimingFiredFor instanceof Map) ||
    !Number.isSafeInteger(state.sequence) ||
    state.sequence < 0
  ) {
    return false;
  }
  const identities = new Set<number>();
  for (const entry of [...state.subscriptions, ...state.replacements]) {
    if (
      entry === null ||
      typeof entry !== "object" ||
      !Number.isSafeInteger(entry.id) ||
      entry.id < 0 ||
      entry.id >= state.sequence ||
      identities.has(entry.id)
    ) {
      return false;
    }
    identities.add(entry.id);
  }
  return state.subscriptions.every((entry) => typeof entry.run === "function");
}
