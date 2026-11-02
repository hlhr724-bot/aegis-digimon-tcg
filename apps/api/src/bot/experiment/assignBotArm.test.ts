import { describe, expect, it } from "vitest";
import { assignBotArm } from "#api/bot/experiment/assignBotArm";
import { parseBotExperiment } from "#api/bot/experiment/parseBotExperiment";

const experiment = parseBotExperiment({ id: "bot-ab-2026-10", arms: { certified: 80, humanPanelPlanner: 20 } });

function countArms(matchIds: readonly string[], assigned = experiment) {
  const counts = new Map<string, number>();
  for (const matchId of matchIds) {
    const arm = assignBotArm({ experiment: assigned, matchId });
    counts.set(arm, (counts.get(arm) ?? 0) + 1);
  }
  return counts;
}

describe("bot experiment assignment", () => {
  it("gives the same match the same arm every time", () => {
    const matchIds = Array.from({ length: 200 }, (_, index) => `match-${index}`);
    const first = matchIds.map((matchId) => assignBotArm({ experiment, matchId }));
    const second = matchIds.map((matchId) => assignBotArm({ experiment, matchId }));
    expect(second).toEqual(first);
  });

  it("splits many matches close to the configured weights", () => {
    const total = 20_000;
    const counts = countArms(Array.from({ length: total }, (_, index) => crypto.randomUUID() + index));
    expect([...counts.keys()].sort()).toEqual(["certified", "humanPanelPlanner"]);
    expect(Math.abs(counts.get("humanPanelPlanner")! / total - 0.2)).toBeLessThan(0.015);
    expect(Math.abs(counts.get("certified")! / total - 0.8)).toBeLessThan(0.015);
  });

  it("reassigns matches independently when the experiment id changes", () => {
    const renamed = { ...experiment, id: "bot-ab-2026-11" };
    const matchIds = Array.from({ length: 2_000 }, (_, index) => `match-${index}`);
    const changed = matchIds.filter(
      (matchId) => assignBotArm({ experiment, matchId }) !== assignBotArm({ experiment: renamed, matchId }),
    );
    expect(changed.length).toBeGreaterThan(400);
  });

  it("uses only the arm of a single-arm experiment", () => {
    const single = parseBotExperiment({ id: "legacy-only", arms: { legacy: 100 } });
    expect(countArms(["a", "b", "c"], single)).toEqual(new Map([["legacy", 3]]));
  });
});
