import "#api/cards/index";
import { describe, expect, it } from "vitest";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/played-link-loses-dp-bonus.fixture";
import { advance } from "#api/engine/testkit/advance";

describe("Playing linked cards removes their DP bonus", () => {
  it("refreshes Maneuvermon when its linked Maquinamon enters the battle area", async () => {
    const s = setupScenario(fixture, { autoDeclineOptional: true, autoSelectCards: true });
    await s.ready();
    expect(s.perm("host").currentDP).toBe(14000);
    await advance(s.engine).verb.playInstances([s.inst("link").instanceId]);
    await settle();
    expect(s.perm("host").linked).toHaveLength(0);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === s.inst("link").instanceId)).toBe(
      true,
    );
    expect(s.perm("host").currentDP).toBe(12000);
  });
  it("removes the same bonus when a link becomes a digivolution card", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    expect(s.perm("host").currentDP).toBe(14000);
    await advance(s.engine).verb.placeUnder(s.perm("host").permanentId, [s.inst("link").instanceId]);
    expect(s.perm("host").linked).toHaveLength(0);
    expect(s.perm("host").stack.some(({ instanceId }) => instanceId === s.inst("link").instanceId)).toBe(true);
    expect(s.perm("host").currentDP).toBe(12000);
  });
});
