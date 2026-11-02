import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

it("finishes the recorded Coredramon cost and draw after Dracomon X evolves at start of main", async () => {
  const record = JSON.parse(
    readFileSync(new URL("./coredramon-cost-after-start-main-evolution.replay.json", import.meta.url), "utf8"),
  ) as ReplayRecord;
  const replay = await runReplay(record);
  try {
    expect(replay.divergences).toEqual([]);
    expect(replay.pendingRequest).toMatchObject({ kind: "selectCards", seat: 0, sourceCardId: "EX13-018" });
    const handBefore = replay.state.players[0]!.hand.length;
    expect(
      await replay.applyIntent(0, {
        type: "respondDecision",
        decisionId: replay.pendingRequest!.decisionId,
        response: { kind: "selectCards", instanceIds: ["s0-27"] },
      }),
    ).toEqual({ ok: true });
    expect(replay.state.players[0]!.trash.some(({ instanceId }) => instanceId === "s0-27")).toBe(true);
    expect(replay.state.players[0]!.hand).toHaveLength(handBefore + 1);
    expect(replay.state.pendingDecision).toBeUndefined();
    expect(await replay.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
  } finally {
    await replay.applyIntent(0, { type: "surrender" });
  }
});
