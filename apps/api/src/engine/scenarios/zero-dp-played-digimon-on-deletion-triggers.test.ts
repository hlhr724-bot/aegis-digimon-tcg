import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplay } from "../../replays/inputs/run.js";
import type { ReplayRecord } from "../../replays/inputs/types.js";

const fixture = new URL("./zero-dp-played-digimon-on-deletion-triggers.replay.json", import.meta.url);
const record = JSON.parse(readFileSync(fixture, "utf8")) as ReplayRecord;
const galleryInput = 65;

describe("zero-dp-played-digimon-on-deletion-triggers", () => {
  it("replays the recorded match up to the inherited [On Deletion] play choice", async () => {
    const { divergences } = await runReplay(record, { untilInput: galleryInput });

    expect(
      divergences.filter(({ kind }) => kind === "intent-result" || kind === "position" || kind === "threw"),
    ).toEqual([]);
  });

  it.each([
    ["BT19-055", "BT19-055/ir-11-0"],
    ["EX10-026", "EX10-026/ir-11-0"],
  ])(
    "deletes %s played into an all-Digimon -5000 DP effect and triggers its [On Deletion]",
    async (cardId, effectKey) => {
      const run = await runReplay(record, { untilInput: galleryInput });
      const request = run.pendingRequest!;
      const played = run.state.players[1]!.trash.find((card) => card.cardId === cardId)!;
      expect(request.options?.candidateInstanceIds).toContain(played.instanceId);

      const result = await run.applyIntent(1, {
        type: "respondDecision",
        decisionId: request.decisionId,
        response: { kind: "selectCards", instanceIds: [played.instanceId] },
      });

      expect(result).toEqual({ ok: true });
      expect(run.state.players[1]!.trash.map((card) => card.instanceId)).toContain(played.instanceId);
      expect(run.state.players[1]!.battleArea.map((permanent) => permanent.topCard.instanceId)).not.toContain(
        played.instanceId,
      );
      const pending = run.state.pendingDecision!;
      expect(pending.kind).toBe("orderTriggers");
      expect(JSON.parse(pending.payloadJson).triggerKeys).toContain(`${played.instanceId}::${effectKey}`);
    },
  );
});
