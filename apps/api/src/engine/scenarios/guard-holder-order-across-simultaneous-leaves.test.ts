import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";
import { settle } from "#api/engine/testkit/harness";

const fixture = new URL("./guard-holder-order-across-simultaneous-leaves.replay.json", import.meta.url);
const record = JSON.parse(readFileSync(fixture, "utf8")) as ReplayRecord;

const ANDROMON = "EX12-055";
const METALGARURUMON = "EX12-035";
const THUNDERMON = "EX12-041";

async function replayToLeaveOrder() {
  const run = await runReplay(record, { untilInput: 56 });
  expect(run.divergences).toEqual([]);
  const decision = run.state.pendingDecision;
  expect(decision?.kind).toBe("orderTriggers");
  const { triggerCardIds } = JSON.parse(decision!.payloadJson) as { triggerCardIds: string[] };
  return { run, decisionId: decision!.decisionId, triggerCardIds };
}

describe("Guard holders across a simultaneous leave", () => {
  it("offers every Guard holder that protects another leaving Digimon, including one that is itself leaving", async () => {
    const { run, triggerCardIds } = await replayToLeaveOrder();
    try {
      expect([...triggerCardIds].sort()).toEqual([ANDROMON, METALGARURUMON, THUNDERMON].sort());
    } finally {
      run.engine.applyIntent(0, { type: "surrender" });
    }
  });

  it("lets a leaving Guard holder pay to keep the other leaving Digimon", async () => {
    const { run, decisionId, triggerCardIds } = await replayToLeaveOrder();
    try {
      const thundermonFirst = [
        triggerCardIds.indexOf(THUNDERMON),
        ...triggerCardIds.map((_, index) => index).filter((index) => triggerCardIds[index] !== THUNDERMON),
      ];
      expect(
        await run.applyIntent(0, {
          type: "respondDecision",
          decisionId,
          response: { kind: "orderTriggers", order: [], orderIndexes: thundermonFirst },
        }),
      ).toEqual({ ok: true });

      const guard = run.state.pendingDecision;
      expect(guard?.kind).toBe("optional");
      expect(
        await run.applyIntent(0, {
          type: "respondDecision",
          decisionId: guard!.decisionId,
          response: { kind: "optional", accept: true },
        }),
      ).toEqual({ ok: true });
      await settle(() => run.state.pendingDecision?.seat !== 0);

      const player = run.state.players[0]!;
      const fieldCardIds = player.battleArea.map((permanent) => permanent.topCard?.cardId);
      expect(fieldCardIds).toContain(ANDROMON);
      expect(fieldCardIds).toContain(METALGARURUMON);
      expect(fieldCardIds).not.toContain(THUNDERMON);
      expect(player.trash.map((card) => card.cardId)).toContain(THUNDERMON);
    } finally {
      run.engine.applyIntent(0, { type: "surrender" });
    }
  });
});
