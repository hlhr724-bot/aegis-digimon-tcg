import fixture from "../../api/src/engine/scenarios/chiropmon-placement-evolution.fixture";
import { test, expect } from "./scenario-page";

test("hand placement evolution presents its clauses without waiting for an announcement timeout", async ({
  scenario,
  page,
}) => {
  await scenario.openFixture(fixture, "normal", "none");
  await page.getByRole("button", { name: "No, decline", exact: true }).click();
  await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
  await scenario.hand("ScourgeChiropmon");
  await page.getByRole("button", { name: /^Activate effect:/ }).click();
  await scenario.resolveUntil(
    (state) => !state.pendingDecision && state.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT27-080"),
    async () => ({ accept: false }),
  );
  await scenario.idle();
  const state = await scenario.snapshot();
  expect(state.memory).toBe(8);
  expect(state.players[0]!.battleArea.find((p) => p.topCard.cardId === "BT27-080")!.stack.map((c) => c.cardId)).toEqual(
    ["BT27-077", "BT27-073"],
  );
  const presentation = await page.evaluate(() => window.browserTestPresentation());
  expect(presentation.gateExpiries).toEqual([]);
  expect(scenario.errors).toEqual([]);
});
