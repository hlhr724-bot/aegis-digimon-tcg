import { Phase } from "@aegis/shared/schema/enums";
import violet from "../../api/src/engine/scenarios/black-emperor-dragon-story-adaptation.fixture";
import owen from "../../api/src/engine/scenarios/guardians-deep-owen-story-adaptation.fixture";
import close from "../../api/src/engine/scenarios/guardians-deep-close-story-adaptation.fixture";
import dragonkin from "../../api/src/engine/scenarios/dragonkin-aggro-story-adaptation.fixture";
import { test, expect } from "./scenario-page";

for (const width of [1440, 390]) {
  test(`Owen digivolves Agumon onto his starting egg at ${width}px`, async ({ scenario, page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await scenario.openFixture(owen, "normal", "none");
    await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    await scenario.hand("Agumon");
    await page.getByRole("button", { name: "Digivolve", exact: true }).click();
    await page.locator('[data-drop="breeding-you"]').click();
    await expect.poll(async () => (await scenario.snapshot()).players[0]!.breeding?.topCard.cardId).toBe("BT21-007");
    expect((await scenario.snapshot()).players[0]!.breeding?.stack.map((card) => card.cardId)).toEqual(["BT21-001"]);
    await scenario.healthy();
  });

  test(`Violet raises Ghostmon and evolves into Necromon at ${width}px`, async ({ scenario, page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await scenario.openFixture(violet, "normal", "move");
    await scenario.resolveUntil((state) => state.phase === Phase.Main && !state.pendingDecision);
    const ghost = (await scenario.snapshot()).players[0]!.battleArea.find(
      (permanent) => permanent.topCard.cardId === "BT20-063",
    )!;
    for (const [name, cardId] of [
      ["Soulmon", "BT20-067"],
      ["Phantomon", "BT20-072"],
      ["Necromon", "BT20-079"],
    ]) {
      await scenario.evolve(name!, ghost.permanentId);
      await scenario.resolveUntil(
        (state) =>
          !state.pendingDecision &&
          state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === cardId),
        () => ({ accept: false }),
      );
    }
    await scenario.healthy();
  });
}

test("Close raises Proganomon with three inherited sources", async ({ scenario, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await scenario.openFixture(close, "normal", "move");
  await scenario.resolveUntil((state) => state.phase === Phase.Main && !state.pendingDecision);
  const proganomon = (await scenario.snapshot()).players[0]!.battleArea.find(
    (permanent) => permanent.topCard.cardId === "EX8-051",
  )!;
  expect(proganomon.stack.map((card) => card.cardId)).toEqual(["EX8-005", "EX8-047", "EX8-048"]);
  await scenario.healthy();
});

test("Dragonkin Aggro opens on Owen's turn", async ({ scenario }) => {
  await scenario.openFixture(dragonkin, "normal", "none");
  const phases = (await scenario.presentation()).events.filter((event) => event.kind === "phaseChanged");
  expect(phases.length).toBeGreaterThan(0);
  expect(phases[0]!.turnSeat).toBe(1);
  await expect
    .poll(async () =>
      (await scenario.presentation()).events.some(
        (event) => event.kind === "phaseChanged" && event.phase === Phase.Main && event.turnSeat === 1,
      ),
    )
    .toBe(true);
  await scenario.resolveUntil(
    (state) => state.turnSeat === 0 && state.phase === Phase.Breeding && !state.pendingDecision,
    () => ({ accept: false }),
    30_000,
  );
  const state = await scenario.snapshot();
  const initialAttackers = new Set(["ST18-12", "ST18-04", "ST18-05"]);
  expect(
    state.players[0]!.battleArea.filter((permanent) => initialAttackers.has(permanent.topCard.cardId)).length,
  ).toBeLessThan(3);
  expect(state.gameOver).toBe(false);
  expect(scenario.errors).toEqual([]);
});
