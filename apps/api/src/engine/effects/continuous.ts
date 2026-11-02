import type { RuntimeReferenceRegistry } from "#api/engine/snapshot/RuntimeReferenceRegistry";
import type { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import type { ContinuousLedgerState } from "#api/engine/effects/ContinuousLedgerState";
import type { RuntimeCallbackRegistry } from "#api/engine/snapshot/RuntimeCallbackRegistry";
import type { RuntimeGraphSnapshot } from "#api/engine/snapshot/RuntimeGraphSnapshot";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { decodeRuntimeGraph } from "#api/engine/snapshot/decodeRuntimeGraph";
import {
  CardKind,
  EffectDuration,
  type CardColor,
  type CardDefinition,
  type GameState,
  type FieldEffectView,
  type Seat,
  type Keyword,
  type ZoneRef,
  nameIncludesToken,
} from "@aegis/shared";
import type { Restriction } from "./EffectContext.js";
import type { DurationBoundary } from "./modifiers.js";
import { clearsAt } from "./continuous/durations.js";
import type {
  AttackTargetRestriction,
  CanAttackUnsuspendedGrant,
  CannotIgnoreDigivolutionFlag,
  ColorGrant,
  ColorWaiver,
  DigivolveIntoConstraint,
  KeywordGrant,
  KindGrant,
  LinkCostReductionGrant,
  LinkMaxGrant,
  NameTraitGrant,
  OriginalCardInfoOverride,
  PlayerCustomEffectGrant,
  PlayerKeywordGrant,
  PlayerRestrictionEntry,
  RestrictionEntry,
  SecurityAddRestriction,
  SeatStackTrashLock,
  SecurityAttackInversion,
  StackCardTrashLock,
  StackEffectConferral,
  StackTrashLock,
  SuspendRestrictionSource,
  UnsuspendedDigivolveProhibition,
  VortexCanAttackPlayersGrant,
} from "./continuous/entries.js";
import type {
  CostReductionBlock,
  CustomEffectGrant,
  DisableTimingMask,
  DnaLevelOverride,
  EffectTimingDisable,
  MemoryGainPolicy,
  OnDeletionAtEndOfAttackProjection,
  PlayerEffectTimingDisable,
  PlayMatch,
  PlayProhibition,
  SecurityEffectDisable,
} from "./continuous/policies.js";
import { modeMatches, ownerSeatOfPermanent, playMatchesCard } from "./continuous/effective.js";

export type { LinkCostReductionGrant, StackEffectConferral } from "./continuous/entries.js";
export type {
  CustomEffectGrant,
  DisableTimingMask,
  OnDeletionAtEndOfAttackProjection,
  PlayMatch,
} from "./continuous/policies.js";
export { effectiveColors, effectiveKinds, effectiveNames, effectiveTraits } from "./continuous/effective.js";

/**
 * Continuous-effect application layer (subsystem: static-continuous-effects).
 *
 * Some card text does not perform a one-shot mutation but imposes an ongoing
 * RULE while the source is in play (or for a bounded duration): a Digimon that
 * "can't attack", an "attack target can't change", a name/trait alias ("also
 * treated as [X]"), or a permission ("use this card without meeting its color
 * requirements"). source these are queried at decision points (can-attack,
 * can-change-target, name comparison, color-cost check) rather than stored as a
 * stat. This ledger is the server-only store the engine's combat / turn / cost
 * code reads at those points.
 *
 * Scope (consistent with the `core` effect-primitives sibling, modifiers.ts): it
 * OWNS the continuous-rule store and the boundary sweep. It does NOT itself drive
 * combat/turn legality — the consumers (combat legality, attack target change,
 * card-name comparison, color-cost check) read it. Recording a rule is therefore a
 * REAL effect (authoritative server state survives until its boundary), not a
 * silent no-op; the read sites are documented TODOs where not yet wired.
 *
 * Pairs with ModifierLedger: that one owns numeric DP/pierce/evo-cost windows; this
 * one owns boolean restrictions, name/trait aliases, and color-cost waivers. They
 * share the same DurationBoundary sweep contract so the engine clears both at once.
 */

/**
 * Marks an entry as produced by a PERSISTENT (static / `EffectTiming.None`) effect
 * rather than a one-shot triggered one. The continuous-recompute pass
 * (GameEngine.recomputeContinuousEffects) clears `continuous` entries and re-derives
 * them by re-firing the static effects; a one-shot entry ("gains ＜Blocker＞ until end
 * of turn") is kept and expires only at its own duration boundary. See
 * ModifierLedger.DpModifier.continuous for the numeric sibling.
 */

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

export class ContinuousEffectLedger {
  private restrictions: RestrictionEntry[] = [];
  /** Permanents whose `beAffected` immunity expired in the last sweep (drained by the sweep site). */
  private expiredAffectationRecipients = new Set<string>();
  private playerRestrictions: PlayerRestrictionEntry[] = [];
  private attackTargetRestrictions: AttackTargetRestriction[] = [];
  private canAttackUnsuspendedGrants: CanAttackUnsuspendedGrant[] = [];
  private vortexCanAttackPlayersGrants: VortexCanAttackPlayersGrant[] = [];
  private suspendRestrictionSources: SuspendRestrictionSource[] = [];
  private unsuspendedDigivolveProhibitions: UnsuspendedDigivolveProhibition[] = [];
  private digivolveIntoConstraints: DigivolveIntoConstraint[] = [];
  private nameTraitGrants: NameTraitGrant[] = [];
  private originalCardInfoOverrides: OriginalCardInfoOverride[] = [];
  private colorWaivers: ColorWaiver[] = [];
  private keywordGrants: KeywordGrant[] = [];
  private playerKeywordGrants: PlayerKeywordGrant[] = [];
  private playerCustomEffectGrants: PlayerCustomEffectGrant[] = [];
  /** Break dependency cycles while a conditional grant asks about other live keywords. */
  private evaluatingKeywordGrants = new Set<KeywordGrant>();
  private linkMaxGrants: LinkMaxGrant[] = [];
  private linkCostReductionGrants: LinkCostReductionGrant[] = [];
  private kindGrants: KindGrant[] = [];
  private cannotIgnoreDigivolutionFlags: CannotIgnoreDigivolutionFlag[] = [];
  private securityAddRestrictions: SecurityAddRestriction[] = [];
  private colorGrants: ColorGrant[] = [];
  private stackTrashLocks: StackTrashLock[] = [];
  private seatStackTrashLocks: SeatStackTrashLock[] = [];
  private stackCardTrashLocks: StackCardTrashLock[] = [];
  private securityAttackInversions: SecurityAttackInversion[] = [];
  private stackEffectConferrals: StackEffectConferral[] = [];
  private onDeletionAtEndOfAttackProjections: OnDeletionAtEndOfAttackProjection[] = [];
  private customEffectGrants: CustomEffectGrant[] = [];
  private grantsOfCardsThatLeftField = new WeakSet<CustomEffectGrant>();
  private nextCustomEffectGrantId = 1;
  private memoryGainPolicies: MemoryGainPolicy[] = [];
  private costReductionBlocks: CostReductionBlock[] = [];
  private playProhibitions: PlayProhibition[] = [];
  private securityEffectDisables: SecurityEffectDisable[] = [];
  private effectTimingDisables: EffectTimingDisable[] = [];
  private playerEffectTimingDisables: PlayerEffectTimingDisable[] = [];
  private dnaLevelOverrides: DnaLevelOverride[] = [];
  private battleScopes = new Map<number, { parent?: number; entries: Set<object> }>();
  private durationOwners = new WeakMap<object, Seat>();
  getRuntimeState(): ContinuousLedgerState {
    this.assertSnapshotBoundary();
    return {
      restrictions: this.restrictions,
      playerRestrictions: this.playerRestrictions,
      attackTargetRestrictions: this.attackTargetRestrictions,
      canAttackUnsuspendedGrants: this.canAttackUnsuspendedGrants,
      vortexCanAttackPlayersGrants: this.vortexCanAttackPlayersGrants,
      suspendRestrictionSources: this.suspendRestrictionSources,
      unsuspendedDigivolveProhibitions: this.unsuspendedDigivolveProhibitions,
      digivolveIntoConstraints: this.digivolveIntoConstraints,
      nameTraitGrants: this.nameTraitGrants,
      originalCardInfoOverrides: this.originalCardInfoOverrides,
      colorWaivers: this.colorWaivers,
      keywordGrants: this.keywordGrants,
      playerKeywordGrants: this.playerKeywordGrants,
      playerCustomEffectGrants: this.playerCustomEffectGrants,
      linkMaxGrants: this.linkMaxGrants,
      linkCostReductionGrants: this.linkCostReductionGrants,
      kindGrants: this.kindGrants,
      cannotIgnoreDigivolutionFlags: this.cannotIgnoreDigivolutionFlags,
      securityAddRestrictions: this.securityAddRestrictions,
      colorGrants: this.colorGrants,
      stackTrashLocks: this.stackTrashLocks,
      seatStackTrashLocks: this.seatStackTrashLocks,
      stackCardTrashLocks: this.stackCardTrashLocks,
      securityAttackInversions: this.securityAttackInversions,
      stackEffectConferrals: this.stackEffectConferrals,
      onDeletionAtEndOfAttackProjections: this.onDeletionAtEndOfAttackProjections,
      customEffectGrants: this.customEffectGrants,
      memoryGainPolicies: this.memoryGainPolicies,
      costReductionBlocks: this.costReductionBlocks,
      playProhibitions: this.playProhibitions,
      securityEffectDisables: this.securityEffectDisables,
      effectTimingDisables: this.effectTimingDisables,
      playerEffectTimingDisables: this.playerEffectTimingDisables,
      dnaLevelOverrides: this.dnaLevelOverrides,
      durationOwners: this.allEntries().flatMap((entry): [object, Seat][] => {
        const owner = this.durationOwners.get(entry);
        return owner === undefined ? [] : [[entry, owner]];
      }),
      battleScopes: this.battleScopes,
      expiredAffectationRecipients: this.expiredAffectationRecipients,
      grantsOfCardsThatLeftField: new Set(
        this.customEffectGrants.filter((entry) => this.grantsOfCardsThatLeftField.has(entry)),
      ),
      nextCustomEffectGrantId: this.nextCustomEffectGrantId,
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
    if (!isContinuousLedgerState(state)) {
      throw new Error("Invalid continuous ledger snapshot");
    }
    this.restrictions = state.restrictions;
    this.playerRestrictions = state.playerRestrictions;
    this.attackTargetRestrictions = state.attackTargetRestrictions;
    this.canAttackUnsuspendedGrants = state.canAttackUnsuspendedGrants;
    this.vortexCanAttackPlayersGrants = state.vortexCanAttackPlayersGrants;
    this.suspendRestrictionSources = state.suspendRestrictionSources;
    this.unsuspendedDigivolveProhibitions = state.unsuspendedDigivolveProhibitions;
    this.digivolveIntoConstraints = state.digivolveIntoConstraints;
    this.nameTraitGrants = state.nameTraitGrants;
    this.originalCardInfoOverrides = state.originalCardInfoOverrides;
    this.colorWaivers = state.colorWaivers;
    this.keywordGrants = state.keywordGrants;
    this.playerKeywordGrants = state.playerKeywordGrants;
    this.playerCustomEffectGrants = state.playerCustomEffectGrants;
    this.linkMaxGrants = state.linkMaxGrants;
    this.linkCostReductionGrants = state.linkCostReductionGrants;
    this.kindGrants = state.kindGrants;
    this.cannotIgnoreDigivolutionFlags = state.cannotIgnoreDigivolutionFlags;
    this.securityAddRestrictions = state.securityAddRestrictions;
    this.colorGrants = state.colorGrants;
    this.stackTrashLocks = state.stackTrashLocks;
    this.seatStackTrashLocks = state.seatStackTrashLocks;
    this.stackCardTrashLocks = state.stackCardTrashLocks;
    this.securityAttackInversions = state.securityAttackInversions;
    this.stackEffectConferrals = state.stackEffectConferrals;
    this.onDeletionAtEndOfAttackProjections = state.onDeletionAtEndOfAttackProjections;
    this.customEffectGrants = state.customEffectGrants;
    this.memoryGainPolicies = state.memoryGainPolicies;
    this.costReductionBlocks = state.costReductionBlocks;
    this.playProhibitions = state.playProhibitions;
    this.securityEffectDisables = state.securityEffectDisables;
    this.effectTimingDisables = state.effectTimingDisables;
    this.playerEffectTimingDisables = state.playerEffectTimingDisables;
    this.dnaLevelOverrides = state.dnaLevelOverrides;
    this.durationOwners = new WeakMap(state.durationOwners);
    this.battleScopes = state.battleScopes;
    this.expiredAffectationRecipients = state.expiredAffectationRecipients;
    this.grantsOfCardsThatLeftField = new WeakSet(state.grantsOfCardsThatLeftField);
    this.nextCustomEffectGrantId = state.nextCustomEffectGrantId;
  }

  private assertSnapshotBoundary(): void {
    if (
      this.evaluatingKeywordGrants.size > 0 ||
      this.evaluatingPlayerRestrictions.size > 0 ||
      this.evaluatingPlayerKeywordGrants.size > 0
    ) {
      throw new Error("Cannot snapshot or restore while continuous predicates are being evaluated");
    }
  }

  private anchorDuration<T extends object>(entry: T): T {
    const target = entry as { permanentId?: string; attackerPermanentId?: string; ownerSeat?: Seat };
    if (target.ownerSeat !== undefined) return entry;
    const id = target.permanentId ?? target.attackerPermanentId;
    const seat = id === undefined ? undefined : (this.anyControllerSeatOf?.(id) ?? this.controllerSeatOf?.(id));
    if (seat !== undefined) this.durationOwners.set(entry, seat);
    return entry;
  }

  beginBattleScope(scopeId: number): void {
    const parent = [...this.battleScopes.keys()].at(-1);
    this.battleScopes.set(scopeId, { parent, entries: new Set(this.allEntries()) });
  }

  endBattleScope(scopeId: number): void {
    this.battleScopes.delete(scopeId);
  }

  private allEntries(): object[] {
    return [
      ...this.restrictions,
      ...this.playerRestrictions,
      ...this.attackTargetRestrictions,
      ...this.canAttackUnsuspendedGrants,
      ...this.vortexCanAttackPlayersGrants,
      ...this.suspendRestrictionSources,
      ...this.unsuspendedDigivolveProhibitions,
      ...this.digivolveIntoConstraints,
      ...this.nameTraitGrants,
      ...this.originalCardInfoOverrides,
      ...this.colorWaivers,
      ...this.keywordGrants,
      ...this.playerKeywordGrants,
      ...this.playerCustomEffectGrants,
      ...this.linkMaxGrants,
      ...this.linkCostReductionGrants,
      ...this.kindGrants,
      ...this.cannotIgnoreDigivolutionFlags,
      ...this.securityAddRestrictions,
      ...this.colorGrants,
      ...this.stackTrashLocks,
      ...this.seatStackTrashLocks,
      ...this.stackCardTrashLocks,
      ...this.securityAttackInversions,
      ...this.stackEffectConferrals,
      ...this.onDeletionAtEndOfAttackProjections,
      ...this.customEffectGrants,
      ...this.memoryGainPolicies,
      ...this.costReductionBlocks,
      ...this.playProhibitions,
      ...this.securityEffectDisables,
      ...this.effectTimingDisables,
      ...this.playerEffectTimingDisables,
      ...this.dnaLevelOverrides,
    ];
  }

  private expiresAt(
    entry: object,
    duration: EffectDuration,
    boundary: DurationBoundary,
    ownerSeat: Seat,
    sweepSeat: Seat,
    battleScopeId?: number,
  ): boolean {
    if (!clearsAt(duration, boundary, this.durationOwners.get(entry) ?? ownerSeat, sweepSeat)) return false;
    if (boundary !== "endBattle" || battleScopeId === undefined) return true;
    const scope = this.battleScopes.get(battleScopeId);
    return scope?.parent === undefined || !scope.entries.has(entry);
  }

  /** Record a "can't <restriction>" rule on a permanent for a duration. */
  addRestriction(
    permanentId: string,
    restriction: Restriction,
    duration: EffectDuration,
    opts?: {
      continuous?: boolean;
      fromSourceKind?: string[];
      byOpponentEffectsOnly?: boolean;
      byEffectsOnly?: boolean;
      originSeat?: Seat;
      sourceKinds?: string[];
    },
  ): void {
    this.restrictions.push(
      this.anchorDuration({
        permanentId,
        restriction,
        duration,
        continuous: opts?.continuous,
        originSeat: opts?.originSeat,
        sourceKinds: opts?.sourceKinds,
        fromSourceKind: opts?.fromSourceKind,
        byOpponentEffectsOnly: opts?.byOpponentEffectsOnly,
        byEffectsOnly: opts?.byEffectsOnly,
      }),
    );
  }

  fieldEffectViews(seat: Seat): FieldEffectView[] {
    return [
      ...this.playerRestrictions
        .filter((entry) => entry.seat === seat)
        .map((entry) => ({
          kind: "restriction" as const,
          value: entry.restriction,
          duration: entry.duration,
          ownerSeat: entry.ownerSeat,
          sourceCardId: entry.sourceCardId,
          effectText: entry.effectText,
          fromSourceKind: entry.fromSourceKind,
          byOpponentEffectsOnly: entry.byOpponentEffectsOnly,
          continuous: entry.continuous,
        })),
      ...this.playProhibitions
        .filter((entry) => entry.seat === seat)
        .map((entry) => ({
          kind: "restriction" as const,
          value: entry.byEffectOnly === true ? "playByEffects" : entry.mode,
          duration: entry.duration,
          ownerSeat: entry.sourceSeat,
          sourceCardId: entry.sourceCardId,
          effectText: entry.effectText,
          continuous: entry.continuous,
        })),
      ...this.playerKeywordGrants
        .filter((entry) => entry.seat === seat)
        .map((entry) => ({
          kind: "keyword" as const,
          value: entry.keyword,
          amount: entry.amount,
          duration: entry.duration,
          ownerSeat: entry.ownerSeat ?? seat,
          sourceCardId: entry.sourceCardId,
          effectText: entry.effectText,
        })),
    ];
  }

  /** Record a duration-scoped rule for every matching permanent a player controls, including future entrants. */
  addPlayerRestriction(
    seat: Seat,
    ownerSeat: Seat,
    restriction: Restriction,
    duration: EffectDuration,
    matches: (permanentId: string) => boolean,
    opts?: {
      continuous?: boolean;
      sourceCardId?: string;
      effectText?: string;
      matchesAsDigimon?: PlayerRestrictionEntry["matchesAsDigimon"];
      fromSourceKind?: string[];
      byOpponentEffectsOnly?: boolean;
      byEffectsOnly?: boolean;
    },
  ): void {
    this.playerRestrictions.push(
      this.anchorDuration({
        seat,
        ownerSeat,
        restriction,
        duration,
        matches,
        sourceCardId: opts?.sourceCardId,
        effectText: opts?.effectText,
        continuous: opts?.continuous,
        ...(opts?.matchesAsDigimon === undefined ? {} : { matchesAsDigimon: opts.matchesAsDigimon }),
        ...(opts?.fromSourceKind === undefined ? {} : { fromSourceKind: opts.fromSourceKind }),
        ...(opts?.byOpponentEffectsOnly === true ? { byOpponentEffectsOnly: true } : {}),
        ...(opts?.byEffectsOnly === true ? { byEffectsOnly: true } : {}),
      }),
    );
  }

  /** Whether a "Digimon can't digivolve" rule locks the Tamer `permanentId` digivolving as `asDigimon`. */
  isDigivolveLockedAsDigimon(permanentId: string, asDigimon: CardDefinition): boolean {
    if (this.hasRestriction(permanentId, "digivolve")) return true;
    const controllerSeat = this.anyControllerSeatOf?.(permanentId) ?? this.controllerSeatOf?.(permanentId);
    return this.playerRestrictions.some(
      (entry) =>
        entry.seat === controllerSeat &&
        entry.restriction === "digivolve" &&
        entry.matchesAsDigimon?.(permanentId, asDigimon) === true,
    );
  }

  addUnsuspendedDigivolveProhibition(seat: Seat, sourceSeat: Seat, duration: EffectDuration): void {
    this.unsuspendedDigivolveProhibitions.push(this.anchorDuration({ seat, sourceSeat, duration }));
  }

  isUnsuspendedDigivolveProhibited(seat: Seat): boolean {
    return this.unsuspendedDigivolveProhibitions.some((entry) => entry.seat === seat);
  }

  /**
   * Whether a permanent currently has a given restriction from any active entry.
   *
   * `sourceKind` is the kind of the card producing the effect being gated (e.g.
   * `"Digimon"`). When an entry carries `fromSourceKind`, it blocks ONLY when the
   * sourceKind is known AND in the list. An unqualified entry (no `fromSourceKind`)
   * blocks regardless of source.
   *
   * `opts.byOpponentEffect` says whether the effect being gated is controlled by the
   * restricted permanent's opponent, which is what a `byOpponentEffectsOnly` entry keys
   * on. Leaving it undefined makes such an entry block anyway: a prohibiting effect takes
   * precedence (Comprehensive Rules §15-1-3), and over-blocking surfaces as a failing test
   * whereas under-blocking is the silent no-op this scoping exists to prevent.
   *
   * `opts.byEffect: false` marks rule processing or battle, which a `byEffectsOnly` entry
   * does not block.
   */
  hasRestriction(
    permanentId: string,
    restriction: Restriction,
    sourceKind?: string,
    opts?: { byOpponentEffect?: boolean; byEffect?: boolean },
  ): boolean {
    // Printed "can't suspend" effects are recorded as `beSuspended` by the
    // interpreter so effect-driven suspension can honor them. The combat
    // legality reader uses the public `suspend` vocabulary for the implicit
    // suspend that starts a normal attack. Treat the two spellings as the
    // same prohibition at this read boundary; otherwise cards such as
    // EX8-026 would block effect suspension but still allow attacks.
    const isSuspend = restriction === "suspend" || restriction === "beSuspended";
    const isEquivalent = (candidate: Restriction): boolean =>
      candidate === restriction || (isSuspend && (candidate === "suspend" || candidate === "beSuspended"));
    const scopeBlocks = (entry: {
      byOpponentEffectsOnly?: boolean;
      byEffectsOnly?: boolean;
      fromSourceKind?: string[];
    }): boolean => {
      if (entry.byOpponentEffectsOnly === true && opts?.byOpponentEffect === false) return false;
      if (entry.byEffectsOnly === true && opts?.byEffect === false) return false;
      if (entry.fromSourceKind === undefined) return true;
      // Qualified entry: block only when sourceKind is known and matches.
      return sourceKind !== undefined && entry.fromSourceKind.includes(sourceKind);
    };
    const individuallyRestricted = this.restrictions.some((r) => {
      if (r.permanentId !== permanentId || !isEquivalent(r.restriction)) return false;
      if (this.suppressedByEffectImmunity(r)) return false;
      return scopeBlocks(r);
    });
    if (individuallyRestricted) return true;
    // A player-scoped restriction can name ANY permanent kind ("none of your opponent's Tamers
    // can unsuspend" — LM-010), so it resolves the controller through the kind-agnostic lookup.
    // `controllerSeatOf` deliberately answers only for Digimon (it also drives the
    // Digimon-only player KEYWORD grants) and would silently drop every Tamer here.
    if (this.playerRestrictions.length === 0) return false;
    const controllerSeat = this.anyControllerSeatOf?.(permanentId) ?? this.controllerSeatOf?.(permanentId);
    return this.playerRestrictions.some(
      (entry) =>
        entry.seat === controllerSeat &&
        isEquivalent(entry.restriction) &&
        scopeBlocks(entry) &&
        this.playerRestrictionMatches(entry, permanentId),
    );
  }

  /** Entries whose live filter is being evaluated, so a filter that reads restrictions can't recurse into itself. */
  private readonly evaluatingPlayerRestrictions = new Set<PlayerRestrictionEntry>();

  private playerRestrictionMatches(entry: PlayerRestrictionEntry, permanentId: string): boolean {
    if (this.evaluatingPlayerRestrictions.has(entry)) return false;
    this.evaluatingPlayerRestrictions.add(entry);
    try {
      return entry.matches(permanentId);
    } finally {
      this.evaluatingPlayerRestrictions.delete(entry);
    }
  }

  /** Effects this permanent cannot be affected by cannot keep their restrictions active. */
  private suppressedByEffectImmunity(restriction: RestrictionEntry): boolean {
    const restrictionKinds = restriction.sourceKinds;
    if (
      restriction.restriction === "beAffected" ||
      restriction.originSeat === undefined ||
      restrictionKinds === undefined
    )
      return false;
    const targetSeat =
      this.anyControllerSeatOf?.(restriction.permanentId) ?? this.controllerSeatOf?.(restriction.permanentId);
    if (targetSeat === undefined) return false;
    // Player-wide immunity (BT20-059/Q4395) shares the same live reader as
    // per-permanent immunity. Keep the original restriction stored so it can
    // resume if immunity ends first (Q4396).
    const opts = { byOpponentEffect: restriction.originSeat !== targetSeat };
    return (
      this.hasRestriction(restriction.permanentId, "beAffected", undefined, opts) ||
      restrictionKinds.some((kind) => this.hasRestriction(restriction.permanentId, "beAffected", kind, opts))
    );
  }

  /**
   * Stored copies of a restriction, including entries currently suppressed by an
   * "effects don't affect" immunity. Use this only to prove a restriction is still
   * recorded and will re-apply once the immunity lapses; every enforcement site wants
   * `restrictionCount`, which counts the copies that are effective right now.
   */
  storedRestrictionCount(permanentId: string, restriction: Restriction): number {
    return this.restrictions.filter((entry) => entry.permanentId === permanentId && entry.restriction === restriction)
      .length;
  }

  /** Number of independently-stacking copies of a restriction on one permanent. */
  restrictionCount(permanentId: string, restriction: Restriction): number {
    return this.restrictions.filter(
      (entry) =>
        entry.permanentId === permanentId &&
        entry.restriction === restriction &&
        !this.suppressedByEffectImmunity(entry),
    ).length;
  }

  /** Record a target-scoped "can't attack this Digimon" rule. */
  addAttackTargetRestriction(
    attackerPermanentId: string,
    targetPermanentId: string,
    duration: EffectDuration,
    opts?: { continuous?: boolean },
  ): void {
    this.attackTargetRestrictions.push(
      this.anchorDuration({
        attackerPermanentId,
        targetPermanentId,
        duration,
        continuous: opts?.continuous,
      }),
    );
  }

  /** Whether this exact attacker is prohibited from attacking this exact defender. */
  cannotAttackTarget(attackerPermanentId: string, targetPermanentId: string): boolean {
    return this.attackTargetRestrictions.some(
      (entry) => entry.attackerPermanentId === attackerPermanentId && entry.targetPermanentId === targetPermanentId,
    );
  }

  restrictSecurityAddsFromEffect(blockedEffectSeat: Seat, granterSeat: Seat, duration: EffectDuration): void {
    this.securityAddRestrictions.push(this.anchorDuration({ blockedEffectSeat, granterSeat, duration }));
  }

  cannotAddSecurityFromEffect(effectSeat: Seat | undefined): boolean {
    return (
      effectSeat !== undefined && this.securityAddRestrictions.some((entry) => entry.blockedEffectSeat === effectSeat)
    );
  }

  /**
   * Arm a BT23-024 suspend-restriction source for `duration` ("until their turn ends" =>
   * UntilOpponentTurnEnd). Idempotent per source while armed: the link trigger fires at most
   * once per turn, and re-arming the same source within a duration just refreshes the entry.
   */
  armSuspendRestrictionSource(permanentId: string, duration: EffectDuration): void {
    if (this.suspendRestrictionSources.some((s) => s.permanentId === permanentId)) return;
    this.suspendRestrictionSources.push(this.anchorDuration({ permanentId, duration }));
  }

  /** Whether a BT23-024 source is currently armed (read by the continuous recompute). */
  hasSuspendRestrictionSource(permanentId: string): boolean {
    return this.suspendRestrictionSources.some((s) => s.permanentId === permanentId);
  }

  /**
   * Record a positive "can only digivolve into [X]" constraint on a permanent (EX10-035).
   * `matchesInto` is satisfied by the allowed evolving card's definition.
   */
  addDigivolveIntoConstraint(
    permanentId: string,
    matchesInto: (def: CardDefinition) => boolean,
    duration: EffectDuration,
    opts?: { continuous?: boolean },
  ): void {
    this.digivolveIntoConstraints.push(
      this.anchorDuration({ permanentId, matchesInto, duration, continuous: opts?.continuous }),
    );
  }

  /**
   * Whether digivolving `permanentId` into a card with definition `evolvingDef` is allowed by every
   * active `digivolveExceptInto` constraint on it. With no constraint => allowed (the base rule).
   * With one or more => allowed only if EVERY constraint's `matchesInto` accepts the evolving card.
   */
  digivolveIntoAllowed(permanentId: string, evolvingDef: CardDefinition): boolean {
    return this.digivolveIntoConstraints
      .filter((c) => c.permanentId === permanentId)
      .every((c) => c.matchesInto(evolvingDef));
  }

  /** Grant a permanent the ability to also attack opponent unsuspended Digimon. */
  grantCanAttackUnsuspended(
    permanentId: string,
    duration: EffectDuration,
    opts?: { continuous?: boolean; noDigivolutionCards?: boolean; defenderLevelMax?: number },
  ): void {
    this.canAttackUnsuspendedGrants.push(
      this.anchorDuration({
        permanentId,
        duration,
        continuous: opts?.continuous,
        noDigivolutionCards: opts?.noDigivolutionCards,
        defenderLevelMax: opts?.defenderLevelMax,
      }),
    );
  }

  /** Whether a permanent may also attack opponent unsuspended Digimon (positive grant). */
  canAttackUnsuspended(permanentId: string): boolean {
    return this.canAttackUnsuspendedGrants.some((g) => g.permanentId === permanentId);
  }

  /**
   * Whether EVERY active "can attack unsuspended" grant on this permanent is restricted to
   * defenders with no digivolution cards. Used by combat legality to narrow the defender set
   * for grants like EX1-016 ("...unsuspended Digimon with no digivolution cards"). Returns
   * false when no grant exists or when any grant is unrestricted (ST12-08 widens it back).
   */
  canAttackUnsuspendedRequiresNoDigivolution(permanentId: string): boolean {
    const grants = this.canAttackUnsuspendedGrants.filter((g) => g.permanentId === permanentId);
    return grants.length > 0 && grants.every((g) => g.noDigivolutionCards === true);
  }

  /** Whether at least one active grant accepts this exact unsuspended defender. */
  canAttackUnsuspendedTarget(
    permanentId: string,
    defender: { level?: number; hasDigivolutionCards: boolean },
  ): boolean {
    return this.canAttackUnsuspendedGrants.some((grant) => {
      if (grant.permanentId !== permanentId) return false;
      if (grant.noDigivolutionCards === true && defender.hasDigivolutionCards) return false;
      if (
        grant.defenderLevelMax !== undefined &&
        (defender.level === undefined || defender.level > grant.defenderLevelMax)
      )
        return false;
      return true;
    });
  }

  grantVortexCanAttackPlayers(permanentId: string, duration: EffectDuration, opts?: { continuous?: boolean }): void {
    this.vortexCanAttackPlayersGrants.push(
      this.anchorDuration({ permanentId, duration, continuous: opts?.continuous }),
    );
  }

  /** Whether a permanent's ＜Vortex＞ attack may also target a player (positive grant). */
  vortexCanAttackPlayers(permanentId: string): boolean {
    return this.vortexCanAttackPlayersGrants.some((g) => g.permanentId === permanentId);
  }

  /** Record a seat-level memory gain lock (rule implementation). */
  addMemoryGainPolicy(seat: Seat, duration: EffectDuration, opts?: { continuous?: boolean }): void {
    this.memoryGainPolicies.push(
      this.anchorDuration({
        seat,
        exceptTamerEffects: true,
        duration,
        continuous: opts?.continuous,
      }),
    );
  }

  /**
   * May `seat` gain memory from an effect whose source is `effectSource`?
   * Mirrors ICannotAddMemoryEffect: blocked when a policy applies and the effect
   * is not a Tamer effect.
   */
  canGainMemoryFromEffect(seat: Seat, effectSource: { definition: { kinds: readonly string[] } } | undefined): boolean {
    const blocked = this.memoryGainPolicies.some((p) => p.seat === seat);
    if (!blocked) return true;
    if (effectSource === undefined) return false;
    return effectSource.definition.kinds.includes(CardKind.Tamer);
  }

  /** Record that `seat` may not reduce play/digivolve costs. */
  addCostReductionBlock(
    seat: Seat,
    costType: "play" | "digivolve" | "all",
    duration: EffectDuration,
    opts?: { continuous?: boolean },
  ): void {
    this.costReductionBlocks.push(this.anchorDuration({ seat, costType, duration, continuous: opts?.continuous }));
  }

  /** Whether cost reductions are forbidden for `seat` and `costType`. */
  blocksCostReduction(seat: Seat, costType: "play" | "digivolve"): boolean {
    return this.costReductionBlocks.some((b) => b.seat === seat && (b.costType === "all" || b.costType === costType));
  }

  /**
   * Record a seat-level play/move prohibition (rule implementation / rule implementation). `seat` is the
   * RESTRICTED player; `sourceSeat` is the effect owner whose perspective the `duration` is
   * framed from (normally opponentOf(seat)).
   */
  addPlayProhibition(
    seat: Seat,
    sourceSeat: Seat,
    match: PlayMatch,
    mode: "play" | "move" | "playOrMove",
    duration: EffectDuration,
    opts?: { continuous?: boolean; byEffectOnly?: boolean; sourceCardId?: string; effectText?: string },
  ): void {
    this.playProhibitions.push(
      this.anchorDuration({
        seat,
        sourceSeat,
        match,
        mode,
        duration,
        continuous: opts?.continuous,
        byEffectOnly: opts?.byEffectOnly,
        ...(opts?.sourceCardId === undefined ? {} : { sourceCardId: opts.sourceCardId }),
        ...(opts?.effectText === undefined ? {} : { effectText: opts.effectText }),
      }),
    );
  }

  /**
   * Is `seat` forbidden from playing/moving `cardDef` right now? `seat` is the player whose
   * own ACTION or EFFECT is performing the play/move — for a manual play that is the playing
   * player; for an effect-driven play it is the seat the resolving effect is attributed to
   * (so a "your opponent can't play" effect blocks the opponent's actions and effects, but
   * NOT the source player's effects: KB EX7-014 Q4675/Q4676, including tokens (Q3834).
   * `requestedMode` is "play" (play / enter-field, incl. breeding) or "move" (effect-driven
   * or breeding move); a "playOrMove" prohibition matches either.
   * `effectPlay` true means the caller is an effect-driven play path — prohibitions with
   * `byEffectOnly: true` are honored; when false/absent those prohibitions are skipped so
   * normal hand-play is unaffected (KB Q4665–Q4668, Q6245 BT20-020).
   */
  isPlayBlocked(
    seat: Seat,
    cardDef: CardDefinition,
    requestedMode: "play" | "move",
    effectPlay?: boolean,
    fromZone?: ZoneRef,
  ): boolean {
    return this.playProhibitions.some(
      (p) =>
        p.seat === seat &&
        modeMatches(p.mode, requestedMode) &&
        playMatchesCard(p.match, cardDef) &&
        (p.match.fromZones === undefined || (fromZone !== undefined && p.match.fromZones.includes(fromZone))) &&
        (effectPlay === true || !p.byEffectOnly),
    );
  }

  /**
   * Record a security-effect disable: while `attackerPermanentId` is the attacker, a flipped
   * security card's [Security] effect does not activate (`sourceKind` "option" => only Option
   * security effects; "any" => any). The security half of the source rule implementation split.
   */
  addSecurityEffectDisable(
    attackerPermanentId: string,
    sourceKind: "option" | "any",
    duration: EffectDuration,
    opts?: { continuous?: boolean },
  ): void {
    this.securityEffectDisables.push(
      this.anchorDuration({
        attackerPermanentId,
        sourceKind,
        duration,
        continuous: opts?.continuous,
      }),
    );
  }

  addSecurityEffectDisableForSeat(
    attackerSeat: Seat,
    sourceKind: "option" | "any",
    duration: EffectDuration,
    opts?: { continuous?: boolean },
  ): void {
    this.securityEffectDisables.push(
      this.anchorDuration({ attackerSeat, sourceKind, duration, continuous: opts?.continuous }),
    );
  }

  /**
   * Is the [Security] effect of `securityCard` (definition `securityDef`) suppressed while
   * `attackerPermanentId` is the attacker? True when a disable on that attacker matches —
   * "any" suppresses every security effect; "option" only when the security card is an Option
   *. Consulted in the security-check resolution
   * loop; the card is still trashed (KB Q886), only the effect is skipped.
   */
  isSecurityEffectDisabled(attackerPermanentId: string, securityDef: CardDefinition): boolean {
    const isOption = securityDef.kinds.includes(CardKind.Option);
    return this.securityEffectDisables.some(
      (d) =>
        (d.attackerPermanentId === attackerPermanentId ||
          (d.attackerSeat !== undefined && d.attackerSeat === this.controllerSeatOf?.(attackerPermanentId))) &&
        (d.sourceKind === "any" || isOption),
    );
  }

  /**
   * Record a timing-effect disable: the masked [When Digivolving] / [When Attacking] /
   * [On Play] effects of `permanentId` do not activate. The timing half of the source
   * rule implementation split.
   */
  addEffectTimingDisable(
    permanentId: string,
    timings: DisableTimingMask[],
    duration: EffectDuration,
    opts?: { continuous?: boolean },
  ): void {
    this.effectTimingDisables.push(
      this.anchorDuration({ permanentId, timings, duration, continuous: opts?.continuous }),
    );
  }

  addPlayerEffectTimingDisable(
    seat: Seat,
    ownerSeat: Seat,
    timings: DisableTimingMask[],
    duration: EffectDuration,
    matches: (permanentId: string) => boolean,
    opts?: { continuous?: boolean },
  ): void {
    this.playerEffectTimingDisables.push(
      this.anchorDuration({ seat, ownerSeat, timings, duration, matches, continuous: opts?.continuous }),
    );
  }

  /**
   * Is `timing` masked on `permanentId` right now (so its effect at that window may not
   * activate)? Consulted by the per-effect activation gate; callers apply the `beAffected`
   */
  isTimingEffectDisabled(permanentId: string, timing: DisableTimingMask): boolean {
    if (this.effectTimingDisables.some((d) => d.permanentId === permanentId && d.timings.includes(timing))) return true;
    const controllerSeat = this.anyControllerSeatOf?.(permanentId) ?? this.controllerSeatOf?.(permanentId);
    return this.playerEffectTimingDisables.some(
      (entry) => entry.seat === controllerSeat && entry.timings.includes(timing) && entry.matches(permanentId),
    );
  }

  /** Record a name/trait alias on a permanent (e.g. "also treated as [Leomon]"). */
  addNameTraitGrant(
    permanentId: string,
    kind: "name" | "trait",
    tokens: string[],
    duration: EffectDuration,
    opts?: {
      continuous?: boolean;
      digiXrosOnly?: boolean;
      fromRule?: boolean;
      nameContainsOnly?: boolean;
      dynamicTokens?: () => string[];
    },
  ): void {
    this.nameTraitGrants.push(
      this.anchorDuration({
        permanentId,
        kind,
        tokens,
        duration,
        continuous: opts?.continuous,
        digiXrosOnly: opts?.digiXrosOnly,
        fromRule: opts?.fromRule,
        nameContainsOnly: opts?.nameContainsOnly,
        dynamicTokens: opts?.dynamicTokens,
      }),
    );
  }

  /**
   * Name grants in force on a permanent. A `(Rule)` name is original card information, so an
   * effect that replaces the original name removes it too (Q2081/Q2479).
   */
  private activeNameGrants(permanentId: string): NameTraitGrant[] {
    const originalNameReplaced = this.originalCardInfoOverride(permanentId)?.name !== undefined;
    return this.nameTraitGrants.filter(
      (grant) =>
        grant.permanentId === permanentId &&
        grant.kind === "name" &&
        !grant.digiXrosOnly &&
        !(originalNameReplaced && grant.fromRule === true),
    );
  }

  /** Extra name aliases granted to a permanent (lowercased tokens), excluding DigiXros-only grants. */
  grantedNames(permanentId: string): string[] {
    return this.activeNameGrants(permanentId).flatMap((g) =>
      g.dynamicTokens ? g.dynamicTokens().map((t) => t.toLowerCase()) : g.tokens.map((t) => t.toLowerCase()),
    );
  }

  /**
   * Additional names that are exact effective identities. A `(Rule)` clause saying a card's
   * name "also contains [X]" is intentionally absent: it satisfies inclusion filters without
   * renaming the card to exactly X (EX13-053/Q7377).
   */
  grantedExactNames(permanentId: string): string[] {
    return this.activeNameGrants(permanentId)
      .filter((grant) => grant.nameContainsOnly !== true)
      .flatMap((grant) =>
        grant.dynamicTokens
          ? grant.dynamicTokens().map((token) => token.toLowerCase())
          : grant.tokens.map((token) => token.toLowerCase()),
      );
  }

  /**
   * Name aliases granted to a permanent that are ONLY valid for DigiXros material matching
   * (lowercased tokens). These must NOT appear in effectiveNames() or ordinary name checks.
   */
  grantedDigiXrosNames(permanentId: string): string[] {
    return this.nameTraitGrants
      .filter((g) => g.permanentId === permanentId && g.kind === "name" && g.digiXrosOnly === true)
      .flatMap((g) => g.tokens.map((t) => t.toLowerCase()));
  }

  /** Extra trait aliases granted to a permanent (lowercased tokens). */
  grantedTraits(permanentId: string): string[] {
    return this.nameTraitGrants
      .filter((g) => g.permanentId === permanentId && g.kind === "trait")
      .flatMap((g) => g.tokens.map((t) => t.toLowerCase()));
  }

  addOriginalCardInfoOverride(
    permanentId: string,
    info: { name?: string; colors?: string[] },
    duration: EffectDuration,
    opts?: { continuous?: boolean; sourceSeat?: Seat; sourceKinds?: string[] },
  ): void {
    this.originalCardInfoOverrides.push(this.anchorDuration({ permanentId, ...info, duration, ...opts }));
  }

  originalCardInfoOverride(permanentId: string): { name?: string; colors?: string[] } | undefined {
    const targetSeat = this.anyControllerSeatOf?.(permanentId) ?? this.controllerSeatOf?.(permanentId);
    const entries = this.originalCardInfoOverrides.filter((entry) => {
      if (entry.permanentId !== permanentId) return false;
      if (entry.sourceSeat === undefined || targetSeat === undefined || entry.sourceSeat === targetSeat) return true;
      const sourceKinds = entry.sourceKinds ?? [];
      if (sourceKinds.length === 0) {
        return !this.hasRestriction(permanentId, "beAffected", undefined, { byOpponentEffect: true });
      }
      return !sourceKinds.some((kind) =>
        this.hasRestriction(permanentId, "beAffected", kind, { byOpponentEffect: true }),
      );
    });
    if (entries.length === 0) return undefined;
    return Object.assign(
      {},
      ...entries.map(({ name, colors }) => ({
        ...(name === undefined ? {} : { name }),
        ...(colors === undefined ? {} : { colors }),
      })),
    );
  }

  /**
   * Record that an instance may be used/played without meeting its color requirement, or —
   * with `alsoColor` — that one extra colour ALSO satisfies the printed requirement.
   */
  addColorWaiver(
    instanceId: string,
    duration: EffectDuration,
    opts?: { continuous?: boolean; alsoColor?: CardColor },
  ): void {
    this.colorWaivers.push(
      this.anchorDuration({ instanceId, duration, continuous: opts?.continuous, alsoColor: opts?.alsoColor }),
    );
  }

  /** Whether an instance's color requirement is waived outright (no colour source needed). */
  hasColorWaiver(instanceId: string): boolean {
    return this.colorWaivers.some((w) => w.instanceId === instanceId && w.alsoColor === undefined);
  }

  /** Extra colours that currently also satisfy an instance's printed colour requirement. */
  colorRequirementAlternatives(instanceId: string): CardColor[] {
    return this.colorWaivers
      .filter((w) => w.instanceId === instanceId && w.alsoColor !== undefined)
      .map((w) => w.alsoColor as CardColor);
  }

  addDnaLevelOverride(permanentId: string, level: number, opts?: { intoNames?: string[]; continuous?: boolean }): void {
    this.dnaLevelOverrides.push(this.anchorDuration({ permanentId, level, ...opts }));
  }

  dnaLevelFor(permanentId: string, into: CardDefinition): number | undefined {
    return this.dnaLevelOverrides.find(
      (entry) =>
        entry.permanentId === permanentId &&
        (entry.intoNames === undefined || entry.intoNames.some((name) => nameIncludesToken(into.nameEn, name))),
    )?.level;
  }

  /**
   * Grant a keyword ability to a permanent for a duration ("gains ＜Blocker＞",
   * "gains ＜Rush＞ for the turn"). The combat / keyword-abilities subsystem reads
   * `grantedKeywords` at the relevant decision point; recorded now as real
   * authoritative state so the grant is not a silent no-op.
   * (＜Piercing＞ has its own dedicated pierce store in ModifierLedger; this is the
   * general store for every other keyword.)
   */
  addKeywordGrant(
    permanentId: string,
    keyword: string,
    duration: EffectDuration,
    amount?: number,
    opts?: {
      continuous?: boolean;
      active?: () => boolean;
      specifiers?: string[];
      sourceCardId?: string;
      sourceInstanceId?: string;
      sourceEffectText?: string;
      sourceSeat?: Seat;
      sourceKinds?: string[];
    },
  ): void {
    this.keywordGrants.push(
      this.anchorDuration({
        permanentId,
        keyword,
        amount,
        duration,
        continuous: opts?.continuous,
        active: opts?.active,
        specifiers: opts?.specifiers,
        sourceCardId: opts?.sourceCardId,
        sourceInstanceId: opts?.sourceInstanceId,
        sourceEffectText: opts?.sourceEffectText,
        sourceSeat: opts?.sourceSeat,
        sourceKinds: opts?.sourceKinds,
      }),
    );
  }

  constructor(
    private readonly controllerSeatOf?: (permanentId: string) => Seat | undefined,
    private readonly printedKeywordsOfPermanent?: (permanentId: string) => readonly string[],
    private readonly anyControllerSeatOf?: (permanentId: string) => Seat | undefined,
    /** Keywords a rule confers without a ledger grant, such as ＜Collision＞'s ＜Blocker＞ during its attack. */
    private readonly ruleGrantedKeywordsOf?: (permanentId: string) => readonly string[],
  ) {}

  /** Grant a keyword to every current and future Digimon permanent controlled by `seat`. */
  addPlayerKeywordGrant(
    seat: Seat,
    keyword: string,
    duration: EffectDuration,
    amount?: number,
    opts?: { ownerSeat?: Seat; matches?: (permanentId: string) => boolean; sourceCardId?: string; effectText?: string },
  ): void {
    this.playerKeywordGrants.push(
      this.anchorDuration({
        seat,
        keyword,
        amount,
        duration,
        sourceCardId: opts?.sourceCardId,
        effectText: opts?.effectText,
        ...(opts?.ownerSeat === undefined ? {} : { ownerSeat: opts.ownerSeat }),
        ...(opts?.matches === undefined ? {} : { matches: opts.matches }),
      }),
    );
  }

  /** Grant a named custom effect to every matching current/future permanent controlled by `seat`. */
  addPlayerCustomEffectGrant(
    seat: Seat,
    ownerSeat: Seat,
    token: string,
    duration: EffectDuration,
    matches: (permanentId: string) => boolean,
  ): void {
    this.playerCustomEffectGrants.push(
      this.anchorDuration({ seat, ownerSeat, token, duration, activationIdentity: {}, matches }),
    );
  }

  playerCustomEffectsOf(seat: Seat): readonly PlayerCustomEffectGrant[] {
    return this.playerCustomEffectGrants.filter((grant) => grant.seat === seat);
  }

  /** Keywords currently granted to a permanent (with optional amounts). */
  grantedKeywords(permanentId: string): { keyword: string; amount?: number }[] {
    const direct: { keyword: string; amount?: number }[] = [
      ...this.keywordGrants
        .filter((g) => g.permanentId === permanentId && this.keywordGrantIsActive(g))
        .map((g) => ({ keyword: g.keyword, amount: g.amount })),
      ...(this.ruleGrantedKeywordsOf?.(permanentId) ?? []).map((keyword) => ({ keyword })),
    ];
    const seat = this.controllerSeatOf?.(permanentId);
    if (seat === undefined) return direct;
    return direct.concat(
      this.playerKeywordGrants
        .filter((grant) => grant.seat === seat && this.playerKeywordGrantMatches(grant, permanentId))
        .map(({ keyword, amount }) => ({ keyword, amount })),
    );
  }

  /** Grants whose live filter is being evaluated, so a filter that reads keywords can't recurse into itself. */
  private readonly evaluatingPlayerKeywordGrants = new Set<PlayerKeywordGrant>();

  private playerKeywordGrantMatches(grant: PlayerKeywordGrant, permanentId: string): boolean {
    if (grant.matches === undefined) return true;
    if (this.evaluatingPlayerKeywordGrants.has(grant)) return false;
    this.evaluatingPlayerKeywordGrants.add(grant);
    try {
      return grant.matches(permanentId);
    } finally {
      this.evaluatingPlayerKeywordGrants.delete(grant);
    }
  }

  /** Effect-gained copies, excluding keywords materialized from printed continuous effects. */
  gainedKeywordCount(permanentId: string, keyword: string): number {
    const direct = this.keywordGrants.filter(
      (grant) =>
        grant.permanentId === permanentId &&
        grant.keyword === keyword &&
        !grant.continuous &&
        this.keywordGrantIsActive(grant),
    ).length;
    const seat = this.controllerSeatOf?.(permanentId);
    return (
      direct +
      this.playerKeywordGrants.filter(
        (grant) =>
          grant.seat === seat && grant.keyword === keyword && this.playerKeywordGrantMatches(grant, permanentId),
      ).length
    );
  }

  captureContinuousKeywordGrantsFromOtherSources(
    permanentId: string,
    keyword: string,
    excludedSourceInstanceId: string,
  ): (() => boolean)[] {
    const continuousKey = (grant: KeywordGrant) =>
      JSON.stringify([grant.sourceInstanceId, grant.sourceCardId, grant.sourceEffectText]);
    const liveKeys = () =>
      new Set(
        this.keywordGrants
          .filter(
            (grant) =>
              grant.permanentId === permanentId &&
              grant.keyword === keyword &&
              grant.continuous === true &&
              this.keywordGrantIsActive(grant),
          )
          .map(continuousKey),
      );
    return this.keywordGrants
      .filter(
        (grant) =>
          grant.permanentId === permanentId &&
          grant.keyword === keyword &&
          grant.continuous === true &&
          grant.sourceInstanceId !== undefined &&
          grant.sourceInstanceId !== excludedSourceInstanceId &&
          this.keywordGrantIsActive(grant),
      )
      .map((grant) => {
        const key = continuousKey(grant);
        return () => liveKeys().has(key);
      });
  }

  /** Capture only the grants that may sustain a keyword already pending activation. */
  capturePendingKeywordGrants(permanentId: string, keyword: string): (() => boolean) | undefined {
    // One-shot grants retain object identity across recomputes. Continuous grants
    // are rebuilt, so retain their physical source and clause instead. A new grant
    // cannot stand in for one removed before its pending keyword activates.
    const active = () =>
      this.keywordGrants.filter(
        (grant) => grant.permanentId === permanentId && grant.keyword === keyword && this.keywordGrantIsActive(grant),
      );
    const continuousKey = (grant: KeywordGrant) =>
      JSON.stringify([grant.sourceInstanceId, grant.sourceCardId, grant.sourceEffectText]);
    let direct = active().filter((grant) => !grant.continuous);
    let continuous = active()
      .filter((grant) => grant.continuous)
      .map(continuousKey);
    const playerMatches = (grant: PlayerKeywordGrant) =>
      grant.seat === this.controllerSeatOf?.(permanentId) &&
      grant.keyword === keyword &&
      this.playerKeywordGrantMatches(grant, permanentId);
    let player = this.playerKeywordGrants.filter(playerMatches);
    if (direct.length + continuous.length + player.length === 0) return undefined;
    return () => {
      const live = active();
      direct = direct.filter((grant) => live.includes(grant));
      const liveContinuous = new Set(live.filter((grant) => grant.continuous).map(continuousKey));
      continuous = continuous.filter((key) => liveContinuous.has(key));
      player = player.filter((grant) => this.playerKeywordGrants.includes(grant) && playerMatches(grant));
      return direct.length + continuous.length + player.length > 0;
    };
  }

  /** Whether a permanent currently has a given keyword from any active grant. */
  hasKeyword(permanentId: string, keyword: string): boolean {
    const result =
      this.printedKeywordsOfPermanent?.(permanentId)?.includes(keyword) === true ||
      this.grantedKeywords(permanentId).some((grant) => grant.keyword === keyword);
    return result;
  }

  /** Active parameter alternatives carried by grants such as Decoy (Black/White). */
  keywordSpecifiers(permanentId: string, keyword: string): string[] {
    return this.keywordGrants
      .filter(
        (grant) => grant.permanentId === permanentId && grant.keyword === keyword && this.keywordGrantIsActive(grant),
      )
      .flatMap((grant) => grant.specifiers ?? []);
  }

  /** Active provenance records for a granted keyword, preserving inherited sources. */
  keywordGrantSources(
    permanentId: string,
    keyword: string,
  ): Array<{ sourceCardId?: string; sourceInstanceId?: string; effectText?: string; specifiers?: string[] }> {
    return this.keywordGrants
      .filter(
        (grant) => grant.permanentId === permanentId && grant.keyword === keyword && this.keywordGrantIsActive(grant),
      )
      .map(({ sourceCardId, sourceInstanceId, sourceEffectText, specifiers }) => ({
        sourceCardId,
        sourceInstanceId,
        effectText: sourceEffectText,
        specifiers,
      }));
  }

  private keywordGrantIsActive(grant: KeywordGrant): boolean {
    const recipientSeat = this.controllerSeatOf?.(grant.permanentId);
    if (grant.sourceSeat !== undefined && recipientSeat !== undefined) {
      // An immunity that isn't scoped to the opponent also suppresses its controller's own
      // grants (LM-020's declared category, KB Q4007/Q4011).
      const byOpponentEffect = grant.sourceSeat !== recipientSeat;
      const sourceKinds = grant.sourceKinds ?? [];
      const immune =
        sourceKinds.length === 0
          ? this.hasRestriction(grant.permanentId, "beAffected", undefined, { byOpponentEffect })
          : sourceKinds.some((kind) =>
              this.hasRestriction(grant.permanentId, "beAffected", kind, { byOpponentEffect }),
            );
      if (immune) return false;
    }
    if (grant.active === undefined) return true;
    // A conditional grant may inspect the recipient through permanentMatchesFilter,
    // which itself reads grantedKeywords. Exclude the grant currently being evaluated
    // from that nested read so it cannot recursively ask whether it is active forever.
    if (this.evaluatingKeywordGrants.has(grant)) return false;
    this.evaluatingKeywordGrants.add(grant);
    try {
      return grant.active();
    } finally {
      this.evaluatingKeywordGrants.delete(grant);
    }
  }

  /**
   * Remove the first active keyword grant matching both `permanentId` and `keyword`
   * (consume-on-resolve semantics for `＜Delay＞` gating: the grant is armed by
   * `GainKeyword(Delay)` on one turn and revoked here when the gated play fires).
   */
  removeKeywordGrant(permanentId: string, keyword: string): void {
    const idx = this.keywordGrants.findIndex((g) => g.permanentId === permanentId && g.keyword === keyword);
    if (idx !== -1) this.keywordGrants.splice(idx, 1);
  }

  /**
   * Record a `<Link +N>` grant raising a permanent's link limit by `delta`
   *. Read by `linkMax` (mindLink.ts);
   * lapses on dropPermanent / sweep / clearContinuous like every other grant.
   */
  addLinkMaxGrant(permanentId: string, delta: number, duration: EffectDuration, opts?: { continuous?: boolean }): void {
    this.linkMaxGrants.push(this.anchorDuration({ permanentId, delta, duration, continuous: opts?.continuous }));
  }

  /** Sum of every active `<Link +N>` delta granted to a permanent (0 when none). */
  linkMaxDelta(permanentId: string): number {
    return this.linkMaxGrants.filter((g) => g.permanentId === permanentId).reduce((total, g) => total + g.delta, 0);
  }

  /**
   * Record a recipient-scoped link-cost-reduction grant.
   * `traits` are matched case-insensitively against a would-link card's traits. Read by
   * `linkCostReduction`; lapses on dropPermanent / sweep / clearContinuous like every grant.
   */
  addLinkCostReductionGrant(
    permanentId: string,
    amount: number,
    traits: string[],
    duration: EffectDuration,
    opts?: {
      continuous?: boolean;
      sourceCardId?: string;
      sourceInstanceId?: string;
      controllerSeat?: Seat;
      optional?: boolean;
      oncePerTurnKey?: string;
    },
  ): void {
    this.linkCostReductionGrants.push(
      this.anchorDuration({
        permanentId,
        amount,
        traits: traits.map((t) => t.toLowerCase()),
        duration,
        continuous: opts?.continuous,
        sourceCardId: opts?.sourceCardId,
        sourceInstanceId: opts?.sourceInstanceId,
        controllerSeat: opts?.controllerSeat,
        optional: opts?.optional,
        oncePerTurnKey: opts?.oncePerTurnKey,
      }),
    );
  }

  /**
   * The link-cost reduction that applies when a card with traits `cardTraits` would link to
   * `recipientId`. Per KB BT25-089 Q6423 multiple reductions do NOT stack on one link declaration,
   * so this returns the LARGEST single matching grant's amount (0 when none matches). A grant with
   * no `traits` (empty) applies to any would-link card.
   */
  linkCostReduction(recipientId: string, cardTraits: readonly string[]): number {
    return this.linkCostReductionGrant(recipientId, cardTraits)?.amount ?? 0;
  }

  /** Highest matching declaration-time grant that has not been consumed. */
  linkCostReductionGrant(
    recipientId: string,
    cardTraits: readonly string[],
    used: (key: string) => boolean = () => false,
  ): LinkCostReductionGrant | undefined {
    const lowered = cardTraits.map((t) => t.toLowerCase());
    let best: LinkCostReductionGrant | undefined;
    for (const g of this.linkCostReductionGrants) {
      if (g.permanentId !== recipientId) continue;
      if (g.oncePerTurnKey !== undefined && used(g.oncePerTurnKey)) continue;
      const traitOk = g.traits.length === 0 || g.traits.some((t) => lowered.includes(t));
      if (!traitOk) continue;
      if (best === undefined || g.amount > best.amount) best = g;
    }
    return best;
  }

  /**
   * Grant a card kind to a permanent for a duration ("this Tamer is also treated as
   * the exported `effectiveKinds` helper; lapses on dropPermanent / sweep /
   * clearContinuous like every other grant.
   */
  addKindGrant(
    permanentId: string,
    kinds: CardKind[],
    duration: EffectDuration,
    opts?: { continuous?: boolean },
  ): void {
    this.kindGrants.push(this.anchorDuration({ permanentId, kinds, duration, continuous: opts?.continuous }));
  }

  /** Additional kinds currently granted to a permanent (CardKind values, deduplicated). */
  grantedKinds(permanentId: string): CardKind[] {
    const seen = new Set<CardKind>();
    for (const g of this.kindGrants) {
      if (g.permanentId === permanentId) g.kinds.forEach((k) => seen.add(k));
    }
    return [...seen];
  }

  /**
   * Record a seat-level "can't ignore digivolution requirements" rule (documented behavior
   * rule implementation). Read by `cannotIgnoreDigivolution`.
   */
  addCannotIgnoreDigivolution(seat: Seat, duration: EffectDuration, opts?: { continuous?: boolean }): void {
    this.cannotIgnoreDigivolutionFlags.push(this.anchorDuration({ seat, duration, continuous: opts?.continuous }));
  }

  /** Whether `seat` is currently barred from using ignore-digivolution-requirements effects. */
  cannotIgnoreDigivolution(seat: Seat): boolean {
    return this.cannotIgnoreDigivolutionFlags.some((f) => f.seat === seat);
  }

  /**
   * Grant a continuous additional color to a permanent for a duration ("[Your Turn] This
   * Digimon is also treated as blue"). The color-legality consumers (digivolve EvoCost color
   * check, play-time color requirement) read `grantedColors` and union it with the printed
   * authoritative state so the grant is not a silent no-op; it lapses when the source leaves
   * play (dropPermanent) or its duration/`when` gate stops holding (clearContinuous +
   * recompute), exactly like a granted keyword.
   */
  addColorGrant(permanentId: string, color: string, duration: EffectDuration, opts?: { continuous?: boolean }): void {
    this.colorGrants.push(this.anchorDuration({ permanentId, color, duration, continuous: opts?.continuous }));
  }

  /** Additional colors currently granted to a permanent (CardColor values, deduplicated). */
  grantedColors(permanentId: string): string[] {
    const seen = new Set<string>();
    for (const g of this.colorGrants) {
      if (g.permanentId === permanentId) seen.add(g.color);
    }
    return [...seen];
  }

  /**
   * Record a "this Digimon's stacked cards can't be trashed by the opponent's effects" lock on
   * `permanentId` (EX11-070's rule implementation; KB Q5943). Read by `stackTrashLocked`,
   * consulted at the digivolution-card trash sites.
   */
  addStackTrashLock(permanentId: string, duration: EffectDuration, opts?: { continuous?: boolean }): void {
    this.stackTrashLocks.push(this.anchorDuration({ permanentId, duration, continuous: opts?.continuous }));
  }

  addSeatStackTrashLock(ownerSeat: Seat, duration: EffectDuration, opts?: { continuous?: boolean }): void {
    this.seatStackTrashLocks.push(this.anchorDuration({ ownerSeat, duration, continuous: opts?.continuous }));
  }

  /** Whether a permanent's stacked cards are currently locked against trashing (by any active lock). */
  stackTrashLocked(permanentId: string): boolean {
    if (this.stackTrashLocks.some((l) => l.permanentId === permanentId)) return true;
    if (this.seatStackTrashLocks.length === 0) return false;
    const controllerSeat = this.controllerSeatOf?.(permanentId);
    return this.seatStackTrashLocks.some((l) => l.ownerSeat === controllerSeat);
  }

  addStackCardTrashLock(
    instanceId: string,
    ownerSeat: Seat,
    duration: EffectDuration,
    opts?: { continuous?: boolean },
  ): void {
    this.stackCardTrashLocks.push(
      this.anchorDuration({ instanceId, ownerSeat, duration, continuous: opts?.continuous }),
    );
  }

  /** Whether effects are currently forbidden from trashing this exact stacked card. */
  stackCardTrashLocked(instanceId: string): boolean {
    return this.stackCardTrashLocks.some((lock) => lock.instanceId === instanceId);
  }

  /**
   * Record a "invert each ＜Security Attack ±N＞ grant on this permanent" rule (EX6-031; KB
   * Q3751/Q3752). Read by `securityAttackInverted`, consulted at the security-check strike count.
   */
  addSecurityAttackInversion(permanentId: string, duration: EffectDuration, opts?: { continuous?: boolean }): void {
    this.securityAttackInversions.push(this.anchorDuration({ permanentId, duration, continuous: opts?.continuous }));
  }

  /** Whether a permanent's ＜Security Attack ±N＞ grants are currently sign-inverted (any active rule). */
  securityAttackInverted(permanentId: string): boolean {
    return this.securityAttackInversions.some((i) => i.permanentId === permanentId);
  }

  /** Drop every continuous rule scoped to a permanent (when it leaves the field). */
  dropPermanent(permanentId: string): void {
    this.restrictions = this.restrictions.filter((r) => r.permanentId !== permanentId);
    this.attackTargetRestrictions = this.attackTargetRestrictions.filter(
      (entry) => entry.attackerPermanentId !== permanentId && entry.targetPermanentId !== permanentId,
    );
    this.canAttackUnsuspendedGrants = this.canAttackUnsuspendedGrants.filter((g) => g.permanentId !== permanentId);
    this.vortexCanAttackPlayersGrants = this.vortexCanAttackPlayersGrants.filter((g) => g.permanentId !== permanentId);
    this.suspendRestrictionSources = this.suspendRestrictionSources.filter((s) => s.permanentId !== permanentId);
    this.digivolveIntoConstraints = this.digivolveIntoConstraints.filter((c) => c.permanentId !== permanentId);
    this.nameTraitGrants = this.nameTraitGrants.filter((g) => g.permanentId !== permanentId);
    this.originalCardInfoOverrides = this.originalCardInfoOverrides.filter((g) => g.permanentId !== permanentId);
    this.keywordGrants = this.keywordGrants.filter((g) => g.permanentId !== permanentId);
    this.linkMaxGrants = this.linkMaxGrants.filter((g) => g.permanentId !== permanentId);
    this.linkCostReductionGrants = this.linkCostReductionGrants.filter((g) => g.permanentId !== permanentId);
    this.kindGrants = this.kindGrants.filter((g) => g.permanentId !== permanentId);
    this.colorGrants = this.colorGrants.filter((g) => g.permanentId !== permanentId);
    this.stackTrashLocks = this.stackTrashLocks.filter((l) => l.permanentId !== permanentId);
    this.securityAttackInversions = this.securityAttackInversions.filter((i) => i.permanentId !== permanentId);
    this.stackEffectConferrals = this.stackEffectConferrals.filter((c) => c.targetPermanentId !== permanentId);
    this.onDeletionAtEndOfAttackProjections = this.onDeletionAtEndOfAttackProjections.filter(
      (p) => p.permanentId !== permanentId,
    );
    // NOTE: customEffectGrants are anchored on the granted card's INSTANCE, not its permanent, and
    // are intentionally NOT dropped here. The grant must outlive the permanent's field-leave so a
    // granted [On Deletion] still fires on the grantee's OWN deletion (the instance is in trash by
    // the deletion window). The grant lapses via `sweep` at its duration boundary, or when the card
    // re-enters the field (`dropCustomEffectGrantsOfReenteringCards`).
    // A security disable lives on its attacker; a timing disable on its suppressed target —
    // either lapses once that permanent leaves the field.
    this.securityEffectDisables = this.securityEffectDisables.filter((d) => d.attackerPermanentId !== permanentId);
    this.effectTimingDisables = this.effectTimingDisables.filter((d) => d.permanentId !== permanentId);
  }

  /** Confer a stack card's effects onto its owning permanent. */
  conferStackEffects(
    targetPermanentId: string,
    stackInstanceId: string,
    opts?: {
      continuous?: boolean;
      trigger?: string;
      excludeInherited?: boolean;
      excludeKeywords?: Keyword[];
      inheritedOnly?: boolean;
      granterInstanceId?: string;
    },
  ): void {
    const exists = this.stackEffectConferrals.some(
      (c) =>
        c.targetPermanentId === targetPermanentId &&
        c.stackInstanceId === stackInstanceId &&
        c.trigger === opts?.trigger &&
        c.inheritedOnly === opts?.inheritedOnly &&
        (c.excludeKeywords?.length ?? 0) === (opts?.excludeKeywords?.length ?? 0) &&
        (c.excludeKeywords ?? []).every((keyword) => opts?.excludeKeywords?.includes(keyword) === true) &&
        c.granterInstanceId === opts?.granterInstanceId,
    );
    if (exists) return;
    this.stackEffectConferrals.push(
      this.anchorDuration({
        targetPermanentId,
        stackInstanceId,
        continuous: opts?.continuous,
        trigger: opts?.trigger,
        excludeInherited: opts?.excludeInherited,
        excludeKeywords: opts?.excludeKeywords,
        inheritedOnly: opts?.inheritedOnly,
        granterInstanceId: opts?.granterInstanceId,
      }),
    );
  }

  /** Active stack-effect conferrals (GrantStatic grant:"effects"). */
  listStackEffectConferrals(): readonly StackEffectConferral[] {
    return this.stackEffectConferrals;
  }

  /** Offer a permanent's [On Deletion] effects at the end of its own attack (BT16-015). */
  projectOnDeletionAtEndOfAttack(permanentId: string, duration: EffectDuration): void {
    if (this.onDeletionAtEndOfAttackProjections.some((p) => p.permanentId === permanentId)) return;
    this.onDeletionAtEndOfAttackProjections.push(this.anchorDuration({ permanentId, duration, continuous: true }));
  }

  /** Permanents currently projecting their [On Deletion] effects into the end-of-attack window. */
  listOnDeletionAtEndOfAttackProjections(): readonly OnDeletionAtEndOfAttackProjection[] {
    return this.onDeletionAtEndOfAttackProjections;
  }

  /**
   * Grant a named custom effect onto a permanent for a duration. Calls without an activation
   * identity are distinct resolved grants and therefore stack. An explicit identity deduplicates
   * only repeated materializations of THAT activation (for example, duplicate entry signals).
   */
  addCustomEffectGrant(
    instanceId: string,
    ownerSeat: Seat,
    token: string,
    duration: EffectDuration,
    opts?: { activationIdentity?: object; isActive?: () => boolean; continuous?: boolean; sourceCardId?: string },
  ): void {
    const exists =
      opts?.activationIdentity !== undefined &&
      this.customEffectGrants.some(
        (grant) =>
          grant.instanceId === instanceId &&
          grant.token === token &&
          grant.activationIdentity === opts.activationIdentity,
      );
    if (exists) return;
    this.customEffectGrants.push(
      this.anchorDuration({
        grantId: this.nextCustomEffectGrantId++,
        instanceId,
        ownerSeat,
        token,
        duration,
        ...opts,
      }),
    );
  }

  /** Keep effects granted to a Digimon attached when that Digimon changes its top card. */
  reanchorCustomEffectGrants(priorTopInstanceId: string, newTopInstanceId: string): void {
    for (const grant of this.customEffectGrants) {
      if (grant.instanceId === priorTopInstanceId) grant.instanceId = newTopInstanceId;
    }
  }

  /**
   * A granted card that leaves the field keeps its grants only for the reactions to that exit,
   * such as its own [On Deletion]. Once it re-enters the field it is a new card without them
   * (CR §3-1-3-1-2; BT3-109 KB Q1148).
   */
  markCustomEffectGrantsLeftField(instanceIds: readonly string[]): void {
    const leaving = new Set(instanceIds);
    for (const grant of this.customEffectGrants) {
      if (leaving.has(grant.instanceId)) this.grantsOfCardsThatLeftField.add(grant);
    }
  }

  dropCustomEffectGrantsOfReenteringCards(instanceIds: readonly string[]): void {
    const entering = new Set(instanceIds);
    this.customEffectGrants = this.customEffectGrants.filter(
      (grant) => !entering.has(grant.instanceId) || !this.grantsOfCardsThatLeftField.has(grant),
    );
  }

  /** Active named custom effect grants (the collector compiles each token to a real Effect). */
  listCustomEffectGrants(): readonly CustomEffectGrant[] {
    return this.customEffectGrants;
  }

  /** Expire all continuous rules whose duration clears at `boundary`; nested battle scopes
   * restrict end-battle cleanup to entries created inside that scope. */
  /**
   * Drain the permanents whose `beAffected` immunity expired since the last call, so the caller
   * can recompute the effects that now apply to them again (KB Q5328).
   */
  takeExpiredAffectationRecipients(): string[] {
    const drained = [...this.expiredAffectationRecipients];
    this.expiredAffectationRecipients.clear();
    return drained;
  }

  sweep(state: GameState, boundary: DurationBoundary, sweepSeat: Seat, battleScopeId?: number): void {
    const ownerOf = (permanentId: string): Seat => ownerSeatOfPermanent(state, permanentId);
    this.restrictions = this.restrictions.filter((r) => {
      if (!this.expiresAt(r, r.duration, boundary, ownerOf(r.permanentId), sweepSeat, battleScopeId)) return true;
      // Losing "isn't affected by effects" RE-APPLIES an effect the card was given while it was
      // immune (KB Q5328). The DP ledger only re-reads that suppression when it recomputes, so
      // record the recipient for the sweep site to recompute.
      if (r.restriction === "beAffected") this.expiredAffectationRecipients.add(r.permanentId);
      return false;
    });
    this.playerRestrictions = this.playerRestrictions.filter((entry) => {
      if (!this.expiresAt(entry, entry.duration, boundary, entry.ownerSeat, sweepSeat, battleScopeId)) return true;
      // KB Q5328, as for a per-permanent immunity above.
      if (entry.restriction === "beAffected") {
        for (const { permanentId } of state.players[entry.seat]?.battleArea ?? []) {
          this.expiredAffectationRecipients.add(permanentId);
        }
      }
      return false;
    });
    this.attackTargetRestrictions = this.attackTargetRestrictions.filter(
      (entry) =>
        !this.expiresAt(entry, entry.duration, boundary, ownerOf(entry.attackerPermanentId), sweepSeat, battleScopeId),
    );
    this.canAttackUnsuspendedGrants = this.canAttackUnsuspendedGrants.filter(
      (g) => !this.expiresAt(g, g.duration, boundary, ownerOf(g.permanentId), sweepSeat, battleScopeId),
    );
    this.vortexCanAttackPlayersGrants = this.vortexCanAttackPlayersGrants.filter(
      (g) => !this.expiresAt(g, g.duration, boundary, ownerOf(g.permanentId), sweepSeat, battleScopeId),
    );
    this.suspendRestrictionSources = this.suspendRestrictionSources.filter(
      (s) => !this.expiresAt(s, s.duration, boundary, ownerOf(s.permanentId), sweepSeat, battleScopeId),
    );
    this.unsuspendedDigivolveProhibitions = this.unsuspendedDigivolveProhibitions.filter(
      (entry) => !this.expiresAt(entry, entry.duration, boundary, entry.sourceSeat, sweepSeat, battleScopeId),
    );
    this.digivolveIntoConstraints = this.digivolveIntoConstraints.filter(
      (c) => !this.expiresAt(c, c.duration, boundary, ownerOf(c.permanentId), sweepSeat, battleScopeId),
    );
    this.nameTraitGrants = this.nameTraitGrants.filter(
      (g) => !this.expiresAt(g, g.duration, boundary, ownerOf(g.permanentId), sweepSeat, battleScopeId),
    );
    this.originalCardInfoOverrides = this.originalCardInfoOverrides.filter(
      (g) => !this.expiresAt(g, g.duration, boundary, ownerOf(g.permanentId), sweepSeat, battleScopeId),
    );
    this.keywordGrants = this.keywordGrants.filter(
      (g) => !this.expiresAt(g, g.duration, boundary, ownerOf(g.permanentId), sweepSeat, battleScopeId),
    );
    this.playerKeywordGrants = this.playerKeywordGrants.filter(
      (grant) =>
        !this.expiresAt(grant, grant.duration, boundary, grant.ownerSeat ?? grant.seat, sweepSeat, battleScopeId),
    );
    this.playerCustomEffectGrants = this.playerCustomEffectGrants.filter(
      (grant) => !this.expiresAt(grant, grant.duration, boundary, grant.ownerSeat, sweepSeat, battleScopeId),
    );
    this.linkMaxGrants = this.linkMaxGrants.filter(
      (g) => !this.expiresAt(g, g.duration, boundary, ownerOf(g.permanentId), sweepSeat, battleScopeId),
    );
    this.linkCostReductionGrants = this.linkCostReductionGrants.filter(
      (g) => !this.expiresAt(g, g.duration, boundary, ownerOf(g.permanentId), sweepSeat, battleScopeId),
    );
    this.kindGrants = this.kindGrants.filter(
      (g) => !this.expiresAt(g, g.duration, boundary, ownerOf(g.permanentId), sweepSeat, battleScopeId),
    );
    this.cannotIgnoreDigivolutionFlags = this.cannotIgnoreDigivolutionFlags.filter(
      (f) => !this.expiresAt(f, f.duration, boundary, f.seat, sweepSeat, battleScopeId),
    );
    this.securityAddRestrictions = this.securityAddRestrictions.filter(
      (entry) => !this.expiresAt(entry, entry.duration, boundary, entry.granterSeat, sweepSeat, battleScopeId),
    );
    this.colorGrants = this.colorGrants.filter(
      (g) => !this.expiresAt(g, g.duration, boundary, ownerOf(g.permanentId), sweepSeat, battleScopeId),
    );
    this.stackTrashLocks = this.stackTrashLocks.filter(
      (l) => !this.expiresAt(l, l.duration, boundary, ownerOf(l.permanentId), sweepSeat, battleScopeId),
    );
    this.seatStackTrashLocks = this.seatStackTrashLocks.filter(
      (lock) => !this.expiresAt(lock, lock.duration, boundary, lock.ownerSeat, sweepSeat, battleScopeId),
    );
    this.stackCardTrashLocks = this.stackCardTrashLocks.filter(
      (lock) => !this.expiresAt(lock, lock.duration, boundary, lock.ownerSeat, sweepSeat, battleScopeId),
    );
    this.securityAttackInversions = this.securityAttackInversions.filter(
      (i) => !this.expiresAt(i, i.duration, boundary, ownerOf(i.permanentId), sweepSeat, battleScopeId),
    );
    // Color waivers are scoped to a card instance (usually the playing card itself);
    // they clear on turn boundaries by their stated duration, owner-agnostic.
    this.colorWaivers = this.colorWaivers.filter(
      (w) => !this.expiresAt(w, w.duration, boundary, sweepSeat, sweepSeat, battleScopeId),
    );
    this.memoryGainPolicies = this.memoryGainPolicies.filter(
      (p) => !this.expiresAt(p, p.duration, boundary, p.seat, sweepSeat, battleScopeId),
    );
    this.costReductionBlocks = this.costReductionBlocks.filter(
      (b) => !this.expiresAt(b, b.duration, boundary, b.seat, sweepSeat, battleScopeId),
    );
    this.playProhibitions = this.playProhibitions.filter(
      (p) => !this.expiresAt(p, p.duration, boundary, p.sourceSeat, sweepSeat, battleScopeId),
    );
    this.securityEffectDisables = this.securityEffectDisables.filter(
      (d) =>
        !this.expiresAt(
          d,
          d.duration,
          boundary,
          d.attackerSeat ?? ownerOf(d.attackerPermanentId ?? ""),
          sweepSeat,
          battleScopeId,
        ),
    );
    this.effectTimingDisables = this.effectTimingDisables.filter(
      (d) => !this.expiresAt(d, d.duration, boundary, ownerOf(d.permanentId), sweepSeat, battleScopeId),
    );
    this.playerEffectTimingDisables = this.playerEffectTimingDisables.filter(
      (entry) => !this.expiresAt(entry, entry.duration, boundary, entry.ownerSeat, sweepSeat, battleScopeId),
    );
    // UntilOpponentTurnEnd is framed from the GRANTER's seat (recorded as `ownerSeat`), so this
    // clears at the end of the granter's opponent's turn (RB1-030). Anchored on the instance, the
    // grant also lingers harmlessly in trash post-deletion until this boundary sweep removes it.
    this.customEffectGrants = this.customEffectGrants.filter(
      (g) => !this.expiresAt(g, g.duration, boundary, g.ownerSeat, sweepSeat, battleScopeId),
    );
  }

  /**
   * Drop every CONTINUOUS rule (those produced by persistent / static effects), leaving
   * one-shot, duration-scoped rules intact. Called at the start of the engine's
   * continuous-recompute pass so the static effects can be re-derived from a clean slate
   * without double-applying (Comprehensive Rules §15-8-2: persistent effects are
   * constantly re-applied). One-shot rules ("gains ＜Blocker＞ until end of turn") expire
   * only at their own boundary via `sweep`.
   */
  clearContinuous(): void {
    this.restrictions = this.restrictions.filter((r) => {
      if (r.continuous && r.restriction === "beAffected") {
        this.expiredAffectationRecipients.add(r.permanentId);
      }
      return !r.continuous;
    });
    this.playerRestrictions = this.playerRestrictions.filter((r) => !r.continuous);
    this.attackTargetRestrictions = this.attackTargetRestrictions.filter((r) => !r.continuous);
    this.canAttackUnsuspendedGrants = this.canAttackUnsuspendedGrants.filter((g) => !g.continuous);
    this.vortexCanAttackPlayersGrants = this.vortexCanAttackPlayersGrants.filter((g) => !g.continuous);
    this.digivolveIntoConstraints = this.digivolveIntoConstraints.filter((c) => !c.continuous);
    this.nameTraitGrants = this.nameTraitGrants.filter((g) => !g.continuous);
    this.originalCardInfoOverrides = this.originalCardInfoOverrides.filter((g) => !g.continuous);
    this.colorWaivers = this.colorWaivers.filter((w) => !w.continuous);
    this.keywordGrants = this.keywordGrants.filter((g) => !g.continuous);
    this.linkMaxGrants = this.linkMaxGrants.filter((g) => !g.continuous);
    this.linkCostReductionGrants = this.linkCostReductionGrants.filter((g) => !g.continuous);
    this.kindGrants = this.kindGrants.filter((g) => !g.continuous);
    this.cannotIgnoreDigivolutionFlags = this.cannotIgnoreDigivolutionFlags.filter((f) => !f.continuous);
    this.colorGrants = this.colorGrants.filter((g) => !g.continuous);
    this.stackTrashLocks = this.stackTrashLocks.filter((l) => !l.continuous);
    this.seatStackTrashLocks = this.seatStackTrashLocks.filter((lock) => !lock.continuous);
    this.stackCardTrashLocks = this.stackCardTrashLocks.filter((lock) => !lock.continuous);
    this.securityAttackInversions = this.securityAttackInversions.filter((i) => !i.continuous);
    this.stackEffectConferrals = this.stackEffectConferrals.filter((c) => !c.continuous);
    this.onDeletionAtEndOfAttackProjections = this.onDeletionAtEndOfAttackProjections.filter((p) => !p.continuous);
    this.customEffectGrants = this.customEffectGrants.filter((grant) => !grant.continuous);
    this.memoryGainPolicies = this.memoryGainPolicies.filter((p) => !p.continuous);
    this.costReductionBlocks = this.costReductionBlocks.filter((b) => !b.continuous);
    this.playProhibitions = this.playProhibitions.filter((p) => !p.continuous);
    this.securityEffectDisables = this.securityEffectDisables.filter((d) => !d.continuous);
    this.effectTimingDisables = this.effectTimingDisables.filter((d) => !d.continuous);
    this.playerEffectTimingDisables = this.playerEffectTimingDisables.filter((d) => !d.continuous);
    this.dnaLevelOverrides = this.dnaLevelOverrides.filter((entry) => !entry.continuous);
  }

  /** Clear everything (fresh match). */
  reset(): void {
    this.restrictions = [];
    this.playerRestrictions = [];
    this.attackTargetRestrictions = [];
    this.canAttackUnsuspendedGrants = [];
    this.vortexCanAttackPlayersGrants = [];
    this.suspendRestrictionSources = [];
    this.unsuspendedDigivolveProhibitions = [];
    this.digivolveIntoConstraints = [];
    this.nameTraitGrants = [];
    this.originalCardInfoOverrides = [];
    this.colorWaivers = [];
    this.keywordGrants = [];
    this.playerKeywordGrants = [];
    this.playerCustomEffectGrants = [];
    this.linkMaxGrants = [];
    this.linkCostReductionGrants = [];
    this.kindGrants = [];
    this.cannotIgnoreDigivolutionFlags = [];
    this.colorGrants = [];
    this.stackTrashLocks = [];
    this.seatStackTrashLocks = [];
    this.stackCardTrashLocks = [];
    this.securityAttackInversions = [];
    this.stackEffectConferrals = [];
    this.onDeletionAtEndOfAttackProjections = [];
    this.customEffectGrants = [];
    this.memoryGainPolicies = [];
    this.costReductionBlocks = [];
    this.playProhibitions = [];
    this.securityEffectDisables = [];
    this.effectTimingDisables = [];
    this.playerEffectTimingDisables = [];
    this.dnaLevelOverrides = [];
  }
}

function isContinuousLedgerState(value: unknown): value is ContinuousLedgerState {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const state = value as ContinuousLedgerState;
  const arrays = [
    state.restrictions,
    state.playerRestrictions,
    state.attackTargetRestrictions,
    state.canAttackUnsuspendedGrants,
    state.vortexCanAttackPlayersGrants,
    state.suspendRestrictionSources,
    state.unsuspendedDigivolveProhibitions,
    state.digivolveIntoConstraints,
    state.nameTraitGrants,
    state.originalCardInfoOverrides,
    state.colorWaivers,
    state.keywordGrants,
    state.playerKeywordGrants,
    state.playerCustomEffectGrants,
    state.linkMaxGrants,
    state.linkCostReductionGrants,
    state.kindGrants,
    state.cannotIgnoreDigivolutionFlags,
    state.securityAddRestrictions,
    state.colorGrants,
    state.stackTrashLocks,
    state.seatStackTrashLocks,
    state.stackCardTrashLocks,
    state.securityAttackInversions,
    state.stackEffectConferrals,
    state.onDeletionAtEndOfAttackProjections,
    state.customEffectGrants,
    state.memoryGainPolicies,
    state.costReductionBlocks,
    state.playProhibitions,
    state.securityEffectDisables,
    state.effectTimingDisables,
    state.playerEffectTimingDisables,
    state.dnaLevelOverrides,
  ];
  if (
    !arrays.every(
      (entries) => Array.isArray(entries) && entries.every((entry) => entry !== null && typeof entry === "object"),
    )
  ) {
    return false;
  }
  if (!Number.isSafeInteger(state.nextCustomEffectGrantId) || state.nextCustomEffectGrantId < 1) {
    return false;
  }
  if (
    !(state.battleScopes instanceof Map) ||
    !(state.expiredAffectationRecipients instanceof Set) ||
    !(state.grantsOfCardsThatLeftField instanceof Set) ||
    !Array.isArray(state.durationOwners)
  ) {
    return false;
  }
  if (
    !state.durationOwners.every(
      (entry) =>
        Array.isArray(entry) &&
        entry.length === 2 &&
        entry[0] !== null &&
        typeof entry[0] === "object" &&
        (entry[1] === 0 || entry[1] === 1),
    )
  ) {
    return false;
  }
  return (
    [...state.expiredAffectationRecipients].every((id) => typeof id === "string") &&
    [...state.grantsOfCardsThatLeftField].every((entry) => state.customEffectGrants.includes(entry))
  );
}
