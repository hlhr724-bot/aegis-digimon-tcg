import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const record = JSON.parse(
  readFileSync(new URL("./revealed-placement-needs-a-host.replay.json", import.meta.url), "utf8"),
) as ReplayRecord;

it("adds only one revealed card and orders every remaining card when no placement host exists", async () => {
  const replay = await runReplay(record);
  try {
    expect(replay.divergences).toEqual([]);
    expect(replay.state.pendingDecision?.kind).toBe("orderCards");
    const request = replay.pendingRequest!;
    const remaining = request.options!.candidateInstanceIds!;
    expect(remaining).toHaveLength(2);
    expect(request.options?.visibleCards?.map((card) => card.cardId).sort()).toEqual(["BT26-082", "ST24-04"]);
    expect(replay.state.players[0]!.hand.filter((card) => card.cardId === "BT26-076")).toHaveLength(1);
    const order = [...remaining].reverse();
    expect(
      await replay.applyIntent(0, {
        type: "respondDecision",
        decisionId: request.decisionId,
        response: { kind: "orderCards", order },
      }),
    ).toEqual({ ok: true });
    expect(replay.state.players[0]!.deck.slice(-2).map((card) => card.instanceId)).toEqual(order);
    expect(replay.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["ST24-04"]);
    expect(replay.state.players[0]!.hand).toHaveLength(6);
    expect(replay.state.pendingDecision).toBeUndefined();
    expect(replay.state.memory).toBe(1);
    expect(replay.state.turnSeat).toBe(1);
    expect(replay.state.phase).toBe(Phase.Main);
  } finally {
    await replay.applyIntent(0, { type: "surrender" });
  }
});
