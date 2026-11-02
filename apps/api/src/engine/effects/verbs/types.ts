import type { RuntimeCallbackRegistry } from "#api/engine/snapshot/RuntimeCallbackRegistry";
import type { DecisionSelectionGoal } from "@aegis/shared/protocol/DecisionSelectionGoal";
import type { ModifierLedger } from "../modifiers.js";
import type { CollectedEffect } from "../collect.js";
import type { ContinuousEffectLedger } from "../continuous.js";
import type { DnaMemoryGain, SubTriggerRegistry } from "../subtriggers.js";
import type { SubTriggerSourceScope } from "../EffectContext.js";
import type { AttackDecisionProvenance } from "../context/primitives/index.js";
import type {
  AttackTarget,
  CardDefinition,
  CardInstance,
  DigivolutionRequirement,
  GameState,
  Permanent,
  Seat,
  ServerEvent,
  ZoneRef,
} from "@aegis/shared";

/**
 * What `createPrimitives` needs from the engine, and the three ports it reaches
 * the rest of the server through. `PrimitivesEngine` is the seam: the verbs never
 * import GameEngine, they are handed this.
 */

export interface PrimitivesEngine {
  readonly runtimeCallbacks?: RuntimeCallbackRegistry;
  /** Replace a used DUAL Option's pending trash with its optional free digivolution. */
  artsDigivolve?(
    seat: Seat,
    instance: CardInstance,
    definition: CardDefinition,
    duringAttack?: boolean,
  ): Promise<boolean>;
  /** Notify the engine that one triggered effect body has begun resolving. */
  beginEffectBody?(): void;
  /** Notify the engine that one triggered effect body has completely resolved. */
  finishEffectBody?(): void;
  /** Pause enclosing card bodies while an effect-directed attack drains pending effects. */
  resolveAttackTimingWindow?(
    drain: (options?: { retireUnactivatable?: boolean }) => Promise<void>,
    options?: { retireUnactivatable?: boolean },
  ): Promise<void>;
  /**
   * Pause enclosing card bodies for the whole Counter -> End of Attack stretch of an
   * effect-directed attack, so each attack step's triggers resolve as their own windows
   * before the attack advances (CR §11-1).
   */
  runAttackSteps?(body: () => Promise<void>): Promise<void>;
  /**
   * Flush what an attack step deferred, at the boundary between two attack steps. Battle
   * deletions park their [On Deletion] windows while a window token is open (§15-4-4); they
   * must activate before End of Attack, not after the whole attack (§11-1-4).
   */
  settleBetweenAttackSteps?(): Promise<void>;
  /**
   * Resolve whatever an effect-directed attack left in the nested pending pool. Used as the
   * attack's drain when the body that ordered it is a watcher rather than a timing window.
   */
  drainPendingAttackTriggers?(): Promise<void>;
  /**
   * Ask `seat` whether to activate ＜Blitz＞ for `attackerPermanentId`; once accepted, wait for
   * that seat's attack intent naming one of `candidates` ("player" or opponent permanent ids).
   * Resolves `undefined` when the Blitz is declined or abandoned.
   */
  awaitBlitzAttackDeclaration?(
    seat: Seat,
    attackerPermanentId: string,
    candidates: readonly string[],
    provenance?: AttackDecisionProvenance,
  ): Promise<string | undefined>;
  /** The authoritative match state (the only state these verbs read/mutate). */
  readonly state: GameState;
  /** Resolve a static evolution path granted by the base permanent. */
  baseGrantedDigivolve?(
    seat: Seat,
    base: Permanent,
    evolving: CardDefinition,
    sourceZone?: ZoneRef,
  ): { cost: number } | undefined;
  /** Emit a server event (narration/log). */
  emit(event: ServerEvent): void;
  inSecurityCheck?(): boolean;
  /** Allocate a permanentId unique within the match (play-from-hand/security). */
  nextPermanentId(): string;
  /** Allocate an instanceId for token spawn / synthetic instances. */
  nextInstanceId?(): string;
  /** Per-seat seeded stream for shuffles that occur during a match. */
  rngForSeat?(seat: Seat): () => number;
  /** Transient security-DP modifiers for the active security check. */
  securityDp?: import("../../security/securityDp.js").SecurityDpLedger;
  /** Continuous DP-based-deletion maximum bonuses (static-continuous-effects). */
  deletionMaxDp?: import("../../deletionMaxDp.js").DeletionMaxDpLedger;
  /** Continuous DP-based-deletion BUDGET bonuses (BT19-011's inherited `AddToDPDeleteBudget`). */
  dpDeleteBudget?: import("../../dpDeleteBudget.js").DpDeleteBudgetLedger;
  /** Match win declaration (security-and-win-check subsystem). */
  win?: import("../../security/winCheck.js").WinCheck;
  /** Fire a timing window (optional; used before deletion / draw hooks). */
  fireTiming?: (
    timing: import("@aegis/shared").EffectTiming,
    trigger?: import("../EffectContext.js").TriggerInfo,
  ) => Promise<void>;
  /** Resolve simultaneous [On Deletion]/<Ascension> reactions in controller-chosen order. */
  resolveDeletionReactions?: (
    trigger: import("../EffectContext.js").TriggerInfo,
    ascensionCandidates: readonly { instanceId: string; seat: Seat }[],
    transientCandidates?: readonly CardInstance[],
  ) => Promise<void>;
  /** Snapshot the Option-use event before Main; return its deferred activation. */
  prepareOptionUsed?(usedInstanceId: string, usedOptionCost?: number): () => Promise<void>;
  /**
   * Fire the SubTrigger bus (System B) for an event, running armed watchers whose captured
   * sourceFilter matches the payload (delayed-and-rule-effects). Optional on the port so the
   * existing fake engines in tests need no change; absent => no watcher runs (no-op). Used at
   * the deletion / placeUnder seams that have no co-located EffectTiming analogue exposed here.
   */
  fireSubTrigger?: (
    event: import("../EffectContext.js").SubTriggerEventName,
    payload?: import("../EffectContext.js").TriggerInfo,
    sourceScope?: SubTriggerSourceScope,
  ) => Promise<void>;
  /** Pay Barrier's security cost through the generic removal bus before deletion continues. */
  trashTopSecurityForBarrier?(seat: Seat): Promise<void>;
  /** Reset uses for new cards: source plays (CR 7-1-1) and DNA digivolution (8-2-2-1-6). */
  forgetCardUses?: (instanceIds: readonly string[]) => void;
  /** Reinstall continuous effects after a permanent enters play, before its entry timing. */
  recomputeContinuousEffects?: () => Promise<void>;
  /** Derive passive intermediate values while keeping the enclosing rule/effect boundary atomic. */
  recomputeContinuousDerivedEffects?: () => Promise<void>;
  /** Complete a rule check before an effect-driven digivolution's own timing window. */
  processRulesBeforeWhenDigivolving?: () => Promise<void>;
  /** Resolve the normal When Digivolving window for a public digivolution-like entry. */
  fireWhenDigivolving?: (
    seat: Seat,
    permanent: Permanent,
    previousLevel?: number,
    isDnaDigivolve?: boolean,
  ) => Promise<void>;
  /** Run the would-digivolve and before-cost windows for effect-driven App Fusion. */
  prepareAppFusion?: (seat: Seat, target: Permanent, result: CardInstance, into: CardDefinition) => Promise<void>;
  /** Apply active ordinary-digivolution target restrictions to effect-driven App Fusion. */
  appFusionTargetAllowed?: (seat: Seat, target: Permanent, result: CardInstance) => boolean;
  /** Resolve the would-digivolve window after effect-route cost decisions complete. */
  fireWouldDigivolve?: (seat: Seat, target: Permanent, into: CardDefinition) => Promise<void>;
  /**
   * Resolve the played loose card's own pay-time reducers ("when this card would be
   * played") before effect-driven play. Free play runs the same window with a
   * zero base and ignores the result, preserving optional processing costs.
   */
  finalizeEffectPlayCost?: (
    instanceId: string,
    baseCost: number,
    useAsOption?: boolean,
    originZone?: ZoneRef,
    projectOnly?: boolean,
    simultaneousPlayCount?: number,
    reservedInstanceIds?: readonly string[],
  ) => Promise<number>;
  /** Activate matching would-be-played replacements before an effect-driven DigiXros picker. */
  clearPreparedDigiXrosPlay?(instanceId: string): void;
  placePendingPlayCosts?(instanceId: string, permanentId: string): Promise<void>;
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
  /**
   * Play cards for a keyword effect of `sourceInstanceId` without paying their costs, through the
   * shared effect-play seam that offers DigiXros and Assembly (§7-2-2-13).
   */
  playForKeywordEffect?(
    sourceInstanceId: string,
    instanceIds: readonly string[],
    opts?: { playedFromZone?: import("@aegis/shared").ZoneRef },
  ): Promise<Permanent[]>;
  /**
   * Pay an alternate requirement's `placementCost` for an effect-driven digivolution into
   * `evolving` (BT7-112). Returns false when the placement could not be paid.
   */
  payAlternatePlacement?: (
    seat: Seat,
    requirement: DigivolutionRequirement,
    evolving: CardInstance,
  ) => Promise<boolean>;
  /** Resolve passive and interactive cost reducers for an effect-driven paid digivolution. */
  finalizeEffectDigivolveCost?: (
    target: Permanent,
    evolvingInstanceId: string,
    into: CardDefinition,
    baseCost: number,
    baseAsDigimon?: CardDefinition,
    costDelta?: number,
  ) => Promise<number>;
  /** Read the effective hand-use cost for eligibility checks that must include automatic self reducers. */
  effectiveLooseUseCost?: (instanceId: string, controllerSeat: Seat) => number | undefined;
  /** Read a loose card's cost while in hand, counting only reducers that apply there (Q1501). */
  inHandCost?: (instanceId: string, controllerSeat: Seat) => number | undefined;
  /**
   * Resolve one link event: the host's "when linked" watchers and each newly linked card's
   * own [When Linking] effect, as one group of simultaneous triggers.
   */
  fireLinkEvent?: (instanceIds: string[], targetPermanentId: string) => Promise<void>;
  /** Resolve the trashed card's own deck-trash trigger without requiring a field watcher. */
  resolveSelfWhenTrashedFromDeck?: (instanceId: string, byEffectCardId?: string) => Promise<void>;
  /** Memory rewards printed on materials that successfully participate in a DNA digivolution. */
  dnaDigivolveMemoryGains?: (materialPermanentIds: readonly string[], into: CardDefinition) => DnaMemoryGain[];
  /**
   * Fire EffectTiming.OnDiscardSecurity for each given instance — cards an EFFECT just moved from a
   * security stack to trash (the `trash` / `trashFromSecurity` verbs). The card now sits in trash (a
   * candidate zone), so its own module's OnDiscardSecurity clause runs (ST22-10). A normal security
   * CHECK trashes via a different path (securityCheck.trashIfStillLoose) and never reaches here, so
   */
  fireDiscardedFromSecurity?: (instanceIds: string[]) => Promise<void>;
  /** Re-activate one (or all) of a target permanent's own effects at the given timing(s)
   * (EX3-065 and its generalization — see `Primitives.reactivateOnPlay`). Engine-backed;
   * re-exposed as Primitives.reactivateOnPlay. Returns whether an effect actually activated. */
  reactivateOnPlay?: (
    permanentId: string,
    opts?: {
      timings?: import("@aegis/shared").EffectTiming[];
      chooseOne?: boolean;
      outsideTriggerWindow?: boolean;
      continueEffectAfterAttackDeclaration?: () => Promise<void>;
    },
  ) => Promise<boolean>;
  /**
   * Fire the entering card's OWN OnPlay / WhenDigivolving window when an EFFECT played or
   * digivolved it (the producer for the `triggerEnteredByEffect` gate, BT25-084). The trigger's
   * `enteredByEffect` is set to the entering card's controller seat. This is also what makes an
   * effect-played Digimon's [On Play] fire at all — the effect-driven play/digivolve verbs
   * previously placed the permanent without firing its entry window. Optional => no-op in fakes.
   */
  fireEnteredByEffect?: (
    timing: import("@aegis/shared").EffectTiming,
    instanceId: string,
    ownerSeat: Seat,
    opts?: {
      byEffect?: boolean;
      isDnaDigivolve?: boolean;
      digivolvedFromZone?: import("@aegis/shared").ZoneRef;
      baseWasDigimon?: boolean;
      previousDigivolutionLevel?: number;
      playedFromZone?: import("@aegis/shared").ZoneRef;
      digiXrosMaterialCount?: number;
      playedByEffectSourceCardId?: string;
      deferWhenPlayed?: boolean;
      procedurePending?: readonly CollectedEffect[];
    },
  ) => Promise<void>;
  /**
   * Resolve the "would leave" interrupts of the battle-area DigiXros materials of an
   * effect-driven play while the played card is only revealed: not paid for, not in play
   * (§7-2-2-7, §15-8-5-2, Q3724/Q3725). Returns the materials whose leave was prevented and
   * the effects the interrupts triggered, which wait for the played card's [On Play] window
   * (§15-4-3-2, §15-8-3-2).
   */
  interruptDigiXrosMaterialLeave?: (
    fieldPermanentIds: string[],
    resolvingSeat?: Seat,
  ) => Promise<{ prevented: Set<string>; triggered: readonly CollectedEffect[] }>;
  /** Resolve held triggered effects in their own window when the window they waited for never opens. */
  resolveHeldTriggeredEffects?: (effects: readonly CollectedEffect[]) => Promise<void>;
  /**
   * Consult active digivolution-card-trash "redirect" replacements (BT10-084 Tactimon; KB
   * Q2002-Q2008) BEFORE a trash operation selects which cards to take. Returns the redirected
   * single-host id when a reaction fired, or undefined when nothing changed (no reaction
   * installed / not every host eligible / declined). Optional on the port so existing fake
   * engines in tests need no change.
   */
  consultDigivolutionTrashRedirect?: (hostPermanentIds: string[]) => Promise<string | undefined>;
  /**
   * Consult active "prevent" leave/delete replacements for the permanents about to be removed
   * by an effect. Returns the subset whose removal the controller chose to PREVENT (by paying
   * the reaction's cost). Default-safe: empty when no prevent-replacement matches.
   */
  consultLeavePrevention?: (
    permanentIds: string[],
    cause: import("../EffectContext.js").RemovalCause,
    resolvingSeat?: Seat,
    opts?: {
      isBounce?: boolean;
      destination?: ZoneRef;
      playerAction?: boolean;
      keywordPreventions?: { interruptsEffect: boolean };
    },
  ) => Promise<Set<string>>;
  /** The shared memory gauge (memory-gauge subsystem); single owner of memory math. */
  readonly memory: MemoryPort;
  /** Duration-scoped modifier store (DP buffs, pierce, evo-cost). */
  readonly modifiers: ModifierLedger;
  /**
   * Continuous-rule store (restrictions, name/trait aliases, color waivers). Optional
   * on the port so the existing fake engines in tests need no change; when absent a
   * private ledger is used (the verbs still mutate real server state, just not the
   * engine's shared one — production supplies the shared instance).
   */
  readonly continuous?: ContinuousEffectLedger;
  /** Delayed / triggered sub-effect + replacement registry (optional; see `continuous`). */
  readonly subTriggers?: SubTriggerRegistry;
  readonly decoyCostPermanentIds?: Set<string>;
  /**
   * Combat lifecycle driver (attack-and-block subsystem), used by the effect-driven
   * attack / redirect verbs. Optional on the port so the existing fake engines in
   * tests need no change; when absent those verbs narrate the gap instead of running.
   */
  readonly combat?: CombatPort;
  /** Player-decision API (effect-stack-resolution); used by selection verbs. */
  readonly ask: SelectionPort;
  /**
   * The seat currently driving resolution (the turn player / effect controller). Some
   * verbs default a target seat or a "you" reference to the controller; the engine
   * supplies it from `state.turnSeat`. Kept on the port (rather than re-deriving from
   * state inside each verb) so the controller is unambiguous when a future verb needs
   * it during nested resolution.
   */
  controllerSeat(): Seat;
  /**
   * True while the engine is RE-FIRING persistent (static / `EffectTiming.None`)
   * effects in its continuous-recompute pass. When true, the continuous-capable verbs
   * (modifyDP / restrict / grantKeyword / grantNameTrait / grantPierce / waiveColor /
   * the cost modifiers) tag what they record as `continuous`, so the next recompute can
   * clear and re-derive it without double-applying. Absent (or false) for ordinary
   * one-shot effect resolution. Optional on the port so the test fakes need no change.
   */
  inContinuousPass?(): boolean;
  /** True while a triggered timing window is resolving, including nested windows. */
  inResolvingWindow?(): boolean;
  /** The seat whose end-of-turn window is resolving; undefined outside that window. */
  turnEndWindowSeat?(): Seat | undefined;
  /**
   * Shared once-per-turn replacement ledger, also used by link-cost reductions.
   * The caller provides a stable effect key and records it after successful use.
   */
  oncePerTurnFired?: (key: string) => boolean;
  markOncePerTurnFired?: (key: string) => void;
  /**
   * Report cards that were JUST linked to a permanent. Comprehensive Rules §4-9-5: when
   * linking to a Digimon that has already reached its link limit, "the same number of the
   * EXISTING link cards are trashed at the same time as the newly linked cards" — the card
   * that just arrived is never the one that goes. The over-limit trim itself is a rule check
   * (§17-1-3-2-5) that runs later and cannot tell new from existing on its own, so the link
   * verb tells it. Optional on the port: a fake that never links needs no implementation.
   */
  noteLinked?(instanceIds: readonly string[]): void;
}

/** The slice of MemoryGauge the primitives use (memory-gauge subsystem owns the impl). */
export interface MemoryPort {
  memoryFor(seat: Seat): number;
  gainMemory(amount: number, reason?: string): void;
  addMemoryForSeat(seat: Seat, amount: number, reason?: string, opts?: { isTamerEffect?: boolean }): void;
  setMemory(value: number, reason?: string): void;
  setMemoryForSeat(seat: Seat, value: number, reason?: string): void;
  setTurnEndMinMemory?(seat: Seat, minimum: number): void;
  pay(seat: Seat, cost: number, reason?: string): number;
  maxCostFor(seat: Seat): number;
}

/**
 * The slice of the CombatController the effect-driven attack verbs use
 * (attack-and-block subsystem owns the impl). `resolveAttack` runs a full attack;
 * `isAttacking` guards against unsafe nesting; `redirectTarget` switches the
 * in-flight attack's target.
 */
export interface CombatPort {
  readonly isAttacking: boolean;
  readonly currentAttackerId: string | undefined;
  /** Resolve a direct rules battle without creating an attack declaration. */
  resolveBattle?(attacker: Permanent, defender: Permanent, opts?: { comparison?: "digivolutionCards" }): Promise<void>;
  resolveAttack(
    attackerSeat: Seat,
    attacker: Permanent,
    target: AttackTarget,
    opts?: {
      withoutTap?: boolean;
      attackMechanic?: string;
      /** Resolve an attack-cost payload after attack declaration and before declaration-triggered effects. */
      afterAttackDeclaration?: () => Promise<void>;
      afterAttackTriggers?: () => Promise<void>;
      artsDigivolveOptionInstanceId?: string;
      drainTimingWindow?: (options?: { retireUnactivatable?: boolean }) => Promise<void>;
    },
  ): Promise<void>;
  redirectTarget(target: AttackTarget): boolean;
  /** An actual suspend -> unsuspend transition lets that permanent declare another attack. */
  resetAttackEligibility?(permanentId: string): void;
  /** End the in-flight attack (BT23-069) — transition to end-of-attack, skipping block/battle. */
  endAttack(): boolean;
  /**
   * Open an ＜Evade＞ decision window for a single permanent and await the
   * controller's accept/decline (Comprehensive Rules §16-22-3: activation is an
   * optional processing condition). Shared with the combat (battle-loss) path so
   * both routes use the same evadePrompt/respondEvade plumbing.
   */
  runEvadeDecision(seat: Seat, permanentId: string): Promise<boolean>;
  /**
   * Open a ＜Barrier＞ decision window for a single permanent and await the
   * controller's accept/decline (Comprehensive Rules §16-25-3: activation is an
   * optional processing condition). Shared with the combat (battle-loss) path so
   * both routes use the same barrierPrompt/respondBarrier plumbing.
   */
  runBarrierDecision(seat: Seat, permanentId: string): Promise<boolean>;
}

/**
 * The slice of the decision API the selection verbs use. The full DecisionApi
 * (EffectContext.ts) is keyed by an EffectContext; primitives that need a choice are
 * invoked from inside a card's resolve where the seat is known, so this narrower
 * seat-keyed form is what the engine adapts to. effect-stack-resolution owns the impl.
 */
export interface SelectionPort {
  /**
   * Ask `seat` to pick between `min` and `max` of `candidateInstanceIds`; returns the
   * chosen instance ids (the engine enforces the count and that they are candidates).
   */
  selectInstances(
    seat: Seat,
    candidateInstanceIds: string[],
    min: number,
    max: number,
    promptText: string,
    provenance?: {
      sourceCardId?: string;
      timing?: string;
      effectText?: string;
      effectTextPart?: string;
      effectTextEmphasis?: string;
      sourceInstanceId?: string;
      sourcePermanentId?: string;
      isInherited?: boolean;
      selectionContext?: "attackTarget" | "partitionActivation" | "materialSaveActivation";
      /** Preview the full group while a single candidate represents activating the keyword. */
      visibleInstanceIds?: string[];
      selectionGoal?: DecisionSelectionGoal;
    },
  ): Promise<string[]>;
}
