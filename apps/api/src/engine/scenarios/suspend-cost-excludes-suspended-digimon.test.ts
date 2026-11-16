import "#api/cards/index";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const record = JSON.parse(
  readFileSync(new URL("./suspend-cost-excludes-suspended-digimon.replay.json", import.meta.url), "utf8"),
) as ReplayRecord;
const suspendCostInput = 57;

describe("Suspend cost excludes suspended Digimon", () => {
  it("offers only unsuspended Digimon to pay a borrowed [When Digivolving] suspend cost and then plays the card", async () => {
    const replay = await runReplay(record, { untilInput: suspendCostInput });
    try {
      expect(replay.divergences).toEqual([]);
      const digimon = [...replay.state.players[0]!.battleArea, ...replay.state.players[1]!.battleArea];
      const suspendedIds = digimon
        .filter((permanent) => permanent.isSuspended)
        .map((permanent) => permanent.permanentId);
      const ceresmon = replay.state.players[0]!.battleArea.find(
        (permanent) => permanent.topCard.cardId === "BT26-032",
      )!;
      const elecmon = replay.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === "BT24-031")!;
      const opposingAgumon = replay.state.players[1]!.battleArea.find(
        (permanent) => permanent.topCard.cardId === "ST24-04",
      )!;
      expect(ceresmon.isSuspended).toBe(true);
      expect(suspendedIds).toContain(ceresmon.permanentId);

      const costPrompt = replay.state.pendingDecision!;
      expect(costPrompt.seat).toBe(0);
      expect(costPrompt.kind).toBe("chooseTargets");
      const costOptions = JSON.parse(costPrompt.payloadJson) as { candidateInstanceIds: string[]; min: number };
      expect(costOptions.min).toBe(0);
      expect(costOptions.candidateInstanceIds.toSorted()).toEqual(
        [elecmon.permanentId, opposingAgumon.permanentId].toSorted(),
      );
      expect(costOptions.candidateInstanceIds.filter((id) => suspendedIds.includes(id))).toEqual([]);

      const memoryBeforePlay = replay.state.memory;
      expect(
        await replay.applyIntent(0, {
          type: "respondDecision",
          decisionId: costPrompt.decisionId,
          response: { kind: "chooseTargets", instanceIds: [elecmon.permanentId] },
        }),
      ).toEqual({ ok: true });
      expect(elecmon.isSuspended).toBe(true);

      const playPrompt = replay.state.pendingDecision!;
      expect(playPrompt.kind).toBe("selectCards");
      const deramon = replay.state.players[0]!.hand.find((card) => card.cardId === "BT25-055")!;
      expect((JSON.parse(playPrompt.payloadJson) as { candidateInstanceIds: string[] }).candidateInstanceIds).toContain(
        deramon.instanceId,
      );
      expect(
        await replay.applyIntent(0, {
          type: "respondDecision",
          decisionId: playPrompt.decisionId,
          response: { kind: "selectCards", instanceIds: [deramon.instanceId] },
        }),
      ).toEqual({ ok: true });
      expect(replay.state.memory).toBe(memoryBeforePlay - 1);
      expect(replay.state.players[0]!.hand.map((card) => card.instanceId)).not.toContain(deramon.instanceId);
      expect(replay.state.players[0]!.battleArea.map((permanent) => permanent.topCard.instanceId)).toContain(
        deramon.instanceId,
      );

      for (let remaining = 4; remaining > 0 && replay.state.pendingDecision?.seat === 0; remaining -= 1) {
        const followUp = replay.state.pendingDecision;
        expect(followUp.kind).toBe("chooseTargets");
        expect(
          await replay.applyIntent(0, {
            type: "respondDecision",
            decisionId: followUp.decisionId,
            response: { kind: "chooseTargets", instanceIds: [] },
          }),
        ).toEqual({ ok: true });
      }
      expect(replay.state.turnSeat).toBe(1);
    } finally {
      await replay.applyIntent(0, { type: "surrender" });
    }
  });
});
