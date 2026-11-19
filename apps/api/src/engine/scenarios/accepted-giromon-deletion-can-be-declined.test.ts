import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { Intent } from "@aegis/shared";
import { runReplay, type ReplayRun } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";
import { settle } from "#api/engine/testkit/harness";

const trainingManualOfferInput = 39;

async function applyRecordedFrom(run: ReplayRun, record: ReplayRecord, start: number) {
  for (const input of record.inputs.slice(start)) {
    if (input.kind !== "intent") continue;
    const intent = structuredClone(input.intent) as Intent;
    if (intent.type === "respondDecision") intent.decisionId = run.state.pendingDecision!.decisionId;
    expect(await run.applyIntent(input.seat, intent)).toEqual({ ok: true });
  }
}

it("allows declining Giromon's deletion after accepting its trigger and placing a hand card", async () => {
  const record: ReplayRecord = JSON.parse(
    readFileSync(new URL("./accepted-giromon-deletion-can-be-declined.replay.json", import.meta.url), "utf8"),
  );
  const run = await runReplay(record, { untilInput: trainingManualOfferInput });
  try {
    expect(run.divergences).toEqual([]);
    expect(run.state.pendingDecision).toMatchObject({ seat: 0, kind: "optional" });
    expect(run.state.pendingDecision!.payloadJson).toContain("BT26-099");
    await run.applyIntent(0, {
      type: "respondDecision",
      decisionId: run.state.pendingDecision!.decisionId,
      response: { kind: "optional", accept: false },
    });
    await applyRecordedFrom(run, record, trainingManualOfferInput);

    const pending = run.state.pendingDecision!;
    expect(pending).toMatchObject({ seat: 0, kind: "chooseTargets" });
    const payload = JSON.parse(pending.payloadJson);
    expect(payload.effectKey).toBe("BT26-055/bt26-055-place-delete");
    expect(payload.min).toBe(0);
    const before = run.state.players.map((player) => player.battleArea.map((permanent) => permanent.permanentId));
    const source = run.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === "BT26-055")!;
    expect(source.stack.length).toBeGreaterThan(0);
    expect(
      await run.applyIntent(0, {
        type: "respondDecision",
        decisionId: pending.decisionId,
        response: { kind: "chooseTargets", instanceIds: [] },
      }),
    ).toEqual({ ok: true });
    await settle(() => run.state.pendingDecision === undefined);
    expect(run.state.players.map((player) => player.battleArea.map((permanent) => permanent.permanentId))).toEqual(
      before,
    );
    expect(source.stack.length).toBeGreaterThan(0);
  } finally {
    run.engine.applyIntent(0, { type: "surrender" });
  }
});
