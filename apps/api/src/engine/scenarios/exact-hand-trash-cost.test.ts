import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const record = JSON.parse(
  readFileSync(new URL("./exact-hand-trash-cost.replay.json", import.meta.url), "utf8"),
) as ReplayRecord;

it.each([false, true])("rejects partial trash costs and permits an empty refusal or full payment: %s", async (pay) => {
  const replay = await runReplay(record);
  try {
    expect(replay.divergences).toEqual([]);
    const player = replay.state.players[1]!;
    const host = player.battleArea.find((permanent) => permanent.topCard.cardId === "EX5-023")!;
    const beforeHand = player.hand.map((card) => card.instanceId);
    const beforeTrash = player.trash.map((card) => card.instanceId);
    const payment = beforeHand.slice(0, 2);
    const decision = replay.state.pendingDecision!;
    expect(
      await replay.applyIntent(1, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "selectCards", instanceIds: payment.slice(0, 1) },
      }),
    ).toMatchObject({ ok: false });
    expect(replay.state.pendingDecision?.decisionId).toBe(decision.decisionId);
    expect(player.hand.map((card) => card.instanceId)).toEqual(beforeHand);
    expect(player.trash.map((card) => card.instanceId)).toEqual(beforeTrash);
    expect(host.isSuspended).toBe(true);
    expect(replay.pendingRequest?.options).toMatchObject({ min: 2, max: 2, declinesCost: true, purpose: "cost" });
    expect(
      await replay.applyIntent(1, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "selectCards", instanceIds: pay ? payment : [] },
      }),
    ).toEqual({ ok: true });
    if (pay) {
      expect(replay.state.pendingDecision?.kind).toBe("optional");
      expect(
        await replay.applyIntent(1, {
          type: "respondDecision",
          decisionId: replay.state.pendingDecision!.decisionId,
          response: { kind: "optional", accept: false },
        }),
      ).toEqual({ ok: true });
    }
    expect(replay.state.pendingDecision).toBeUndefined();
    expect(host.isSuspended).toBe(!pay);
    expect(player.trash.map((card) => card.instanceId)).toEqual([...beforeTrash, ...(pay ? payment : [])]);
    expect(player.hand).toHaveLength(beforeHand.length + 1 - (pay ? 2 : 0));
    expect(replay.state.players[0]!.security).toHaveLength(2);
    expect(replay.state.memory).toBe(0);
    expect(replay.state.turnSeat).toBe(1);
    expect(replay.state.turnCount).toBe(3);
  } finally {
    await replay.applyIntent(0, { type: "surrender" });
  }
});
