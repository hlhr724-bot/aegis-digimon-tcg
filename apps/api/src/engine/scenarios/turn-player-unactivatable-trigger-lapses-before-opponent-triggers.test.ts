import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const OPPONENT_DELETION_ORDER_INPUT = 64;
const GOKUUMON_TARGET_INPUT = 66;
const SOLARMON_INSTANCE_ID = "s1-e4ba9d518d9f77c2f03d388780d9003cc1dee8b57674539d64f0e47f8dd585a8";

it("lapses the turn player's unactivatable [When Attacking] once the opponent's simultaneous effects begin", async () => {
  const record: ReplayRecord = JSON.parse(
    readFileSync(
      new URL("./turn-player-unactivatable-trigger-lapses-before-opponent-triggers.replay.json", import.meta.url),
      "utf8",
    ),
  );
  const triggeredEffectKeys: string[] = [];
  const run = await runReplay(record, {
    untilInput: GOKUUMON_TARGET_INPUT,
    onBatch: (_state, events) => {
      for (const event of events) {
        if (event.kind === "effectTriggered") triggeredEffectKeys.push(event.effectKey);
      }
    },
  });
  try {
    expect(run.divergences.filter((divergence) => divergence.index < OPPONENT_DELETION_ORDER_INPUT)).toEqual([]);

    const solarmonPlay = triggeredEffectKeys.indexOf("BT22-074/ir-11-1");
    expect(solarmonPlay).toBeGreaterThanOrEqual(0);
    expect(triggeredEffectKeys.slice(solarmonPlay)).not.toContain("EX12-015/ir-12-0");
    expect(run.pendingRequest?.sourceCardId).not.toBe("EX12-015");
    expect(
      run.state.players[1]!.battleArea.some((permanent) => permanent.topCard.instanceId === SOLARMON_INSTANCE_ID),
    ).toBe(true);
  } finally {
    run.engine.applyIntent(0, { type: "surrender" });
  }
});
