import fixture from "../../api/src/engine/scenarios/battle-row-columns-stay-when-card-suspends.fixture";
import { fixturePermanentId } from "../../api/src/engine/scenario/references";
import { test, expect, type ScenarioPage } from "./scenario-page";

const ATTACKER_ID = fixturePermanentId("attacker");
const NEIGHBOUR_ID = fixturePermanentId("neighbour");

async function columnPositions(scenario: ScenarioPage) {
  return scenario.page.evaluate((neighbourId) => {
    const neighbour = document.querySelector(`[data-drop="perm-you"][data-id="${neighbourId}"]`)!;
    const row = neighbour.closest(".game-battle-row, .game-battle-lane")!;
    return {
      neighbour: Math.round(neighbour.getBoundingClientRect().left),
      emptySlots: [...row.querySelectorAll(".game-field-card-slot")].map((slot) =>
        Math.round(slot.getBoundingClientRect().left),
      ),
    };
  }, NEIGHBOUR_ID);
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`battle row columns stay in place when a card suspends on a wide ${colorScheme} board`, async ({ scenario }) => {
    const { page } = scenario;
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await scenario.openFixture(fixture);
    await scenario.resolveUntil((s) => s.phase === "Main" && s.turnSeat === 0 && !s.pendingDecision);
    const upright = await columnPositions(scenario);
    expect(upright.emptySlots.length).toBeGreaterThan(0);

    await scenario.attack(ATTACKER_ID);
    await scenario.resolveUntil(
      (s) =>
        !s.pendingDecision &&
        !s.combatWindow &&
        s.players[1]!.securityCount === 1 &&
        s.players[0]!.battleArea.some((permanent) => permanent.permanentId === ATTACKER_ID && permanent.isSuspended),
    );
    await scenario.idle();

    expect(await columnPositions(scenario)).toEqual(upright);
    await scenario.healthy();
  });
}
