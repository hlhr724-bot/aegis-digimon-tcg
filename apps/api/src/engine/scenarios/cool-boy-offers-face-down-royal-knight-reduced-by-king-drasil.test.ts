import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

it("offers a face-down hand Royal Knight that only King Drasil's breeding reduction makes payable to Cool Boy", async () => {
  const record = JSON.parse(
    readFileSync(
      new URL("./cool-boy-offers-face-down-royal-knight-reduced-by-king-drasil.replay.json", import.meta.url),
      "utf8",
    ),
  ) as ReplayRecord;
  const replay = await runReplay(record, { untilInput: 62 });
  try {
    expect(replay.divergences).toEqual([]);
    expect(replay.state.memory).toBe(1);
    const omnimon = replay.state.players[0]!.hand.find(({ cardId }) => cardId === "BT13-112")!;
    expect(omnimon.faceUp).toBe(false);
    expect(replay.pendingRequest).toMatchObject({ kind: "selectCards", seat: 0, sourceCardId: "EX11-071" });
    expect(replay.pendingRequest!.options?.candidateInstanceIds).toContain(omnimon.instanceId);
  } finally {
    await replay.applyIntent(0, { type: "surrender" });
  }
});
