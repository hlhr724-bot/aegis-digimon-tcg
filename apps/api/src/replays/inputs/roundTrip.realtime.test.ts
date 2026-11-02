import { famousDeckById } from "@aegis/shared";
import { describe, expect, it, vi } from "vitest";
import type { BotOptions } from "../../bot/BotPlayer.js";
import { extractReplay } from "./extract.js";
import { runReplay } from "./run.js";
import type { ReplayInput } from "./types.js";
import { comparableState, recordRoomMatch, type RoomMatchOptions } from "./roomMatch.fixture.js";
import { recordApplicationRandomCalls } from "#api/engine/testkit/recordApplicationRandomCalls";

/**
 * The round trip of `roundTrip.test.ts`, with the room on Node's real timers instead of faked
 * ones. In production Colyseus' matchmaker calls `room.__init()` before `onCreate`; that arms
 * `setInterval(() => this.broadcastPatch(), patchRate)` with the default 50 ms rate, and every
 * `broadcastPatch()` ticks the room clock (AegisRoom sets no simulation interval), so a room timer
 * such as the combat-window timeout can fire at whatever async boundary the interval lands on, as
 * well as inside the room's own `broadcastPatch()` calls. `recordRoomMatch({ clock: "real" })`
 * runs that same `__init`, so the clock here is ticked by the library's own interval.
 *
 * Only the bots' pacing is shortened, or a match would take minutes: every think delay and
 * reflex becomes a real `setTimeout` of 0–60 ms, which spreads the inputs over every phase of the
 * 50 ms patch interval. Which moves are played is still decided by the seeded policy, but when
 * they land relative to the patch tick is up to the real event loop, run by run.
 *
 * A replay can only be exact if the room drew no unseeded randomness, so every recording is checked
 * for `Math.random` calls. Seed 99 with the blocker decks shuffles security through an effect, which
 * once fell back to `Math.random`.
 */

vi.mock("../../bot/BotPlayer.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../bot/BotPlayer.js")>();
  class RealTimeBotPlayer extends actual.BotPlayer {
    constructor(...[seat, state, sendIntent, options]: ConstructorParameters<typeof actual.BotPlayer>) {
      // A seeded stream, so the room never calls Math.random on a bot's behalf (see the guard below).
      let next = 0x2545f491 ^ (seat + 1) ^ (options?.seed ?? 0);
      const thinkDelay = () =>
        new Promise<void>((resolve) => {
          next = (Math.imul(next, 1_103_515_245) + 12_345) >>> 0;
          setTimeout(resolve, (next >>> 16) % 61);
        });
      super(seat, state, sendIntent, { thinkDelay, ...options } satisfies BotOptions);
    }
  }
  return { ...actual, BotPlayer: RealTimeBotPlayer };
});

function deck(id: string) {
  const { mainDeck, eggDeck } = famousDeckById(id)!.decklist;
  return { mainDeck: [...mainDeck], eggDeck: [...eggDeck] };
}

const BLOCKER_DECKS = { humanDeck: deck("bt10-xros-heart"), botDeck: deck("bt5-lordknightmon") };

type Match = RoomMatchOptions & { name: string; expects: (inputs: ReplayInput[]) => void };

const uninterrupted = (seed: number): Match => ({
  name: "an uninterrupted match",
  seed,
  expects: (inputs) => {
    expect(inputs.filter((input) => input.kind === "startMatch")).toHaveLength(1);
    expect(inputs.some((input) => input.kind === "disconnect")).toBe(false);
  },
});

const dropAndReconnect = (seed: number, dropAtTurn: number): Match => ({
  name: `a dropped connection at turn ${dropAtTurn} and a reconnect`,
  seed,
  dropAtTurn,
  reconnectAfterMs: 400,
  expects: (inputs) => {
    expect(inputs).toContainEqual(expect.objectContaining({ kind: "disconnect", seat: 0, final: false }));
    expect(inputs).toContainEqual(expect.objectContaining({ kind: "reconnect", seat: 0 }));
  },
});

const combatWindowExpiry = (seed: number): Match => ({
  name: "a combat prompt left to expire on the real clock",
  seed,
  ...BLOCKER_DECKS,
  ignoreFirstCombatPrompt: true,
  // 240 s in production; a third of a second still spans several patch ticks.
  combatWindowTimeoutSeconds: 0.3,
  expects: (inputs) => {
    const expiries = inputs.filter((input) => input.kind === "expireCombatWindow");
    // The open window parks the attack, so nothing else ticks the clock: the room's own patch
    // interval fires the timeout, between macrotasks rather than inside a room call.
    expect(expiries).toContainEqual(expect.not.objectContaining({ site: expect.anything() }));
    expect(expiries).toHaveLength(1);
  },
});

const MATCHES: Match[] = [
  uninterrupted(20260914),
  uninterrupted(7),
  dropAndReconnect(13, 3),
  dropAndReconnect(424242, 5),
  combatWindowExpiry(6),
  { ...uninterrupted(99), ...BLOCKER_DECKS, name: "a match whose effects shuffle security" },
  {
    ...combatWindowExpiry(6),
    ...dropAndReconnect(6, 3),
    ...BLOCKER_DECKS,
    name: "a combat prompt expiring and a dropped connection at turn 3",
    expects: (inputs) => {
      combatWindowExpiry(6).expects(inputs);
      dropAndReconnect(6, 3).expects(inputs);
    },
  },
];

describe("match replay round trip through a real room on real timers", () => {
  for (const { name, expects, ...match } of MATCHES) {
    it(`seed ${match.seed}: ${name}`, async () => {
      const random = recordApplicationRandomCalls();
      let unseededDraws = 0;
      const recorded = await recordRoomMatch({ ...match, clock: "real" }).finally(() => {
        unseededDraws = random.stacks.length;
        random.restore();
      });
      expect(recorded.gameOver).toBe(true);
      expect(unseededDraws, "the room drew unseeded randomness, which no replay can reproduce").toBe(0);

      const record = extractReplay(recorded.lines, recorded.matchId);
      expects(record.inputs);
      expect(record.inputs.filter((input) => input.kind === "intent").length).toBeGreaterThan(10);
      expect(record.inputs.every((input) => input.kind !== "intent" || input.ok !== undefined)).toBe(true);

      // Through JSON, as a saved record would arrive.
      const replay = await runReplay(JSON.parse(JSON.stringify(record)));
      replay.engine.syncCounts();
      replay.engine.projection.syncHandAffordances();
      replay.engine.flushHandAffordances();
      expect(replay.divergences).toEqual([]);
      expect(replay.applied).toBe(record.inputs.length);
      expect(comparableState(replay.state)).toEqual(recorded.finalState);
    }, 60_000);
  }
});
