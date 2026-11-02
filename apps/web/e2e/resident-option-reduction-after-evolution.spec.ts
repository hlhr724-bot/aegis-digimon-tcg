import fixture from "../../api/src/engine/scenarios/resident-option-reduction-after-evolution.fixture";
import { test, expect } from "./scenario-page";

test("a buried Armalizamon does not offer its printed Option reduction", async ({ scenario, page }) => {
  test.setTimeout(120_000);
  const refs = await scenario.openFixture(fixture, "normal", "none");
  await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
  const firstOption = page.getByTestId("hand").getByRole("button", { name: "Select e-Pulse", exact: true }).first();
  await firstOption.focus();
  await firstOption.press("Enter");
  await page.getByRole("button", { name: "Play Option", exact: true }).click();
  await scenario.resolveUntil(
    (state) =>
      state.players[0]!.hand.filter(({ cardId }) => cardId === "ST23-15").length === 1 && !state.pendingDecision,
    () => ({ accept: false }),
  );
  expect((await scenario.snapshot()).memory).toBe(7);
  expect((await scenario.presentation()).decisions.some((decision) => decision.sourceCardId === "BT25-049")).toBe(true);
  await scenario.evolve("Monarchlizamon", refs.permanentId("reducer"), true);
  await scenario.resolveUntil(
    (state) =>
      state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT25-057") &&
      !state.pendingDecision,
    () => ({ accept: false }),
  );
  const before = await scenario.snapshot();
  const decisionCount = (await scenario.presentation()).decisions.length;
  await scenario.play("e-Pulse", "Option");
  await scenario.resolveUntil(
    (state) => !state.players[0]!.hand.some(({ cardId }) => cardId === "ST23-15") && !state.pendingDecision,
    () => ({ accept: false }),
  );
  const after = await scenario.snapshot();
  expect(after.memory).toBe(before.memory - 3);
  expect(
    (await scenario.presentation()).decisions
      .slice(decisionCount)
      .some((decision) => decision.sourceCardId === "BT25-049"),
  ).toBe(false);
  expect(
    after.players[0]!.battleArea.find((permanent) => permanent.permanentId === refs.permanentId("tamer"))!.stack.map(
      ({ instanceId }) => instanceId,
    ),
  ).toEqual([refs.instanceId("fuel")]);
  await scenario.healthy();
});
