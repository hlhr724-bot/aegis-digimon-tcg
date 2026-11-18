import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

it("trashes a Tamer card exposed by the first of two De-Digivolve 1 instances", async () => {
  const record: ReplayRecord = JSON.parse(
    readFileSync(new URL("./repeated-de-digivolve-trashes-exposed-tamer.replay.json", import.meta.url), "utf8"),
  );
  const playedSistermonIndex = record.inputs.length - 1;
  const playedSistermon = record.inputs[playedSistermonIndex]!;
  if (playedSistermon.kind !== "intent") throw new Error("The trimmed record must end on the played card choice.");
  const run = await runReplay(record, { untilInput: playedSistermonIndex });
  try {
    expect(run.divergences).toEqual([]);
    expect(run.pendingRequest?.sourceCardId).toBe("EX13-066");
    const [attacker, defender] = run.state.players;
    const hybrid = defender!.battleArea.find((permanent) => permanent.topCard?.cardId === "AD1-015")!;
    const beowolfmon = hybrid.topCard!;
    const sourcesBottomFirst = [...hybrid.stack];
    const exposedTamer = sourcesBottomFirst.at(-1)!;
    const cardUnderTamer = sourcesBottomFirst.at(-2)!;
    expect(exposedTamer.cardId).toBe("AD1-023");
    expect(sourcesBottomFirst).toHaveLength(5);
    const trashBefore = defender!.trash.length;
    const memoryBefore = run.state.memory;
    const turnBefore = run.state.turnCount;

    expect(await run.applyIntent(playedSistermon.seat, playedSistermon.intent)).toEqual({ ok: true });

    expect(
      attacker!.battleArea
        .map((permanent) => permanent.topCard?.cardId)
        .filter((cardId) => cardId === "BT13-013" || cardId === "BT6-084"),
    ).toEqual(["BT13-013", "BT6-084"]);
    expect(hybrid.topCard?.instanceId).toBe(cardUnderTamer.instanceId);
    expect(hybrid.stack.map((card) => card.instanceId)).toEqual(
      sourcesBottomFirst.slice(0, -2).map((card) => card.instanceId),
    );
    expect(defender!.trash.slice(trashBefore).map((card) => card.instanceId)).toEqual([
      beowolfmon.instanceId,
      exposedTamer.instanceId,
    ]);
    expect(run.state.memory).toBe(memoryBefore);
    expect(run.state.turnCount).toBe(turnBefore);
    expect(run.state.turnSeat).toBe(0);
    expect(run.state.pendingDecision?.seat).toBe(0);
  } finally {
    run.engine.applyIntent(0, { type: "surrender" });
  }
});
