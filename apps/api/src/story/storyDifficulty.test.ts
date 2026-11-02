import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { catalogStoryBattles } from "@aegis/shared/story/catalogStoryBattles";
import { getStoryBattleDifficulty } from "@aegis/shared/story/getStoryBattleDifficulty";
import { getStoryCampaignBattles } from "@aegis/shared/story/getStoryCampaignBattles";
import { storyCanonicalDefeatBattleIds } from "@aegis/shared/story/storyCanonicalDefeatBattleIds";
import { storyCatalogCampaigns } from "@aegis/shared/story/storyCatalogCampaigns";
import { StoryDifficulty } from "@aegis/shared/story/StoryDifficulty";
import type { PermanentSpec } from "#api/engine/scenario/types";
import { getStoryScenario } from "#api/story/getStoryScenario";
import { getStoryScenarioDeck } from "#api/story/getStoryScenarioDeck";
import { getStorySeatDeck } from "#api/story/getStorySeatDeck";
import { shuffleStoryDecks } from "#api/story/shuffleStoryDecks";
import { seitenGokuumonStoryDeck } from "#api/story/decks/seitenGokuumonStoryDeck";

const playableBattles = catalogStoryBattles.filter((battle) => battle.playable);

function getSourceCards(deck: Pick<ReturnType<typeof getStoryScenarioDeck>, "main" | "eggs">): string[] {
  return [...deck.main, ...deck.eggs].flatMap(([card, count]) => Array.from({ length: count }, () => card)).sort();
}

function getStackCards(permanent: PermanentSpec): string[] {
  return [...(permanent.under ?? []).map((card) => (typeof card === "string" ? card : card.card)), permanent.card];
}

describe("story difficulty", () => {
  it.each(
    storyCatalogCampaigns
      .filter((campaign) => !campaign.isHidden && getStoryCampaignBattles({ campaignId: campaign.id }).length > 1)
      .map((campaign) => campaign.id),
  )("ramps %s from an introduction to a boss finale", (campaignId) => {
    const battles = getStoryCampaignBattles({ campaignId });
    const finale = battles.findLast((battle) => !battle.isOptional)!;
    expect(getStoryBattleDifficulty({ battleId: battles[0]!.id })?.value).toBe(StoryDifficulty.INTRO.value);
    expect(getStoryBattleDifficulty({ battleId: finale.id })?.value).toBe(StoryDifficulty.BOSS.value);
    for (const battle of battles) {
      expect(getStoryBattleDifficulty({ battleId: battle.id })).toBeDefined();
    }
  });

  it("removes canonical protagonist defeats from campaigns and play", () => {
    for (const battleId of storyCanonicalDefeatBattleIds) {
      const battle = catalogStoryBattles.find((entry) => entry.id === battleId)!;
      expect(battle.playable).toBe(false);
      expect(getStoryCampaignBattles({ campaignId: battle.campaignId! })).not.toContainEqual(battle);
    }
  });

  it("keeps Liberator battles out of the difficulty ramp", () => {
    expect(getStoryBattleDifficulty({ battleId: "ice-knight" })).toBeUndefined();
  });

  it.each(playableBattles.map((battle) => battle.id))("builds the %s opening from complete legal decks", (battleId) => {
    const battle = catalogStoryBattles.find((entry) => entry.id === battleId)!;
    const difficulty = getStoryBattleDifficulty({ battleId })!;
    const fixture = getStoryScenario(battleId)!;
    shuffleStoryDecks({ fixture, seed: 7 });
    const [player, opponent] = [fixture.board[0]!, fixture.board[1]!];
    expect(player.security).toHaveLength(difficulty.playerSecurity);
    expect(opponent.security).toHaveLength(difficulty.opponentSecurity);
    expect(player.hand).toHaveLength(5);
    expect(opponent.hand).toHaveLength(5);
    for (const [seat, ref] of [
      [0, battle.playerDeckRef!],
      [1, battle.opponentDeckRef!],
    ] as const) {
      const deck = getStorySeatDeck({ fixture, seat });
      const source = battleId === "bb13" && seat === 1 ? seitenGokuumonStoryDeck : getStoryScenarioDeck({ ref });
      expect([...deck.mainDeck, ...deck.eggDeck].sort()).toEqual(getSourceCards(source));
    }
    expect(player.battleArea).toEqual([]);
    const permanents = opponent.battleArea as PermanentSpec[];
    const canBuildPermanent =
      difficulty.opponentLevel !== null &&
      getSourceCards(getStoryScenarioDeck({ ref: battle.opponentDeckRef! })).some((card) => {
        const level = getCardDefinition(card)?.level ?? 0;
        return level >= 3 && level <= difficulty.opponentLevel!;
      });
    expect(permanents.length).toBe(canBuildPermanent ? 1 : 0);
    for (const permanent of permanents) {
      const levels = getStackCards(permanent).map((card) => getCardDefinition(card)!.level!);
      expect(levels[0]).toBeGreaterThanOrEqual(3);
      expect(levels.at(-1)).toBeLessThanOrEqual(difficulty.opponentLevel!);
      expect(levels).toEqual(levels.map((_, index) => levels[0]! + index));
      const stack = getStackCards(permanent).map((card) => getCardDefinition(card)!);
      for (let index = 1; index < stack.length; index++) {
        const base = stack[index - 1]!;
        expect(
          stack[index]!.evoCosts.some((cost) => cost.level === base.level && base.colors.includes(cost.color)),
        ).toBe(true);
      }
    }
  });
});
