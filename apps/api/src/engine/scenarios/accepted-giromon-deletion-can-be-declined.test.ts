import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";
import { settle } from "#api/engine/testkit/harness";

it("allows declining Giromon's deletion after accepting its trigger and placing a hand card", async () => {
  const record: ReplayRecord = JSON.parse(
    readFileSync(new URL("./accepted-giromon-deletion-can-be-declined.replay.json", import.meta.url), "utf8"),
  );
  const run = await runReplay(record);
  try {
    expect(run.divergences).toEqual([]);
    const pending = run.pendingRequest;
    expect(pending?.sourceCardId).toBe("BT26-055");
    expect(pending?.kind).toBe("chooseTargets");
    expect(pending?.options?.min).toBe(0);
    const before = run.state.players.map((player) => player.battleArea.map((permanent) => permanent.permanentId));
    const source = run.state.players[0]!.battleArea.find(
      (permanent) => permanent.permanentId === pending?.sourcePermanentId,
    )!;
    expect(source.stack.length).toBeGreaterThan(0);
    expect(
      await run.applyIntent(0, {
        type: "respondDecision",
        decisionId: pending!.decisionId,
        response: { kind: "chooseTargets", instanceIds: [] },
      }),
    ).toEqual({ ok: true });
    await settle(() => run.state.pendingDecision === undefined);
    expect(run.state.players.map((player) => player.battleArea.map((permanent) => permanent.permanentId))).toEqual(
      before,
    );
    expect(source.stack.length).toBeGreaterThan(0);
  } finally {
    run.engine.applyIntent(0, { type: "surrender" });
  }
});
