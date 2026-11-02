import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const record = JSON.parse(
  readFileSync(new URL("./dna-resets-opponent-memory.replay.json", import.meta.url), "utf8"),
) as ReplayRecord;

it("sets the opponent to three memory after DNA even when they already have more, then gains one", async () => {
  const replay = await runReplay(record);
  try {
    expect(
      replay.divergences.filter(({ kind }) => kind === "intent-result" || kind === "position" || kind === "threw"),
    ).toEqual([]);
    expect(replay.state.turnSeat).toBe(1);
    expect(replay.state.memory).toBe(-2);
  } finally {
    await replay.applyIntent(1, { type: "surrender" });
  }
});
