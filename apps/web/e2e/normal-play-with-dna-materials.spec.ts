import fixture from "../../api/src/engine/scenarios/dna-digivolve-trigger-order-choice.fixture";
import { test, expect } from "./scenario-page";
import { GamePage } from "./game-page";

for (const { width, dark } of [
  { width: 412, dark: true },
  { width: 412, dark: false },
  { width: 1440, dark: true },
  { width: 1440, dark: false },
]) {
  test(`normal play preserves available DNA materials at width ${width}, dark ${dark}`, async ({ scenario, page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript((value) => localStorage.setItem("aegis:darkMode", String(value)), dark);
    const refs = await scenario.openFixture(fixture);
    await scenario.resolveUntil((state) => state.turnSeat === 0 && state.phase === "Main" && !state.pendingDecision);
    await new GamePage(page).dragCardTo(/^Paildramon$/i, page.locator('[data-drop="battle-you"]'));
    const prompt = page.getByRole("region", { name: /DNA Digivolution available/i });
    await prompt.getByRole("button", { name: "Play normally", exact: true }).click();
    await scenario.resolveUntil(
      (state) =>
        !state.pendingDecision &&
        state.players[0]!.battleArea.some(
          (permanent) => permanent.topCard.instanceId === refs.instanceId("paildramon"),
        ),
      () => ({ accept: false }),
    );
    const state = await scenario.snapshot();
    const board = state.players[0]!.battleArea;
    expect(board.map((permanent) => permanent.permanentId)).toEqual(
      expect.arrayContaining([refs.permanentId("blue"), refs.permanentId("green")]),
    );
    expect(
      board.find((permanent) => permanent.topCard.instanceId === refs.instanceId("paildramon"))!.stack,
    ).toHaveLength(0);
    await expect(prompt).not.toBeVisible();
    await scenario.healthy();
  });
}
