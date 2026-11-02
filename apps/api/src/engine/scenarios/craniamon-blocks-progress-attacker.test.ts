import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

describe("Craniamon blocking an attacker protected by Progress", () => {
  it.each([30, 55])("resolves battle without an ineffective deletion prompt at input %i", async (untilInput) => {
    const record = JSON.parse(
      readFileSync(new URL("./craniamon-blocks-progress-attacker.replay.json", import.meta.url), "utf8"),
    ) as ReplayRecord;
    const replay = await runReplay(record, { untilInput });
    try {
      expect(replay.divergences).toEqual([]);
      expect(replay.state.players[1]!.battleArea.some(({ topCard }) => topCard.cardId === "EX13-015")).toBe(
        untilInput === 30,
      );
      expect(replay.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "EX13-062")).toBe(false);
      expect(replay.state.pendingDecision).toBeUndefined();
    } finally {
      await replay.applyIntent(0, { type: "surrender" });
    }
  });
});
