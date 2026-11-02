import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const record = JSON.parse(
  readFileSync(new URL("./purge-places-bottom-source.replay.json", import.meta.url), "utf8"),
) as ReplayRecord;

it("places the selected Knight below every existing King Drasil source in the recorded match", async () => {
  const replay = await runReplay(record);
  try {
    expect(replay.divergences).toEqual([]);
    expect(replay.state.players[0]!.breeding!.stack[0]!.instanceId).toBe("s0-24");
    expect(replay.state.players[0]!.breeding!.stack.length).toBeGreaterThan(1);
  } finally {
    await replay.applyIntent(0, { type: "surrender" });
  }
});
