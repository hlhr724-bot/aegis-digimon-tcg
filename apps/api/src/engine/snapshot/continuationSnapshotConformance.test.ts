import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GameState } from "@aegis/shared/schema/GameState";
import type { Intent } from "@aegis/shared/protocol/intents";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import type { CounterChoice } from "@aegis/shared/protocol/CounterChoice";
import type { Seat } from "@aegis/shared/schema/enums";
import "#api/cards/index";
import { GameEngine } from "#api/engine/GameEngine";
import { snapshotGameEngine } from "#api/engine/snapshot/snapshotGameEngine";
import { restoreGameEngine } from "#api/engine/snapshot/restoreGameEngine";
import { waitForEngineIdle } from "#api/engine/snapshot/waitForEngineIdle";
import type { GameEngineSnapshot } from "#api/engine/snapshot/GameEngineSnapshot";
import { SeededRandom } from "#api/engine/random/SeededRandom";
import { BotPlayer } from "#api/bot/BotPlayer";
import { createEvaluationPolicy, type BotPolicy } from "#api/bot/policy";
import { evolutionPilotDecks } from "#api/bot/evolution/evolutionPilotDecks";
import type { ScenarioFixture } from "#api/engine/scenario/types";
import {
  COUNTER_WINDOW_SNAPSHOT_CARDS,
  counterWindowSnapshotFixture,
} from "#api/engine/scenarios/counter-window-snapshot.fixture";
import { kingDrasilBreedingSnapshot } from "#api/engine/scenarios/king-drasil-breeding-snapshot.fixture";

type PositionKind = "main" | "block" | "counter" | "decision";
type CounterKind = "blastDigivolve" | "blastDnaDigivolve" | "handEffect" | "fieldEffect";
type CounterWindow = { eligible: CounterKind[]; answer: CounterKind | "decline" };
type RecordedInput = { seat: Seat; intent: Intent; events: number };
type Position = {
  kind: PositionKind;
  snapshot: GameEngineSnapshot;
  events: number;
  inputs: number;
  counter?: CounterWindow;
};
type Deck = { mainDeck: string[]; eggDeck: string[] };
type RecordedMatch = {
  events: ServerEvent[];
  inputs: RecordedInput[];
  positions: Position[];
  failures: Record<PositionKind, number>;
  state: GameState;
};
type MatchStart = { decks: readonly [Deck, Deck] } | { fixture: ScenarioFixture };
type PlayParams = {
  seed: number;
  sampleRate: number;
  captured: readonly PositionKind[];
  start: MatchStart;
  turnLimit: number;
  declineCounters?: boolean;
};
type VerifyParams = { seed: number; match: RecordedMatch; position: Position };

const TURN_LIMIT = 24;
const COUNTER_FIXTURE_TURNS = 4;
const EMPTY_DECK: Deck = { mainDeck: [], eggDeck: [] };
const POSITION_KINDS: readonly PositionKind[] = ["main", "block", "counter", "decision"];
const COUNTER_KINDS: readonly CounterKind[] = ["blastDigivolve", "blastDnaDigivolve", "handEffect", "fieldEffect"];

function readDecks(): readonly { deck: Deck }[] {
  const path = process.env.SNAPSHOT_CONFORMANCE_DECKS;
  if (path === undefined) {
    return evolutionPilotDecks().available;
  }
  const pool = JSON.parse(readFileSync(path, "utf8")) as { decks: Deck[] };
  return [
    ...pool.decks.map(({ mainDeck, eggDeck }) => ({ deck: { mainDeck, eggDeck } })),
    ...evolutionPilotDecks().available,
  ];
}

function classifyCounter({
  state,
  seat,
  choice,
}: {
  state: GameState;
  seat: Seat;
  choice: CounterChoice;
}): CounterKind {
  if (choice.effectKey.startsWith("blast-dna-digivolve:")) {
    return "blastDnaDigivolve";
  }
  if (choice.effectKey.startsWith("blast-digivolve:")) {
    return "blastDigivolve";
  }
  const inHand = state.players[seat]?.hand.some((card) => card.instanceId === choice.instanceId) ?? false;
  return inHand ? "handEffect" : "fieldEffect";
}

function waitForMacrotask(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

async function playRecordedMatch({
  seed,
  sampleRate,
  captured,
  start,
  turnLimit,
  declineCounters = false,
}: PlayParams): Promise<RecordedMatch> {
  const state = new GameState();
  const events: ServerEvent[] = [];
  const inputs: RecordedInput[] = [];
  const positions: Position[] = [];
  const failures: Record<PositionKind, number> = { main: 0, block: 0, counter: 0, decision: 0 };
  const bots: BotPlayer[] = [];
  const sampler = new SeededRandom({ seed: seed ^ 0x5bd1e995 });
  let progress = 0;
  const engine = new GameEngine(state, {
    seed,
    emit: (event) => {
      progress++;
      events.push(structuredClone(event));
      for (const bot of bots) {
        bot.onEvent(event);
      }
    },
    requestDecision: (seat, request) => {
      progress++;
      bots[seat]?.onDecisionRequested(request);
    },
    onActionSettled: (seat, type) => {
      progress++;
      bots[seat]?.onActionSettled(type);
    },
  });
  engine.snapshotContinuation.enable();
  const capture = (kind: PositionKind): Position | undefined => {
    if (!captured.includes(kind)) {
      return undefined;
    }
    if (kind !== "block" && kind !== "counter" && sampler.next() >= sampleRate) {
      return undefined;
    }
    try {
      const snapshot = JSON.parse(JSON.stringify(snapshotGameEngine({ engine, allowContinuation: true })));
      const position: Position = { kind, snapshot, events: events.length, inputs: inputs.length };
      positions.push(position);
      return position;
    } catch {
      failures[kind]++;
      return undefined;
    }
  };
  const apply = (seat: Seat, intent: Intent) => {
    inputs.push({ seat, intent: structuredClone(intent), events: events.length });
    progress++;
    return engine.applyIntent(seat, intent);
  };
  for (const seat of [0, 1] as const) {
    const base = createEvaluationPolicy({ seed: seed + seat });
    const policy: BotPolicy = {
      ...base,
      chooseMainAction: (view, signal) => {
        capture("main");
        return base.chooseMainAction(view, signal);
      },
      chooseBlockResponse: (view, context, signal) => {
        capture("block");
        return base.chooseBlockResponse(view, context, signal);
      },
      chooseCounterResponse: (view, context, signal) => {
        const position = capture("counter");
        const answer: Intent = declineCounters
          ? { type: "respondCounter" }
          : base.chooseCounterResponse(view, context, signal);
        if (position !== undefined) {
          const kindOf = (choice: CounterChoice) => classifyCounter({ state, seat, choice });
          const chosen =
            answer.type === "respondCounter"
              ? context.eligibleCounters.find(
                  (choice) => choice.instanceId === answer.sourceInstanceId && choice.effectKey === answer.effectKey,
                )
              : undefined;
          position.counter = {
            eligible: [...new Set(context.eligibleCounters.map(kindOf))],
            answer: chosen === undefined ? "decline" : kindOf(chosen),
          };
        }
        return answer;
      },
      answerDecision: (view, request, signal) => {
        if (request.kind !== "mulligan") {
          capture("decision");
        }
        return base.answerDecision(view, request, signal);
      },
    };
    bots.push(
      new BotPlayer(seat, state, (intent) => apply(seat, intent), {
        policy,
        seed: seed + seat * 7919,
        thinkDelay: waitForMacrotask,
      }),
    );
  }
  for (const seat of [0, 1] as const) {
    const deck = "decks" in start ? start.decks[seat] : EMPTY_DECK;
    engine.seatPlayer(seat, `conformance-${seat}`, { displayName: `Seat ${seat}`, deck });
  }
  if ("fixture" in start) {
    engine.startScenarioFixture(start.fixture);
  } else {
    engine.startMatch();
  }
  let idleTurns = 0;
  let previous = progress;
  while (!state.gameOver) {
    await waitForMacrotask();
    if (state.turnCount > turnLimit) {
      await waitForEngineIdle({ progress: () => progress });
      if (!state.gameOver) {
        apply(0, { type: "surrender" });
      }
    }
    idleTurns = progress === previous ? idleTurns + 1 : 0;
    previous = progress;
    if (idleTurns > 5000) {
      throw new Error(`Conformance match ${seed} stalled`);
    }
  }
  await waitForEngineIdle({ progress: () => progress });
  for (const bot of bots) {
    bot.dispose();
  }
  return { events, inputs, positions, failures, state };
}

async function verifyPosition({ seed, match, position }: VerifyParams): Promise<void> {
  const events: ServerEvent[] = [];
  let progress = 0;
  const restored = restoreGameEngine({
    snapshot: position.snapshot,
    hooks: {
      seed,
      emit: (event) => {
        progress++;
        events.push(structuredClone(event));
      },
      requestDecision: () => {
        progress++;
      },
      onActionSettled: () => {
        progress++;
      },
    },
  });
  void restored.completion.catch(() => undefined);
  await restored.ready;
  for (const input of match.inputs.slice(position.inputs)) {
    await waitForEngineIdle({ progress: () => progress });
    expect(events.length).toBe(input.events - position.events);
    progress++;
    restored.engine.applyIntent(input.seat, structuredClone(input.intent));
  }
  await waitForEngineIdle({ progress: () => progress });
  expect(events).toEqual(match.events.slice(position.events));
  expect(restored.engine.state.toJSON()).toEqual(match.state.toJSON());
}

function readCount({ name, fallback }: { name: string; fallback: number }): number {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  const count = Number(raw);
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error(`${name} must be a positive integer: ${raw}`);
  }
  return count;
}

function emptyCounts<Kind extends string>(kinds: readonly Kind[]): Record<Kind, number> {
  return Object.fromEntries(kinds.map((kind) => [kind, 0])) as Record<Kind, number>;
}

describe("continuation snapshot conformance", () => {
  it(
    "restores combat-window and mid-effect positions and matches every later event and the final state",
    async () => {
      const matches = readCount({ name: "SNAPSHOT_CONFORMANCE_MATCHES", fallback: 6 });
      const baseSeed = readCount({ name: "SNAPSHOT_CONFORMANCE_SEED", fallback: 20261032 });
      const sampleRate = Number(process.env.SNAPSHOT_CONFORMANCE_SAMPLE_RATE ?? 0.25);
      const pool = readDecks();
      const verified = emptyCounts(POSITION_KINDS);
      const continued = emptyCounts(POSITION_KINDS);
      const failures = emptyCounts(POSITION_KINDS);
      const perMatch: { seed: number; kinds: PositionKind[] }[] = [];
      for (let index = 0; index < matches; index++) {
        const seed = baseSeed + index;
        const decks = [0, 1].map((seat) => pool[(seed * 3 + seat * 5) % pool.length]!.deck) as [Deck, Deck];
        const match = await playRecordedMatch({
          seed,
          sampleRate,
          captured: POSITION_KINDS,
          start: { decks },
          turnLimit: TURN_LIMIT,
        });
        for (const kind of POSITION_KINDS) {
          failures[kind] += match.failures[kind];
        }
        perMatch.push({
          seed,
          kinds: match.positions.map((position) => position.kind).filter((kind) => kind !== "main"),
        });
        for (const position of match.positions) {
          await verifyPosition({ seed, match, position });
          verified[position.kind]++;
          if (position.snapshot.continuation !== undefined) {
            continued[position.kind]++;
          }
        }
      }
      const reportPath = process.env.SNAPSHOT_CONFORMANCE_REPORT;
      if (reportPath !== undefined) {
        writeFileSync(
          reportPath,
          JSON.stringify({ matches, baseSeed, sampleRate, verified, continued, failures, perMatch }),
        );
      }
      expect(verified.block + verified.counter).toBeGreaterThan(0);
      expect(continued.decision).toBeGreaterThan(0);
    },
    readCount({ name: "SNAPSHOT_CONFORMANCE_TIMEOUT_MS", fallback: 600_000 }),
  );

  it(
    "restores Counter windows of every Counter kind and matches every later event and the final state",
    async () => {
      const cardStep = readCount({ name: "COUNTER_CONFORMANCE_CARD_STEP", fallback: 3 });
      const seed = readCount({ name: "COUNTER_CONFORMANCE_SEED", fallback: 20261100 });
      const cards = Object.values(COUNTER_WINDOW_SNAPSHOT_CARDS).flatMap((group) =>
        group.filter((_, index) => index % cardStep === 0),
      );
      const eligible = emptyCounts(COUNTER_KINDS);
      const answered = emptyCounts([...COUNTER_KINDS, "decline"] as const);
      let verified = 0;
      let continued = 0;
      let failures = 0;
      const perFixture: { counterCard: string; declined: boolean; windows: number }[] = [];
      for (const [index, counterCard] of cards.entries()) {
        const fixture = counterWindowSnapshotFixture({ counterCard });
        for (const declineCounters of [false, true]) {
          const match = await playRecordedMatch({
            seed: seed + index,
            sampleRate: 0,
            captured: ["counter"],
            start: { fixture },
            turnLimit: fixture.turnCount + COUNTER_FIXTURE_TURNS,
            declineCounters,
          });
          failures += match.failures.counter;
          perFixture.push({ counterCard, declined: declineCounters, windows: match.positions.length });
          for (const position of match.positions) {
            await verifyPosition({ seed: seed + index, match, position });
            verified++;
            if (position.snapshot.continuation !== undefined) {
              continued++;
            }
            for (const kind of position.counter?.eligible ?? []) {
              eligible[kind]++;
            }
            answered[position.counter?.answer ?? "decline"]++;
          }
        }
      }
      const reportPath = process.env.COUNTER_CONFORMANCE_REPORT;
      if (reportPath !== undefined) {
        writeFileSync(
          reportPath,
          JSON.stringify({ cardStep, seed, verified, continued, failures, eligible, answered, perFixture }),
        );
      }
      expect(failures).toBe(0);
      for (const kind of COUNTER_KINDS) {
        expect(eligible[kind], kind).toBeGreaterThan(0);
      }
      expect(answered.decline).toBeGreaterThan(0);
      expect(verified - answered.decline).toBeGreaterThan(0);
    },
    readCount({ name: "COUNTER_CONFORMANCE_TIMEOUT_MS", fallback: 600_000 }),
  );

  it("takes settled snapshots under a breeding digivolve lock and a breeding play-cost reduction", async () => {
    const fixture = kingDrasilBreedingSnapshot();
    const seed = 7;
    const match = await playRecordedMatch({
      seed,
      sampleRate: 1,
      captured: POSITION_KINDS,
      start: { fixture },
      turnLimit: fixture.turnCount + 2,
    });
    const playedAt = match.events.findIndex(
      (event) => event.kind === "cardPlayed" && event.instanceId === "scenario-card:royalKnight",
    );
    expect(playedAt).toBeGreaterThanOrEqual(0);
    expect(match.failures).toEqual(emptyCounts(POSITION_KINDS));
    const settledAfterPlay = match.positions.filter(
      (position) =>
        position.kind === "main" && position.events > playedAt && position.snapshot.continuation === undefined,
    );
    expect(settledAfterPlay.length).toBeGreaterThan(0);
    for (const position of match.positions) {
      await verifyPosition({ seed, match, position });
    }
  });
});
