import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { runReplay, type ReplayRecord, type ReplayRun } from "../../replays/inputs/index.js";

/**
 * Regression for Discord report 1560735666084515870, reproduced from match replay
 * 3118b23f-9f87-433e-af48-2fe16066eee5 (`pnpm replay scaffold`).
 *
 * `examon-battle-win-before-opponent-replacement-watchers.replay.json` is that match trimmed to
 * inputs 0..192: both decklists and every action up to the bug, and nothing else (no names, chat
 * or accounts). EX13-045 Examon wins an effect battle against BT26-085 Giant Slayer, whose
 * replacement digivolves it into BT26-060 Chronomon: Destroy Mode. While Examon's
 * [Your Turn] win trigger waits in the attack window, EX13-044's watcher starts a second battle
 * (input #189/#190) whose loser is saved by a Holy Mode replacement that returns a card to the
 * deck (input #191). The opponent's "when your effects add to decks" watchers then triggered
 * beside Examon's second win, and the turn player must order first.
 *
 * Inspect the position with `pnpm replay run apps/api/src/engine/scenarios/examon-battle-win-before-opponent-replacement-watchers.replay.json --until 192`.
 */
const fixture = new URL("./examon-battle-win-before-opponent-replacement-watchers.replay.json", import.meta.url);
const record = JSON.parse(readFileSync(fixture, "utf8")) as ReplayRecord;

let replay: ReplayRun;

beforeAll(async () => {
  replay = await runReplay(record, { untilInput: 192 });
}, 60_000);

describe("examon-battle-win-before-opponent-replacement-watchers", () => {
  it("accepts every recorded input through the second battle", () => {
    expect(replay.applied).toBe(192);
    expect(replay.divergences.filter(({ kind }) => kind === "intent-result")).toEqual([]);
  });

  it("offers the turn player's pending Examon win trigger before the opponent's add-to-deck watchers", () => {
    expect(replay.state.turnSeat).toBe(0);
    expect(replay.pendingRequest?.seat).toBe(0);
    expect(JSON.stringify(replay.pendingRequest)).toContain("EX13-045/ir-35-5");
  });
});
