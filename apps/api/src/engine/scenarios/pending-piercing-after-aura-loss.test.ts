import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";
import { observe } from "#api/engine/testkit/observe";

const record: ReplayRecord = JSON.parse(
  readFileSync(new URL("./pending-piercing-after-aura-loss.replay.json", import.meta.url), "utf8"),
);

describe("pending Piercing after its continuous source loses the effect", () => {
  it("removes the aura after De-Digivolve but finishes the already activated security checks", async () => {
    const run = await runReplay(record, { untilInput: 56 });
    try {
      expect(run.divergences).toEqual([]);
      const attacker = run.state.players[1]!.battleArea.find((permanent) => permanent.permanentId === "perm-9")!;
      const source = run.state.players[1]!.battleArea.find((permanent) => permanent.permanentId === "perm-2")!;
      expect(source.topCard.cardId).toBe("EX13-074");
      expect(attacker.topCard.cardId).toBe("EX13-058");
      expect(observe(run.engine).hasPierce(attacker)).toBe(false);
      expect(observe(run.engine).hasKeyword(attacker, "Alliance")).toBe(false);
      expect([...attacker.keywords]).not.toContain("Piercing");
      expect(run.state.players[0]!.security).toHaveLength(4);

      for (const input of record.inputs.slice(56)) {
        if (input.kind !== "intent") {
          throw new Error(`Expected a recorded intent, received ${input.kind}`);
        }
        expect(await run.applyIntent(input.seat, input.intent)).toEqual({ ok: true });
      }

      expect(run.state.players[0]!.security).toHaveLength(2);
      expect(observe(run.engine).hasPierce(attacker)).toBe(false);
      expect(observe(run.engine).hasKeyword(attacker, "Alliance")).toBe(false);
      expect(run.state.pendingDecision).toBeUndefined();
    } finally {
      await run.applyIntent(0, { type: "surrender" });
    }
  });
});
