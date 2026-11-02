import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";
import { observe } from "#api/engine/testkit/observe";

const record = JSON.parse(
  readFileSync(new URL("./kongou-restricts-player-attacks-through-next-turn.replay.json", import.meta.url), "utf8"),
) as ReplayRecord;

describe("Kongou restricts player attacks through the next turn", () => {
  it("blocks low-cost Digimon while allowing both Barbamon and LadyDevimon to check security", async () => {
    const replay = await runReplay(record, { untilInput: 152 });
    try {
      expect(replay.divergences).toEqual([]);
      expect(record.seats[1].deck.mainDeck[34]).toBe("BT9-103");
      expect(record.inputs[134]).toMatchObject({ seat: 1, intent: { type: "playCard", instanceId: "s1-34" } });
      expect(replay.state.turnCount).toBe(16);
      expect(replay.state.players[1]!.trash.some((card) => card.instanceId === "s1-34")).toBe(true);
      for (const permanentId of ["perm-25", "perm-27"]) {
        const permanent = replay.state.players[0]!.battleArea.find((p) => p.permanentId === permanentId)!;
        expect(permanent.isSuspended).toBe(false);
        expect(permanent.summoningSick).toBe(false);
        expect(observe(replay.engine).isRestricted(permanent, "attackPlayers")).toBe(true);
        expect(permanent.canAttackPlayer).toBe(false);
        expect(
          await replay.applyIntent(0, {
            type: "attack",
            attackerPermanentId: permanentId,
            target: { kind: "player" },
          }),
        ).toEqual({ ok: false, reason: "illegal-target" });
      }
      for (const permanentId of ["perm-17", "perm-21", "perm-26"]) {
        const permanent = replay.state.players[0]!.battleArea.find((p) => p.permanentId === permanentId)!;
        expect(observe(replay.engine).isRestricted(permanent, "attackPlayers")).toBe(false);
        expect(permanent.canAttackPlayer).toBe(true);
      }
    } finally {
      await replay.applyIntent(0, { type: "surrender" });
    }
  });

  it("finishes all three recorded attacks with no remaining legal player attacker", async () => {
    const replay = await runReplay(record);
    try {
      expect(replay.divergences).toEqual([]);
      expect(replay.state.players[1]!.security).toHaveLength(0);
      expect(replay.state.pendingDecision).toBeUndefined();
      expect(replay.state.combatWindow).toBeUndefined();
      expect(replay.state.players[0]!.battleArea.every((permanent) => !permanent.canAttackPlayer)).toBe(true);
      const token = replay.state.players[0]!.battleArea.find((p) => p.permanentId === "perm-29")!;
      expect(token.summoningSick).toBe(true);
      for (const permanentId of ["perm-17", "perm-21"]) {
        expect(replay.state.players[0]!.battleArea.find((p) => p.permanentId === permanentId)?.isSuspended).toBe(true);
      }
    } finally {
      await replay.applyIntent(0, { type: "surrender" });
    }
  });
});
