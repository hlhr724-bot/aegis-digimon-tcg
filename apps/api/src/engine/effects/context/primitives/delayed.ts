import type { EffectDuration, EffectTiming, Permanent, Seat, ZoneRef } from "@aegis/shared";
import type { ReplacementInstall } from "../replacements.js";
import type { SubTriggerInstall } from "../subTriggers.js";

/**
 * The delayed-and-rule-effects subsystem: install sub-triggers and replacement
 * effects that fire later, and the rule effects that carry them.
 */
export interface DelayedPrimitives {
  /** Install a delayed/triggered sub-effect on the event bus. Returns its id. */
  subscribeSubTrigger(sub: SubTriggerInstall): number;
  /** Install a replacement effect. Returns its id. */
  subscribeReplacement(sub: ReplacementInstall): number;

  /**
   * Expand DigiXros material source zones for `seat` for `duration` (BT19-079/BT19-087).
   * The play-card / DigiXros material-picking path reads these via `digiXrosExpandedZones`.
   * Optional on the port so faked primitives in tests need no change.
   */
  expandDigiXrosZones?(seat: Seat, zones: ZoneRef[], duration: EffectDuration): void;
  /** Record a DigiXros expansion for the single pending play that activated it. */
  expandDigiXrosZonesForPlay?(
    seat: Seat,
    zones: ZoneRef[],
    duration: EffectDuration,
    pendingPlayInstanceId?: string,
    materialLimits?: Partial<Record<ZoneRef, number>>,
  ): void;
  /**
   * Read the currently-expanded DigiXros material source zones for `seat`.
   * Returns the union of all active expansions, or an empty array when none. Legacy callers
   * that only need presence may use this; quota-aware callers should use the counted reader.
   * Optional on the port so faked primitives in tests need no change.
   */
  digiXrosExpandedZones?(seat: Seat, pendingPlayInstanceId?: string): ZoneRef[];
  /** Read the active expansion quota by source zone, preserving separate Tamer activations. */
  digiXrosExpandedZoneCounts?(seat: Seat, pendingPlayInstanceId?: string): Partial<Record<ZoneRef, number>>;
  /** Number of pending-play expansion activations for `seat`, for replacement success accounting. */
  digiXrosPlayExpansionCount?(seat: Seat, pendingPlayInstanceId?: string): number;
  /** Consume pending-play expansions after material selection; persistent grants survive. */
  consumeDigiXrosPlayExpansions?(seat: Seat, pendingPlayInstanceId?: string): void;
  /** Resolve matching wouldBePlayed replacements before effect-driven DigiXros material selection. */
  clearPreparedDigiXrosPlay?(instanceId: string): void;
  preparedDigiXrosMaterials?(instanceId: string): {
    allowsTrash: boolean;
    reservedInstanceIds: string[];
    ruleTrashMaterials: import("@aegis/shared").CardInstance[];
  };
  prepareDigiXrosPlay?(instanceId: string): Promise<string[]>;
  prepareDigiXrosPlays?(
    instanceIds: readonly string[],
    simultaneousPlayCount?: number,
  ): Promise<Record<string, string[]>>;

  /** Spawn a token Digimon as a new battle-area permanent. */
  playToken(
    seat: Seat,
    tokenName: string,
    opts?: {
      payCost?: boolean;
      suspended?: boolean;
      keywords?: Array<{ keyword: string; amount?: number; specifiers?: string[] }>;
    },
  ): Promise<Permanent | undefined>;
  /** Apply a transient DP modifier to a seat's security Digimon during a check. */
  modifySecurityDp(seat: Seat, delta: number, opts?: { continuous?: boolean; duration?: EffectDuration }): void;
  /**
   * Resolve a DIRECT battle between two battle-area Digimon (a §14 DP comparison; the loser,
   * or both on a tie, is deleted). No attack declaration / block / security — distinct from
   * forceAttack. Per KB the battle is a rule, so it does not check effect-immunity. Optional
   * on the port so faked primitives in tests need no change.
   */
  forceBattle?(
    attackerPermanentId: string,
    defenderPermanentId: string,
    opts?: { comparison?: "digivolutionCards" },
  ): Promise<void>;
  /**
   * Record a continuous DP-based-deletion maximum bonus (the producer side of the
   * DP-deletion-maximum subsystem). Owner-wide when given a seat, source-scoped when given a
   * permanentId. Optional on the port so faked primitives in tests need no change.
   */
  addDeletionMaxDp?(target: { seat: Seat } | { permanentId: string }, delta: number): void;
  /** The active DP-cap bonus for a deletion resolved by `seat` from `sourcePermanentId`. */
  deletionMaxDpBonus?(seat: Seat, sourcePermanentId?: string): number;
  /**
   * Accumulate a DP-delete-budget bonus for a source permanent (producer side of the
   * `AddToDPDeleteBudget` inherited-modifier subsystem). Called once per inherited instance
   * that fires; stacks. Optional on the port — tests that do not exercise the bonus need no change.
   */
  addDpDeleteBudget?(permanentId: string, amount: number): void;
  /**
   * Return the total accumulated DP-delete-budget bonus for the given source permanent.
   * Returns 0 when no bonus has been recorded (no `AddToDPDeleteBudget` fired). Optional.
   */
  dpDeleteBudgetBonus?(permanentId: string): number;
  /**
   * Place a loose Option card into its owner's battle area as a battle-area PERMANENT
   * (source `CanPlayAsNewPermanent isPlayOption:true` / `PlaceDelayOptionCards`). Used by
   * Option-permanent effects such as EX3-036 placing [Trial of the Four Great Dragons] from
   * hand: the Option stays in play rather than resolving-then-trashing. Distinct from
   * `playInstances` (which only plays Digimon/Tamer/DigiEgg permanents and silently skips
   * Options). The placement is gated to a card whose kind is Option; a non-Option instance is
   * a no-op. Returns the created Permanent, or undefined when the instance is missing / not an
   * Option. Optional on the port so faked primitives in tests need no change.
   */
  placeOptionAsPermanent?(instanceId: string): Promise<Permanent | undefined>;
  /**
   * Pay an activation cost by suspending a permanent (BeforePayCost / activateClass1
   * pattern, HARD-05). The caller has already resolved which permanent to pay with;
   * this primitive validates the permanent is unsuspended, affectable, and on the
   * battle area, then suspends it. Returns true when the payment succeeded (permanent
   * was suspended), false when invalid/immune/already-suspended/no-longer-on-field.
   *
   * Explicit parameters — NEVER reads ctx.source.permanent(), which is undefined
   * during the BeforePayCost timing window. Optional on the port so faked primitives
   * in tests need no change.
   */
  payActivationCost?(permanentId: string, costKind: "suspend"): boolean;
  /** Check an activation cost without mutating the permanent. */
  canPayActivationCost?(permanentId: string, costKind: "suspend"): boolean;
  /**
   * Re-activate one (or, with `chooseOne: false`, ALL) of a target permanent's own effects at
   * the given timing(s) — the "activate 1 of that Digimon's [X] effects" family (EX3-065 "[On
   * Play] effects"; generalized for BT11-112 "[When Digivolving] effects", BT24-102 "[On Play]
   * or [When Digivolving] effect" — a combined pool across BOTH timings, BT22-092 "[Main]
   * effects" (`EffectTiming.OnDeclaration`), and BT15-041 "activate the [When Digivolving]
   * effects" — plural, every matching effect, not a choice).
   *
   * `timings` defaults to `[OnPlay]` (EX3-065's original single-timing shape). Collects the
   * TARGET permanent's top-card effects and active inherited effects across every listed timing; when
   * `chooseOne` (default true) there are 2+ candidates, asks the target's controller to pick
   * exactly one (KB Q3430/Q3431 for the OnPlay case); with `chooseOne: false`, every matching
   * candidate resolves in collection order. Each chosen effect resolves with the TARGET
   * permanent as source — a genuine re-fire of that card's own timing effect, not a proxy.
   * Returns whether an effect actually activated (false when there were no eligible
   * candidates, or the chosen one's `canActivate` failed) — BT22-092's "if this activated
   * any effect, gain 1 memory" reads this. Optional on the port; no-op in fakes.
   */
  reactivateOnPlay?(
    permanentId: string,
    opts?: {
      timings?: EffectTiming[];
      chooseOne?: boolean;
      outsideTriggerWindow?: boolean;
      continueEffectAfterAttackDeclaration?: () => Promise<void>;
    },
  ): Promise<boolean>;
}
