import { test, expect } from "@e2e/scenario-page";
import { stubCardArtwork } from "@e2e/card-artwork";
import fixture from "@api-fixtures/optional-self-digivolution.fixture";

test.beforeEach(async ({ page }) => stubCardArtwork(page));

test("passing Tsunomon's evolution choice preserves the next security-removal opportunity", async ({
  scenario,
  page,
}) => {
  const refs = await scenario.openFixture(fixture);
  let evolutionChoices = 0;
  for (const alias of ["firstTemple", "secondTemple"]) {
    await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    const card = page.locator(`[data-hand-instance-id="${refs.instanceId(alias)}"]`);
    await card.focus();
    await card.press("Enter");
    await page.getByRole("button", { name: "Play Option", exact: true }).click();
    const expectedTop = alias === "firstTemple" ? "P-194" : "BT24-014";
    await scenario.resolveUntil(
      (state) =>
        !state.pendingDecision &&
        state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === refs.instanceId(alias)) &&
        state.players[0]!.battleArea.some(
          (permanent) => permanent.permanentId === refs.permanentId("host") && permanent.topCard.cardId === expectedTop,
        ),
      (decision) => {
        expect(decision.sourceCardId).toBe("BT24-003");
        expect(decision.kind).toBe("selectCards");
        expect(decision.options).toMatchObject({
          min: 0,
          max: 1,
          purpose: "optionalTarget",
          candidateInstanceIds: [refs.instanceId("shaman")],
        });
        evolutionChoices += 1;
        return alias === "firstTemple" ? { accept: false } : { instanceId: refs.instanceId("shaman") };
      },
    );
  }
  const state = await scenario.snapshot();
  expect(evolutionChoices).toBe(2);
  expect(state.memory).toBe(4);
  expect(state.players[0]!.hand.some((card) => card.instanceId === refs.instanceId("jupitermon"))).toBe(true);
  await scenario.healthy();
});
