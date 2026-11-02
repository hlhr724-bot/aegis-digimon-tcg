import { expect, it } from "vitest";
import { storyBattles } from "@aegis/shared/story/storyBattles";
import { getStoryMilestones } from "@aegis/shared/story/getStoryMilestones";

it("awards Liberator achievements from its existing persisted victory identities", () => {
  const completed = storyBattles.filter((battle) => !battle.campaignId).map((battle) => battle.id);
  const milestones = getStoryMilestones({ completed: [...completed, ...completed] });
  expect(milestones).toContain("battle:ice-knight");
  expect(milestones).toContain("chapter:liberator:Shoto Kazama");
  expect(milestones).toContain("story:liberator");
  expect(milestones.filter((id) => id.startsWith("battle:"))).toHaveLength(30);
});

it("requires every encounter in a campaign before its final achievement", () => {
  const completed = storyBattles.filter((battle) => battle.campaignId === "digimon-world-2").map((battle) => battle.id);
  expect(getStoryMilestones({ completed: completed.slice(0, -1) })).not.toContain("story:digimon-world-2");
  expect(getStoryMilestones({ completed })).toContain("story:digimon-world-2");
  expect(getStoryMilestones({ completed: ["invented-battle"] })).toEqual([]);
});
