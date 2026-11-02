import type { BotThinkRange } from "#api/bot/BotThinkRange";
import type { BotDifficulty } from "@aegis/shared/bot/BotDifficulty";
import { performance } from "node:perf_hooks";
import {
  Phase,
  CARD_ARRIVAL_NARRATION_MS,
  CHAIN_EFFECT_NARRATION_MS,
  EFFECT_CHOICE_NARRATION_MS,
  PHASE_NARRATION_MS,
  TURN_NARRATION_MS,
  SECURITY_CHECK_NARRATION_MS,
  SECURITY_DESTRUCTION_NARRATION_MS,
  SECURITY_EFFECT_NARRATION_MS,
  Zone,
  type DecisionRequest,
  type GameState,
  type Intent,
  type IntentResult,
  type PresentationReport,
  type Seat,
  type ServerEvent,
} from "@aegis/shared";
import { attackCandidates } from "./candidates.js";
import { createEvaluationPolicy, type BotPolicy } from "./policy.js";
import { resolveBotProfile, type BotProfile, type BotProfileName } from "./profiles.js";
import { createBotRandom } from "./rng.js";
import { buildBotView, type BotView } from "./view.js";
import type { LiveSearchFallbackCounts } from "#api/bot/search/LiveSearchFallback";

/* Default think-time window (ms). It is a window rather than a fixed beat so a
   run of actions does not tick out metronomically, and it is this long because
   the client narrates every bot action — the showcase, the burst and the feed
   entry all have to be readable before the next action displaces them. */
export const DEFAULT_MIN_ACTION_DELAY_MS = 2_000;
export const DEFAULT_MAX_ACTION_DELAY_MS = 2_800;

/* Combat windows are reflexes, not plans. The engine blocks the whole attack on the
   answer, and the attacking client holds its target arrow on the board until it lands,
   so a main-phase think time here reads as the game hanging between the arrow reaching
   security and the battle that follows. Long enough to look like a choice, short enough
   that nobody waits for it. */
export const COMBAT_REFLEX_MIN_MS = 300;
export const COMBAT_REFLEX_MAX_MS = 650;

/* How often a real-time seat rechecks a Main phase blocked on someone else (the
   opponent's decision, a combat window, an engine continuation). Polling with
   setImmediate instead keeps the event loop from ever sleeping and pins a core
   for as long as the human takes to answer. */
const BLOCKED_MAIN_PHASE_POLL_MS = 50;

/* When the opposing client reports its presentation queue, the bot waits for that queue
   to drain instead of estimating it, then leaves this beat before acting. The think time
   above only existed to cover the narration the client is now known to have finished. */
export const PRESENTED_ACTION_BEAT_MIN_MS = 700;
export const PRESENTED_ACTION_BEAT_MAX_MS = 1_100;
/* An action or event that queues no animation produces no report; past this grace the
   client is treated as idle. */
export const PRESENTATION_START_GRACE_MS = 1_000;
/* A docked decision or a hidden tab can keep the queue non-empty indefinitely. */
export const PRESENTATION_WAIT_CEILING_MS = 12_000;
const PRESENTATION_POLL_MS = 50;

/** Safety valve: the most actions the bot will take in one Main phase. */
const MAX_MAIN_PHASE_ACTIONS = 40;

export interface BotOptions {
  difficulty?: BotDifficulty;
  minThinkMs?: number;
  maxThinkMs?: number;
  /** Personality. Weights only — every profile runs the same evaluation. */
  profile?: BotProfileName | BotProfile;
  /** Seeded so an identical engine seed plus this seed replays identically. */
  seed?: number;
  /** Supply a different policy (the benchmark uses this to seat the baseline policy). */
  policy?: BotPolicy<Intent | Promise<Intent>>;
  /** Maximum time for an asynchronous policy answer, before using the heuristic. */
  policyTimeoutMs?: number;
  /** Replaces the think delay. The headless benchmark passes a microtask yield. */
  thinkDelay?: (range: BotThinkRange) => Promise<void>;
  getLegalCandidateCount?: () => number;
  /** Headless training waits for engine continuations before requesting a move. */
  canChooseMainAction?: () => boolean;
  /** Training can use Infinity and enforce an explicit episode truncation externally. */
  maxMainPhaseActions?: number;
  /**
   * The opposing client paces a chain of triggered effects itself, one effect at a time, at
   * the viewer's Effect speed. The bot then answers what a chain asks (the next effect to
   * resolve, a choice inside one) on its reflex clock: the think time would only put dead
   * air between effects the client already spaces out.
   */
  clientPacesChains?: boolean;
}

/**
 * Bot seat driver: owns the asynchronous plumbing, owns none of the judgement.
 *
 * It runs in-process, calling `applyIntent` through the supplied callback — no network
 * hop, and it shares the engine's state reference with the room that hosts it. Every
 * "what should I do" question is delegated to a {@link BotPolicy}; this class only
 * decides WHEN to ask (phase transitions, decision requests, combat windows) and paces
 * the answers so play feels human: a think delay for its own actions, a reflex for the
 * combat windows the opponent is waiting on.
 *
 * The engine's combat windows (block / counter / alliance / evade / barrier) block on a
 * promise until the seat responds, so all five are answered here — a seat that answers
 * only the block window deadlocks the match the first time a Digimon with ＜Evade＞ loses
 * a battle.
 */
export class BotPlayer {
  private disposed = false;
  private readonly cancelPolicyDecisions = new Set<() => void>();
  private runningMainPhase = false;
  private resumeMainPhaseWhenIdle = false;
  private lastTurnStarted = -1;
  private breedingActionTurn = -1;
  /** The attack currently in its block window, so the block appraisal knows the target. */
  private pendingAttackTargetsPlayer = true;
  private pendingAttackTargetPermanentId: string | undefined;
  private readonly minThinkMs: number;
  private readonly maxThinkMs: number;
  private readonly policy: BotPolicy<Intent | Promise<Intent>>;
  private readonly fallbackPolicy: BotPolicy;
  private readonly policyTimeoutMs: number;
  private readonly fallbackCounts = { timeout: 0, error: 0 };
  private readonly policyDecisionLatenciesMs: number[] = [];
  private pendingPolicyDecisions = 0;
  private eventRevision = 0;
  /** Narration the opposing client still owes the last attack, in milliseconds. */
  private narrationUntil = 0;
  /** Zero until the opposing client sends its first presentation report. */
  private lastPresentationReportAt = 0;
  private opponentPresenting = false;
  /** The last action or event the opposing client has yet to present. */
  private lastChangeAt = 0;
  /**
   * A security check is open: the card is face up and the engine is holding the attack on
   * whatever it raises next. Opened by `securityRevealed`, closed by `securityChecked` —
   * the protocol promises exactly one of each, in that order.
   */
  private resolvingSecurityCheck = false;
  private readonly usesRealTimePacing: boolean;
  private readonly clientPacesChains: boolean;
  private readonly pause: (minMs: number, maxMs: number) => Promise<void>;
  private readonly canChooseMainAction: () => boolean;
  private readonly maxMainPhaseActions: number;

  constructor(
    private readonly seat: Seat,
    private readonly state: GameState,
    private readonly sendIntent: (intent: Intent) => IntentResult | void,
    private readonly options: BotOptions = {},
  ) {
    this.minThinkMs = options.minThinkMs ?? DEFAULT_MIN_ACTION_DELAY_MS;
    this.maxThinkMs = Math.max(options.maxThinkMs ?? DEFAULT_MAX_ACTION_DELAY_MS, this.minThinkMs);
    const seed = options.seed ?? 0x5eed;
    this.fallbackPolicy = createEvaluationPolicy({
      profile: resolveBotProfile(options.profile),
      seed,
    });
    this.policy = options.policy ?? this.fallbackPolicy;
    this.policyTimeoutMs = options.policyTimeoutMs ?? 1_000;
    if (!Number.isFinite(this.policyTimeoutMs) || this.policyTimeoutMs <= 0)
      throw new Error("policyTimeoutMs must be finite and positive");
    this.canChooseMainAction = options.canChooseMainAction ?? (() => true);
    this.clientPacesChains = options.clientPacesChains === true;
    this.maxMainPhaseActions = options.maxMainPhaseActions ?? MAX_MAIN_PHASE_ACTIONS;
    if (!(this.maxMainPhaseActions > 0)) throw new Error("maxMainPhaseActions must be positive");
    const random = createBotRandom(seed ^ 0x9e37);
    const injected = options.thinkDelay;
    this.usesRealTimePacing = injected === undefined;
    this.pause = injected
      ? (minMs, maxMs) => injected({ minMs, maxMs })
      : (minMs, maxMs) =>
          new Promise<void>((resolve) => setTimeout(resolve, minMs + Math.floor(random.next() * (maxMs - minMs + 1))));
  }

  /** Stop this seat and settle bounded inference waits without issuing a fallback. */
  restartAfterRollback(state: GameState): BotPlayer {
    return new BotPlayer(this.seat, state, this.sendIntent, this.options);
  }

  resumeAfterRollback(): void {
    if (this.state.phase === Phase.Breeding)
      this.onEvent({
        kind: "phaseChanged",
        phase: Phase.Breeding,
        turnSeat: this.state.turnSeat,
        turnCount: this.state.turnCount,
      });
    if (this.state.phase === Phase.Main)
      this.onEvent({
        kind: "phaseChanged",
        phase: Phase.Main,
        turnSeat: this.state.turnSeat,
        turnCount: this.state.turnCount,
      });
  }

  dispose(): void {
    this.disposed = true;
    for (const cancel of this.cancelPolicyDecisions) cancel();
    this.cancelPolicyDecisions.clear();
  }

  /** Which policy this seat is running — surfaced for benchmark reporting. */
  get policyName(): string {
    return this.policy.name;
  }

  /** Counts fallback selections separately from successful inference and discarded stale requests. */
  get inferenceFallbacks(): Readonly<{ timeout: number; error: number }> {
    return { ...this.fallbackCounts };
  }

  get searchFallbacks(): Readonly<LiveSearchFallbackCounts> | undefined {
    return this.policy.searchFallbacks?.();
  }

  get searchErrors(): Readonly<Record<string, number>> | undefined {
    return this.policy.searchErrors?.();
  }

  get policyDecisionLatencySummary(): {
    decisions: number;
    p50Ms: number | null;
    p95Ms: number | null;
    maxMs: number | null;
  } {
    const sorted = [...this.policyDecisionLatenciesMs].sort((left, right) => left - right);
    const quantile = (fraction: number): number | null =>
      sorted.length === 0 ? null : sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]!;
    return {
      decisions: sorted.length,
      p50Ms: quantile(0.5),
      p95Ms: quantile(0.95),
      maxMs: sorted.at(-1) ?? null,
    };
  }

  /** Minimal scheduler state for headless stall diagnostics. */
  get diagnosticState(): {
    runningMainPhase: boolean;
    resumeMainPhaseWhenIdle: boolean;
    pendingPolicyDecisions: number;
  } {
    return {
      runningMainPhase: this.runningMainPhase,
      resumeMainPhaseWhenIdle: this.resumeMainPhaseWhenIdle,
      pendingPolicyDecisions: this.pendingPolicyDecisions,
    };
  }

  onDecisionRequested(request: DecisionRequest): void {
    if (this.disposed) return;
    const requestedTurnCount = this.state.turnCount;
    const pending = this.state.pendingDecision;
    const stillOpen = () =>
      !this.disposed &&
      !this.state.gameOver &&
      request.seat === this.seat &&
      this.state.turnCount === requestedTurnCount &&
      this.state.pendingDecision === pending &&
      (pending === undefined || pending.decisionId === request.decisionId);
    const answer = () => this.answerDecision(request, requestedTurnCount, stillOpen);
    // A reactive [All Turns] clause has already interrupted an action. Holding its optional
    // choice for the ordinary main-phase think time leaves the effect visibly hanging after
    // its source has lit up; answer it on the same short reflex clock as combat windows.
    // Same clock for a decision raised INSIDE a security check. The reveal is on screen,
    // the engine is holding the attack on this answer, and the narration the think time
    // would wait for is the very scene this answer is blocking — so the main-phase pace
    // reads as the match freezing mid-check (match fd8ad770 stalled 5.2s on exactly this,
    // an [On Play] target choice from a card the bot's own security replacement played).
    if (request.options?.timing === "AllTurns" || this.resolvingSecurityCheck || this.answersInChain(request)) {
      void this.reflex().then(answer);
      return;
    }
    void this.nextActionDelay().then(answer);
  }

  private async answerDecision(
    request: DecisionRequest,
    requestedTurnCount: number,
    stillOpen: () => boolean,
  ): Promise<void> {
    if (!stillOpen()) return;
    const view = this.view();
    const answer = this.resolvePolicyIntent(
      (signal) => this.policy.answerDecision(view, request, signal),
      () => this.fallbackPolicy.answerDecision(view, request),
      stillOpen,
    );
    const intent = answer instanceof Promise ? await answer : answer;
    if (intent === undefined || !stillOpen()) return;
    this.act(intent);
    // Answering may have been what the phase driver was waiting on. Let the engine's
    // continuation settle before reading the phase and scheduling the next action.
    void settleContinuation().then(() => {
      // A decision can finish a combat or effect that also ends the turn. The new
      // phaseChanged event owns the next turn; this stale callback must not act in it.
      if (this.state.turnCount !== requestedTurnCount || this.state.turnSeat !== this.seat) return;
      if (
        request.options?.promptKey === "activateBlitz" &&
        intent.type === "respondDecision" &&
        intent.response.kind === "optional" &&
        intent.response.accept
      ) {
        this.declareBlitzAttack();
        return;
      }
      if (this.state.phase === Phase.Breeding) this.runBreedingPhase();
      else if (this.state.phase === Phase.Main) this.startMainPhaseLoop();
    });
  }

  /**
   * An activated ＜Blitz＞ attacks inside the effect that processed it, and that effect can
   * resolve inside or outside Main. Declare its attack directly: the ordinary Main
   * readiness gate waits for that effect to finish and cannot drive this declaration.
   */
  private declareBlitzAttack(): void {
    const view = this.view();
    const attack = view === undefined ? undefined : attackCandidates(view)[0];
    if (attack !== undefined) this.act(attack.intent);
  }

  /** Resume only after the engine's asynchronous combat continuation has settled. */
  onActionSettled(intentType: Intent["type"]): void {
    if (intentType !== "attack" || !this.isMyMainPhase()) return;
    if (this.runningMainPhase) {
      this.resumeMainPhaseWhenIdle = true;
      return;
    }
    this.startMainPhaseLoop();
  }

  /** A presentation step the opposing human client queued, started or finished. */
  onOpponentPresentation(report: Pick<PresentationReport, "phase" | "pendingCount" | "mode">): void {
    if (this.disposed || report.phase === "expired") return;
    this.lastPresentationReportAt = Date.now();
    // The reported count still includes the step that is finishing.
    const settled = (report.phase === "finished" || report.phase === "dropped") && report.pendingCount <= 1;
    this.opponentPresenting = report.mode === "live" && !settled;
  }

  onEvent(event: ServerEvent): void {
    if (this.disposed) return;
    this.lastChangeAt = Date.now();
    this.policy.observeEvent?.(event);
    this.eventRevision++;
    switch (event.kind) {
      case "actionRejected":
        this.policy.onEngineRejection?.(event);
        break;
      case "phaseChanged":
        if (event.phase !== Phase.None) {
          this.deferForNarration(PHASE_NARRATION_MS);
        }
        if (event.turnSeat === this.seat) this.onOwnPhase(event.phase as Phase, event.turnCount);
        break;
      case "turnEnded":
        this.deferForNarration(TURN_NARRATION_MS);
        break;
      case "attackDeclared":
        this.pendingAttackTargetsPlayer = event.target.kind === "player";
        this.pendingAttackTargetPermanentId = event.target.kind === "permanent" ? event.target.permanentId : undefined;
        break;
      case "cardPlayed":
      case "digivolved":
        this.deferForNarration(CARD_ARRIVAL_NARRATION_MS);
        break;
      case "effectTriggered":
        // The client plays effects one by one, so every accepted effect adds a beat.
        // Coalescing the chain lets a later action overtake its still-pending effects.
        if (this.clientPacesChains) {
          this.deferForNarration(CHAIN_EFFECT_NARRATION_MS);
        } else if (/on.?play|when.?digivolving/i.test(event.timing ?? "")) {
          this.deferForNarration(EFFECT_CHOICE_NARRATION_MS);
        }
        break;
      case "securityRevealed":
        this.resolvingSecurityCheck = true;
        break;
      case "securityChecked":
        this.resolvingSecurityCheck = false;
        // Each check is its own centre-stage scene, and the client plays them one
        // after another, so a multi-check attack owes the sum of them.
        this.deferForNarration(
          event.resolution === "effect" ? SECURITY_EFFECT_NARRATION_MS : SECURITY_CHECK_NARRATION_MS,
        );
        break;
      case "cardsMoved":
        // An effect that spends a security stack is narrated card by card, so a bot that
        // empties one owes the whole sequence before it may act again.
        if (event.from === Zone.Security && event.to === Zone.Trash) {
          this.deferForNarration(event.instanceIds.length * SECURITY_DESTRUCTION_NARRATION_MS);
        }
        break;
      case "blockWindowOpened":
        if (this.state.turnSeat !== this.seat) {
          const context = {
            attackerPermanentId: event.attackerPermanentId,
            eligibleBlockerIds: event.eligibleBlockerIds,
            mustBlock: event.mustBlock === true,
            targetsPlayer: this.pendingAttackTargetsPlayer,
            ...(this.pendingAttackTargetPermanentId === undefined
              ? {}
              : { targetPermanentId: this.pendingAttackTargetPermanentId }),
          };
          const forcedBlockerId = event.mustBlock === true ? event.eligibleBlockerIds[0] : undefined;
          const fallback: Intent =
            forcedBlockerId === undefined
              ? { type: "declineBlock" }
              : { type: "declareBlock", blockerPermanentId: forcedBlockerId };
          this.respondWithView(
            (view, signal) => this.policy.chooseBlockResponse(view, context, signal),
            fallback,
            () =>
              this.state.combatWindow?.kind === "block" &&
              this.state.combatWindow.seat === this.seat &&
              this.state.combatWindow.attackerPermanentId === event.attackerPermanentId,
          );
        }
        break;
      case "counterWindowOpened":
        if (event.defendingSeat === this.seat) {
          this.respondWithView((view, signal) => this.policy.chooseCounterResponse(view, event, signal), {
            type: "respondCounter",
          });
        }
        break;
      case "alliancePrompt":
        if (this.controls(event.permanentId)) {
          this.respondWithView((view, signal) => this.policy.chooseAllianceResponse(view, event, signal), {
            type: "respondAlliance",
          });
        }
        break;
      case "evadePrompt":
        if (this.controls(event.permanentId)) {
          this.respondWithView((view, signal) => this.policy.chooseEvadeResponse(view, event.permanentId, signal), {
            type: "respondEvade",
            permanentId: event.permanentId,
            accept: false,
          });
        }
        break;
      case "barrierPrompt":
        if (this.controls(event.permanentId)) {
          this.respondWithView((view, signal) => this.policy.chooseBarrierResponse(view, event.permanentId, signal), {
            type: "respondBarrier",
            permanentId: event.permanentId,
            accept: false,
          });
        }
        break;
    }
  }

  /** True when the named permanent is one this seat controls. */
  private controls(permanentId: string): boolean {
    const player = this.state.players[this.seat];
    if (player === undefined) return false;
    if (player.breeding?.permanentId === permanentId) return true;
    for (const permanent of player.battleArea) {
      if (permanent.permanentId === permanentId) return true;
    }
    return false;
  }

  /**
   * Answer a combat window. Every one of these blocks the engine on an unresolved promise
   * until this seat responds, so a path that returns without sending anything wedges the
   * match — which is why an unreadable view falls back to the passive answer rather than
   * staying silent. Answered on a reflex rather than a think time: the attack is frozen
   * on the attacker's screen until it lands.
   */
  private respondWithView(
    choose: (view: BotView, signal: AbortSignal) => Intent | Promise<Intent>,
    fallback: Intent,
    stillOpen: () => boolean = () => true,
  ): void {
    const window = this.state.combatWindow;
    const turn = this.state.turnCount;
    const current = () =>
      !this.disposed &&
      !this.state.gameOver &&
      this.state.turnCount === turn &&
      this.state.combatWindow === window &&
      stillOpen();
    void this.reflex().then(async () => {
      if (!current()) return;
      const view = this.view();
      const answer =
        view === undefined
          ? fallback
          : this.resolvePolicyIntent(
              (signal) => choose(view, signal),
              () => fallback,
              current,
            );
      const intent = answer instanceof Promise ? await answer : answer;
      if (intent !== undefined && current()) this.act(intent);
    });
  }

  /** Synchronous policies keep their fail-fast behavior; remote failures have a bounded fallback. */
  private resolvePolicyIntent(
    choose: (signal: AbortSignal) => Intent | Promise<Intent>,
    fallback: () => Intent,
    current: () => boolean,
  ): Intent | Promise<Intent | undefined> {
    const startedAt = performance.now();
    const recordLatency = () => this.policyDecisionLatenciesMs.push(performance.now() - startedAt);
    const controller = new AbortController();
    let answer: Intent | Promise<Intent>;
    try {
      answer = choose(controller.signal);
    } catch (error) {
      recordLatency();
      throw error;
    }
    if (!(answer instanceof Promise)) {
      recordLatency();
      return answer;
    }
    this.pendingPolicyDecisions++;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<{ reason: "timeout" }>((resolve) => {
      timer = setTimeout(() => resolve({ reason: "timeout" }), this.policyTimeoutMs);
    });
    let cancel!: () => void;
    const cancellation = new Promise<{ cancelled: true }>((resolve) => {
      cancel = () => resolve({ cancelled: true });
      this.cancelPolicyDecisions.add(cancel);
    });
    return Promise.race([
      cancellation,
      answer.then(
        (intent) => ({ intent }),
        () => ({ reason: "error" as const }),
      ),
      timeout,
    ])
      .then((result) => {
        clearTimeout(timer);
        controller.abort();
        if ("cancelled" in result || !current()) return undefined;
        if ("intent" in result) return result.intent;
        this.fallbackCounts[result.reason]++;
        return fallback();
      })
      .finally(() => {
        recordLatency();
        this.cancelPolicyDecisions.delete(cancel);
        this.pendingPolicyDecisions--;
      });
  }

  private view(): BotView | undefined {
    return buildBotView(this.state, this.seat);
  }

  /** Send an intent and tell the policy when the engine refused it. */
  private act(intent: Intent): IntentResult | void {
    if (this.disposed) return;
    this.lastChangeAt = Date.now();
    const result = this.sendIntent(intent);
    if (result !== undefined && result.ok === false) {
      this.policy.noteRejected(intent);
      if (this.policy !== this.fallbackPolicy) this.fallbackPolicy.noteRejected(intent);
    }
    return result;
  }

  private onOwnPhase(phase: Phase, turnCount: number): void {
    if (turnCount !== this.lastTurnStarted) {
      this.lastTurnStarted = turnCount;
      // A turn change can reach the client before its security scene ends.
      // Keep the deadline; elapsed narration naturally stops delaying this seat.
      this.policy.onTurnStart();
      if (this.policy !== this.fallbackPolicy) this.fallbackPolicy.onTurnStart();
    }
    switch (phase) {
      case Phase.Breeding:
        void this.nextOwnActionDelay().then(() => this.runBreedingPhase());
        break;
      case Phase.Main:
        this.startMainPhaseLoop();
        break;
    }
  }

  private startMainPhaseLoop(): void {
    if (!this.isMyMainPhase()) return;
    if (this.runningMainPhase) {
      this.resumeMainPhaseWhenIdle = true;
      return;
    }
    this.runningMainPhase = true;
    void this.runMainPhaseLoop().finally(() => {
      this.runningMainPhase = false;
      if (this.resumeMainPhaseWhenIdle) {
        this.resumeMainPhaseWhenIdle = false;
        this.startMainPhaseLoop();
      }
    });
  }

  private async runBreedingPhase(): Promise<void> {
    if (
      this.disposed ||
      this.state.gameOver ||
      this.state.turnSeat !== this.seat ||
      this.state.phase !== Phase.Breeding ||
      this.state.pendingDecision !== undefined
    )
      return;
    if (this.breedingActionTurn === this.state.turnCount) return;
    const view = this.view();
    if (view === undefined) {
      this.breedingActionTurn = this.state.turnCount;
      this.act({ type: "endPhase" });
      return;
    }
    this.breedingActionTurn = this.state.turnCount;
    const turn = this.state.turnCount;
    const revision = this.eventRevision;
    const current = () =>
      !this.disposed &&
      !this.state.gameOver &&
      this.state.turnCount === turn &&
      this.state.turnSeat === this.seat &&
      this.state.phase === Phase.Breeding &&
      this.state.pendingDecision === undefined &&
      this.eventRevision === revision;
    const answer = this.resolvePolicyIntent(
      (signal) => this.policy.chooseBreedingAction(view, signal),
      () => this.fallbackPolicy.chooseBreedingAction(view),
      current,
    );
    const intent = answer instanceof Promise ? await answer : answer;
    if (intent === undefined || !current()) {
      if (this.breedingActionTurn === turn) this.breedingActionTurn = -1;
      if (this.state.turnCount === turn) void this.runBreedingPhase();
      return;
    }
    const result = this.act(intent);
    if (result !== undefined && result.ok === false) this.breedingActionTurn = -1;
  }

  private async runMainPhaseLoop(): Promise<void> {
    // Yield once so any synchronous effects from the phase transition settle.
    await microtask();

    let actionStep = 0;
    while (actionStep < this.maxMainPhaseActions) {
      if (!this.isMyMainPhase()) return;
      if (!this.canChooseMainAction()) {
        await this.waitWhileBlocked();
        continue;
      }

      const pending = this.state.pendingDecision;
      if (pending !== undefined) {
        if (pending.seat !== this.seat) {
          // A decision for the opponent blocks our actions too. Keep the active seat's
          // driver alive until it closes: only the responding bot is notified directly.
          await this.waitWhileBlocked();
          continue;
        }
        // Our own decision; onDecisionRequested answers it and restarts this loop.
        return;
      }
      // An open combat prompt (for example an Evade on an effect deletion) parks an earlier
      // verb, and the engine refuses an attack until it resolves. A refused attacker is
      // dropped for the rest of the turn, so wait instead of acting into the refusal.
      if (this.state.combatWindow !== undefined) {
        await this.waitWhileBlocked();
        continue;
      }
      actionStep++;

      await this.nextOwnActionDelay();
      // The delay can outlast the window we planned in (combat resolved, a decision
      // arrived); re-validate before acting and let the loop re-evaluate if so.
      if (
        !this.isMyMainPhase() ||
        this.state.pendingDecision !== undefined ||
        this.state.combatWindow !== undefined ||
        !this.canChooseMainAction()
      )
        continue;

      const view = this.view();
      if (view === undefined) break;

      const turn = this.state.turnCount;
      const revision = this.eventRevision;
      const current = () =>
        this.isMyMainPhase() &&
        this.state.turnCount === turn &&
        this.eventRevision === revision &&
        this.state.pendingDecision === undefined &&
        this.state.combatWindow === undefined &&
        this.canChooseMainAction();
      const answer = this.resolvePolicyIntent(
        (signal) => this.policy.chooseMainAction(view, signal),
        () => this.fallbackPolicy.chooseMainAction(view),
        current,
      );
      const intent = answer instanceof Promise ? await answer : answer;
      if (intent === undefined || !current()) continue;
      if (intent.type === "endPhase") {
        this.act(intent);
        return;
      }

      const result = this.act(intent);
      if (result !== undefined && result.ok === false) continue; // re-plan without it
      if (intent.type === "attack") {
        // Combat is asynchronous. The host restarts this loop through onActionSettled
        // only after security/battle/end-of-attack has fully resolved.
        return;
      }
      await microtask();
    }

    if (this.isMyMainPhase() && this.state.pendingDecision === undefined) this.act({ type: "endPhase" });
  }

  private waitWhileBlocked(): Promise<void> {
    if (!this.usesRealTimePacing) return microtask();
    return new Promise<void>((resolve) => setTimeout(resolve, BLOCKED_MAIN_PHASE_POLL_MS));
  }

  private isMyMainPhase(): boolean {
    return (
      !this.disposed && !this.state.gameOver && this.state.turnSeat === this.seat && this.state.phase === Phase.Main
    );
  }

  /** The answer to a combat window, which the engine and the attacker are both waiting on. */
  /** A question a resolving chain asks, when the client is the one pacing that chain. */
  private answersInChain(request: DecisionRequest): boolean {
    return this.clientPacesChains && (request.kind === "orderTriggers" || request.sourceCardId !== undefined);
  }

  private reflex(): Promise<void> {
    return this.pause(COMBAT_REFLEX_MIN_MS, COMBAT_REFLEX_MAX_MS);
  }

  private deferForNarration(duration: number): void {
    const now = Date.now();
    // Phase/turn ribbons share one serialized client track, including the outgoing
    // resolution ahead of them. Card arrivals and consecutive effects also play in order.
    this.narrationUntil = Math.max(now, this.narrationUntil) + duration;
  }

  /**
   * The beat before the next main-phase action. Ordinarily the think time, but an attack
   * that spent security leaves the opposing client narrating the check for longer than
   * that, so the wait is stretched to cover it: the next card is played once the clash
   * has handed the board back, never on top of it.
   */
  private async nextActionDelay(): Promise<void> {
    const narration = Math.max(0, this.narrationUntil - Date.now());
    const range = this.getActionDelayRange({ minMs: this.minThinkMs, maxMs: this.maxThinkMs });
    await this.pause(Math.max(range.minMs, narration), Math.max(range.maxMs, narration));
    // More checks can arrive while this seat is already waiting to act.
    while (!this.disposed && this.usesRealTimePacing && this.narrationUntil > Date.now()) {
      const remaining = this.narrationUntil - Date.now();
      await this.pause(remaining, remaining);
    }
  }

  /**
   * The beat before a breeding or main-phase action of this seat's own. Decision answers keep
   * the estimate: a client can hold a dock open until that very answer arrives.
   */
  private getActionDelayRange({ minMs, maxMs }: BotThinkRange): BotThinkRange {
    const count = this.options.getLegalCandidateCount?.();
    if (count === undefined || !Number.isSafeInteger(count) || count < 1) {
      return { minMs, maxMs };
    }
    if (count === 1) {
      return { minMs: Math.round(minMs * 0.2), maxMs: Math.round(maxMs * 0.2) };
    }
    return { minMs, maxMs: minMs + Math.round((maxMs - minMs) * Math.min(1, (count - 1) / 7)) };
  }

  private async nextOwnActionDelay(): Promise<void> {
    const deadline = Date.now() + PRESENTATION_WAIT_CEILING_MS;
    if (!(await this.waitForOpponentPresentation(deadline))) return this.nextActionDelay();
    do {
      const range = this.getActionDelayRange({
        minMs: PRESENTED_ACTION_BEAT_MIN_MS,
        maxMs: PRESENTED_ACTION_BEAT_MAX_MS,
      });
      await this.pause(range.minMs, range.maxMs);
      // A turn change can reach the client during the beat, starting its ribbons.
    } while (
      !this.presentationSettled() &&
      Date.now() < deadline &&
      (await this.waitForOpponentPresentation(deadline))
    );
  }

  /** False when the opposing client does not report, so the estimates above still apply. */
  private async waitForOpponentPresentation(deadline: number): Promise<boolean> {
    if (!this.usesRealTimePacing || this.lastPresentationReportAt === 0) return false;
    while (!this.disposed && !this.presentationSettled() && Date.now() < deadline) {
      await this.pause(PRESENTATION_POLL_MS, PRESENTATION_POLL_MS);
    }
    return true;
  }

  private presentationSettled(): boolean {
    const reportedSinceChange = this.lastPresentationReportAt >= this.lastChangeAt;
    const graceElapsed = Date.now() - this.lastChangeAt >= PRESENTATION_START_GRACE_MS;
    return !this.opponentPresenting && (reportedSinceChange || graceElapsed);
  }
}

function microtask(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

async function settleContinuation(): Promise<void> {
  // Decision resolution may unwind several nested trigger promises before the main verb
  // queue is ready again. Keep this headless-safe; real-time bots already wait seconds.
  for (let step = 0; step < 10; step++) await microtask();
}
