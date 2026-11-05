import { expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import { asReplayRecord } from "#api/replays/inputs/tools/records";
import { readFileSync } from "node:fs";

const record: unknown = JSON.parse(
  readFileSync(new URL("./face-down-ace-exposed-by-dedigivolve.replay.json", import.meta.url), "utf8"),
);

it("trashes an exposed face-down ACE without charging Overflow", async () => {
  const replay = await runReplay(asReplayRecord(record, "face-down ACE regression"));
  expect(replay.divergences).toEqual([]);
  const memory = replay.state.memory;
  const host = replay.state.players[0]!.battleArea.find((permanent) => permanent.permanentId === "perm-10")!;
  const aceIds = host.stack.filter((card) => card.cardId === "EX9-065").map((card) => card.instanceId);
  expect(aceIds).toHaveLength(2);
  expect(
    await replay.applyIntent(1, {
      type: "respondDecision",
      decisionId: replay.pendingRequest!.decisionId,
      response: { kind: "chooseTargets", instanceIds: ["perm-2", "perm-10"] },
    }),
  ).toEqual({ ok: true });
  expect(replay.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === "perm-10")).toBe(false);
  expect(replay.state.players[0]!.trash.map((card) => card.instanceId)).toEqual(expect.arrayContaining(aceIds));
  expect(replay.state.memory).toBe(-memory);
  expect(replay.state.turnSeat).toBe(0);
  expect(replay.state.pendingDecision).toBeUndefined();
});
