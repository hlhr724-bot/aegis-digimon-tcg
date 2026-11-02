import { readFileSync } from "node:fs";
import { Phase, type DecisionRequest } from "@aegis/shared";
import { expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";
import { settle } from "#api/engine/testkit/harness";

const record: ReplayRecord = JSON.parse(
  readFileSync(new URL("./sayo-koh-pays-play-cost-without-dna-result.replay.json", import.meta.url), "utf8"),
);

it("lets Sayo & Koh play a same-level stack card at the start of the opponent's turn without a DNA result in hand", async () => {
  let latestDecision: DecisionRequest | undefined;
  const replay = await runReplay(record, {
    untilInput: 154,
    onDecision: (request) => {
      latestDecision = request;
    },
  });
  try {
    expect(replay.divergences).toEqual([]);
    expect(replay.state.turnSeat).toBe(1);
    const seat = replay.state.players[0]!;
    expect(seat.hand.some((card) => card.cardId === "BT25-103")).toBe(false);
    const crescemon = seat.battleArea.find((permanent) => permanent.topCard.cardId === "BT22-073")!;
    const flaremon = crescemon.stack.find((card) => card.cardId === "EX5-012")!;
    expect(flaremon).toBeDefined();

    expect(latestDecision).toMatchObject({ seat: 0, kind: "orderTriggers" });
    expect(latestDecision?.options?.triggerCardIds).toEqual(["EX5-065", "EX5-065"]);
    expect(
      await replay.applyIntent(0, {
        type: "respondDecision",
        decisionId: latestDecision!.decisionId,
        response: { kind: "orderTriggers", order: [], orderIndexes: [0] },
      }),
    ).toEqual({ ok: true });

    expect(latestDecision).toMatchObject({ seat: 0, kind: "optional", sourceCardId: "EX5-065" });
    expect(
      await replay.applyIntent(0, {
        type: "respondDecision",
        decisionId: latestDecision!.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => replay.state.pendingDecision === undefined);

    expect(crescemon.stack.map((card) => card.instanceId)).not.toContain(flaremon.instanceId);
    expect(seat.battleArea.some((permanent) => permanent.topCard.instanceId === flaremon.instanceId)).toBe(true);
    expect(replay.state).toMatchObject({ turnSeat: 1, phase: Phase.Breeding, memory: 4 });

    expect(await replay.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await settle(() => replay.state.phase === Phase.Main);
    expect(await replay.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await settle(() => replay.state.turnSeat === 0);

    expect(seat.hand.map((card) => card.instanceId)).toContain(flaremon.instanceId);
    expect(seat.battleArea.some((permanent) => permanent.topCard.instanceId === flaremon.instanceId)).toBe(false);
  } finally {
    replay.engine.applyIntent(0, { type: "surrender" });
  }
});
