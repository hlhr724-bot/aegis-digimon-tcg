import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";
import { settle } from "#api/engine/testkit/harness";

const placeCardUnderGarurumonInput = 77;

it("trashes every available opposing source when face-down sources outnumber them after paying the placement cost", async () => {
  const record: ReplayRecord = JSON.parse(
    readFileSync(new URL("./face-down-scaled-trash-takes-every-available-source.replay.json", import.meta.url), "utf8"),
  );
  const run = await runReplay(record, { untilInput: placeCardUnderGarurumonInput });
  try {
    expect(run.divergences).toEqual([]);
    const opponentDigimon = run.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard.cardId === "EX13-022",
    )!;
    expect(opponentDigimon.stack).toHaveLength(3);
    const input = record.inputs[placeCardUnderGarurumonInput]!;
    expect(input.kind).toBe("intent");
    if (input.kind !== "intent" || input.intent.type !== "respondDecision") throw new Error("unexpected input");
    expect(await run.applyIntent(1, { ...input.intent, decisionId: run.state.pendingDecision!.decisionId })).toEqual({
      ok: true,
    });
    await settle(() => opponentDigimon.stack.length === 0);

    const garurumon = run.state.players[1]!.battleArea.find((permanent) => permanent.topCard.cardId === "EX9-017")!;
    expect(garurumon.stack.filter((card) => card.faceUp !== true)).toHaveLength(4);
    expect(opponentDigimon.stack).toHaveLength(0);
    expect(run.state.players[0]!.trash.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["EX13-002", "EX13-017", "EX13-019"]),
    );
  } finally {
    run.engine.applyIntent(0, { type: "surrender" });
  }
});
