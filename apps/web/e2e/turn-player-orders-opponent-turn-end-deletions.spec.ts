import fixture from "../../api/src/engine/scenarios/turn-player-orders-opponent-turn-end-deletions.fixture";
import { test, expect } from "./scenario-page";

test("the order prompt marks the opponent's pending turn-end deletions and shows their pending clause", async ({
  scenario,
}) => {
  const { page } = scenario;
  await scenario.openFixture(fixture, "normal", "none");
  await scenario.resolveUntil((s) => s.phase === "Main" && s.turnSeat === 0 && !s.pendingDecision);

  for (const played of [1, 2]) {
    const attacker = (await scenario.snapshot()).players[0]!.battleArea.find(
      (permanent) => permanent.topCard.cardId === "BT1-020" && !permanent.isSuspended,
    )!;
    await scenario.idle();
    const notices = page.getByRole("button", { name: /^Dismiss / });
    for (let remaining = await notices.count(); remaining > 0; remaining -= 1) await notices.first().click();
    await expect(notices).toHaveCount(0);
    await scenario.attack(attacker.permanentId);
    await scenario.resolveUntil(
      (s) =>
        !s.pendingDecision &&
        !s.combatWindow &&
        s.players[1]!.battleArea.filter((permanent) => permanent.topCard.cardId === "BT23-025").length === played,
    );
  }

  await page.getByRole("button", { name: /^End turn$/i }).click();
  let offeredControllers: number[] | undefined;
  await scenario.resolveUntil(
    (s) => !s.players[1]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT23-025"),
    async (decision) => {
      if (decision.kind === "orderTriggers") {
        offeredControllers = [...(decision.options.triggerControllerSeats ?? [])];
        const panel = page.getByRole("dialog").filter({ hasText: "Order pending effects" });
        await expect(panel.getByText("Opponent's effect", { exact: true })).toHaveCount(2);
        await expect(panel.getByText(/You are the turn player/)).toBeVisible();
        const clauses = panel.locator(".trigger-chooser__effect-text");
        await expect(clauses).toHaveCount(2);
        for (const clause of await clauses.all()) {
          await expect(clause).toContainText("At turn end, delete the Digimon this effect played.");
          await expect(clause).not.toContainText("[Hand]");
        }
      }
      return {};
    },
  );

  expect(offeredControllers).toEqual([1, 1]);
  expect(scenario.errors).toEqual([]);
});
