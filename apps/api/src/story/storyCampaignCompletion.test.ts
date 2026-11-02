import { expect, it } from "vitest";
import { getStoryCampaignBattles } from "@aegis/shared/story/getStoryCampaignBattles";
import { getStoryMilestones } from "@aegis/shared/story/getStoryMilestones";
import { isStoryCampaignComplete } from "@aegis/shared/story/isStoryCampaignComplete";

it("completes Dawn Dusk with one version of each shared event and no optional challenges", () => {
  const battles = getStoryCampaignBattles({ campaignId: "digimon-dawn-dusk" });
  const groups = new Set<string>();
  const required = battles.filter((battle) => {
    if (battle.isOptional || (battle.completionGroup && groups.has(battle.completionGroup))) {
      return false;
    }
    if (battle.completionGroup) {
      groups.add(battle.completionGroup);
    }
    return true;
  });
  const completed = required.map((battle) => battle.id);
  expect(battles).toHaveLength(41);
  expect(isStoryCampaignComplete({ battles, completed })).toBe(true);
  expect(getStoryMilestones({ completed })).toContain("story:digimon-dawn-dusk");
  expect(isStoryCampaignComplete({ battles, completed: completed.slice(1) })).toBe(false);
  expect(isStoryCampaignComplete({ battles: battles.filter((battle) => battle.isOptional), completed })).toBe(false);
});

it("awards Cyber Sleuth completion without requiring optional cases or postgame", () => {
  const battles = getStoryCampaignBattles({ campaignId: "digimon-cyber-sleuth" });
  const completed = battles.filter((battle) => !battle.isOptional).map((battle) => battle.id);
  expect(battles).toHaveLength(57);
  expect(battles.some((battle) => battle.id === "cs52")).toBe(false);
  expect(getStoryMilestones({ completed })).toContain("story:digimon-cyber-sleuth");
  expect(getStoryMilestones({ completed: completed.filter((id) => id !== "jo10") })).not.toContain(
    "story:digimon-cyber-sleuth",
  );
  expect(battles.find((battle) => battle.id === "cs09")?.isOptional).toBe(true);
  expect(battles.find((battle) => battle.id === "cs22")?.character).toBe("Nokia");
  expect(battles.some((battle) => battle.id === "cs34" || battle.id === "cs37")).toBe(false);
});

it("awards narrative chapters without optional cases and keeps optional collections separate", () => {
  const battles = getStoryCampaignBattles({ campaignId: "digimon-cyber-sleuth" });
  const chapter = battles.filter((battle) => battle.chapterId === "Chapter 4");
  expect(chapter.some((battle) => battle.isOptional)).toBe(true);
  const completed = chapter.filter((battle) => !battle.isOptional).map((battle) => battle.id);
  expect(getStoryMilestones({ completed })).toContain("chapter:digimon-cyber-sleuth:Chapter 4");
  expect(getStoryMilestones({ completed: [] })).not.toContain("chapter:digimon-cyber-sleuth:Chapter 4");
});
