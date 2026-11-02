import { expect, it } from "vitest";
import { getStoryCampaignBattles } from "@aegis/shared/story/getStoryCampaignBattles";
import { getStoryMilestones } from "@aegis/shared/story/getStoryMilestones";
import { normalizeStoryCompleted } from "@aegis/shared/story/normalizeStoryCompleted";

it("presents the three Back Dimension manifestations as one encounter", () => {
  const campaign = getStoryCampaignBattles({ campaignId: "digimon-world-1" });
  expect(campaign).toHaveLength(38);
  expect(campaign.filter((battle) => battle.chapterId === "Back Dimension").map((battle) => battle.id)).toEqual([
    "dw1-038",
  ]);
  expect(campaign.some((battle) => battle.id === "dw1-039" || battle.id === "dw1-040")).toBe(false);
});

it("preserves old manifestation victories without duplicate achievements", () => {
  expect(normalizeStoryCompleted({ completed: ["dw1-039", "dw1-040", "dw1-038"] })).toEqual(["dw1-038"]);
  const completed = getStoryCampaignBattles({ campaignId: "digimon-world-1" }).map((battle) =>
    battle.id === "dw1-038" ? "dw1-040" : battle.id,
  );
  const milestones = getStoryMilestones({ completed });
  expect(milestones).toContain("battle:dw1-038");
  expect(milestones).not.toContain("battle:dw1-039");
  expect(milestones).not.toContain("battle:dw1-040");
  expect(milestones).toContain("story:digimon-world-1");
});

it("keeps the four narratively distinct Ogremon encounters", () => {
  const ids = getStoryCampaignBattles({ campaignId: "digimon-world-1" }).map((battle) => battle.id);
  expect(ids).toEqual(expect.arrayContaining(["dw1-009", "dw1-010", "dw1-012", "dw1-013"]));
});

it("combines the Darkness Bagramon phases and preserves old victories", () => {
  const battles = getStoryCampaignBattles({ campaignId: "digimon-xros-wars" });
  expect(battles).toHaveLength(17);
  expect(battles.filter((battle) => /DarknessBagramon/.test(battle.title))).toHaveLength(1);
  expect(normalizeStoryCompleted({ completed: ["xw05", "xw06"] })).toEqual(["xw06"]);
  const completed = battles.map((battle) => (battle.id === "xw06" ? "xw05" : battle.id));
  const milestones = getStoryMilestones({ completed });
  expect(milestones).toContain("story:digimon-xros-wars");
  expect(milestones).toContain("battle:xw06");
  expect(milestones).not.toContain("battle:xw05");
});
