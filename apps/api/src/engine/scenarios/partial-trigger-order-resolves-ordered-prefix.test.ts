import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

it("resolves both ordered Cool Boy effects before asking about the unordered rest", async () => {
  const record = JSON.parse(
    readFileSync(new URL("./partial-trigger-order-resolves-ordered-prefix.replay.json", import.meta.url), "utf8"),
  ) as ReplayRecord;
  const replay = await runReplay(record, { untilInput: 94 });
  try {
    expect(replay.divergences).toEqual([]);
    const coolBoys = replay.state.players[1]!.battleArea.filter(({ topCard }) => topCard.cardId === "BT20-091");
    expect(coolBoys.map(({ isSuspended }) => isSuspended)).toEqual([true, true]);
    expect(replay.pendingRequest?.options?.triggerCardIds ?? []).not.toContain("BT20-091");
  } finally {
    await replay.applyIntent(0, { type: "surrender" });
  }
});
