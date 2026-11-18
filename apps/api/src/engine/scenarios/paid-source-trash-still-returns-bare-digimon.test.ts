import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { settle } from "#api/engine/testkit/harness";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

it("returns bare opposing Digimon after a paid source trash finds no sources to trash", async () => {
  const record: ReplayRecord = JSON.parse(
    readFileSync(new URL("./paid-source-trash-still-returns-bare-digimon.replay.json", import.meta.url), "utf8"),
  );
  const targetChoiceIndex = record.inputs.length - 1;
  const targetChoice = record.inputs[targetChoiceIndex]!;
  if (targetChoice.kind !== "intent") throw new Error("The trimmed record must end on the target choice.");
  const run = await runReplay(record, { untilInput: targetChoiceIndex });
  try {
    expect(run.divergences).toEqual([]);
    expect(run.pendingRequest?.sourceCardId).toBe("BT8-112");
    expect(run.pendingRequest?.kind).toBe("chooseTargets");
    const [attacker, defender] = run.state.players;
    const paladinMode = attacker!.battleArea.find((permanent) => permanent.topCard?.cardId === "BT8-112")!;
    const bareDigimon = defender!.battleArea.filter((permanent) =>
      ["EX5-025", "EX5-017"].includes(permanent.topCard?.cardId ?? ""),
    );
    expect(bareDigimon.map((permanent) => permanent.stack.length)).toEqual([0, 0]);
    const bareInstanceIds = bareDigimon.map((permanent) => permanent.topCard!.instanceId);
    const sourcesAfterCost = paladinMode.stack.length;
    const deckBeforeReturn = defender!.deck.length;
    const trashBeforeReturn = defender!.trash.length;
    const turnBeforeReturn = run.state.turnCount;

    expect(await run.applyIntent(targetChoice.seat, targetChoice.intent)).toEqual({ ok: true });
    const order = run.state.pendingDecision;
    expect(order?.kind).toBe("orderCards");
    expect(
      await run.applyIntent(0, {
        type: "respondDecision",
        decisionId: order!.decisionId,
        response: { kind: "orderCards", order: bareInstanceIds },
      }),
    ).toEqual({ ok: true });
    await settle(() => run.state.pendingDecision === undefined);

    expect(defender!.battleArea.map((permanent) => permanent.topCard?.cardId)).toEqual(["EX5-064"]);
    expect(defender!.deck.length).toBe(deckBeforeReturn + bareInstanceIds.length - 1);
    expect(defender!.deck.slice(-2).map((card) => card.instanceId)).toEqual(bareInstanceIds);
    expect(defender!.trash.length).toBe(trashBeforeReturn);
    expect(paladinMode.stack.length).toBe(sourcesAfterCost);
    expect(run.state.turnCount).toBe(turnBeforeReturn + 1);
    expect(run.state.turnSeat).toBe(1);
  } finally {
    run.engine.applyIntent(0, { type: "surrender" });
  }
});
