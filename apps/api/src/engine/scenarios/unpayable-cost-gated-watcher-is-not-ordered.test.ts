import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

it("leaves a watcher whose leading cost can't be paid out of the trigger order prompt", async () => {
  const record: ReplayRecord = JSON.parse(
    readFileSync(new URL("./unpayable-cost-gated-watcher-is-not-ordered.replay.json", import.meta.url), "utf8"),
  );
  const run = await runReplay(record);
  try {
    expect(run.divergences).toEqual([]);
    const lordKnightmon = run.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard?.cardId === "BT27-084",
    );
    expect(lordKnightmon).toBeDefined();
    expect(lordKnightmon!.stack.some((card) => card.cardId === "EX13-064" || card.cardId === "BT27-084")).toBe(false);
    const pending = run.pendingRequest;
    expect(pending).toBeDefined();
    const offeredCardIds =
      pending?.kind === "orderTriggers" ? pending.options?.triggerCardIds : [pending?.sourceCardId];
    expect(offeredCardIds).not.toContain("BT27-084");
  } finally {
    run.engine.applyIntent(0, { type: "surrender" });
  }
});
