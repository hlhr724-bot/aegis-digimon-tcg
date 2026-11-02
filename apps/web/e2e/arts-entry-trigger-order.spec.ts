import { fileURLToPath } from "node:url";
import fixture from "@api-fixtures/arts-evolution-shares-play-trigger-order.fixture";
import { test, expect } from "@e2e/scenario-page";

test.use({ holdBotAfterTurn: 1 });

test("offers the revived On Play and Arts evolution effects together before resolving either", async ({
  scenario,
  page,
}) => {
  await page.route(/\/assets\/card-images\/BT27-(080|082)(?:-Sample)?\.webp(?:\?.*)?$/, (route) => {
    const cardId = new URL(route.request().url()).pathname.split("/").pop()!.replace("-Sample", "");
    return route.fulfill({
      contentType: "image/webp",
      path: fileURLToPath(new URL(`../../../data/card-images/${cardId}`, import.meta.url)),
    });
  });
  const refs = await scenario.openFixture(fixture, "normal", "none");
  await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
  await scenario.play("Nosferamon", "Option");
  await page.getByRole("button", { name: "Use as Option", exact: true }).click();
  await scenario.resolveUntil(
    (state) => state.pendingDecision?.kind === "orderTriggers",
    (decision) => {
      if (decision.promptText.includes("Arts Digivolve")) {
        return { instanceId: refs.instanceId("arts-base") };
      }
      if (decision.kind === "selectCards") {
        return { instanceId: refs.instanceId("played") };
      }
      return { accept: true };
    },
  );

  const panel = page.getByRole("dialog").filter({
    has: page.getByRole("heading", { name: "Order pending effects", exact: true }),
  });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: /Cougarmon/ }).and(panel.locator("[aria-pressed]"))).toBeVisible();
  await expect(panel.getByRole("button", { name: /Nosferamon/ }).and(panel.locator("[aria-pressed]"))).toBeVisible();
  const before = await scenario.snapshot();
  const pending = (await scenario.presentation()).decisions.find(
    (decision) => decision.decisionId === before.pendingDecision?.decisionId,
  );
  expect(pending?.options?.triggerCardIds?.sort()).toEqual(["BT27-082", "ST23-03"]);
  const beforeEvents = (await scenario.presentation()).events;
  expect(
    beforeEvents.filter(
      (event) => event.kind === "effectTriggered" && event.sourceCardId === "ST23-03" && event.timing === "OnPlay",
    ),
  ).toHaveLength(0);
  expect(
    beforeEvents.filter(
      (event) =>
        event.kind === "effectTriggered" && event.sourceCardId === "BT27-082" && event.timing === "WhenDigivolving",
    ),
  ).toHaveLength(0);

  await scenario.resolveUntil(
    (state) => !state.pendingDecision,
    (decision) => (decision.kind === "orderTriggers" ? { triggerCardId: "ST23-03" } : { accept: false }),
  );
  const after = await scenario.snapshot();
  expect(
    after.players[0]!.battleArea.find((permanent) => permanent.permanentId === refs.permanentId("arts-base"))?.topCard
      .cardId,
  ).toBe("BT27-082");
  expect(
    after.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === refs.instanceId("played")),
  ).toBe(true);
  expect(
    after.players[0]!.battleArea.find((permanent) => permanent.permanentId === refs.permanentId("tamer"))?.stack,
  ).toHaveLength(2);
  expect(after.players[0]!.securityCount).toBe(3);
  expect(after.players[0]!.handCount).toBe(before.players[0]!.handCount + 1);
  expect(after.memory).toBe(5);
  expect(
    (await scenario.presentation()).events.filter(
      (event) => event.kind === "effectResolved" && event.sourceCardId === "ST23-03" && event.timing === "OnPlay",
    ),
  ).toHaveLength(1);
  await scenario.healthy();
});
