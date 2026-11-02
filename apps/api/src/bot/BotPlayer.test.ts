import type { BotThinkRange } from "#api/bot/BotThinkRange";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Phase,
  CARD_ARRIVAL_NARRATION_MS,
  PHASE_NARRATION_MS,
  TURN_NARRATION_MS,
  SECURITY_CHECK_NARRATION_MS,
  SECURITY_DESTRUCTION_NARRATION_MS,
  EFFECT_CHOICE_NARRATION_MS,
  CHAIN_EFFECT_NARRATION_MS,
  SECURITY_EFFECT_NARRATION_MS,
  Zone,
  type DecisionRequest,
  type GameState,
  type Intent,
  type ServerEvent,
} from "@aegis/shared";
import {
  BotPlayer,
  COMBAT_REFLEX_MAX_MS,
  COMBAT_REFLEX_MIN_MS,
  DEFAULT_MAX_ACTION_DELAY_MS,
  DEFAULT_MIN_ACTION_DELAY_MS,
  PRESENTATION_START_GRACE_MS,
  PRESENTATION_WAIT_CEILING_MS,
  PRESENTED_ACTION_BEAT_MAX_MS,
  PRESENTED_ACTION_BEAT_MIN_MS,
} from "./BotPlayer.js";
import { createEvaluationPolicy } from "./policy.js";

/**
 * Pacing and wiring tests for the bot seat.
 *
 * These pin `BotPlayer`'s plumbing — the think delay, the resume-after-combat handshake,
 * the recovery from a rejected intent, and decision routing — not the evaluation itself,
 * which `evaluate.test.ts` covers directly.
 *
 * The board fixture now carries the engine's attack projections (`canAttackPlayer`,
 * `attackablePermanentIds`) because the policy reads attack legality from them rather
 * than re-deriving it from suspension, and a real opponent PlayerState because the
 * evaluation compares both boards. Both are what the engine actually publishes.
 */
function botState() {
  const attackers = [
    {
      permanentId: "large",
      topCard: { cardId: "BT1-013" }, // Muchomon, Lv.3 5000 DP
      currentDP: 5_000,
      isSuspended: false,
      keywords: [],
      canAttackPlayer: true,
      attackablePermanentIds: [],
    },
    {
      permanentId: "small",
      topCard: { cardId: "BT1-009" }, // Monodramon, Lv.3 3000 DP
      currentDP: 2_000,
      isSuspended: false,
      keywords: [],
      canAttackPlayer: true,
      attackablePermanentIds: [],
    },
  ];
  return {
    attackers,
    state: {
      gameOver: false,
      turnSeat: 1,
      turnCount: 1,
      phase: Phase.Main,
      memory: 3,
      pendingDecision: undefined,
      players: [
        { hand: [], battleArea: [], security: [1, 2, 3, 4, 5], trash: [], deck: [], eggDeck: [] },
        { hand: [], battleArea: attackers, security: [1, 2, 3, 4, 5], trash: [], deck: [], eggDeck: [] },
      ],
    } as unknown as GameState,
  };
}

/* The plumbing tests below pin the handshakes, not the default pace, so they run
   the seat on a fixed think time. The default window — deliberately a range, so a
   run of actions does not tick out metronomically — is pinned by its own test. */
const FIXED_THINK = { minThinkMs: 2_000, maxThinkMs: 2_000 };

async function advance(milliseconds: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(milliseconds);
  await Promise.resolve();
}

function deferredIntent() {
  let resolve!: (intent: Intent) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Intent>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("BotPlayer action pacing and player attacks", () => {
  afterEach(() => {
    // Drain spy restore callbacks while their fake clock is still installed.
    // A later suite's restoreAllMocks must not resurrect a fake setImmediate.
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("waits for every sequential effect before declaring its next main action", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    const intents: Intent[] = [];
    const bot = new BotPlayer(1, state, (intent) => void intents.push(intent), {
      ...FIXED_THINK,
      clientPacesChains: true,
    });
    for (let index = 0; index < 3; index++) {
      bot.onEvent({ kind: "effectTriggered", timing: "WhenDigivolving" } as ServerEvent);
    }
    bot.onEvent({ kind: "phaseChanged", phase: Phase.Main, turnSeat: 1, turnCount: 1 });
    await advance(3 * CHAIN_EFFECT_NARRATION_MS + PHASE_NARRATION_MS - 1);
    expect(intents).toEqual([]);
    await advance(1);
    expect(intents).toHaveLength(1);
    bot.dispose();
  });

  it("waits for the opposing client to finish presenting before its next main action", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    const intents: Intent[] = [];
    const bot = new BotPlayer(1, state, (intent) => void intents.push(intent), FIXED_THINK);
    bot.onOpponentPresentation({ phase: "started", pendingCount: 3, mode: "live" });
    bot.onEvent({ kind: "phaseChanged", phase: Phase.Main, turnSeat: 1, turnCount: 1 });
    // Match 39d1607b: the estimate let the bot act while its last arrival was still lit.
    await advance(PHASE_NARRATION_MS + DEFAULT_MAX_ACTION_DELAY_MS + 2_000);
    expect(intents).toEqual([]);
    bot.onOpponentPresentation({ phase: "finished", pendingCount: 1, mode: "live" });
    await advance(PRESENTED_ACTION_BEAT_MIN_MS - 1);
    expect(intents).toEqual([]);
    await advance(PRESENTED_ACTION_BEAT_MAX_MS - PRESENTED_ACTION_BEAT_MIN_MS + 100);
    expect(intents).toHaveLength(1);
    bot.dispose();
  });

  it("waits for the ribbons a turn change starts after the client last reported idle", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    const intents: Intent[] = [];
    const bot = new BotPlayer(1, state, (intent) => void intents.push(intent), FIXED_THINK);
    bot.onOpponentPresentation({ phase: "finished", pendingCount: 1, mode: "live" });
    await advance(5_000);
    bot.onEvent({ kind: "phaseChanged", phase: Phase.Main, turnSeat: 1, turnCount: 1 });
    // Match ff06953c: the client queued its turn ribbons 87 ms after the phase events.
    await advance(90);
    bot.onOpponentPresentation({ phase: "started", pendingCount: 4, mode: "live" });
    await advance(6_000);
    expect(intents).toEqual([]);
    bot.onOpponentPresentation({ phase: "finished", pendingCount: 1, mode: "live" });
    await advance(PRESENTED_ACTION_BEAT_MAX_MS + 100);
    expect(intents).toHaveLength(1);
    bot.dispose();
  });

  it("stops waiting for a presentation that never drains at its ceiling", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    const intents: Intent[] = [];
    const bot = new BotPlayer(1, state, (intent) => void intents.push(intent), FIXED_THINK);
    bot.onOpponentPresentation({ phase: "started", pendingCount: 2, mode: "live" });
    bot.onEvent({ kind: "phaseChanged", phase: Phase.Main, turnSeat: 1, turnCount: 1 });
    await advance(PRESENTATION_WAIT_CEILING_MS - 100);
    expect(intents).toEqual([]);
    await advance(PRESENTED_ACTION_BEAT_MAX_MS + 200);
    expect(intents).toHaveLength(1);
    bot.dispose();
  });

  it("treats an action that queued no presentation as presented after the grace period", async () => {
    vi.useFakeTimers();
    const { state, attackers } = botState();
    const intents: Intent[] = [];
    const bot = new BotPlayer(
      1,
      state,
      (intent) => {
        intents.push(intent);
        const attacker =
          intent.type === "attack"
            ? attackers.find((candidate) => candidate.permanentId === intent.attackerPermanentId)
            : undefined;
        if (attacker) {
          attacker.isSuspended = true;
          attacker.canAttackPlayer = false;
        }
        return { ok: true };
      },
      FIXED_THINK,
    );
    bot.onOpponentPresentation({ phase: "finished", pendingCount: 1, mode: "live" });
    bot.onEvent({ kind: "phaseChanged", phase: Phase.Main, turnSeat: 1, turnCount: 1 } as ServerEvent);
    await advance(PRESENTED_ACTION_BEAT_MAX_MS + 100);
    expect(intents).toHaveLength(1);
    bot.onActionSettled("attack");
    await advance(PRESENTATION_START_GRACE_MS - 100);
    expect(intents).toHaveLength(1);
    await advance(PRESENTED_ACTION_BEAT_MAX_MS + 200);
    expect(intents).toHaveLength(2);
    bot.dispose();
  });

  it("waits for a digivolution arrival even when it raises no triggered effects", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    const intents: Intent[] = [];
    const bot = new BotPlayer(1, state, (intent) => void intents.push(intent), FIXED_THINK);
    bot.onEvent({ kind: "phaseChanged", phase: Phase.Main, turnSeat: 1, turnCount: 1 });
    await advance(PHASE_NARRATION_MS);
    bot.onEvent({ kind: "digivolved", seat: 1, permanentId: "small", cardId: "ST1-07", mechanic: "normal" });
    await advance(CARD_ARRIVAL_NARRATION_MS - 1);
    expect(intents).toEqual([]);
    await advance(1);
    expect(intents).toHaveLength(1);
    bot.dispose();
  });

  it("extends the queued narration when a new scene arrives during its wait", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    state.turnSeat = 0;
    const intents: Intent[] = [];
    const bot = new BotPlayer(
      1,
      state,
      (intent) => {
        intents.push(intent);
        return { ok: true };
      },
      {
        ...FIXED_THINK,
        clientPacesChains: true,
      },
    );
    for (let index = 0; index < 3; index++) {
      bot.onEvent({ kind: "effectTriggered", timing: "WhenDigivolving" } as ServerEvent);
    }
    state.turnSeat = 1;
    bot.onEvent({ kind: "phaseChanged", phase: Phase.Main, turnSeat: 1, turnCount: 1 } as ServerEvent);
    await advance(1_000);
    bot.onEvent({ kind: "securityChecked", resolution: "effect" } as ServerEvent);
    await advance(3 * CHAIN_EFFECT_NARRATION_MS + PHASE_NARRATION_MS + SECURITY_EFFECT_NARRATION_MS - 1_001);
    expect(intents).toEqual([]);
    await advance(1);
    expect(intents).toHaveLength(1);
    bot.dispose();
  });

  it("retains additive arrival-effect narration for clients that do not pace chains", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    state.turnSeat = 0;
    const intents: Intent[] = [];
    const bot = new BotPlayer(
      1,
      state,
      (intent) => {
        intents.push(intent);
        return { ok: true };
      },
      FIXED_THINK,
    );
    for (let index = 0; index < 3; index++) {
      bot.onEvent({ kind: "effectTriggered", timing: "WhenDigivolving" } as ServerEvent);
    }
    state.turnSeat = 1;
    bot.onEvent({ kind: "phaseChanged", phase: Phase.Main, turnSeat: 1, turnCount: 1 } as ServerEvent);
    await advance(3 * EFFECT_CHOICE_NARRATION_MS + PHASE_NARRATION_MS - 1);
    expect(intents).toEqual([]);
    await advance(1);
    expect(intents).toHaveLength(1);
    bot.dispose();
  });

  it("waits for an asynchronous Main decision before applying it", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    const deferred = deferredIntent();
    const chooseMainAction = vi.fn<() => Promise<Intent>>(() => deferred.promise);
    const intents: Intent[] = [];
    const bot = new BotPlayer(1, state, (intent) => void intents.push(intent), {
      thinkDelay: async () => {},
      policy: { ...createEvaluationPolicy(), chooseMainAction },
    });
    bot.onEvent({ kind: "phaseChanged", phase: Phase.Main, turnSeat: 1, turnCount: 1 });
    await advance(1);
    expect(chooseMainAction).toHaveBeenCalledOnce();
    expect(intents).toEqual([]);
    deferred.resolve({ type: "endPhase" });
    await advance(1);
    expect(intents).toEqual([{ type: "endPhase" }]);
  });

  it("waits for the opponent's decision without spinning the event loop", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    state.pendingDecision = { id: "opponent", seat: 0 } as never;
    const immediates = vi.spyOn(globalThis, "setImmediate");
    const intents: Intent[] = [];
    const bot = new BotPlayer(1, state, (intent) => void intents.push(intent), {
      ...FIXED_THINK,
      policy: { ...createEvaluationPolicy(), chooseMainAction: () => ({ type: "endPhase" }) },
    });
    bot.onEvent({ kind: "phaseChanged", phase: Phase.Main, turnSeat: 1, turnCount: 1 });
    await advance(10_000);
    expect(immediates.mock.calls.length).toBeLessThan(10);
    expect(intents).toEqual([]);
    state.pendingDecision = undefined;
    await advance(2_100);
    expect(intents).toEqual([{ type: "endPhase" }]);
  });

  it("does not reinstall fake immediates when a later suite restores mocks", () => {
    const realImmediate = globalThis.setImmediate;
    try {
      // The preceding test spies on a fake timer. Restoring that stale spy after the
      // clock is uninstalled must not put its fake function back into the next suite.
      vi.restoreAllMocks();
      expect(globalThis.setImmediate).toBe(realImmediate);
      expect("clock" in globalThis.setImmediate).toBe(false);
    } finally {
      globalThis.setImmediate = realImmediate;
    }
  });

  it("discards a Main decision that returns after the turn changes", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    const deferred = deferredIntent();
    const intents: Intent[] = [];
    const bot = new BotPlayer(1, state, (intent) => void intents.push(intent), {
      thinkDelay: async () => {},
      policy: { ...createEvaluationPolicy(), chooseMainAction: () => deferred.promise },
    });
    bot.onEvent({ kind: "phaseChanged", phase: Phase.Main, turnSeat: 1, turnCount: 1 });
    await advance(1);
    state.turnSeat = 0;
    state.turnCount++;
    deferred.resolve({ type: "endPhase" });
    await advance(1);
    expect(intents).toEqual([]);
  });

  it("times out asynchronous blocking once and ignores the late model response", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    state.turnSeat = 0;
    state.combatWindow = { kind: "block", seat: 1, attackerPermanentId: "atk" } as never;
    const deferred = deferredIntent();
    let receivedSignal: AbortSignal | undefined;
    const intents: Intent[] = [];
    const bot = new BotPlayer(1, state, (intent) => void intents.push(intent), {
      thinkDelay: async () => {},
      policyTimeoutMs: 100,
      policy: {
        ...createEvaluationPolicy(),
        chooseBlockResponse: (_view, _context, signal) => {
          receivedSignal = signal;
          return deferred.promise;
        },
      },
    });
    bot.onEvent({
      kind: "blockWindowOpened",
      attackerPermanentId: "atk",
      eligibleBlockerIds: ["large"],
      mustBlock: true,
    });
    await advance(99);
    expect(intents).toEqual([]);
    await advance(1);
    expect(intents).toEqual([{ type: "declareBlock", blockerPermanentId: "large" }]);
    expect(bot.inferenceFallbacks).toEqual({ timeout: 1, error: 0 });
    deferred.resolve({ type: "declareBlock", blockerPermanentId: "small" });
    await advance(1);
    expect(intents).toHaveLength(1);
    expect(receivedSignal?.aborted).toBe(true);
  });

  it("falls back on asynchronous errors without an unhandled rejection", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    state.turnSeat = 0;
    state.combatWindow = { kind: "block", seat: 1, attackerPermanentId: "atk" } as never;
    const deferred = deferredIntent();
    const intents: Intent[] = [];
    const bot = new BotPlayer(1, state, (intent) => void intents.push(intent), {
      thinkDelay: async () => {},
      policy: { ...createEvaluationPolicy(), chooseBlockResponse: () => deferred.promise },
    });
    bot.onEvent({ kind: "blockWindowOpened", attackerPermanentId: "atk", eligibleBlockerIds: ["large"] });
    await advance(1);
    deferred.reject(new Error("inference worker exited"));
    await advance(1);
    expect(intents).toEqual([{ type: "declineBlock" }]);
    expect(bot.inferenceFallbacks).toEqual({ timeout: 0, error: 1 });
  });

  it("does not apply a late block to a replacement window with the same attacker", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    state.turnSeat = 0;
    state.combatWindow = { kind: "block", seat: 1, attackerPermanentId: "atk" } as never;
    const deferred = deferredIntent();
    const intents: Intent[] = [];
    const bot = new BotPlayer(1, state, (intent) => void intents.push(intent), {
      thinkDelay: async () => {},
      policy: { ...createEvaluationPolicy(), chooseBlockResponse: () => deferred.promise },
    });
    bot.onEvent({ kind: "blockWindowOpened", attackerPermanentId: "atk", eligibleBlockerIds: ["large"] });
    await advance(1);
    state.combatWindow = { kind: "block", seat: 1, attackerPermanentId: "atk" } as never;
    deferred.resolve({ type: "declineBlock" });
    await advance(1);
    expect(intents).toEqual([]);
  });

  it("discards an asynchronous decision answer after the pending request changes", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    state.turnSeat = 0;
    const request: DecisionRequest = { decisionId: "old", seat: 1, kind: "optional", promptText: "Activate?" };
    state.pendingDecision = { decisionId: "old", seat: 1 } as never;
    const deferred = deferredIntent();
    const intents: Intent[] = [];
    const bot = new BotPlayer(1, state, (intent) => void intents.push(intent), {
      thinkDelay: async () => {},
      policy: { ...createEvaluationPolicy(), answerDecision: () => deferred.promise },
    });
    bot.onDecisionRequested(request);
    await advance(1);
    state.pendingDecision = { decisionId: "new", seat: 1 } as never;
    deferred.resolve({ type: "respondDecision", decisionId: "old", response: { kind: "optional", accept: true } });
    await advance(1);
    expect(intents).toEqual([]);
  });

  it("retries breeding when public state changes while inference is pending", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    state.phase = Phase.Breeding;
    const deferred = deferredIntent();
    const chooseBreedingAction = vi
      .fn<() => Intent | Promise<Intent>>()
      .mockReturnValueOnce(deferred.promise)
      .mockReturnValue({ type: "endPhase" });
    const intents: Intent[] = [];
    const bot = new BotPlayer(1, state, (intent) => void intents.push(intent), {
      thinkDelay: async () => {},
      policy: { ...createEvaluationPolicy(), chooseBreedingAction },
    });
    bot.onEvent({ kind: "phaseChanged", phase: Phase.Breeding, turnSeat: 1, turnCount: 1 });
    await advance(1);
    expect(chooseBreedingAction).toHaveBeenCalledOnce();
    bot.onEvent({ kind: "memoryChanged", from: 3, to: 4, reason: "test effect" });
    deferred.resolve({ type: "hatchEgg" });
    await advance(1);
    expect(chooseBreedingAction).toHaveBeenCalledTimes(2);
    expect(intents).toEqual([{ type: "endPhase" }]);
  });

  it("uses the heuristic to answer a timed-out required decision", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    state.turnSeat = 0;
    const request: DecisionRequest = {
      decisionId: "order",
      seat: 1,
      kind: "orderCards",
      promptText: "Order",
      options: { candidateInstanceIds: ["B", "A"] },
    };
    state.pendingDecision = { decisionId: "order", seat: 1 } as never;
    const deferred = deferredIntent();
    const intents: Intent[] = [];
    const bot = new BotPlayer(1, state, (intent) => void intents.push(intent), {
      thinkDelay: async () => {},
      policyTimeoutMs: 100,
      policy: { ...createEvaluationPolicy(), answerDecision: () => deferred.promise },
    });
    bot.onDecisionRequested(request);
    await advance(100);
    expect(intents).toEqual([
      { type: "respondDecision", decisionId: "order", response: { kind: "orderCards", order: ["A", "B"] } },
    ]);
    deferred.reject(new Error("late failure"));
    await advance(1);
    expect(intents).toHaveLength(1);
  });

  it.each(["timeout", "error"] as const)("does not invoke fallback for an obsolete Main %s", async (failure) => {
    vi.useFakeTimers();
    const { state } = botState();
    const deferred = deferredIntent();
    const intents: Intent[] = [];
    const bot = new BotPlayer(1, state, (intent) => void intents.push(intent), {
      thinkDelay: async () => {},
      policyTimeoutMs: 100,
      policy: { ...createEvaluationPolicy(), chooseMainAction: () => deferred.promise },
    });
    bot.onEvent({ kind: "phaseChanged", phase: Phase.Main, turnSeat: 1, turnCount: 1 });
    await advance(1);
    state.turnSeat = 0;
    state.turnCount++;
    if (failure === "error") deferred.reject(new Error("late failure"));
    await advance(101);
    expect(bot.inferenceFallbacks).toEqual({ timeout: 0, error: 0 });
    expect(intents).toEqual([]);
    expect(bot.diagnosticState.runningMainPhase).toBe(false);
  });

  it.each([0, -1, Infinity, NaN])("rejects an invalid policy timeout (%s)", (policyTimeoutMs) => {
    const { state } = botState();
    expect(() => new BotPlayer(1, state, () => {}, { policyTimeoutMs })).toThrow(
      "policyTimeoutMs must be finite and positive",
    );
  });

  it("disposes pending inference without a timeout fallback or late action", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    const deferred = deferredIntent();
    let receivedSignal: AbortSignal | undefined;
    const intents: Intent[] = [];
    const bot = new BotPlayer(1, state, (intent) => void intents.push(intent), {
      thinkDelay: async () => {},
      policy: {
        ...createEvaluationPolicy(),
        chooseMainAction: (_view, signal) => {
          receivedSignal = signal;
          return deferred.promise;
        },
      },
    });
    bot.onEvent({ kind: "phaseChanged", phase: Phase.Main, turnSeat: 1, turnCount: 1 });
    await advance(1);
    expect(bot.diagnosticState.pendingPolicyDecisions).toBe(1);
    bot.dispose();
    await advance(1);
    expect(bot.diagnosticState.pendingPolicyDecisions).toBe(0);
    expect(bot.diagnosticState.runningMainPhase).toBe(false);
    deferred.resolve({ type: "endPhase" });
    await advance(1001);
    expect(intents).toEqual([]);
    expect(bot.inferenceFallbacks).toEqual({ timeout: 0, error: 0 });
    expect(receivedSignal?.aborted).toBe(true);
  });

  it.each([false, true])(
    "waits for all opening phase ribbons before breeding, sequential client %s",
    async (clientPacesChains) => {
      vi.useFakeTimers();
      const { state } = botState();
      const intents: Intent[] = [];
      const bot = new BotPlayer(
        1,
        state,
        (intent) => {
          intents.push(intent);
          return { ok: true };
        },
        { ...FIXED_THINK, clientPacesChains },
      );
      bot.onEvent({ kind: "phaseChanged", phase: Phase.End, turnSeat: 0, turnCount: 1 } as ServerEvent);
      bot.onEvent({ kind: "turnEnded", endingSeat: 0, nextSeat: 1, turnCount: 1 } as ServerEvent);
      state.turnCount = 2;
      for (const phase of [Phase.Active, Phase.Draw, Phase.Breeding]) {
        state.phase = phase;
        bot.onEvent({ kind: "phaseChanged", phase, turnSeat: 1, turnCount: 2 } as ServerEvent);
      }
      // Production plays End, turn change, Active, Draw and Breeding in sequence.
      const ribbonsMs = 4 * PHASE_NARRATION_MS + TURN_NARRATION_MS;
      await advance(ribbonsMs - 1);
      expect(intents).toEqual([]);
      await advance(1);
      expect(intents).toHaveLength(1);
    },
  );

  it("waits for an opponent play's arrival and On Play announcement before answering its choice", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    const intents: Intent[] = [];
    const bot = new BotPlayer(
      1,
      state,
      (intent) => {
        intents.push(intent);
      },
      FIXED_THINK,
    );
    bot.onEvent({ kind: "cardPlayed", seat: 1, cardId: "EX1-066", permanentId: "analog" });
    await advance(12);
    bot.onEvent({
      kind: "effectTriggered",
      seat: 1,
      sourceCardId: "EX1-066",
      timing: "OnPlay",
      effectKey: "on-play",
      description: "Reveal top 3 and add",
    });
    bot.onDecisionRequested({
      decisionId: "analog-choice",
      seat: 1,
      kind: "selectCards",
      promptText: "Analog Youth",
      options: { candidateInstanceIds: ["digimon"], min: 1, max: 1 },
    });
    await advance(2348);
    expect(intents).toEqual([]);
    await advance(EFFECT_CHOICE_NARRATION_MS + 272);
    expect(intents[0]).toMatchObject({ type: "respondDecision", decisionId: "analog-choice" });
  });

  it("answers an All Turns reaction on the short reflex clock", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    const intents: Intent[] = [];
    const bot = new BotPlayer(1, state, (intent) => void intents.push(intent), FIXED_THINK);

    bot.onDecisionRequested({
      decisionId: "all-turns-delete",
      seat: 1,
      kind: "chooseTargets",
      promptText: "Delete the lowest-level Digimon",
      options: {
        candidateInstanceIds: ["small"],
        min: 1,
        max: 1,
        timing: "AllTurns",
        targetFate: "delete",
      },
    });

    await advance(COMBAT_REFLEX_MIN_MS - 1);
    expect(intents).toEqual([]);
    await advance(COMBAT_REFLEX_MAX_MS - COMBAT_REFLEX_MIN_MS + 1);
    expect(intents).toMatchObject([{ type: "respondDecision", decisionId: "all-turns-delete" }]);
  });

  it("answers a chain's order on the reflex clock when the client paces chains", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    const intents: Intent[] = [];
    const bot = new BotPlayer(1, state, (intent) => void intents.push(intent), {
      ...FIXED_THINK,
      clientPacesChains: true,
    });

    bot.onDecisionRequested({
      decisionId: "chain-order",
      seat: 1,
      kind: "orderTriggers",
      promptText: "Choose the next effect to resolve",
      options: { triggerKeys: ["a", "b"], triggerCardIds: ["LM-002", "P-199"] },
    });

    await advance(COMBAT_REFLEX_MAX_MS + 1);
    expect(intents).toMatchObject([{ type: "respondDecision", decisionId: "chain-order" }]);
  });

  it("keeps the think time for a chain's order when the client does not pace chains", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    const intents: Intent[] = [];
    const bot = new BotPlayer(1, state, (intent) => void intents.push(intent), FIXED_THINK);

    bot.onDecisionRequested({
      decisionId: "chain-order",
      seat: 1,
      kind: "orderTriggers",
      promptText: "Choose the next effect to resolve",
      options: { triggerKeys: ["a", "b"], triggerCardIds: ["LM-002", "P-199"] },
    });

    await advance(COMBAT_REFLEX_MAX_MS + 1);
    expect(intents).toEqual([]);
    await advance(FIXED_THINK.maxThinkMs);
    expect(intents).toMatchObject([{ type: "respondDecision", decisionId: "chain-order" }]);
  });

  it.each([Phase.Main, Phase.End])(
    "declares an activated Blitz attack in %s while ordinary Main actions wait",
    async (phase) => {
      vi.useFakeTimers();
      const { state, attackers } = botState();
      state.phase = phase;
      attackers[0]!.canAttackPlayer = false;
      const intents: Intent[] = [];
      const bot = new BotPlayer(1, state, (intent) => void intents.push(intent), {
        ...FIXED_THINK,
        canChooseMainAction: () => false,
      });

      bot.onDecisionRequested({
        decisionId: "blitz",
        seat: 1,
        kind: "optional",
        promptText: "Activate Blitz?",
        options: { promptKey: "activateBlitz" },
      });
      await advance(FIXED_THINK.maxThinkMs);
      await vi.runAllTimersAsync();

      expect(intents).toEqual([
        { type: "respondDecision", decisionId: "blitz", response: { kind: "optional", accept: true } },
        { type: "attack", attackerPermanentId: "small", target: { kind: "player" } },
      ]);
    },
  );

  it("waits two seconds, then attacks the player with its strongest eligible Digimon", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    const intents: Intent[] = [];
    const bot = new BotPlayer(
      1,
      state,
      (intent) => {
        intents.push(intent);
        return { ok: true };
      },
      FIXED_THINK,
    );

    bot.onEvent({ kind: "phaseChanged", phase: Phase.Main, turnSeat: 1, turnCount: 1 } as ServerEvent);
    await advance(1_999);
    expect(intents).toEqual([]);

    await advance(1);
    expect(intents).toEqual([
      {
        type: "attack",
        attackerPermanentId: "large",
        target: { kind: "player" },
      },
    ]);
  });

  it("waits another two seconds before the next attack after combat settles", async () => {
    vi.useFakeTimers();
    const { state, attackers } = botState();
    const intents: Intent[] = [];
    const bot = new BotPlayer(
      1,
      state,
      (intent) => {
        intents.push(intent);
        if (intent.type === "attack") {
          const attacker = attackers.find((candidate) => candidate.permanentId === intent.attackerPermanentId);
          if (attacker) {
            attacker.isSuspended = true;
            attacker.canAttackPlayer = false; // the engine clears the projection once suspended
          }
        }
        return { ok: true };
      },
      FIXED_THINK,
    );

    bot.onEvent({ kind: "phaseChanged", phase: Phase.Main, turnSeat: 1, turnCount: 1 } as ServerEvent);
    await advance(2_000);
    bot.onActionSettled("attack");
    await advance(1_999);
    expect(intents).toHaveLength(1);

    await advance(1);
    expect(intents[1]).toEqual({
      type: "attack",
      attackerPermanentId: "small",
      target: { kind: "player" },
    });
  });

  it("holds its main action while an opponent's Evade prompt parks an earlier verb", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    state.combatWindow = { kind: "evade", seat: 0, permanentId: "opponent-evader" } as never;
    const intents: Intent[] = [];
    const bot = new BotPlayer(
      1,
      state,
      (intent) => {
        intents.push(intent);
        return { ok: true };
      },
      FIXED_THINK,
    );

    bot.onEvent({ kind: "phaseChanged", phase: Phase.Main, turnSeat: 1, turnCount: 1 } as ServerEvent);
    await advance(10_000);
    expect(intents).toEqual([]);

    state.combatWindow = undefined;
    await advance(20_000);
    expect(intents[0]).toEqual({ type: "attack", attackerPermanentId: "large", target: { kind: "player" } });
  });

  it("does not stall when the strongest attacker is rejected", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    const intents: Intent[] = [];
    const bot = new BotPlayer(
      1,
      state,
      (intent) => {
        intents.push(intent);
        return intent.type === "attack" && intent.attackerPermanentId === "large"
          ? { ok: false, reason: "illegal-target" }
          : { ok: true };
      },
      FIXED_THINK,
    );

    bot.onEvent({ kind: "phaseChanged", phase: Phase.Main, turnSeat: 1, turnCount: 1 } as ServerEvent);
    await advance(2_000);
    expect(intents).toHaveLength(1);

    await advance(2_000);
    expect(intents[1]).toEqual({
      type: "attack",
      attackerPermanentId: "small",
      target: { kind: "player" },
    });
  });

  it("answers orderCards with the complete server-offered order", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    const intents: Intent[] = [];
    const bot = new BotPlayer(
      1,
      state,
      (intent) => {
        intents.push(intent);
        return { ok: true };
      },
      FIXED_THINK,
    );
    const request = {
      decisionId: "dec-order",
      seat: 1,
      kind: "orderCards",
      promptText: "Order cards",
      options: { candidateInstanceIds: ["card-c", "card-a", "card-b"] },
    } satisfies DecisionRequest;

    bot.onDecisionRequested(request);
    await advance(2_000);

    expect(intents).toEqual([
      {
        type: "respondDecision",
        decisionId: "dec-order",
        response: { kind: "orderCards", order: ["card-a", "card-b", "card-c"] },
      },
    ]);
  });

  // The benchmark decks are mono-color BT1 lists that print no ＜Counter＞, ＜Alliance＞,
  // ＜Evade＞ or ＜Barrier＞, so a bot-vs-bot series structurally cannot open three of the
  // five combat windows. These synthetic-event tests are the only coverage those paths get,
  // and each one is a wedged match if it regresses.
  it("answers the combat windows that block the engine until the seat responds", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    // The prompts below target the defending seat, so put the opponent on turn.
    state.turnSeat = 0;
    const intents: Intent[] = [];
    const bot = new BotPlayer(
      1,
      state,
      (intent) => {
        intents.push(intent);
        return { ok: true };
      },
      FIXED_THINK,
    );

    bot.onEvent({
      kind: "counterWindowOpened",
      attackerPermanentId: "atk",
      defendingSeat: 1,
      eligibleCounters: [{ instanceId: "i-1", effectKey: "0", description: "counter" }],
    } as ServerEvent);
    bot.onEvent({ kind: "evadePrompt", permanentId: "large" } as ServerEvent);
    bot.onEvent({ kind: "barrierPrompt", permanentId: "small" } as ServerEvent);
    await advance(2_000);

    expect(intents).toContainEqual({
      type: "respondCounter",
      sourceInstanceId: "i-1",
      effectKey: "0",
    });
    expect(intents).toContainEqual({ type: "respondEvade", permanentId: "large", accept: true });
    // Barrier trashes a security card; a 5000 DP Lv.3 body is not worth one.
    expect(intents).toContainEqual({ type: "respondBarrier", permanentId: "small", accept: false });
    expect(bot.policyDecisionLatencySummary).toMatchObject({
      decisions: 3,
      p50Ms: expect.any(Number),
      p95Ms: expect.any(Number),
      maxMs: expect.any(Number),
    });
  });

  it("answers the alliance prompt, taking an ally only against a contested board", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    const intents: Intent[] = [];
    const bot = new BotPlayer(
      1,
      state,
      (intent) => {
        intents.push(intent);
        return { ok: true };
      },
      FIXED_THINK,
    );

    bot.onEvent({
      kind: "alliancePrompt",
      permanentId: "large",
      eligibleAllyIds: ["small"],
    } as ServerEvent);
    await advance(2_000);
    // Seat 0's board is empty, so there is nothing the extra DP would beat.
    expect(intents).toEqual([{ type: "respondAlliance" }]);

    state.players[0]!.battleArea = [
      { permanentId: "enemy", topCard: { cardId: "BT1-015" }, currentDP: 4_000, isSuspended: false },
    ] as never;
    bot.onEvent({
      kind: "alliancePrompt",
      permanentId: "large",
      eligibleAllyIds: ["small"],
    } as ServerEvent);
    await advance(2_000);

    expect(intents[1]).toEqual({ type: "respondAlliance", allyPermanentId: "small" });
  });

  it("paces its default think time inside the window the client narration needs", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    const intents: Intent[] = [];
    const bot = new BotPlayer(1, state, (intent) => {
      intents.push(intent);
      return { ok: true };
    });

    bot.onEvent({ kind: "phaseChanged", phase: Phase.Main, turnSeat: 1, turnCount: 1 } as ServerEvent);
    // Nothing before the floor: every action the client narrates has to stay
    // readable until the next one displaces it.
    await advance(DEFAULT_MIN_ACTION_DELAY_MS - 1);
    expect(intents).toEqual([]);

    await advance(DEFAULT_MAX_ACTION_DELAY_MS - DEFAULT_MIN_ACTION_DELAY_MS + 1);
    expect(intents).toHaveLength(1);
  });

  // The engine holds the whole attack on this answer and the attacking client holds its
  // target arrow up for the same window, so a think time here is a visible stall between
  // the arrow reaching security and the battle animation.
  it("answers a block window on a reflex rather than a think time", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    state.turnSeat = 0;
    const intents: Intent[] = [];
    const bot = new BotPlayer(
      1,
      state,
      (intent) => {
        intents.push(intent);
        return { ok: true };
      },
      FIXED_THINK,
    );
    state.combatWindow = { kind: "block", seat: 1, attackerPermanentId: "atk" } as never;

    bot.onEvent({
      kind: "blockWindowOpened",
      attackerPermanentId: "atk",
      eligibleBlockerIds: ["large"],
    } as ServerEvent);
    await advance(COMBAT_REFLEX_MIN_MS - 1);
    expect(intents).toEqual([]);

    await advance(COMBAT_REFLEX_MAX_MS - COMBAT_REFLEX_MIN_MS + 1);
    expect(intents).toHaveLength(1);
  });

  it("passes redirected permanent targets to blocking and clears them for player attacks", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    state.turnSeat = 0;
    state.combatWindow = { kind: "block", seat: 1, attackerPermanentId: "atk" } as never;
    const policy = createEvaluationPolicy();
    const chooseBlock = vi.spyOn(policy, "chooseBlockResponse").mockReturnValue({ type: "declineBlock" });
    const bot = new BotPlayer(1, state, () => ({ ok: true }), { ...FIXED_THINK, policy });
    const declared = {
      kind: "attackDeclared",
      seat: 0,
      attackerPermanentId: "atk",
      attackerCardId: "BT1-013",
    } as const;
    const block: ServerEvent = {
      kind: "blockWindowOpened",
      attackerPermanentId: "atk",
      eligibleBlockerIds: ["large"],
    };
    bot.onEvent({ ...declared, target: { kind: "permanent", permanentId: "large" } });
    bot.onEvent({ ...declared, redirected: true, target: { kind: "permanent", permanentId: "small" } });
    bot.onEvent(block);
    await advance(COMBAT_REFLEX_MAX_MS);
    expect(chooseBlock.mock.calls[0]![1]).toMatchObject({ targetsPlayer: false, targetPermanentId: "small" });
    bot.onEvent({ ...declared, target: { kind: "player" } });
    bot.onEvent(block);
    await advance(COMBAT_REFLEX_MAX_MS);
    expect(chooseBlock.mock.calls[1]![1].targetsPlayer).toBe(true);
    expect(chooseBlock.mock.calls[1]![1].targetPermanentId).toBeUndefined();
  });

  it("does not answer a block window after combat has already closed it", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    state.turnSeat = 0;
    state.combatWindow = { kind: "block", seat: 1, attackerPermanentId: "atk" } as never;
    const intents: Intent[] = [];
    const bot = new BotPlayer(
      1,
      state,
      (intent) => {
        intents.push(intent);
      },
      FIXED_THINK,
    );

    bot.onEvent({
      kind: "blockWindowOpened",
      attackerPermanentId: "atk",
      eligibleBlockerIds: ["large"],
    } as ServerEvent);
    state.combatWindow = undefined;
    await advance(COMBAT_REFLEX_MAX_MS);

    expect(intents).toEqual([]);
  });

  it("declares an eligible blocker when Collision makes blocking mandatory", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    state.turnSeat = 0;
    state.combatWindow = { kind: "block", seat: 1, attackerPermanentId: "atk" } as never;
    const intents: Intent[] = [];
    const bot = new BotPlayer(1, state, (intent) => void intents.push(intent), FIXED_THINK);

    bot.onEvent({
      kind: "blockWindowOpened",
      attackerPermanentId: "atk",
      eligibleBlockerIds: ["large"],
      mustBlock: true,
    } as ServerEvent);
    await advance(COMBAT_REFLEX_MAX_MS);

    expect(intents).toEqual([{ type: "declareBlock", blockerPermanentId: "large" }]);
  });

  it("falls back to an eligible blocker for Collision when its view is unavailable", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    state.turnSeat = 0;
    state.players = [] as never;
    state.combatWindow = { kind: "block", seat: 1, attackerPermanentId: "atk" } as never;
    const intents: Intent[] = [];
    const bot = new BotPlayer(1, state, (intent) => void intents.push(intent), FIXED_THINK);

    bot.onEvent({
      kind: "blockWindowOpened",
      attackerPermanentId: "atk",
      eligibleBlockerIds: ["forced"],
      mustBlock: true,
    } as ServerEvent);
    await advance(COMBAT_REFLEX_MAX_MS);

    expect(intents).toEqual([{ type: "declareBlock", blockerPermanentId: "forced" }]);
  });

  // The check owns the centre of the opposing screen until its scene fades. A second
  // action inside that window is played over a board the human is still watching.
  it("waits out the security narration before acting again after an attack", async () => {
    vi.useFakeTimers();
    const { state, attackers } = botState();
    const intents: Intent[] = [];
    const bot = new BotPlayer(
      1,
      state,
      (intent) => {
        intents.push(intent);
        if (intent.type === "attack") {
          const attacker = attackers.find((candidate) => candidate.permanentId === intent.attackerPermanentId);
          if (attacker) {
            attacker.isSuspended = true;
            attacker.canAttackPlayer = false;
          }
        }
        return { ok: true };
      },
      FIXED_THINK,
    );

    bot.onEvent({ kind: "phaseChanged", phase: Phase.Main, turnSeat: 1, turnCount: 1 } as ServerEvent);
    await advance(2_000);
    expect(intents).toHaveLength(1);

    bot.onEvent({ kind: "securityChecked", seat: 0, revealedCardId: "BT1-013", resolution: "trashed" } as ServerEvent);
    bot.onActionSettled("attack");
    // Longer than the think time the same seat would otherwise have taken.
    await advance(SECURITY_CHECK_NARRATION_MS - 1);
    expect(intents).toHaveLength(1);

    await advance(1);
    expect(intents).toHaveLength(2);
  });

  it("preserves the opponent attack's security narration across the turn change", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    state.turnSeat = 0;
    const intents: Intent[] = [];
    const bot = new BotPlayer(
      1,
      state,
      (intent) => {
        intents.push(intent);
        return { ok: true };
      },
      FIXED_THINK,
    );
    bot.onEvent({ kind: "securityChecked", seat: 1, revealedCardId: "BT1-013", resolution: "battle" } as ServerEvent);
    state.turnSeat = 1;
    state.turnCount = 2;
    state.phase = Phase.Breeding;
    bot.onEvent({ kind: "phaseChanged", phase: Phase.Breeding, turnSeat: 1, turnCount: 2 } as ServerEvent);
    await advance(SECURITY_CHECK_NARRATION_MS + PHASE_NARRATION_MS - 1);
    expect(intents).toEqual([]);
    await advance(1);
    expect(intents.length).toBeGreaterThan(0);
  });

  it("does not charge elapsed security narration against a later turn", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    state.turnSeat = 0;
    const intents: Intent[] = [];
    const bot = new BotPlayer(
      1,
      state,
      (intent) => {
        intents.push(intent);
        return { ok: true };
      },
      FIXED_THINK,
    );
    bot.onEvent({ kind: "securityChecked", seat: 1, revealedCardId: "BT1-013", resolution: "battle" } as ServerEvent);
    await advance(SECURITY_CHECK_NARRATION_MS);
    state.turnSeat = 1;
    state.phase = Phase.Breeding;
    bot.onEvent({ kind: "phaseChanged", phase: Phase.Breeding, turnSeat: 1, turnCount: 2 } as ServerEvent);
    await advance(2_000);
    expect(intents.length).toBeGreaterThan(0);
  });

  it("extends an in-flight action wait when another security check arrives", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    const intents: Intent[] = [];
    const bot = new BotPlayer(
      1,
      state,
      (intent) => {
        intents.push(intent);
        return { ok: true };
      },
      FIXED_THINK,
    );
    bot.onEvent({ kind: "phaseChanged", phase: Phase.Main, turnSeat: 1, turnCount: 1 } as ServerEvent);
    await advance(1_000);
    bot.onEvent({ kind: "securityChecked", seat: 1, revealedCardId: "BT1-013", resolution: "battle" } as ServerEvent);
    // The check follows the remaining portion of Main's ribbon.
    await advance(PHASE_NARRATION_MS - 1_000 + SECURITY_CHECK_NARRATION_MS - 1);
    expect(intents).toEqual([]);
    await advance(1);
    expect(intents.length).toBeGreaterThan(0);
  });

  // An effect that spends a security stack is narrated card by card, so the whole run
  // owes its budget before the bot may play anything over it.
  it.each([false, true])("waits out each trashed security card, sequential client %s", async (clientPacesChains) => {
    vi.useFakeTimers();
    const { state, attackers } = botState();
    const intents: Intent[] = [];
    const bot = new BotPlayer(
      1,
      state,
      (intent) => {
        intents.push(intent);
        if (intent.type === "attack") {
          const attacker = attackers.find((candidate) => candidate.permanentId === intent.attackerPermanentId);
          if (attacker) {
            attacker.isSuspended = true;
            attacker.canAttackPlayer = false;
          }
        }
        return { ok: true };
      },
      { ...FIXED_THINK, clientPacesChains },
    );

    bot.onEvent({ kind: "phaseChanged", phase: Phase.Main, turnSeat: 1, turnCount: 1 } as ServerEvent);
    await advance(2_000);
    expect(intents).toHaveLength(1);

    bot.onEvent({
      kind: "cardsMoved",
      instanceIds: ["sec-1", "sec-2"],
      from: Zone.Security,
      to: Zone.Trash,
    } as ServerEvent);
    bot.onActionSettled("attack");
    await advance(2 * SECURITY_DESTRUCTION_NARRATION_MS - 1);
    expect(intents).toHaveLength(1);

    await advance(1);
    expect(intents).toHaveLength(2);
  });

  it("ignores combat prompts aimed at permanents it does not control", async () => {
    vi.useFakeTimers();
    const { state } = botState();
    state.turnSeat = 0;
    const intents: Intent[] = [];
    const bot = new BotPlayer(
      1,
      state,
      (intent) => {
        intents.push(intent);
        return { ok: true };
      },
      FIXED_THINK,
    );

    bot.onEvent({ kind: "evadePrompt", permanentId: "not-mine" } as ServerEvent);
    await advance(2_000);

    expect(intents).toEqual([]);
  });
});

/**
 * Observed in match fd8ad770-b50f-40ef-ba29-94f51d697c13: the last security check of the
 * match froze the board for 5.2 seconds. The reveal was up, the engine was holding the
 * attack open, and the bot was sitting on a `chooseTargets` from a card its own security
 * replacement had just played — paced on the main-phase think clock and stretched by the
 * narration it was itself blocking.
 */
describe("BotPlayer — a decision inside a security check", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function securityCheckBot() {
    const { state } = botState();
    const intents: Intent[] = [];
    const bot = new BotPlayer(1, state, (intent) => void intents.push(intent), FIXED_THINK);
    bot.onEvent({
      kind: "securityRevealed",
      seat: 0,
      revealedCardId: "BT26-085",
      attackerPermanentId: "large",
      isDigimon: true,
    });
    return { bot, intents };
  }

  it("answers on the reflex clock while the reveal is still on screen", async () => {
    vi.useFakeTimers();
    const { bot, intents } = securityCheckBot();

    // The replacement plays a card, whose [On Play] then asks the bot to pick a target.
    bot.onEvent({ kind: "cardPlayed", seat: 1, cardId: "BT19-051", permanentId: "played" });
    bot.onEvent({
      kind: "effectTriggered",
      seat: 1,
      sourceCardId: "BT19-051",
      effectKey: "BT19-051/ir-6-0",
      description: "[OnPlay] Modify DP by 3000",
      timing: "OnPlay",
      duringSecurityCheck: true,
    });
    bot.onDecisionRequested({
      decisionId: "dec-20",
      seat: 1,
      kind: "chooseTargets",
      promptText: "AtlurBallistamon",
      options: { candidateInstanceIds: ["small"], min: 1, max: 1 },
    });

    await advance(COMBAT_REFLEX_MIN_MS - 1);
    expect(intents).toEqual([]);
    await advance(COMBAT_REFLEX_MAX_MS - COMBAT_REFLEX_MIN_MS + 1);
    expect(intents).toMatchObject([{ type: "respondDecision", decisionId: "dec-20" }]);
  });

  it("goes back to the think clock once the check has closed", async () => {
    vi.useFakeTimers();
    const { bot, intents } = securityCheckBot();
    bot.onEvent({
      kind: "securityChecked",
      seat: 0,
      revealedCardId: "BT26-085",
      resolution: "battle",
    });

    bot.onDecisionRequested({
      decisionId: "after-check",
      seat: 1,
      kind: "chooseTargets",
      promptText: "Ordinary main-phase choice",
      options: { candidateInstanceIds: ["small"], min: 1, max: 1 },
    });

    await advance(COMBAT_REFLEX_MAX_MS + 1);
    expect(intents.filter((intent) => intent.type === "respondDecision")).toEqual([]);
    await advance(SECURITY_CHECK_NARRATION_MS + DEFAULT_MAX_ACTION_DELAY_MS);
    expect(intents).toContainEqual(expect.objectContaining({ type: "respondDecision", decisionId: "after-check" }));
  });
});

it("paces a forced move faster than a branching turn through the injected delay", async () => {
  async function collectRange(count: number): Promise<BotThinkRange> {
    const { state } = botState();
    let observed: BotThinkRange | undefined;
    const bot = new BotPlayer(
      1,
      state,
      () => {
        state.gameOver = true;
      },
      {
        minThinkMs: 2000,
        maxThinkMs: 2800,
        getLegalCandidateCount: () => count,
        thinkDelay: async (range) => {
          observed = range;
        },
        policy: { ...createEvaluationPolicy(), chooseMainAction: () => ({ type: "endPhase" }) },
      },
    );
    bot.onEvent({ kind: "phaseChanged", phase: Phase.Main, turnSeat: 1, turnCount: 1 });
    await vi.waitFor(() => expect(observed).toBeDefined());
    bot.dispose();
    return observed!;
  }
  const forced = await collectRange(1);
  const branching = await collectRange(2);
  const complex = await collectRange(10);
  expect(forced.maxMs).toBeLessThan(branching.minMs);
  expect(branching.minMs).toBe(2000);
  expect(branching.maxMs).toBeLessThan(complex.maxMs);
  expect(complex).toEqual({ minMs: 2000, maxMs: 2800 });
});
