/**
 * Deterministic engine fuzzer. A seed controls board construction, intent
 * selection, and the engine. Every case executes a short sequence on one
 * state and reports the seed plus action trace if an invariant fails.
 */
import { describe, it, expect } from "vitest";
import {
  GameState,
  Permanent,
  CardInstance,
  PendingDecision,
  Phase,
  type DecisionResponse,
  type DecisionRequest,
  type Seat,
} from "@aegis/shared";
import { checkStateInvariants } from "./testkit/stateInvariants.js";
import { minimizeSequence } from "./testkit/minimizeSequence.js";
import { GameEngine } from "./GameEngine.js";
import { advance } from "./testkit/advance.js";
import { snapshotGameEngine } from "./snapshot/snapshotGameEngine.js";
import { restoreGameEngine } from "./snapshot/restoreGameEngine.js";
import { SeededRandom } from "./random/SeededRandom.js";
import { setupEngine as setupScenarioEngine } from "./testkit/harness.js";
import "../cards/index.js";

// ── Card pool ────────────────────────────────────────────────────────────────
// A small pool of real cards with diverse costs/DP/colors for random selection.

const CARD_POOL = [
  // DigiEggs (low cost, inherited effects)
  "BT1-001", // Yokomon, Red
  "BT1-002", // Bebydomon, Red
  "BT1-003", // Upamon, Blue
  // Lv.3 Digimon (low cost)
  "BT1-009", // Agumon, Red, cost 3
  "BT1-010", // Agumon Expert, Red, cost 4
  "BT1-011", // Agumon, Red, cost 3
  "ST1-01", // Koromon, Red, cost 3
  "ST1-02", // ...
  "ST1-03",
  "ST1-04",
  // Lv.4 Digimon (mid cost)
  "BT1-016", // Tyrannomon, Green, cost 5
  "BT1-023", // SkullGreymon, Purple, cost 5
  "BT1-036", // Garurumon, Blue, cost 6, Unsuspend OnPlay
  // Lv.5 Digimon (high cost)
  "BT1-021", // MetalGreymon, Red, cost 6, GainMemory
  "BT1-044", // MetalGarurumon, Blue, cost 7
  // Tamers
  "BT1-085", // Tai Kamiya, Red, cost 3
  "BT1-086", // Matt Ishida, Blue, cost 3
  // AD cards (extra variety)
  "AD1-001", // Greymon, Red
  "AD1-002", // Aldamon, Red
  "AD1-004", // WarGreymon, Red
  "AD1-010", // Garurumon, Blue
];

type Random = () => number;

function seededRandom(seed: number): Random {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x100000000;
  };
}

function pick<T>(items: readonly T[], random: Random): T {
  return items[Math.floor(random() * items.length)]!;
}

function randomCard(random: Random): string {
  return pick(CARD_POOL, random);
}

// ── Helpers (standard) ───────────────────────────────────────────────────────

let seq = 0;
function instance(cardId: string, seat: Seat, faceUp: boolean): CardInstance {
  seq++;
  const c = new CardInstance();
  c.instanceId = `fuzz-i-${seq}`;
  c.cardId = cardId;
  c.ownerSeat = seat;
  c.faceUp = faceUp;
  return c;
}

function digimon(seat: Seat, dp: number, random: Random, cardId?: string): Permanent {
  seq++;
  const top = instance(cardId ?? randomCard(random), seat, true);
  const p = new Permanent();
  p.permanentId = `fuzz-p-${seq}`;
  p.controllerSeat = seat;
  p.topCard = top;
  p.baseDP = dp;
  p.currentDP = dp;
  p.isSuspended = random() < 0.3;
  return p;
}

function setupEngine(seed: number, trace: string[] = []) {
  const state = new GameState();
  const events: import("@aegis/shared").ServerEvent[] = [];
  const decisionErrors: string[] = [];
  let queuedResponses = 0;
  let engineRef: GameEngine | undefined;

  function queueResponse(seat: Seat, decisionId: string, response: DecisionResponse): void {
    const label = `decision:${decisionId}:${JSON.stringify(response)}`;
    trace.push(`${label}:queued`);
    queuedResponses++;
    queueMicrotask(() => {
      try {
        if (!engineRef) throw new Error("engine unavailable for decision response");
        const result = engineRef.applyIntent(seat, { type: "respondDecision", decisionId, response });
        trace.push(`${label}:${result.ok ? "accepted" : `rejected(${JSON.stringify(result)})`}`);
        if (!result.ok) decisionErrors.push(`${label}: ${JSON.stringify(result)}`);
      } catch (error) {
        trace.push(`${label}:threw`);
        decisionErrors.push(`${label}: ${String(error)}`);
      } finally {
        queuedResponses--;
      }
    });
  }

  const engine = new GameEngine(state, {
    seed,
    requestDecision: (seat, req) => {
      if (req.kind === "optional") {
        queueResponse(seat, req.decisionId, { kind: "optional", accept: true });
      } else if (req.kind === "selectCards" || req.kind === "chooseTargets") {
        const candidates = req.options?.candidateInstanceIds ?? [];
        const ids = candidates.slice(0, req.options?.min ?? 0);
        queueResponse(seat, req.decisionId, { kind: req.kind, instanceIds: ids });
      } else if (req.kind === "chooseOption") {
        queueResponse(seat, req.decisionId, { kind: "chooseOption", optionIndex: 0 });
      } else if (req.kind === "orderCards") {
        queueResponse(seat, req.decisionId, { kind: "orderCards", order: req.options?.candidateInstanceIds ?? [] });
      } else if (req.kind === "orderTriggers") {
        queueResponse(seat, req.decisionId, {
          kind: "orderTriggers",
          order: (req.options?.triggerKeys ?? []).slice(0, 1),
        });
      } else {
        decisionErrors.push(`unsupported decision:${req.decisionId}:${req.kind}`);
      }
    },
    emit: (event) => events.push(event),
  });
  engineRef = engine;
  engine.seatPlayer(0, "sa", { displayName: "A", deck: { mainDeck: [], eggDeck: [] } });
  engine.seatPlayer(1, "sb", { displayName: "B", deck: { mainDeck: [], eggDeck: [] } });
  state.phase = Phase.Main;
  state.turnSeat = 0;
  return {
    engine,
    state,
    events,
    decisionErrors,
    queueResponse,
    get queuedResponses() {
      return queuedResponses;
    },
  };
}

function responseForDecision(request: DecisionRequest): DecisionResponse | undefined {
  if (request.kind === "optional") return { kind: "optional", accept: true };
  if (request.kind === "selectCards" || request.kind === "chooseTargets") {
    const candidates = request.options?.candidateInstanceIds ?? [];
    return { kind: request.kind, instanceIds: candidates.slice(0, request.options?.min ?? 0) };
  }
  if (request.kind === "chooseOption") return { kind: "chooseOption", optionIndex: 0 };
  if (request.kind === "orderCards") {
    return { kind: "orderCards", order: request.options?.candidateInstanceIds ?? [] };
  }
  if (request.kind === "orderTriggers") {
    return { kind: "orderTriggers", order: (request.options?.triggerKeys ?? []).slice(0, 1) };
  }
  return undefined;
}

async function assertFuzzerSnapshotContinuation(seed: number): Promise<void> {
  seq = 0;
  const setup = setupScenarioEngine({ autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true });
  setup.engine.randomStreams = [new SeededRandom({ seed }), new SeededRandom({ seed: seed ^ 0x9e3779b9 })];
  const random = seededRandom(seed);
  for (const seat of [0, 1] as const) {
    for (let index = 0; index < 10; index++) {
      setup.state.players[seat]!.deck.push(instance("BT1-009", seat, false));
    }
  }
  setup.state.memory = 10;
  const prefixInstances = [instance("BT1-009", 0, false), instance("BT1-009", 0, false)];
  setup.state.players[0]!.battleArea.push(digimon(0, 5000, random, "BT1-009"));
  setup.state.players[0]!.hand.push(...prefixInstances);
  setup.state.isFirstPlayersFirstTurn = true;
  await setup.ready();
  const originalTurn = setup.engine.turnMachine.runTurn();
  await advance(setup.engine).waitForMainPhase(0);
  buildRandomBoard(setup.state, random);
  setup.state.memory = 10;
  await setup.ready();
  const prefixLength = Math.floor(random() * (prefixInstances.length + 1));
  for (const card of prefixInstances.slice(0, prefixLength)) {
    expect(setup.engine.applyIntent(0, { type: "playCard", instanceId: card.instanceId })).toEqual({ ok: true });
    await advance(setup.engine).waitForMainPhase(0);
  }
  const eventOffset = setup.events.length;
  const snapshot = JSON.parse(JSON.stringify(snapshotGameEngine({ engine: setup.engine })));
  const restoredEvents: import("@aegis/shared").ServerEvent[] = [];
  const restoredErrors: string[] = [];
  let restoredEngine: GameEngine | undefined;
  const restored = restoreGameEngine({
    snapshot,
    hooks: {
      seed,
      emit: (event) => restoredEvents.push(event),
      requestDecision: (seat, request) => {
        const response = responseForDecision(request);
        if (response === undefined) {
          restoredErrors.push(`unsupported decision:${request.decisionId}:${request.kind}`);
          return;
        }
        queueMicrotask(() => {
          if (restoredEngine === undefined) {
            restoredErrors.push("engine unavailable for restored decision response");
            return;
          }
          const result = restoredEngine.applyIntent(seat, {
            type: "respondDecision",
            decisionId: request.decisionId,
            response,
          });
          if (!result.ok) restoredErrors.push(`${request.decisionId}: ${JSON.stringify(result)}`);
        });
      },
    },
  });
  restoredEngine = restored.engine;
  const originalResult = setup.engine.applyIntent(0, { type: "endPhase" });
  const restoredResult = restored.engine.applyIntent(0, { type: "endPhase" });
  expect(originalResult).toEqual({ ok: true });
  expect(restoredResult).toEqual(originalResult);
  await Promise.all([originalTurn, restored.completion]);
  expect(restoredErrors).toEqual([]);
  expect(restoredEvents).toEqual(setup.events.slice(eventOffset));
  expect(restored.engine.state.toJSON()).toEqual(setup.state.toJSON());
}

async function settleDecisions(
  setup: ReturnType<typeof setupEngine>,
  errors: string[],
  step: number,
  maxTicks = 500,
): Promise<void> {
  // Effects may raise a follow-up decision after the preceding response resumes.
  for (let tick = 0; tick < maxTicks; tick++) {
    await Promise.resolve();
    if (setup.decisionErrors.length > 0) {
      errors.push(...setup.decisionErrors.map((error) => `step ${step}: ${error}`));
      return;
    }
    if (tick >= 80 && setup.queuedResponses === 0 && setup.state.pendingDecision === undefined) return;
  }
  errors.push(
    `step ${step}: decision settlement exceeded ${maxTicks} ticks; pending=${setup.state.pendingDecision?.decisionId ?? "none"}; queued=${setup.queuedResponses}`,
  );
}

// ── Random board builder ─────────────────────────────────────────────────────

function buildRandomBoard(state: GameState, random: Random) {
  const p0 = state.players[0];
  const p1 = state.players[1];

  // Random Digimon on board (0-4 per player)
  for (const p of [p0, p1]) {
    const count = Math.floor(random() * 5);
    for (let i = 0; i < count; i++) {
      const dp = 1000 + Math.floor(random() * 10) * 1000; // 1K-10K
      const perm = digimon(p === p0 ? 0 : 1, dp, random);
      // 20% chance of having digivolution cards underneath
      if (random() < 0.2) {
        const stackCount = 1 + Math.floor(random() * 3);
        for (let j = 0; j < stackCount; j++) {
          perm.stack.push(instance(randomCard(random), perm.controllerSeat, false));
        }
      }
      p.battleArea.push(perm);
    }
  }

  // Random hand cards (0-5 per player)
  for (const p of [p0, p1]) {
    const count = Math.floor(random() * 6);
    for (let i = 0; i < count; i++) {
      p.hand.push(instance(randomCard(random), p === p0 ? 0 : 1, false));
    }
  }

  // Random security (0-3 per player)
  for (const p of [p0, p1]) {
    const count = Math.floor(random() * 4);
    for (let i = 0; i < count; i++) {
      p.security.push(instance(randomCard(random), p === p0 ? 0 : 1, false));
    }
  }

  // Random trash (0-5 per player)
  for (const p of [p0, p1]) {
    const count = Math.floor(random() * 6);
    for (let i = 0; i < count; i++) {
      p.trash.push(instance(randomCard(random), p === p0 ? 0 : 1, false));
    }
  }

  // Stock decks
  for (const p of [p0, p1]) {
    const count = 3 + Math.floor(random() * 10);
    for (let i = 0; i < count; i++) {
      p.deck.push(instance(randomCard(random), p === p0 ? 0 : 1, false));
    }
  }

  // Positive memory makes the first action more likely to be accepted.
  state.memory = Math.floor(random() * 11);
}

// ── Random intent generator ──────────────────────────────────────────────────

function randomIntent(state: GameState, random: Random): { seat: Seat; intent: Record<string, unknown> } | null {
  const p0 = state.players[0];
  const p1 = state.players[1];
  const seat = state.turnSeat;
  const player = seat === 0 ? p0 : p1;

  const intentType = random();

  // 30% chance: play a card from hand
  if (intentType < 0.3 && player.hand.length > 0) {
    const card = player.hand[Math.floor(random() * player.hand.length)]!;
    return { seat, intent: { type: "playCard", instanceId: card.instanceId } };
  }

  // 25% chance: attack with a Digimon
  if (intentType < 0.55 && player.battleArea.length > 0) {
    const attacker = player.battleArea[Math.floor(random() * player.battleArea.length)]!;
    // 60% attack player, 40% attack opponent Digimon
    if (random() < 0.6) {
      return {
        seat,
        intent: { type: "attack", attackerPermanentId: attacker.permanentId, target: { kind: "player" } },
      };
    } else {
      const opp = seat === 0 ? p1 : p0;
      if (opp.battleArea.length > 0) {
        const targets = opp.battleArea.filter((permanent) => permanent.isSuspended);
        if (targets.length === 0)
          return {
            seat,
            intent: { type: "attack", attackerPermanentId: attacker.permanentId, target: { kind: "player" } },
          };
        const target = pick(targets, random);
        return {
          seat,
          intent: {
            type: "attack",
            attackerPermanentId: attacker.permanentId,
            target: { kind: "permanent", permanentId: target.permanentId },
          },
        };
      }
    }
  }

  // 25% chance: digivolve (need hand card + board Digimon)
  if (intentType < 0.8 && player.hand.length > 0 && player.battleArea.length > 0) {
    const base = player.battleArea[Math.floor(random() * player.battleArea.length)]!;
    if (!base.topCard) return null;
    const evoCard = player.hand[Math.floor(random() * player.hand.length)]!;
    // Don't digivolve the same card onto itself
    if (evoCard.instanceId === base.topCard.instanceId) return null;
    return { seat, intent: { type: "digivolve", permanentId: base.permanentId, instanceId: evoCard.instanceId } };
  }

  // 20% chance: activateEffect on a permanent
  if (player.battleArea.length > 0) {
    const perm = player.battleArea[Math.floor(random() * player.battleArea.length)]!;
    return { seat, intent: { type: "activateEffect", permanentId: perm.permanentId, effectKey: "0" } };
  }

  return { seat, intent: { type: "endPhase" } };
}

// ── Fuzzer main ──────────────────────────────────────────────────────────────

const CASE_COUNT = 250;
const ACTIONS_PER_CASE = 8;
const DEFAULT_BASE_SEED = 0x5eed2026;

interface CaseResult {
  trace: string[];
  errors: string[];
  accepted: number;
  rejected: number;
  actions: SelectedAction[];
}

interface SelectedAction {
  seat: Seat;
  intent: Record<string, unknown>;
}

async function runCase(
  seed: number,
  actions = ACTIONS_PER_CASE,
  replay?: readonly SelectedAction[],
): Promise<CaseResult> {
  seq = 0;
  const random = seededRandom(seed);
  const trace: string[] = [];
  const errors: string[] = [];
  let accepted = 0;
  let rejected = 0;
  const selectedActions: SelectedAction[] = [];
  const setup = setupEngine(seed, trace);
  const { engine, state } = setup;

  try {
    buildRandomBoard(state, random);
    errors.push(...checkStateInvariants(state).map((error) => `initial: ${error}`));
  } catch (error) {
    errors.push(`board: ${String(error)}`);
    return { trace, errors, accepted, rejected, actions: selectedActions };
  }

  for (let step = 0; step < (replay?.length ?? actions) && errors.length === 0 && !state.gameOver; step++) {
    const selected = replay ? replay[step] : randomIntent(state, random);
    if (!selected) break;
    selectedActions.push(selected);
    const action = `${step}:${selected.seat}:${JSON.stringify(selected.intent)}`;
    const traceIndex = trace.push(`${action}:pending`) - 1;
    try {
      const result = engine.applyIntent(selected.seat, selected.intent as never);
      const status = result.ok ? "accepted" : `rejected(${JSON.stringify(result)})`;
      trace[traceIndex] = `${action}:${status}`;
      if (result.ok) accepted++;
      else rejected++;
      await settleDecisions(setup, errors, step);
      if (errors.length === 0) errors.push(...checkStateInvariants(state).map((error) => `step ${step}: ${error}`));
    } catch (error) {
      trace[traceIndex] = `${action}:threw`;
      errors.push(`step ${step}: ${String(error)}`);
    }
  }
  return { trace, errors, accepted, rejected, actions: selectedActions };
}

function failureKind(error: string): string {
  return error.replace(/^step \d+:/, "step:");
}

async function minimizeFailure(seed: number, result: CaseResult): Promise<SelectedAction[]> {
  const target = failureKind(result.errors[0]!);
  return minimizeSequence(result.actions, async (candidate) => {
    const replay = await runCase(seed, candidate.length, candidate);
    return replay.errors.some((error) => failureKind(error) === target);
  });
}

function actionsFromEnvironment(): SelectedAction[] | undefined {
  const encoded = process.env.FUZZ_ACTIONS_BASE64;
  const raw = encoded === undefined ? process.env.FUZZ_ACTIONS : Buffer.from(encoded, "base64").toString("utf8");
  if (raw === undefined) return undefined;
  const value: unknown = JSON.parse(raw);
  if (
    !Array.isArray(value) ||
    !value.every(
      (entry) =>
        entry !== null &&
        typeof entry === "object" &&
        (entry.seat === 0 || entry.seat === 1) &&
        entry.intent !== null &&
        typeof entry.intent === "object" &&
        !Array.isArray(entry.intent) &&
        typeof entry.intent.type === "string",
    )
  )
    throw new Error("FUZZ_ACTIONS must be a JSON array of seat and intent objects");
  return value as SelectedAction[];
}

function seedFromEnvironment(): number | undefined {
  const raw = process.env.FUZZ_SEED;
  if (raw === undefined) return undefined;
  const seed = Number(raw);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error(`FUZZ_SEED must be an unsigned 32-bit integer: ${raw}`);
  }
  return seed;
}

function stepsFromEnvironment(): number {
  const raw = process.env.FUZZ_STEPS;
  if (raw === undefined) return ACTIONS_PER_CASE;
  const steps = Number(raw);
  if (!Number.isSafeInteger(steps) || steps < 1) {
    throw new Error(`FUZZ_STEPS must be a positive integer: ${raw}`);
  }
  return steps;
}

function caseCountFromEnvironment(): number {
  const raw = process.env.FUZZ_CASES;
  if (raw === undefined) return CASE_COUNT;
  const count = Number(raw);
  if (!Number.isSafeInteger(count) || count < 1) throw new Error(`FUZZ_CASES must be a positive integer: ${raw}`);
  return count;
}

describe("Engine fuzzer", () => {
  it("restores random fuzzer Main positions and matches every following event", async () => {
    const replaySeed = seedFromEnvironment();
    const baseSeed = replaySeed ?? DEFAULT_BASE_SEED;
    const count = replaySeed === undefined ? caseCountFromEnvironment() : 1;
    for (let caseIndex = 0; caseIndex < count; caseIndex++) {
      await assertFuzzerSnapshotContinuation((baseSeed + caseIndex) >>> 0);
    }
    expect(count).toBeGreaterThan(0);
  }, 300_000);

  it("checks sequential actions on reproducible seeded boards", async () => {
    const replaySeed = seedFromEnvironment();
    const baseSeed = replaySeed ?? DEFAULT_BASE_SEED;
    const count = replaySeed === undefined ? caseCountFromEnvironment() : 1;
    const steps = stepsFromEnvironment();
    const replayActions = actionsFromEnvironment();
    if (replayActions && replaySeed === undefined) throw new Error("FUZZ_ACTIONS requires FUZZ_SEED");
    const failures: string[] = [];
    let accepted = 0;
    let rejected = 0;

    for (let caseIndex = 0; caseIndex < count; caseIndex++) {
      const seed = (baseSeed + caseIndex) >>> 0;
      const result = await runCase(seed, steps, replayActions);
      accepted += result.accepted;
      rejected += result.rejected;
      if (result.errors.length > 0) {
        const minimized = await minimizeFailure(seed, result);
        const encoded = Buffer.from(JSON.stringify(minimized)).toString("base64");
        failures.push(
          `Seed replay: FUZZ_SEED=${seed} FUZZ_STEPS=${steps} pnpm --filter @aegis/api exec vitest run src/engine/fuzzer.test.ts\n` +
            `Minimized actions: ${JSON.stringify(minimized)}\n` +
            `Replay minimized: FUZZ_SEED=${seed} FUZZ_ACTIONS_BASE64=${encoded} pnpm --filter @aegis/api exec vitest run src/engine/fuzzer.test.ts\n` +
            `${result.trace.join("\n")}\n${result.errors.join("\n")}`,
        );
      }
    }

    expect(replaySeed !== undefined || accepted > 0).toBe(true);
    expect(replaySeed !== undefined || rejected > 0).toBe(true);
    expect(failures.slice(0, 5).join("\n\n")).toBe("");
  });

  it("replays the same seed and action outcomes", async () => {
    const first = await runCase(12345, 6);
    const second = await runCase(12345, 6);
    expect(second).toEqual(first);
    const replay = await runCase(12345, 6, first.actions);
    expect(replay.trace).toEqual(first.trace);
  });

  it("removes irrelevant actions while preserving the same failure", async () => {
    const reduced = await minimizeSequence(["setup", "bug", "noise"], async (actions) => actions.includes("bug"));
    expect(reduced).toEqual(["bug"]);
  });

  it("leaves a rejected wrong-seat play in hand", () => {
    seq = 0;
    const { engine, state } = setupEngine(7);
    const card = instance("BT1-009", 1, false);
    state.players[1].hand.push(card);
    state.memory = 5;

    const result = engine.applyIntent(1, { type: "playCard", instanceId: card.instanceId });

    expect(result.ok).toBe(false);
    expect(state.players[1].hand.some((entry) => entry.instanceId === card.instanceId)).toBe(true);
    expect(state.memory).toBe(5);
    expect(checkStateInvariants(state)).toEqual([]);
  });

  it("surfaces a rejected asynchronous decision response", async () => {
    const trace: string[] = [];
    const setup = setupEngine(8, trace);
    const errors: string[] = [];

    setup.queueResponse(0, "missing-decision", { kind: "optional", accept: true });
    await settleDecisions(setup, errors, 0);

    expect(errors).toEqual([expect.stringContaining("missing-decision")]);
    expect(trace.some((entry) => entry.includes("rejected"))).toBe(true);
  });

  it("reports a decision left pending after the settle limit", async () => {
    const setup = setupEngine(9);
    const pending = new PendingDecision();
    pending.decisionId = "stuck-decision";
    pending.seat = 0;
    pending.kind = "optional";
    setup.state.pendingDecision = pending;
    const errors: string[] = [];

    await settleDecisions(setup, errors, 0, 5);

    expect(errors).toEqual([expect.stringContaining("pending=stuck-decision")]);
  });

  it("checks repeated single-card plays", async () => {
    const errors: string[] = [];
    for (const [cardIndex, cardId] of CARD_POOL.slice(0, 10).entries()) {
      for (let run = 0; run < 5; run++) {
        seq = 0;
        const setup = setupEngine(cardIndex * 5 + run);
        const { engine, state } = setup;
        const card = instance(cardId, 0, false);
        state.players[0].hand.push(card);
        state.memory = 10;
        try {
          engine.applyIntent(0, { type: "playCard", instanceId: card.instanceId });
          await settleDecisions(setup, errors, run);
          if (errors.length === 0)
            errors.push(...checkStateInvariants(state).map((error) => `${cardId} run ${run}: ${error}`));
        } catch (error) {
          errors.push(`${cardId} run ${run}: ${String(error)}`);
        }
      }
    }
    expect(errors).toEqual([]);
  });
});
