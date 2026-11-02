import fixture from "../../api/src/engine/scenarios/arts-dedigivolution-pending-play.fixture";
import { test, expect } from "./scenario-page";

test.use({ holdBotAfterTurn: 1 });

test("de-digivolving after Arts Digivolve does not revive the played Sistermon's lost effect", async ({
  scenario,
  page,
}) => {
  const refs = await scenario.openFixture(fixture);
  await scenario.resolveUntil(
    (state) => state.phase === "Main" && !state.pendingDecision,
    () => ({ accept: false }),
  );
  const before = await scenario.snapshot();
  await scenario.hand("Sistermon Noir (Awakened)");
  await page
    .getByRole("button", { name: /Option/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Use as Option", exact: true }).click();
  await scenario.resolveUntil(
    (state) => state.players[0]!.trash.some((card) => card.cardId === "EX13-066") && !state.pendingDecision,
    (decision) => {
      if (decision.kind === "optional") {
        return { accept: true };
      }
      if (decision.promptText.includes("Arts Digivolve")) {
        return { instanceId: refs.instanceId("blanc") };
      }
      return {};
    },
  );
  const after = await scenario.snapshot();
  const blanc = after.players[0]!.battleArea.find(
    (permanent) => permanent.topCard.instanceId === refs.instanceId("blanc"),
  );
  expect(blanc?.topCard.cardId).toBe("BT23-076");
  expect(blanc?.stack).toHaveLength(0);
  expect(after.players[1]!.trash.some((card) => card.cardId === "BT13-065")).toBe(true);
  expect(after.players[0]!.securityCount).toBe(before.players[0]!.securityCount);
  expect(after.players[0]!.handCount).toBe(before.players[0]!.handCount);
  const presentation = await scenario.presentation();
  expect(
    presentation.events.filter(
      (event) => event.kind === "effectTriggered" && event.sourceCardId === "BT23-076" && event.timing === "OnPlay",
    ),
  ).toHaveLength(0);
  await scenario.healthy();
});
