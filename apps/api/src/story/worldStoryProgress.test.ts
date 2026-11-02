import { describe, expect, it } from "vitest";
import { worldStoryBattles } from "@aegis/shared/story/worldStoryBattles";
import { canStartStoryBattle } from "@aegis/shared/story/canStartStoryBattle";
import { getWorldStoryMilestones } from "@aegis/shared/story/getWorldStoryMilestones";
import { getStoryScenario } from "#api/story/getStoryScenario";
import { getStorySeatDeck } from "#api/story/getStorySeatDeck";
import { shuffleStoryDecks } from "#api/story/shuffleStoryDecks";
import { getStoryBattleDifficulty } from "@aegis/shared/story/getStoryBattleDifficulty";

describe("World story progression", () => {
  it("requires all three recruits before Ogremon's first encounter", () => {
    const battle = worldStoryBattles.find((entry) => entry.id === "dw1-009")!;
    expect(canStartStoryBattle({ battle, completed: ["dw1-001", "dw1-002"] })).toBe(false);
    expect(canStartStoryBattle({ battle, completed: ["dw1-001", "dw1-002", "dw1-003"] })).toBe(true);
  });

  it("deduplicates rewards and distinguishes the opening selection from the full campaign", () => {
    const completed = worldStoryBattles.map((battle) => battle.id);
    const milestones = getWorldStoryMilestones({ completed: [...completed, ...completed, "ice-knight"] });
    expect(milestones).toHaveLength(10);
    expect(milestones).toContain("selection:dw1:opening-v1");
    expect(milestones).not.toContain("story:digimon-world-1");
    expect(getWorldStoryMilestones({ completed: ["dw1-001", "dw1-002"] })).toHaveLength(2);
  });

  it.each(worldStoryBattles.map((battle) => battle.id))(
    "deals reproducible full-game openings without changing either recipe for %s",
    (battleId) => {
      const original = getStoryScenario(battleId)!;
      const first = structuredClone(original);
      const repeated = structuredClone(original);
      const next = structuredClone(original);
      shuffleStoryDecks({ fixture: first, seed: 1 });
      shuffleStoryDecks({ fixture: repeated, seed: 1 });
      shuffleStoryDecks({ fixture: next, seed: 2 });
      expect(first).toEqual(repeated);
      expect(first).not.toEqual(next);
      const difficulty = getStoryBattleDifficulty({ battleId })!;
      const security = [difficulty.playerSecurity, difficulty.opponentSecurity] as const;
      for (const seat of [0, 1] as const) {
        expect(first.board[seat]!.hand).toHaveLength(5);
        expect(first.board[seat]!.security).toHaveLength(security[seat]);
        const dealt = getStorySeatDeck({ fixture: first, seat });
        const expected = getStorySeatDeck({ fixture: original, seat });
        expect(dealt.mainDeck.sort()).toEqual(expected.mainDeck.sort());
        expect(dealt.eggDeck.sort()).toEqual(expected.eggDeck.sort());
      }
    },
  );
});
