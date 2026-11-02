import fixturePumpkinmon from "@api-fixtures/pumpkinmon-executes-after-costed-evolution.fixture";
import fixtureRizeGreymon from "@api-fixtures/rizegreymon-main-and-inherited-recover-separately.fixture";
import { expect, test } from "@e2e/scenario-page";

test("self-granted Execute finishes its attack and Ascension through the visible decisions", async ({ scenario }) => {
  const refs = await scenario.openFixture(fixturePumpkinmon, "normal", "none");
  await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
  await scenario.evolve("Pumpkinmon", refs.permanentId("garurumon"));
  await scenario.resolveUntil(
    (state) => state.turnSeat === 1 && !state.pendingDecision && !state.combatWindow,
    (decision) => {
      if (decision.options.purpose === "cost") {
        return { instanceId: refs.instanceId("payment") };
      }
      return { accept: true, decisionBudgetMs: decision.options.timing === "Ascension" ? 12_000 : undefined };
    },
  );
  const state = await scenario.snapshot();
  expect(state.players[1]!.securityCount).toBe(2);
  expect(state.players[0]!.securityCount).toBe(4);
  expect(state.players[0]!.battleArea).toHaveLength(0);
  expect((await scenario.presentation()).events).toContainEqual(
    expect.objectContaining({
      kind: "cardsMoved",
      instanceIds: [refs.instanceId("pumpkinmon")],
      from: "trash",
      to: "security",
    }),
  );
  await scenario.healthy();
});

test("RizeGreymon recovers separate Marcus cards before and after evolving in one turn", async ({ scenario, page }) => {
  const refs = await scenario.openFixture(fixtureRizeGreymon, "normal", "none");
  await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
  await scenario.evolve("RizeGreymon", refs.permanentId("geogreymon"), true);
  await scenario.resolveUntil(
    (state) => state.combatWindow?.kind === "alliance",
    (decision) =>
      decision.options.candidateInstanceIds?.includes(refs.permanentId("first-marcus"))
        ? { instanceId: refs.permanentId("first-marcus") }
        : {},
  );
  await expect(page.getByRole("region", { name: "Alliance window", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Pass$/i }).click();
  await scenario.resolveUntil(
    (state) => state.players[0]!.securityCount === 4 && !state.pendingDecision && !state.combatWindow,
    (decision) => ({
      decisionBudgetMs:
        decision.sourceCardId === "BT21-044" && (decision.options.effectSummary?.cardsRecovered ?? 0) > 0
          ? 12_000
          : undefined,
    }),
  );
  await scenario.evolve("ShineGreymon", refs.permanentId("geogreymon"), true);
  await scenario.resolveUntil(
    (state) =>
      !state.pendingDecision &&
      state.players[0]!.battleArea.find((permanent) => permanent.permanentId === refs.permanentId("second-marcus"))
        ?.currentDP === 3000,
  );
  await scenario.attack(refs.permanentId("second-marcus"));
  await scenario.resolveUntil(
    (state) => state.players[0]!.securityCount === 5 && !state.pendingDecision && !state.combatWindow,
    (decision) => ({
      decisionBudgetMs:
        decision.sourceCardId === "BT21-044" && (decision.options.effectSummary?.cardsRecovered ?? 0) > 0
          ? 12_000
          : undefined,
    }),
  );
  const events = (await scenario.presentation()).events;
  for (const marcus of ["first-marcus", "second-marcus"]) {
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "cardsMoved",
        instanceIds: [refs.instanceId(marcus)],
        from: "trash",
        to: "security",
      }),
    );
  }
  await scenario.healthy();
});
