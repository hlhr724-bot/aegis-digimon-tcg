import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { settle } from "#api/engine/testkit/harness";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

it("reduces Lucemon: Chaos Mode's play cost by 3 for every 10 cards in its owner's trash", async () => {
  const record: ReplayRecord = JSON.parse(
    readFileSync(new URL("./trash-scaled-self-play-cost-reduction.replay.json", import.meta.url), "utf8"),
  );
  const playInputIndex = record.inputs.length - 1;
  const playInput = record.inputs[playInputIndex]!;
  if (playInput.kind !== "intent" || playInput.intent.type !== "playCard") {
    throw new Error("the trimmed record must end with the reported play");
  }
  const run = await runReplay(record, { untilInput: playInputIndex });
  try {
    expect(run.divergences).toEqual([]);
    const player = run.state.players[0]!;
    const lucemonId = playInput.intent.instanceId;
    expect(player.hand.find((card) => card.instanceId === lucemonId)?.cardId).toBe("BT7-111");
    expect(player.trash).toHaveLength(23);
    expect(run.state.memory).toBe(10);
    const handBefore = player.hand.length;
    const turnBefore = run.state.turnCount;

    expect(await run.applyIntent(0, playInput.intent)).toEqual({ ok: true });
    await settle(() => run.state.pendingDecision !== undefined);

    expect(run.state.memory).toBe(2);
    expect(player.hand).toHaveLength(handBefore - 1);
    expect(player.trash).toHaveLength(23);
    expect(player.battleArea.some((permanent) => permanent.topCard?.instanceId === lucemonId)).toBe(true);
    const decision = run.state.pendingDecision!;
    expect(decision.kind).toBe("chooseTargets");
    expect(decision.seat).toBe(0);
    const opponent = run.state.players[1]!;
    const deletionTarget = opponent.battleArea.find((permanent) => permanent.topCard?.cardId === "BT19-051")!;
    expect(decision.payloadJson).toContain(deletionTarget.permanentId);
    const opponentTrashBefore = opponent.trash.length;
    expect(
      await run.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [deletionTarget.permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => opponent.trash.length > opponentTrashBefore);
    expect(opponent.battleArea.some((permanent) => permanent.topCard?.cardId === "BT19-051")).toBe(false);
    expect(opponent.trash.some((card) => card.cardId === "BT19-051")).toBe(true);
    expect(run.state.memory).toBe(2);
    expect(run.state.turnSeat).toBe(0);
    expect(run.state.turnCount).toBe(turnBefore);
  } finally {
    run.engine.applyIntent(0, { type: "surrender" });
  }
});
