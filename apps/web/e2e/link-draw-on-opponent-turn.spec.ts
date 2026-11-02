import fixture from "../../api/src/engine/scenarios/link-draw-on-opponent-turn.fixture";
import { test, expect } from "./scenario-page";

test("Tweetmon draws when Deusmon links it at the end of the opponent's turn", async ({ scenario, page }) => {
  const refs = await scenario.openFixture(fixture);
  await scenario.resolveUntil((state) => state.turnSeat === 0 && state.phase === "Breeding" && !state.pendingDecision);
  await page.getByRole("button", { name: /^end breeding$/i }).click();
  await scenario.resolveUntil((state) => state.turnSeat === 0 && state.phase === "Main" && !state.pendingDecision);
  const final = await scenario.snapshot();
  expect(final.players[0]!.hand.map((card) => card.instanceId)).toEqual([
    refs.instanceId("linkDraw"),
    refs.instanceId("turnDraw"),
  ]);
  expect(
    final.players[0]!.battleArea.find((permanent) => permanent.permanentId === refs.permanentId("host"))!.linked.map(
      (card) => card.instanceId,
    ),
  ).toEqual([refs.instanceId("linkCard")]);
  expect(final.players[0]!.deckCount).toBe(1);
  expect((await scenario.presentation()).events).toContainEqual(
    expect.objectContaining({ kind: "effectResolved", sourceCardId: "P-190" }),
  );
  await scenario.healthy();
});
