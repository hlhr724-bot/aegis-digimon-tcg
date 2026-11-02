import fixtureAlliance from "@api-fixtures/alliance-suspension-evolves-hisyaryumon.fixture";
import fixtureAttackImmunity from "@api-fixtures/zero-dp-after-attack-immunity.fixture";
import { expect, test } from "@e2e/scenario-page";

test("Alliance evolves into the selected Ouryumon when two hand cards are eligible", async ({ scenario, page }) => {
  const fixture: typeof fixtureAlliance = {
    ...fixtureAlliance,
    board: {
      ...fixtureAlliance.board,
      0: {
        ...fixtureAlliance.board[0],
        hand: [
          { card: "BT24-064", as: "alternate-evolution" },
          { card: "BT27-015", as: "ouryumon" },
        ],
      },
    },
  };
  const refs = await scenario.openFixture(fixture, "normal", "none");
  await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
  await scenario.attack(refs.permanentId("hisyaryumon"));
  await scenario.resolveUntil(
    (state) => state.combatWindow?.kind === "alliance",
    () => ({ triggerCardId: "BT15-063" }),
  );
  await expect(page.getByRole("region", { name: "Alliance window", exact: true })).toBeVisible();
  await page.locator(`[data-id="${refs.permanentId("ally")}"][role="button"]`).click();
  await page.getByRole("button", { name: "Use Alliance", exact: true }).click();
  await scenario.resolveUntil(
    (state) => state.pendingDecision?.kind === "selectCards",
    () => ({ accept: true, triggerCardId: "BT15-063" }),
  );
  const selection = page.getByRole("region", { name: "Hand selection", exact: true });
  await expect(selection).toBeVisible();
  const ouryumon = page.locator(`[data-hand-instance-id="${refs.instanceId("ouryumon")}"]`);
  await ouryumon.focus();
  await ouryumon.press("Enter");
  await expect(ouryumon).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(`[data-hand-instance-id="${refs.instanceId("alternate-evolution")}"]`)).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await selection.getByRole("button", { name: "End Selection", exact: true }).click();
  await scenario.resolveUntil(
    (state) =>
      state.players[0]!.battleArea.find((permanent) => permanent.permanentId === refs.permanentId("hisyaryumon"))
        ?.topCard.cardId === "BT27-015" &&
      state.players[1]!.securityCount < 4 &&
      !state.pendingDecision &&
      !state.combatWindow,
  );
  const state = await scenario.snapshot();
  expect(state.players[0]!.hand.map((card) => card.instanceId)).toContain(refs.instanceId("alternate-evolution"));
  expect(state.memory).toBe(3);
  expect((await scenario.presentation()).events).toContainEqual(
    expect.objectContaining({
      kind: "digivolved",
      permanentId: refs.permanentId("hisyaryumon"),
      cardId: "BT27-015",
    }),
  );
  await scenario.healthy();
});

test("Ouryuken is deleted at zero DP as attack immunity expires before another Main action", async ({ scenario }) => {
  const fixture: typeof fixtureAttackImmunity = {
    ...fixtureAttackImmunity,
    board: {
      ...fixtureAttackImmunity.board,
      1: {
        ...fixtureAttackImmunity.board[1],
        battleArea: [{ card: "BT27-103", as: "ouryuken", under: ["BT13-075", "BT27-015"], suspended: true }],
      },
    },
  };
  const refs = await scenario.openFixture(fixture, "normal", "none");
  await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
  const ouryukenId = refs.permanentId("ouryuken");
  await scenario.attack(refs.permanentId("first-attacker"));
  await scenario.resolveUntil(
    (state) => state.players[1]!.securityCount === 4 && !state.pendingDecision && !state.combatWindow,
    () => ({ instanceId: ouryukenId }),
  );
  const afterFirstAttack = await scenario.snapshot();
  const survivingOuryuken = afterFirstAttack.players[1]!.battleArea.find(
    (permanent) => permanent.permanentId === ouryukenId,
  );
  expect(survivingOuryuken?.currentDP).toBe(8000);
  expect(survivingOuryuken?.immuneToOpponentDigimonEffects).toBe(false);
  await scenario.attack(refs.permanentId("second-attacker"));
  await scenario.resolveUntil(
    (state) =>
      !state.players[1]!.battleArea.some((permanent) => permanent.permanentId === ouryukenId) &&
      !state.pendingDecision &&
      !state.combatWindow,
    () => ({ instanceId: ouryukenId }),
  );
  const state = await scenario.snapshot();
  expect((await scenario.presentation()).events).toContainEqual(
    expect.objectContaining({
      kind: "attackEnded",
      attackerPermanentId: refs.permanentId("second-attacker"),
    }),
  );
  expect(state.players[1]!.trash.map((card) => card.instanceId)).toContain(refs.instanceId("ouryuken"));
  expect(state.phase).toBe("Main");
  expect(state.turnSeat).toBe(0);
  expect(state.memory).toBe(5);
  expect((await scenario.presentation()).steps.filter((step) => step.cancelled).map((step) => step.track)).toEqual([
    `dpPulse-${ouryukenId}`,
    `dpPulse-${ouryukenId}`,
  ]);
  await scenario.healthy({ expectedCancelledStepIds: ["suppressed-dp-pulse-1", "suppressed-dp-pulse-5"] });
});
