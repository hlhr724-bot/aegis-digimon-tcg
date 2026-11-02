import fixture from "@api-fixtures/pending-end-turn-attack-during-dna.fixture";
import { expect, test } from "@e2e/scenario-page";

test("a pending end-turn attack warns and resolves without starting another attack during DNA combat", async ({
  scenario,
  page,
}) => {
  const refs = await scenario.openFixture(fixture, "normal", "none");
  await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
  await page.getByRole("button", { name: /^end turn$/i }).click();
  const warning = "Another attack cannot start while this attack is resolving.";
  await scenario.resolveUntil(
    (state) => state.pendingDecision?.promptText === warning,
    (decision) => {
      if (decision.kind === "orderTriggers" && decision.options.triggerCardIds?.includes("BT22-017")) {
        return { triggerCardId: "BT22-017" };
      }
      if (
        decision.kind === "orderTriggers" &&
        decision.options.triggerCardIds?.includes("BT17-081") &&
        decision.options.triggerCardIds.includes("BT22-015")
      ) {
        return { triggerCardId: "BT17-081" };
      }
      if (decision.kind === "orderTriggers" && decision.options.triggerCardIds?.includes("BT22-015")) {
        return { triggerCardId: "BT22-015" };
      }
      if (decision.sourceCardId === "BT17-081" && decision.options.timing === "AllTurns") {
        return { accept: false };
      }
      return {};
    },
  );
  const prompt = page.getByRole("dialog", { name: "Tai Kamiya & Matt Ishida · effect", exact: true });
  await expect(prompt.getByText(warning, { exact: true })).toBeVisible();
  const duringAttack = await scenario.snapshot();
  const omnimon = duringAttack.players[0]!.battleArea.find(
    (permanent) => permanent.topCard.instanceId === refs.instanceId("omnimon"),
  );
  expect(omnimon?.topCard.cardId).toBe("BT22-015");
  expect(omnimon?.isSuspended).toBe(false);
  const beforeAcceptance = (await scenario.presentation()).events;
  expect(beforeAcceptance.filter((event) => event.kind === "attackDeclared")).toHaveLength(1);
  expect(beforeAcceptance.filter((event) => event.kind === "attackEnded")).toHaveLength(0);
  await prompt.getByRole("button", { name: "Yes, activate", exact: true }).click();
  await scenario.resolveUntil((state) => state.turnSeat === 1 && !state.pendingDecision && !state.combatWindow);
  const state = await scenario.snapshot();
  expect(state.players[1]!.securityCount).toBe(3);
  const events = (await scenario.presentation()).events;
  expect(events.filter((event) => event.kind === "attackDeclared")).toHaveLength(1);
  expect(events.filter((event) => event.kind === "attackEnded")).toHaveLength(1);
  expect(events).toContainEqual(expect.objectContaining({ kind: "turnEnded", endingSeat: 0, nextSeat: 1 }));
  await scenario.healthy();
});
