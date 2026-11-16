import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplay } from "../../replays/inputs/run.js";
import type { ReplayRecord } from "../../replays/inputs/types.js";

const fixture = new URL("./zero-dp-deleted-after-losing-color-buff.replay.json", import.meta.url);
const record = JSON.parse(readFileSync(fixture, "utf8")) as ReplayRecord;
const nameChangeTargetInput = 209;
const afterNameChangeInput = 210;
const recoloredCardId = "BT26-033";
const recoloredSeat = 1;

describe("zero-dp-deleted-after-losing-color-buff", () => {
  it("replays the recorded match up to the name and color change target choice", async () => {
    const { divergences } = await runReplay(record, { untilInput: nameChangeTargetInput });

    expect(divergences).toEqual([]);
  });

  it("checks the recolored 0 DP Digimon before the remaining end of turn effects", async () => {
    const run = await runReplay(record, { untilInput: afterNameChangeInput });
    const request = run.pendingRequest!;

    expect(request.seat).toBe(recoloredSeat);
    expect(request.kind).toBe("optional");
    expect(request.sourceCardId).toBe(recoloredCardId);
    expect(request.options?.affectedPermanentIds).toEqual(["perm-2"]);
  });

  it("deletes the recolored 0 DP Digimon before its controller orders end of turn effects", async () => {
    const run = await runReplay(record, { untilInput: afterNameChangeInput });
    const request = run.pendingRequest!;

    const result = await run.applyIntent(recoloredSeat, {
      type: "respondDecision",
      decisionId: request.decisionId,
      response: { kind: "optional", accept: false },
    });

    expect(result).toEqual({ ok: true });
    const controller = run.state.players[recoloredSeat]!;
    expect(controller.battleArea.map((permanent) => permanent.topCard.cardId)).not.toContain(recoloredCardId);
    expect(controller.trash.map((card) => card.cardId)).toContain(recoloredCardId);
    const pending = run.state.pendingDecision!;
    expect(pending.kind).toBe("orderTriggers");
    const triggerCardIds = JSON.parse(pending.payloadJson).triggerCardIds as string[];
    expect(triggerCardIds).not.toContain(recoloredCardId);
    expect(triggerCardIds).toContain("BT24-102");
  });
});
