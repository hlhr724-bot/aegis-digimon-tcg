import "#api/cards/index";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const record = JSON.parse(
  readFileSync(new URL("./would-leave-play-replacement-when-played-triggers.replay.json", import.meta.url), "utf8"),
) as ReplayRecord;

describe("Would-leave replacement play opens when-played triggers", () => {
  it("triggers [All Turns] when-played watchers after a would-leave replacement plays a Digimon", async () => {
    const events: ServerEvent[] = [];
    const replay = await runReplay(record, {
      untilInput: record.inputs.length - 1,
      onBatch: (_state, batch) => events.push(...batch),
    });
    try {
      expect(replay.divergences).toEqual([]);
      const materialPrompt = replay.state.pendingDecision!;
      expect(materialPrompt.kind).toBe("selectCards");
      events.length = 0;
      expect(
        await replay.applyIntent(0, {
          type: "respondDecision",
          decisionId: materialPrompt.decisionId,
          response: { kind: "selectCards", instanceIds: ["s0-7"] },
        }),
      ).toEqual({ ok: true });
      expect(events).toContainEqual(expect.objectContaining({ kind: "cardPlayed", cardId: "EX12-056", seat: 0 }));
      const ordering = replay.state.pendingDecision!;
      expect(ordering.seat).toBe(0);
      expect(ordering.kind).toBe("orderTriggers");
      const options = JSON.parse(ordering.payloadJson) as { triggerCardIds: string[] };
      expect(options.triggerCardIds.toSorted()).toEqual(["EX12-034", "EX12-056", "EX12-057", "EX12-071"]);
    } finally {
      await replay.applyIntent(0, { type: "surrender" });
    }
  });
});
