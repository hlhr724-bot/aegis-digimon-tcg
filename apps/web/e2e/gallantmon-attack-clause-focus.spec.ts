import { test, expect } from "@e2e/scenario-page";
import { stubCardArtwork } from "@e2e/card-artwork";
import fixture from "@api-fixtures/gallantmon-attack-clause-focus.fixture";

test.beforeEach(async ({ page }) => stubCardArtwork(page));

test("Gallantmon distinguishes deletion and attack steps and finishes both pending effects", async ({
  scenario,
  page,
}) => {
  const refs = await scenario.openFixture(fixture, "normal", "none");
  await scenario.evolve("Gallantmon", refs.permanentId("base"), true);
  const checkedSteps: string[] = [];
  await scenario.resolveUntil(
    (state) =>
      !state.pendingDecision &&
      state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard.cardId === "AD1-008" && permanent.isSuspended,
      ) &&
      state.players[1]!.battleArea.length === 0,
    async (decision) => {
      if (decision.sourceCardId !== "AD1-008") {
        return {};
      }
      if (decision.options.effectKey === "AD1-008/ir-7-0" && decision.kind === "chooseTargets") {
        await page.getByRole("button", { name: "View effect", exact: true }).click();
        await expect(page.locator(".decision-overlay__effect-step")).toHaveText(
          "[When Digivolving] Delete up to 10000 DP total worth of your opponent's Digimon.",
        );
        checkedSteps.push("deletion");
        return { instanceId: refs.permanentId("firstTarget") };
      }
      if (decision.options.selectionContext === "attackTarget") {
        await expect(page.locator(".decision-overlay__effect-text")).toHaveText(
          "[When Digivolving] Delete up to 10000 DP total worth of your opponent's Digimon. Then, this Digimon may attack.",
        );
        await expect(page.locator(".decision-overlay__effect-step")).toHaveText("Then, this Digimon may attack.");
        checkedSteps.push("attack");
        return { instanceId: "player" };
      }
      return {};
    },
  );
  expect(checkedSteps).toEqual(["deletion", "attack"]);
  await scenario.healthy();
});
