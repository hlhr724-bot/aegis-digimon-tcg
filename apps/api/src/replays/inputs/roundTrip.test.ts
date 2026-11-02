import { famousDeckById } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { extractReplay } from "./extract.js";
import { runReplay } from "./run.js";
import type { ReplayInput } from "./types.js";
import { comparableState, recordRoomMatch, type RoomMatchOptions } from "./roomMatch.fixture.js";
import { recordApplicationRandomCalls } from "#api/engine/testkit/recordApplicationRandomCalls";

/**
 * The whole loop on real room logs: a real `AegisRoom` plays a match and writes its log lines,
 * the replay is extracted from those lines alone, and a fresh engine fed that replay must accept
 * and refuse exactly what the room did and end in the same state.
 */

function deck(id: string) {
  const { mainDeck, eggDeck } = famousDeckById(id)!.decklist;
  return { mainDeck: [...mainDeck], eggDeck: [...eggDeck] };
}

const MATCHES: (RoomMatchOptions & { name: string; expects: (inputs: ReplayInput[]) => void })[] = [
  {
    name: "a dropped connection and a combat prompt left to time out",
    seed: 6,
    // Decks with ＜Blocker＞ on both sides, so seat 0 is asked to block and can ignore it.
    humanDeck: deck("bt10-xros-heart"),
    botDeck: deck("bt5-lordknightmon"),
    dropAtTurn: 3,
    ignoreFirstCombatPrompt: true,
    expects: (inputs) => {
      expect(inputs).toContainEqual(expect.objectContaining({ kind: "disconnect", seat: 0, final: false }));
      expect(inputs).toContainEqual(expect.objectContaining({ kind: "reconnect", seat: 0 }));
      expect(inputs).toContainEqual(expect.objectContaining({ kind: "expireCombatWindow" }));
    },
  },
  {
    // BT1-087's [On Play] shuffles security at input #26. That shuffle once drew from Math.random,
    // so this match could not be replayed.
    name: "a match whose effects shuffle security",
    seed: 99,
    humanDeck: deck("bt10-xros-heart"),
    botDeck: deck("bt5-lordknightmon"),
    expects: () => {},
  },
  {
    name: "an uninterrupted match",
    seed: 20260914,
    expects: (inputs) => {
      expect(inputs.filter((input) => input.kind === "startMatch")).toHaveLength(1);
    },
  },
  {
    name: "a player leaving mid-match",
    seed: 424242,
    leaveAtTurn: 7,
    expects: (inputs) => {
      expect(inputs).toContainEqual(expect.objectContaining({ kind: "clearReady", seat: 0 }));
      expect(inputs.at(-1)).toMatchObject({ kind: "disconnect", seat: 0, final: true });
    },
  },
];

describe("match replay round trip through a real room", () => {
  for (const { name, expects, ...match } of MATCHES) {
    it(`seed ${match.seed}: ${name}`, async () => {
      const random = recordApplicationRandomCalls();
      let unseededDraws: number;
      let recorded: Awaited<ReturnType<typeof recordRoomMatch>>;
      try {
        recorded = await recordRoomMatch(match);
      } finally {
        unseededDraws = random.stacks.length;
        random.restore();
      }
      // A match is reproducible from its seed only if nothing in it draws unseeded randomness.
      expect(unseededDraws, "the room drew unseeded randomness, which no replay can reproduce").toBe(0);
      expect(recorded.gameOver).toBe(true);

      const record = extractReplay(recorded.lines, recorded.matchId);
      expects(record.inputs);
      expect(record.inputs.filter((input) => input.kind === "intent").length).toBeGreaterThan(10);
      expect(record.inputs.every((input) => input.kind !== "intent" || input.ok !== undefined)).toBe(true);

      // Through JSON, as a saved record would arrive.
      const replay = await runReplay(JSON.parse(JSON.stringify(record)));
      replay.engine.syncCounts();
      expect(replay.divergences).toEqual([]);
      expect(replay.applied).toBe(record.inputs.length);
      expect(comparableState(replay.state)).toEqual(recorded.finalState);
    }, 120_000);
  }

  it("stops before a chosen input with the state that input arrived at", async () => {
    const recorded = await recordRoomMatch({ seed: 20260914 });
    const record = extractReplay(recorded.lines, recorded.matchId);
    const index = record.inputs.findIndex((input) => input.kind === "intent" && input.intent.type === "attack");
    expect(index).toBeGreaterThan(0);

    const partial = await runReplay(record, { untilInput: index });

    expect(partial.applied).toBe(index);
    expect(partial.divergences).toEqual([]);
    expect(partial.state.gameOver).toBe(false);
    expect(partial.state.stateVersion).toBe(record.inputs[index]!.stateVersion);
    // The engine is waiting for exactly the seat that is about to act.
    expect(partial.engine.inputSeat).toBe((record.inputs[index] as Extract<ReplayInput, { kind: "intent" }>).seat);
  }, 120_000);
});
