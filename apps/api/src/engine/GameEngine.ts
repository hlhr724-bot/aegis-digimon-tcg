import { createInterpreterRuntimeReferences } from "#api/engine/effects/interpreter/snapshot/createInterpreterRuntimeReferences";
import { createEngineRuntimeObjects } from "#api/engine/snapshot/context/createEngineRuntimeObjects";
import { SnapshotContinuationRecorder } from "#api/engine/snapshot/SnapshotContinuationRecorder";
import { SnapshotContinuationInputKind } from "#api/engine/snapshot/SnapshotContinuationInputKind";
import { createInterpreterRuntimeCallbacks } from "#api/engine/effects/interpreter/snapshot/createInterpreterRuntimeCallbacks";
import type { SeededRandom } from "#api/engine/random/SeededRandom";
import { restartManualMatch } from "#api/manual/restartManualMatch";
import { logError } from "#api/logger";
import { ManualController } from "#api/manual/ManualController";
import { GameMode } from "@aegis/shared/manual/GameMode";
import { getAttackRedirection } from "#api/engine/gameEngine/getAttackRedirection";
import { ContinuousEffectScope } from "./effects/ContinuousEffectScope.js";
import { CardKind, EffectTiming, GameState, type CardInstance, type Seat } from "@aegis/shared";
import { buildCombatHooks } from "./gameEngine/combatHooks.js";
import type { CardColor, Permanent, ZoneRef } from "@aegis/shared";
import type { Client } from "colyseus";
import type { ScenarioFixture } from "./scenario/types.js";
import type { VisibilityZone } from "./state/access.js";
import {
  chooseFirstPlayer,
  clearReady,
  collectStagedDecks,
  effectiveColorsOf,
  expireCombatWindow,
  exposeCardToView,
  forgetWithheldCards,
  handleDisconnect,
  handleReconnect,
  installVisibility,
  linkMaxOf,
  makeStateView,
  refreshStateView,
  runMatch,
  runMulliganWindow,
  runOneTurn,
  seatPlayer,
  startScenarioFixture,
  startMatch,
  startTurnLoop,
  syncCounts,
} from "./gameEngine/matchLifecycle.js";
import { recomputeContinuousEffects, runContinuousPass } from "./gameEngine/continuousPass.js";
import type { RemovalCause } from "./effects/EffectContext.js";
import type { Intent, IntentResult } from "@aegis/shared";
import { MemoryGauge } from "./MemoryGauge.js";
import type { VisibilityPort } from "./state/access.js";
import { GameStateAccess, markRoutedUsedOption } from "./state/access.js";
import { CombatController } from "./combat/controller.js";
import { printedKeywordsOf } from "./combat/keywords.js";
import { canGainCollisionBlocker } from "./combat/legality.js";
import { WinCheck } from "./security/index.js";
import { SecurityDpLedger } from "./security/securityDp.js";
import { DeletionMaxDpLedger } from "./deletionMaxDp.js";
import { DpDeleteBudgetLedger } from "./dpDeleteBudget.js";
import { lookupDefinition, isDigimon } from "./cards/cardData.js";
import { DecisionManager } from "./decisions/index.js";
import { pendingEffectCandidates } from "./gameEngine/pendingEffectCandidates.js";
import { createDecisionApi } from "./decisions/decisionApi.js";
import { createResolverDecisions, type ResolverDecisions } from "./decisions/resolverDecisions.js";
import { MainPhaseController } from "./MainPhaseController.js";
import { BreedingPhaseController } from "./BreedingPhaseController.js";
import { ModifierLedger } from "./effects/primitives.js";
import { ContinuousEffectLedger } from "./effects/continuous.js";
import { SubTriggerRegistry, type SubTriggerSubscription } from "./effects/subtriggers.js";
import { type CardStateLookup } from "./cards/CardSource.js";
import { UseTracker } from "./effects/kernel.js";
import type { CardSource } from "./effects/CardSource.js";
import type { CollectedEffect } from "./effects/collect.js";
import type {
  EffectContext,
  GameAccess,
  Primitives,
  DecisionApi,
  TriggerInfo,
  SubTriggerEventName,
  SubTriggerSourceScope,
} from "./effects/EffectContext.js";
import { TurnStateMachine } from "./TurnStateMachine.js";
import { type Rng, type Decklist } from "./setup.js";
import { MulliganCoordinator } from "./mulligan.js";
import { mergeRuleDeletions, type PooledRuleDeletion } from "./gameEngine/ruleDeletions.js";
import { DigivolveSupport } from "./gameEngine/digivolveSupport.js";
import { BoardProjection } from "./gameEngine/projections.js";
import { RuleChecks } from "./gameEngine/ruleChecks.js";
import { securityStrikeCount } from "./gameEngine/securityStrike.js";
import { type ArmedSubTrigger } from "./gameEngine/subTriggerIdentity.js";
import type { GameEngineHooks, SeatJoinOptions } from "./gameEngine/types.js";
import {
  attackDeps,
  buildTurnFlowHooks,
  digivolveDeps,
  dnaDigivolveDeps,
  linkCardDeps,
  playCardDeps,
} from "./gameEngine/actionDeps.js";
import { applyIntent, isNewlyPlayedRushAttacker, validateAppFusion } from "./gameEngine/intents.js";
import { fireTiming, fireTimingForInstance, reactivateOnPlay } from "./gameEngine/timing.js";
import { fireSubTrigger } from "./gameEngine/subTriggers.js";
import { collectRuleProcessMovements, flushRuleTriggerPool, listCandidateInstances } from "./gameEngine/ruleProcess.js";
import {
  buildEffectContext,
  cardSourceOf,
  effectEnvironment,
  forgetUsesOfCardsLeavingField,
  trackGrantsOfCardsCrossingField,
} from "./gameEngine/effectContext.js";
import { engineConsultLeavePrevention } from "./gameEngine/effectContext.js";
import { unsuspendAllForSeat, unsuspendForActivePhase } from "./gameEngine/turnFlow.js";
import { buildPrimitives } from "./gameEngine/effectContext.js";
import type { PendingBlitzAttack } from "./gameEngine/blitz.js";

export { mergeRuleDeletions, securityStrikeCount };
export type { GameEngineHooks, SeatJoinOptions };

/**
 * The brain of a single match. The ONLY object permitted to mutate GameState
 * (ARCHITECTURE.md section 3). It validates every intent, applies costs, mutates
 * the synchronized schema, runs the effect stack, and emits the event log.
 *
 * This is a scaffold: the public surface the room depends on is defined and the
 * boot path compiles/runs, but the rules engine itself is intentionally stubbed.
 * Each subsystem below maps to an entry in historical migration ledger
 *
 * Members without a `private` marker are the engine's INTERNAL seam, not its public API:
 * the `gameEngine/` modules hold method bodies that were cut out of this class and take
 * the engine as their first parameter, so the members those bodies read cannot stay
 * `private`. The room and the tests use only the documented public surface
 * (`seatPlayer`, `startMatch`, `applyIntent`, the view and connection methods); reach for
 * anything else from outside `engine/` and you are reaching into the engine's own wiring.
 */

type ReplaceSnapshotSetParams<T> = { target: Set<T>; values: T[] };

export class GameEngine {
  readonly manual?: ManualController;
  readonly memory: MemoryGauge;
  readonly turnMachine: TurnStateMachine;
  readonly access: GameStateAccess;
  readonly win: WinCheck;
  readonly combat: CombatController;
  /** Decision request/response correlation (subsystem: intent-protocol-and-room). */
  readonly decisions: DecisionManager;
  /** The interactive Main-phase verb loop the turn machine awaits. */
  readonly mainPhase: MainPhaseController;
  /** The interactive Breeding-phase window the turn machine awaits. */
  readonly breeding: BreedingPhaseController;
  /** Per-turn use ledger for maxPerTurn accounting (shared with the effect stack). */
  readonly tracker: UseTracker;
  readonly runtimeCallbacks = createInterpreterRuntimeCallbacks();
  readonly runtimeReferences = createInterpreterRuntimeReferences();
  readonly runtimeObjects = createEngineRuntimeObjects({ engine: this });
  readonly snapshotContinuation = new SnapshotContinuationRecorder();
  /** Duration-scoped modifier store backing the effect primitives. */
  readonly modifiers: ModifierLedger;
  /**
   * Continuous-rule store (can't-X restrictions, name/trait aliases, keyword grants,
   * color waivers) the effect primitives write and combat/turn/cost reads. Shared
   * (not the per-primitives private fallback) so what a static effect records is what
   * the rest of the engine consults.
   */
  readonly continuous: ContinuousEffectLedger;
  /** Delayed / triggered sub-effect + replacement registry, shared with the primitives. */
  readonly subTriggers: SubTriggerRegistry;

  /**
   * Monotonic source for timing-window and individual effect-body identities
   * (KB Q2814 / BT2-053). A timing window can resolve several separate bodies.
   */
  windowTokenSeq = 0;
  securityRemovalEventSeq = 0;
  /** One identity per resolving body, preserving its parent's identity across nested effects. */
  readonly effectBodyTokens: number[] = [];
  /**
   * The `windowToken` for the resolving-effect window currently in progress, or
   * `undefined` when no `fireTiming`/`fireTimingForInstance` call is on the stack.
   * `beginResolvingWindow` mints a fresh value only for the OUTERMOST call and leaves it
   * untouched for any NESTED call (e.g. a played token's own On Play firing while the
   * playing effect's resolve is still on the stack) — so every SubTrigger fire that
   * happens while resolving ONE top-level effect (however many nested timings it
   * triggers) shares the same token, while two genuinely separate top-level
   * resolutions get distinct tokens. Read by {@link fireSubTrigger}.
   */
  activeWindowToken: number | undefined = undefined;
  /** Async Main verbs accepted by the server but not yet fully resolved. */
  mainVerbContinuationsInFlight = 0;
  counterResolutionInFlight = false;
  /** Nesting guard that defers state-based actions until a used Option finishes routing. */
  optionResolutionDepth = 0;
  /** Used Options whose [Main] body is still running; its triggers wait for the post-use routing. */
  optionMainDepth = 0;
  /** Nesting guard that keeps rule checks outside an effect body's atomic resolution. */
  effectResolutionDepth = 0;
  /**
   * Main is open but its start-of-main timing has not finished yet. The input controller
   * deliberately opens before that asynchronous work completes, so this marks the interval
   * in which the phase LOOKS ready but the turn has not actually been handed to the player.
   */
  mainEntryPending = false;
  /** A valid pass held during Main entry or an accepted Main verb, replayed when that work settles. */
  deferredEndPhaseSeat: Seat | undefined;
  /**
   * Tail of the serialized Main-verb chain: each accepted verb starts only once the
   * previous one has fully settled, so two effect resolutions are never in flight at
   * once (see {@link continueMainVerb}).
   */
  mainVerbChain: Promise<void> = Promise.resolve();
  /**
   * Watchers already resolved by the timing window that shares their event (see
   * {@link withPendingSubTriggers}), keyed by {@link subTriggerIdentity} rather than by
   * subscription id: a continuous recompute tears down and RE-INSTALLS every continuous watcher
   * under a fresh id, so an id-keyed ledger would stop recognizing the watcher it just resolved
   * and the trailing bus fire would run it a second time. Populated only inside such a window and
   * cleared when the outermost one closes.
   */
  readonly consumedSubTriggerKeys = new Set<string>();
  readonly announcedSubTriggerEffectKeys = new Set<string>();
  /**
   * How many resolution loops that DRAIN the pending pool ({@link pendingWindowCollected}) are on
   * the stack. Parking a watcher only makes sense while one of them is running: with no draining
   * loop above it, a parked watcher would never be resolved at all.
   */
  pendingPoolDrainDepth = 0;
  /**
   * How many attacks ordered by a still-resolving effect are running their steps
   * (`runAttackSteps`). The ordering effect's window stays open, so triggers derived inside
   * an attack step are parked for it unless that step drains them itself.
   */
  attackStepPauseDepth = 0;
  /** Nesting depth of {@link withPendingSubTriggers} windows. */
  subTriggerWindowDepth = 0;
  /** Watchers armed for the event of the enclosing window, offered to that window's resolver. */
  pendingWindowSubTriggers: ArmedSubTrigger[] = [];
  /**
   * Third-party deletion watchers captured before the deleted permanent moves. They are
   * transferred to the deletion reaction window, which may itself be deferred until the
   * effect that caused the deletion finishes.
   */
  pendingDeletionSubTriggers: ArmedSubTrigger[] = [];
  /** Battle-winner watchers explicitly grouped with a battle's resulting deletion window. */
  pendingBattleWonSubTriggers: ArmedSubTrigger[] = [];
  /**
   * Watchers parked next to {@link pendingNestedTimingEffects} by
   * {@link parkArmedForEnclosingWindow}. Kept in a field of its own rather than in
   * {@link pendingWindowSubTriggers}: that list is SWAPPED per window, so a nested window would
   * drop entries pushed into the copy it discards on exit, while the parked half of an event
   * must survive exactly as long as the printed half it is simultaneous with.
   */
  parkedEntrySubTriggers: ArmedSubTrigger[] = [];
  /** Printed timing effects triggered inside the currently resolving effect body. */
  pendingNestedTimingEffects: CollectedEffect[] = [];
  /**
   * True while a play's pay-time window is running its reducers' costs. A Digimon deleted to
   * pay a "when this card would be played, by deleting 1 of your Digimon, reduce the cost"
   * clause is deleted as part of the play, so its [On Deletion] triggers SIMULTANEOUSLY with
   * the played card's [On Play] (KB Q5131) and the turn player orders the two. Without this
   * flag the deletion opens its own window during cost payment and resolves before the play
   * even happens, so no ordering choice is ever offered.
   */
  payingPlayCost = false;
  /**
   * Watchers triggered while a declared digivolution is still being paid for, or `undefined`
   * when no payment is running. They activate once the digivolution completes, in the same
   * batch as its [When Digivolving] effects (KB Q3999). Resolving them mid-declaration let
   * BT26-091 Yoshino Fujieda digivolve another Digimon with the very card being declared
   * (Discord 1555674174369042583).
   */
  digivolveCostSubTriggers: ArmedSubTrigger[] | undefined = undefined;
  /**
   * [On Deletion] effects collected from a play-cost deletion, waiting for that play's entry
   * window so the turn player orders them against the played card's [On Play] (Q5131). Kept
   * apart from {@link pendingNestedTimingEffects}, which any outermost window may drain.
   */
  pendingPlayCostDeletionEffects: CollectedEffect[] = [];
  /**
   * Effects triggered while a would-leave "instead" replacement resolved (a Tamer's [On Play]),
   * waiting for the replaced leave's [On Deletion] window so the controller orders them together
   * (Q2934, Q2994, Q3021).
   */
  pendingLeaveReplacementEffects: CollectedEffect[] = [];

  /** Security-removal reactions wait until the currently resolving effect finishes. */
  readonly deferredSecurityRemovalTriggers: Array<{
    payload: TriggerInfo;
    subscriptions: SubTriggerSubscription[];
    /**
     * Contexts bound when the removal HAPPENED, not when the reaction runs. The trigger has
     * already activated by then (KB Q2611/Q2629), so a watcher whose anchor dies in the battle
     * that follows the removal — an inherited ＜Draw 1＞ on the attacker's Digi-Egg, BT14-001 —
     * still resolves instead of being dropped for a missing anchor at flush time.
     */
    contexts: Map<number, EffectContext>;
  }> = [];
  flushingDeferredSecurityRemovalTriggers = false;
  readonly pendingEffectReaders = new Set<() => readonly CollectedEffect[]>();

  /** Trigger windows created inside a resolving effect and activated only after that effect ends. */
  readonly deferredTimingWindows: Array<{
    readPendingEffects?: () => readonly CollectedEffect[];
    timing: EffectTiming;
    trigger: TriggerInfo;
    transientCandidates: readonly CardInstance[];
    ascensionCandidates?: readonly { instanceId: string; seat: Seat }[];
    deletionSubTriggers?: readonly ArmedSubTrigger[];
  }> = [];
  flushingDeferredTimingWindows = false;

  /**
   * Cards a cross-permanent play-cost reducer committed at BeforePayCost (BT10-093: purple Digimon
   * pulled from under the player's Tamers), keyed by the played card's instanceId. Applied — placed
   * under the new permanent — by the play action once that permanent exists, before On Play fires.
   */
  readonly pendingPlayReducerPlacements = new Map<string, string[]>();

  /**
   * Battle-area permanent ids a SELF `wouldBePlayed` reducer's cost body (BT12-112: "by placing 1 of
   * your [Shoutmon] as a digivolution card under this Digimon") selected at BeforePayCost, keyed by
   * the played card's instanceId — relocated UNDER the new permanent once it exists (same timing
   * constraint, and the same post-creation seam, as `pendingPlayReducerPlacements`; the two are
   * separate maps because this one relocates a whole PERMANENT via `relocatePermanent`, not loose
   * card instances via `placeUnder`).
   */
  /** Paid/declined material-zone clauses, scoped to one pending played instance. */
  readonly preparedDigiXrosCosts = new Map<string, { handled: string[]; delta: number; allowsTrash: boolean }>();
  readonly pendingSelfReducerRelocations = new Map<string, { permanentId: string; shedOwnCards?: boolean }[]>();

  /** The effect verbs (effect-primitives) bound to this match. */
  readonly primitives: Primitives;
  /** The §17-1-3 state-based-action sweeps (the fixpoint that drives them stays here). */
  readonly ruleChecks: RuleChecks;
  /** The client-visible derivations of the board (keywords, affordances, targets). */
  readonly projection: BoardProjection;
  /** The digivolution paths that are not the digivolve verb itself. */
  readonly digivolveSupport: DigivolveSupport;
  /** The player-decision API (ctx.ask.*) backed by the DecisionManager. */
  readonly decisionApi: DecisionApi;
  /** The stack-resolver's controller prompts (chooseOrder / askOptional). */
  readonly resolverDecisions: ResolverDecisions;
  /** Lobby readiness per seat (analogue of RoomManager AllPlayerIsReady). */
  readonly readySeats = new Set<Seat>();
  /** An activated ＜Blitz＞ whose resolving effect waits for the attack declaration. */
  pendingBlitzAttack: PendingBlitzAttack | undefined;
  /** Publicly played Rush attackers whose play crossed memory and still have their one action window. */
  readonly crossedMemoryRushAttackers = new Set<string>();
  matchSetupStarted = false;
  /** Guards {@link GameEngineHooks.onBothReady} against firing more than once. */
  bothReadyFired = false;
  /** The opening-hand mulligan window (subsystem: deck-and-setup). */
  readonly mulligan: MulliganCoordinator;
  /** Decklists staged at seatPlayer, consumed by startMatch (index === seat). */
  readonly stagedDecks: (Decklist | undefined)[] = [undefined, undefined];
  /** Per-seat shuffle PRNG produced by setup (so a mulligan reshuffles deterministically). */
  rngForSeat: ((seat: Seat) => Rng) | undefined;
  randomStreams: readonly [SeededRandom, SeededRandom] | undefined;
  /** Monotonic source of permanentIds unique within the match. */
  permanentSeq = 0;
  /** Shared completion barrier for the current continuous recompute batch. */
  recomputeInFlight: Promise<void> | undefined;
  /** Coalesces external recompute requests that arrive while a pass is rebuilding the ledgers. */
  recomputeQueued = false;

  /**
   * Cards linked since the last over-limit rule check (fed by the link verb through
   * `PrimitivesEngine.noteLinked`). Comprehensive Rules §4-9-5 trashes EXISTING link cards
   * "at the same time as the newly linked cards", so {@link chooseExcessLinkCards} keeps
   * these out of the candidate pool. Cleared after every completed rule-check fixpoint,
   * including quiet checks with no excess.
   */
  readonly justLinked = new Set<string>();
  /** Last resolved continuous DP contribution, used only to preserve dependency inputs between passes. */
  private readonly continuousDpSeedState = new Map<string, number>();

  /**
   * Which tier the code running RIGHT HERE belongs to, carried down the async call chain
   * rather than held in a field.
   *
   * A shared field alone cannot answer the question once two flows interleave: a
   * recompute is a long `await` chain, and a timing window resolving concurrently with it
   * (a play whose trailing recompute is still in flight while the next window opens) would
   * read the recompute's flag and tag its own one-shot modifiers `continuous` — the next
   * recompute clears that tier and the "for the turn" DP grant vanishes the instant it
   * lands. A flag flipped around the window instead has the mirror failure: the recompute's
   * own statics would stop being tagged and accumulate forever. Only per-flow state
   * separates them, which is what this store is.
   *
   * `undefined` (no enclosing scope) means the code is NOT on a continuous chain, and is
   * read as such — see {@link inContinuousPass}.
   */
  readonly continuousScope = new ContinuousEffectScope();

  /** Trigger payload for the timing window currently resolving. */
  /** Transient security-DP modifiers during an active security check. */
  readonly securityDp = new SecurityDpLedger((seat, delta) => {
    const player = this.state.players[seat];
    if (player) player.securityDpDelta = delta;
  });
  battleScopeSequence = 0;
  /** Continuous DP-based-deletion maximum bonuses (rebuilt each continuous recompute). */
  readonly deletionMaxDp = new DeletionMaxDpLedger();
  /** Continuous DP-based-deletion BUDGET bonuses (BT19-011's inherited modifier; rebuilt each continuous recompute). */
  readonly dpDeleteBudget = new DpDeleteBudgetLedger();
  /** Monotonic source of instanceIds for token spawn. */
  instanceSeq = 0;

  constructor(
    readonly state: GameState,
    readonly hooks: GameEngineHooks,
  ) {
    if (state.gameMode === GameMode.MANUAL.value) {
      this.manual = new ManualController({
        state,
        seed: hooks.seed,
        randomKey: hooks.randomKey,
        emit: hooks.emit,
        declareDeckOutLoss: (seat) => this.win.declareLoss(seat, "deckOut"),
        restart: (firstSeat) => {
          void restartManualMatch({ engine: this, firstSeat }).catch((error: unknown) =>
            logError("manual.restart", error),
          );
        },
      });
    }
    // Every zone move is narrated through `hooks.emit`: the one place that sees a card leave
    // the field. Wrapped before the collaborators below capture `this.hooks.emit` by value.
    this.hooks = {
      ...hooks,
      emit: (event) => {
        this.snapshotContinuation.noteEvent();
        forgetUsesOfCardsLeavingField(this, event);
        trackGrantsOfCardsCrossingField(this, event);
        // The same seam marks the movement that routes a used Option out of its no-area slot,
        // whichever area the Option's own effect sent it to.
        hooks.emit(markRoutedUsedOption(this.state, event));
      },
    };
    // TODO(effect-framework): import "../cards" is done at boot for side-effect
    //   registration; wire the registry into the resolution path here.
    this.continuous = new ContinuousEffectLedger(
      (permanentId) => {
        for (const player of this.state.players) {
          const permanent = player.battleArea.find((candidate) => candidate.permanentId === permanentId);
          if (permanent !== undefined) {
            const definition = lookupDefinition(permanent.topCard.cardId);
            if (
              (definition !== undefined && isDigimon(definition)) ||
              this.continuous.grantedKinds(permanentId).includes(CardKind.Digimon)
            ) {
              return permanent.controllerSeat;
            }
          }
        }
        return undefined;
      },
      (permanentId) => {
        for (const player of this.state.players) {
          const permanent = [...player.battleArea, ...(player.breeding === undefined ? [] : [player.breeding])].find(
            (candidate) => candidate.permanentId === permanentId,
          );
          if (permanent === undefined) continue;
          const topDefinition = lookupDefinition(permanent.topCard.cardId);
          const keywords = new Set(printedKeywordsOf(topDefinition?.effectText));
          const hostKinds = [...(topDefinition?.kinds ?? []), ...this.continuous.grantedKinds(permanentId)];
          // BT5-094 Q1372: a stack topped by a Tamer is not a Digimon and has no inherited
          // effects, unless an effect also treats it as a Digimon (BT25-104 Q6499).
          const inheritsFromStack = hostKinds.includes(CardKind.Digimon) || hostKinds.includes(CardKind.DigiEgg);
          if (!inheritsFromStack) return [...keywords];
          for (const card of permanent.stack) {
            if (card.faceUp === false) continue;
            for (const keyword of printedKeywordsOf(lookupDefinition(card.cardId)?.inheritedEffectText)) {
              keywords.add(keyword);
            }
          }
          return [...keywords];
        }
        return [];
      },
      (permanentId) => {
        for (const player of this.state.players) {
          const permanent = player.battleArea.find((candidate) => candidate.permanentId === permanentId);
          if (permanent !== undefined) return permanent.controllerSeat;
        }
        return undefined;
      },
      (permanentId) => (collisionGrantsBlocker(this, permanentId) ? ["Blocker"] : []),
    );
    this.memory = new MemoryGauge(this.state, this.hooks.emit, (seat, opts) => {
      const kinds = opts.isTamerEffect ? [CardKind.Tamer] : [CardKind.Digimon];
      return this.continuous.canGainMemoryFromEffect(seat, {
        definition: { kinds },
      });
    });
    this.access = new GameStateAccess(this.state, this.memory, this.hooks.emit);
    this.win = new WinCheck(this.state, this.hooks.emit);
    this.tracker = new UseTracker();
    this.modifiers = new ModifierLedger();
    this.modifiers.bindContinuous(this.continuous, () => this.combat?.currentAttackerId);
    this.subTriggers = new SubTriggerRegistry();
    this.decisions = new DecisionManager(
      this.state,
      {
        requestDecision: (seat, req) => {
          // An earlier action in the same effect can grant a restriction before its next
          // choice. Publish the live ledger before humans or policies observe that choice.
          this.projection.syncRestrictions();
          this.hooks.requestDecision(seat, req);
        },
      },
      { pendingEffectCandidates: (spec) => pendingEffectCandidates(this, spec) },
    );
    this.decisionApi = createDecisionApi(this.decisions, (seat) => this.continuous.blocksCostReduction(seat, "play"));
    this.resolverDecisions = createResolverDecisions(
      this.decisions,
      () => this.recomputeContinuousEffects(),
      (event) => this.hooks.emit(event),
    );
    this.mulligan = new MulliganCoordinator(this.state, {
      requestDecision: (seat, req) => this.hooks.requestDecision(seat, req),
    });
    this.primitives = buildPrimitives(this);
    this.digivolveSupport = new DigivolveSupport({
      state: this.state,
      access: this.access,
      continuous: this.continuous,
      tracker: this.tracker,
      decisions: this.decisions,
      decisionApi: this.decisionApi,
      primitives: this.primitives,
      declinedAttackArts: this.declinedAttackArts,
      cardSourceOf: (instance) => cardSourceOf(this, instance),
      buildEffectContext: (source, trigger) => buildEffectContext(this, source, trigger),
      effectiveColorsOf: (permanent) => effectiveColorsOf(this, permanent),
      collectRuleProcessMovements: () => collectRuleProcessMovements(this),
      flushRuleTriggerPool: (pool) => flushRuleTriggerPool(this, pool),
      recomputeContinuousEffects: () => this.recomputeContinuousEffects(),
    });
    this.projection = new BoardProjection({
      omitHandAffordances: hooks.omitHandAffordances,
      state: this.state,
      access: this.access,
      continuous: this.continuous,
      modifiers: this.modifiers,
      subTriggers: this.subTriggers,
      memory: this.memory,
      tracker: this.tracker,
      continuousDpSeedState: this.continuousDpSeedState,
      pendingBlitzAttack: () => this.pendingBlitzAttack,
      hasMainPhaseEnded: () => this.mainPhase.hasEnded,
      deferHandAffordances: this.hooks.deferHandAffordances === true,
      effectEnvironment: (trigger) => effectEnvironment(this, trigger),
      buildEffectContext: (source, trigger) => buildEffectContext(this, source, trigger),
      isNewlyPlayedRushAttacker: (permanentId) => isNewlyPlayedRushAttacker(this, permanentId),
      listCandidateInstances: () => listCandidateInstances(this),
      validateAppFusion: (seat, intent) => validateAppFusion(this, seat, intent),
      attackRedirectTargetIds: (attacker, targetPermanentId) =>
        getAttackRedirection({ engine: this, attacker, targetPermanentId }),
      attackDeps: () => attackDeps(this),
      digivolveDeps: () => digivolveDeps(this),
      dnaDigivolveDeps: () => dnaDigivolveDeps(this),
      playCardDeps: () => playCardDeps(this),
      linkCardDeps: () => linkCardDeps(this),
    });
    this.ruleChecks = new RuleChecks({
      state: this.state,
      access: this.access,
      continuous: this.continuous,
      modifiers: this.modifiers,
      decisions: this.decisions,
      win: this.win,
      primitives: () => this.primitives,
      justLinked: this.justLinked,
      linkMaxOf: (permanent) => linkMaxOf(this, permanent),
      isRuleProcessing: () => this.ruleProcessing,
    });
    this.combat = new CombatController(this.access, buildCombatHooks(this));
    this.mainPhase = new MainPhaseController(this.state, this.memory);
    this.breeding = new BreedingPhaseController(this.state);
    this.turnMachine = new TurnStateMachine(this.state, buildTurnFlowHooks(this), this.memory, this.hooks.emit);
  }

  /**
   * Build the runtime EffectContext for a card instance at a timing window
   * (subsystem boundary: this is the seam the activateEffect verb and, once wired,
   * fireTiming share). Binds the source's CardSource, the trigger payload, read-only
   * game access, the effect primitives (fx), and the decision API (ask).
   */
  /**
   * The board-query facade handed to every effect.
   *
   * Every closure it binds reads `this`, and `this.state` is readonly for the engine's life, so
   * one facade serves the whole match. It used to be rebuilt for each effect of each continuous
   * recompute — eight closures and an object per effect, several times per player action, all of
   * it immediately garbage.
   */
  gameAccess: GameAccess | undefined;

  /**
   * The primitive verbs handed to an effect, one cached object per owning seat.
   *
   * Only `gainMemory` varies with the source's owner, and a seat is 0 or 1, so the spread of the
   * whole primitives object — previously redone on every context build — collapses to two.
   */
  readonly primitivesBySeat: (Primitives | undefined)[] = [];

  /**
   * The state lookup a CardSource delegates its placement/turn questions to.
   *
   * Built once per state rather than once per call: it closes over nothing but `this.state`,
   * and `cardSourceOf` runs for every candidate instance on every continuous recompute — several
   * times per player action — so rebuilding its closure set was pure allocation churn.
   */
  cardStateLookup: CardStateLookup | undefined;

  /**
   * CardSource is a value object over an instance's immutable identity (instanceId, cardId,
   * ownerSeat) whose placement queries are lazy closures, so one per instance stays correct for
   * the instance's whole life. Keyed weakly on the instance itself: an instance that leaves the
   * match takes its entry with it. `cardId`/`ownerSeat` are only ever assigned while building a
   * fresh instance (setup.ts, primitives' token creation), never re-assigned on a live one.
   */
  readonly cardSourceByInstance = new WeakMap<CardInstance, CardSource>();

  /** Guards each immediate prevention from reactivating during its own resolution. */
  preventReentryGuard = { activeReplacementKeys: new Set<string>() };

  readonly decoyCostPermanentIds = new Set<string>();

  /** Stable effect key for a BT3-056-style ＜Digisorption＞ redirect's once-per-turn accounting. */

  /**
   * Fire the SubTrigger bus (System B) for `event`, running every armed watcher whose
   * captured `sourceFilter` matches the `payload` (delayed-and-rule-effects). Distinct
   * from `fireTiming` (System A, the EffectTiming collect-resolve framework): a watcher
   * here was installed by an already-resolved effect ("when you play a green Tamer,
   * draw 1") and reacts to a future event. Co-located with the matching `fireTiming`
   * order, but the bus carries the per-install payload predicate (System A does not).
   *
   * `makeContext` binds each watcher a fresh EffectContext anchored on its OWN source
   * permanent (so its body's "this Digimon" / controller scope resolve correctly) and
   * carries the event `payload` in `ctx.trigger` (so both the body and the `matches`
   * predicate can read what happened). A watcher whose source permanent has left the
   * field is skipped (its subscription was already dropped on leave).
   */

  /**
   * Guards `doRuleProcess` against re-entry while a state-based-action pass is mid-flight
   * (a deletion can fire an [On Deletion] effect that itself drives `resolveTiming`, which
   */
  ruleProcessing = false;
  /**
   * True while a player-declared digivolution draws its bonus card. That draw is still part
   * of the digivolution procedure ("after drawing 1 card from your deck, the digivolution
   * procedure has resolved"), and rule checks aren't performed during rule processing
   * (§17-1-2-1). A Digimon the new top card's aura drops to 0 DP is therefore deleted at the
   * [When Digivolving] checkpoint, and its reactions are ordered with those effects
   * (§15-4-3-3) instead of resolving inside the draw's own window.
   */
  drawingDigivolutionBonus = false;
  /** The seat whose end-of-turn window is resolving; undefined outside that window. */
  turnEndWindowSeat: Seat | undefined = undefined;
  /** Barrier costs trigger security-removal effects before the current security battle continues. */
  resolvingBarrierSecurityCost = false;

  /**
   * Triggered watcher events produced while a rule check is still reaching its fixpoint.
   * They become pending only after every immediately applicable rule process has finished.
   * This is observable for BT25-084/Q6399: paying its leave-prevention cost trashes the
   * controller's hand, but the resulting watcher cannot activate before the repeated
   * 0-DP rule check deletes Titamon.
   */
  readonly deferredRuleSubTriggers: {
    event: SubTriggerEventName;
    payload: TriggerInfo;
    armed: ArmedSubTrigger[];
  }[] = [];

  /**
   * The deletions a rule-check fixpoint has performed but not yet reacted to, or `undefined`
   * outside a fixpoint. Set for the whole pass, so every sweep's `deletePermanent` collects
   * its [On Deletion] triggers here instead of resolving them (see
   * {@link resolveDeletionReactions}); {@link flushRuleTriggerPool} then opens ONE window
   * over the merged set. Rule checks are simultaneous (§17-1-3), and the effects they
   * trigger are simultaneous with each other too (§15-4-3-3), which is only observable if
   * they reach one prompt — hence one pool, whatever order the sweeps ran in.
   */
  ruleTriggerPool: PooledRuleDeletion[] | undefined = undefined;

  /**
   * Bind the security-and-win-check subsystem's `runSecurityCheck` to this match's
   * state and the engine's capabilities (subsystem boundary: combat opens the
   * door, security-and-win-check flips/resolves/declares). The CombatController
   * calls this for a successful, unblocked player-directed attack.
   *
   * The SecurityCheckDeps below are the seams that subsystem declared:
   *   - strikeFor: base 1 plus the attacker's ＜Security Attack +N＞ grants, summed from
   *     continuous.grantedKeywords (the securityAttack IR producer's consuming read).
   *   - fireTiming: the effect stack (OnSecurityCheck / OnLoseSecurity triggers).
   *   - resolveSecurityEffect: runs the flipped card's [Security] effect through the
   *     stack while the checked card has no area (CR 13-1-6), returning true when
   *     an effect activates.
   *   - dpOf / securityCardDp / isDigimon / deletePermanents: backed by the shared
   *     GameStateAccess + card data, identical to combat's own reads.
   */
  /**
   * Non-zero while `runSecurityCheck` is resolving. Effects triggered inside the check
   * announce themselves before the closing `securityChecked` event, so their
   * `effectTriggered` is stamped `duringSecurityCheck` for the client to hold.
   */
  securityCheckDepth = 0;

  /**
   * CR §4-19 Arts Digivolve: after a DUAL card's Option side finishes resolving, one of
   * the controller's own permanents MAY digivolve into it for free instead of the
   * pending trash (§4-19-2: overwrite processing that replaces the trash step).
   * §4-19-1 says "one of your cards on the field may digivolve into that DUAL card
   * without paying the cost" — the COST is waived, not the digivolution REQUIREMENT
   * (mirrors the same "cost-free effect-digivolve" reading `digivolveFromInstance`
   * already applies elsewhere), so eligibility is exactly the normal EvoCost/alternate
   * digivolution-requirement match. When no permanent qualifies, no decision is even
   * raised (there's nothing to offer, so the pending trash proceeds untouched).
   */
  private readonly declinedAttackArts = new Set<string>();

  /** Set once by the room; re-applied to each PlayerState as seats are filled. */
  visibilityNotify?: VisibilityPort;

  /**
   * Validate and apply one player intent. The engine's main entry point from the room;
   * {@link applyIntent} holds the router and the per-verb handlers.
   */
  getSnapshotCoreState() {
    return {
      windowTokenSeq: this.windowTokenSeq,
      permanentSeq: this.permanentSeq,
      instanceSeq: this.instanceSeq,
      battleScopeSequence: this.battleScopeSequence,
      securityRemovalEventSeq: this.securityRemovalEventSeq,
      matchSetupStarted: this.matchSetupStarted,
      bothReadyFired: this.bothReadyFired,
      readySeats: [...this.readySeats],
      stagedDecks: this.stagedDecks,
      crossedMemoryRushAttackers: [...this.crossedMemoryRushAttackers],
      justLinked: [...this.justLinked],
      continuousDpSeedState: [...this.continuousDpSeedState],
      declinedAttackArts: [...this.declinedAttackArts],
      announcedSubTriggerEffectKeys: [...this.announcedSubTriggerEffectKeys],
    };
  }

  restoreSnapshotCoreState(snapshot: ReturnType<GameEngine["getSnapshotCoreState"]>): void {
    this.windowTokenSeq = snapshot.windowTokenSeq;
    this.permanentSeq = snapshot.permanentSeq;
    this.instanceSeq = snapshot.instanceSeq;
    this.battleScopeSequence = snapshot.battleScopeSequence;
    this.securityRemovalEventSeq = snapshot.securityRemovalEventSeq;
    this.matchSetupStarted = snapshot.matchSetupStarted;
    this.bothReadyFired = snapshot.bothReadyFired;
    this.stagedDecks.length = 0;
    this.stagedDecks.push(...snapshot.stagedDecks);
    replaceSet({ target: this.readySeats, values: snapshot.readySeats });
    replaceSet({ target: this.crossedMemoryRushAttackers, values: snapshot.crossedMemoryRushAttackers });
    replaceSet({ target: this.justLinked, values: snapshot.justLinked });
    replaceSet({ target: this.declinedAttackArts, values: snapshot.declinedAttackArts });
    replaceSet({ target: this.announcedSubTriggerEffectKeys, values: snapshot.announcedSubTriggerEffectKeys });
    function replaceSet<T>({ target, values }: ReplaceSnapshotSetParams<T>): void {
      target.clear();
      for (const value of values) {
        target.add(value);
      }
    }
    this.continuousDpSeedState.clear();
    for (const [id, value] of snapshot.continuousDpSeedState) {
      this.continuousDpSeedState.set(id, value);
    }
  }

  /** The player the engine can accept input from, independent of presentation. */
  get inputSeat(): Seat | undefined {
    if (this.state.gameOver) return undefined;
    if (this.state.pendingDecision) return this.state.pendingDecision.seat;
    if (this.state.combatWindow) return this.state.combatWindow.seat;
    if (this.pendingBlitzAttack) return this.pendingBlitzAttack.seat;
    if (
      this.combat.isAttacking ||
      this.activeWindowToken !== undefined ||
      this.effectResolutionDepth > 0 ||
      this.optionResolutionDepth > 0 ||
      this.mainEntryPending ||
      this.mainVerbContinuationsInFlight > 0
    )
      return undefined;
    if (this.breeding.isOpen && !this.breeding.isActionSpent) return this.breeding.seat;
    if (this.mainPhase.isOpen) return this.mainPhase.seat;
    return undefined;
  }

  /** A room clock expires through the same terminal pipeline as other losses. */
  expireMatchTimer(seat: Seat): void {
    this.snapshotContinuation.recordInput({
      engine: this,
      input: { kind: SnapshotContinuationInputKind.EXPIRE_MATCH_TIMER.value, seat },
    });
    this.win.declareLoss(seat, "timeout");
    this.mulligan.cancel();
    this.decisions.cancel();
    this.pendingBlitzAttack?.settle(undefined);
    this.combat.cancel();
    this.mainPhase.abort();
    this.breeding.abort();
  }

  applyIntent(seat: Seat, intent: Intent): IntentResult {
    this.snapshotContinuation.recordInput({
      engine: this,
      input: { kind: SnapshotContinuationInputKind.INTENT.value, seat, intent },
    });
    if (this.manual) {
      if (intent.type === "manual") {
        return this.manual.apply(seat, intent);
      }
      if (
        intent.type !== "ready" &&
        intent.type !== "mulligan" &&
        intent.type !== "surrender" &&
        !(intent.type === "respondDecision" && this.state.turnCount === 0)
      ) {
        return { ok: false, reason: "unknown-intent" };
      }
    }
    return applyIntent(this, seat, intent);
  }

  /**
   * The three fire seams tests reach through an `as unknown as` cast. Their bodies live in
   * {@link ./gameEngine/timing.ts}; these keep the shape those casts name so the harness has
   * one route to the production window instead of 86 hand-written ones.
   */
  /**
   * The two context seams ~90 card tests and the testkit reach by name. Their bodies live
   * in {@link ./gameEngine/effectContext.ts}; these keep the shape those call sites name.
   */
  cardSourceOf(instance: CardInstance): CardSource {
    return cardSourceOf(this, instance);
  }

  buildEffectContext(source: CardSource, trigger: TriggerInfo, askOverride?: DecisionApi): EffectContext {
    return buildEffectContext(this, source, trigger, askOverride);
  }

  /**
   * Leave prevention, consulted before any removal. Kept as a method because
   * ex7VolcanicdramonMechanism replaces it on the instance to force a prevented material;
   * a module-to-module call would walk past the replacement.
   */
  consultLeavePrevention(
    permanentIds: string[],
    cause: RemovalCause = "byEffect",
    resolvingSeat?: Seat,
    opts?: {
      isBounce?: boolean;
      destination?: ZoneRef;
      insteadOnly?: boolean;
      playerAction?: boolean;
      isDigiXros?: boolean;
      keywordPreventions?: { interruptsEffect: boolean };
      holdTriggered?: boolean;
    },
  ): Promise<Set<string>> {
    return engineConsultLeavePrevention(this, permanentIds, cause, resolvingSeat, opts);
  }

  /**
   * The two unsuspend sweeps opponentTurnFrequency and whenUnsuspended wrap on the instance
   * to record which seam each ＜Reboot＞ / Active-phase fire came from.
   */
  unsuspendForActivePhase(seat: Seat): Promise<string[]> {
    return unsuspendForActivePhase(this, seat);
  }

  unsuspendAllForSeat(seat: Seat): Promise<string[]> {
    return unsuspendAllForSeat(this, seat);
  }

  /**
   * Rebuild every continuous effect. Public: the room, the testkit and 500-odd tests await it
   * between steps, and st312SecurityRecompute drives it directly. {@link runContinuousPass}
   * keeps a method too -- tests replace it on the instance to count passes.
   */
  recomputeContinuousEffects(): Promise<void> {
    return recomputeContinuousEffects(this);
  }

  /** Rebuild passive ledgers inside an atomic stack change without publishing affordances. */
  recomputeContinuousDerivedEffects(): Promise<void> {
    return recomputeContinuousEffects(this, false);
  }

  runContinuousPass(
    noPromptAsk: DecisionApi,
    seed: ReadonlyMap<string, number> = new Map(),
    publishMemory = true,
  ): Promise<void> {
    return runContinuousPass(this, noPromptAsk, seed, publishMemory);
  }

  /**
   * The match-lifecycle and view surface the room drives. Bodies in
   * {@link ./gameEngine/matchLifecycle.ts}; these are the public API the room and the
   * tests call, so the class keeps their names and shapes.
   */
  seatPlayer(seat: Seat, sessionId: string, options: SeatJoinOptions): void {
    return seatPlayer(this, seat, sessionId, options);
  }

  clearReady(seat: Seat): void {
    return clearReady(this, seat);
  }

  startMatch(): void {
    return startMatch(this);
  }

  runMatch(): Promise<void> {
    return runMatch(this);
  }

  startScenarioFixture(fixture: ScenarioFixture): void {
    return startScenarioFixture(this, fixture);
  }

  collectStagedDecks(): [Decklist, Decklist] | undefined {
    return collectStagedDecks(this);
  }

  chooseFirstPlayer(): Seat {
    return chooseFirstPlayer(this);
  }

  runMulliganWindow(firstSeat: Seat): Promise<void> {
    return runMulliganWindow(this, firstSeat);
  }

  startTurnLoop(): Promise<void> {
    return startTurnLoop(this);
  }

  runOneTurn(): Promise<void> {
    return runOneTurn(this);
  }

  makeStateView(seat: Seat | undefined): Client["view"] {
    return makeStateView(this, seat);
  }

  refreshStateView(view: Client["view"], seat: Seat | undefined): void {
    return refreshStateView(this, view, seat);
  }

  forgetWithheldCards(view: Client["view"], seat: Seat | undefined): void {
    return forgetWithheldCards(this, view, seat);
  }

  installVisibility(notify: VisibilityPort): void {
    return installVisibility(this, notify);
  }

  exposeCardToView(
    view: Client["view"],
    viewerSeat: Seat | undefined,
    ownerSeat: Seat,
    zone: VisibilityZone,
    card: CardInstance,
  ): void {
    return exposeCardToView(this, view, viewerSeat, ownerSeat, zone, card);
  }

  syncCounts(): void {
    return syncCounts(this);
  }

  flushHandAffordances(): void {
    this.projection.flushHandAffordances();
  }

  refreshHandAffordances(): void {
    this.projection.refreshHandAffordances();
  }

  handleReconnect(seat: Seat): void {
    this.snapshotContinuation.recordInput({
      engine: this,
      input: { kind: SnapshotContinuationInputKind.RECONNECT.value, seat },
    });
    return handleReconnect(this, seat);
  }

  handleDisconnect(seat: Seat, consented: boolean): void {
    this.snapshotContinuation.recordInput({
      engine: this,
      input: { kind: SnapshotContinuationInputKind.DISCONNECT.value, seat, consented },
    });
    return handleDisconnect(this, seat, consented);
  }

  expireCombatWindow(): boolean {
    this.snapshotContinuation.recordInput({
      engine: this,
      input: { kind: SnapshotContinuationInputKind.EXPIRE_COMBAT_WINDOW.value },
    });
    return expireCombatWindow(this);
  }

  effectiveColorsOf(permanent: Permanent): CardColor[] {
    return effectiveColorsOf(this, permanent);
  }

  linkMaxOf(permanent: Permanent): number {
    return linkMaxOf(this, permanent);
  }

  fireSubTrigger(
    event: SubTriggerEventName,
    payload: TriggerInfo = {},
    sourceScope?: SubTriggerSourceScope,
  ): Promise<void> {
    return fireSubTrigger(this, event, payload, sourceScope);
  }

  fireTiming(
    timing: EffectTiming,
    trigger: TriggerInfo = {},
    transientCandidates: readonly CardInstance[] = [],
  ): Promise<void> {
    return fireTiming(this, timing, trigger, transientCandidates);
  }

  fireTimingForInstance(
    timing: EffectTiming,
    sourceInstanceId: string,
    trigger: TriggerInfo = {},
    extraPending: readonly CollectedEffect[] = [],
  ): Promise<void> {
    return fireTimingForInstance(this, timing, sourceInstanceId, trigger, extraPending);
  }

  reactivateOnPlay(
    permanentId: string,
    opts?: { timings?: EffectTiming[]; chooseOne?: boolean; outsideTriggerWindow?: boolean },
  ): Promise<boolean> {
    return reactivateOnPlay(this, permanentId, opts);
  }

  /** Whether an activated ＜Blitz＞ is waiting for `permanentId` to declare its attack. */
  hasAcceptedBlitzAttack(permanentId: string): boolean {
    return this.pendingBlitzAttack?.attackerPermanentId === permanentId;
  }
}

/** ＜Collision＞ (§16-30): during its attack, affected opposing Digimon gain ＜Blocker＞ (CR 16-30-4). */
function collisionGrantsBlocker(engine: GameEngine, permanentId: string): boolean {
  const attackerId = engine.combat?.currentAttackerId;
  if (attackerId === undefined || attackerId === permanentId) return false;
  const attacker = engine.access.permanentById(attackerId);
  const permanent = engine.access.permanentById(permanentId);
  if (attacker === undefined || permanent === undefined) return false;
  if (permanent.controllerSeat === attacker.controllerSeat) return false;
  const definition = lookupDefinition(permanent.topCard.cardId);
  return (
    definition !== undefined && isDigimon(definition) && canGainCollisionBlocker(attacker, permanent, engine.continuous)
  );
}
