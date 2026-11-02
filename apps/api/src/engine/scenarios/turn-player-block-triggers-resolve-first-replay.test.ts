import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

describe("Turn player block triggers resolve first in the recorded match", () => {
  it("resolves the blocked Nezhamon's target-change effect before Gankoomon's suspension prompt", async () => {
    const record = JSON.parse(
      readFileSync(new URL("./turn-player-block-triggers-resolve-first-replay.replay.json", import.meta.url), "utf8"),
    ) as ReplayRecord;
    const events: ServerEvent[] = [];
    const replay = await runReplay(record, {
      untilInput: record.inputs.length - 1,
      onBatch: (_state, batch) => events.push(...batch),
    });
    try {
      expect(replay.divergences).toEqual([]);
      const block = events.findLastIndex((event) => event.kind === "blocked");
      expect(block).toBeGreaterThan(-1);
      const resolutionOrder = events
        .slice(block)
        .flatMap((event) =>
          event.kind === "effectResolved" && (event.sourceCardId === "EX12-019" || event.sourceCardId === "EX13-061")
            ? [event.sourceCardId]
            : [],
        );
      expect(resolutionOrder).toEqual(["EX12-019"]);
      const nezhamon = replay.state.players[1]!.battleArea.find(({ topCard }) => topCard.instanceId === "s1-9");
      expect(nezhamon?.currentDP).toBe(16000);
      expect(nezhamon?.immuneToOpponentDigimonEffects).toBe(true);
      expect(replay.state.pendingDecision?.seat).toBe(0);
    } finally {
      await replay.applyIntent(1, { type: "surrender" });
    }
  });
});
