import fixture from "../../api/src/engine/scenarios/required-face-down-placement-is-revealed.fixture";
import { test, expect } from "./scenario-page";

test("the opponent reveals Keenan's required payment and the match log records its identity", async ({
  scenario,
  page,
}) => {
  const refs = await scenario.openFixture({
    ...fixture,
    board: { 0: fixture.board[1], 1: fixture.board[0] },
    turnSeat: 1,
    presentation: {
      opponent: {
        endBreeding: true,
        fallbackMain: "end",
        decisions: [
          { sourceCard: "BT26-094", kind: "optional", accept: true },
          { sourceCard: "BT26-094", kind: "selectCards", target: "payment" },
        ],
      },
    },
  });
  const reveal = page.getByTestId("reveal-showcase");
  await expect(reveal).toBeVisible();
  await expect(reveal).toContainText("Keenan Crier");
  await expect(reveal.getByRole("listitem", { name: "Lilamon", exact: true })).toBeVisible();
  await scenario.resolveUntil((state) => state.turnSeat === 0 && state.phase === "Main" && !state.pendingDecision);
  const reveals = (await scenario.presentation()).events.filter((event) => event.kind === "cardRevealed");
  expect(reveals).toEqual([expect.objectContaining({ seat: 1, cardId: "BT26-044", sourceCardId: "BT26-094" })]);
  const tamer = (await scenario.snapshot()).players[1]!.battleArea.find(
    (permanent) => permanent.permanentId === refs.permanentId("tamer"),
  );
  expect(tamer).toBeDefined();
  expect(tamer!.stack.every((card) => !card.cardId)).toBe(true);
  await page.getByRole("button", { name: "Match log", exact: true }).first().click();
  const log = page.getByRole("dialog", { name: "Match log", exact: true });
  await expect(log).toContainText(/revealed.*Lilamon.*with.*Keenan Crier/);
  await log.getByRole("button", { name: "Close the play log", exact: true }).click();
  await scenario.healthy();
});
