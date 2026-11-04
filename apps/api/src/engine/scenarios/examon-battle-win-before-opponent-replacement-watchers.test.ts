import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { runReplay, type ReplayRecord, type ReplayRun } from "../../replays/inputs/index.js";

const fixture = new URL("./examon-battle-win-before-opponent-replacement-watchers.replay.json", import.meta.url);
const record = JSON.parse(readFileSync(fixture, "utf8")) as ReplayRecord;

let replay: ReplayRun;

beforeAll(async () => {
  replay = await runReplay(record, { untilInput: 193 });
}, 60_000);

describe("examon-battle-win-before-opponent-replacement-watchers", () => {
  it("accepts every recorded input through the second battle", () => {
    expect(replay.applied).toBe(record.inputs.length);
    expect(replay.divergences.filter(({ kind }) => kind === "intent-result")).toEqual([]);
  });

  it("offers the turn player's pending Examon win trigger before the opponent's add-to-deck watchers", () => {
    expect(replay.state.turnSeat).toBe(0);
    expect(replay.pendingRequest?.seat).toBe(0);
    expect(JSON.stringify(replay.pendingRequest)).toContain("EX13-045/ir-35-5");
  });
});
