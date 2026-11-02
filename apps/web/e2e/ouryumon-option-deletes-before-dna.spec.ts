import { fileURLToPath } from "node:url";
import fixture from "@api-fixtures/ouryumon-option-deletes-before-dna.fixture";
import { test, expect } from "@e2e/scenario-page";

test.use({ holdBotAfterTurn: 1 });

test("keeps a used Option's DNA choice independent of an accepted Ouryumon resolution plan", async ({
  scenario,
  page,
}) => {
  await page.route(/\/assets\/card-images\/BT27-(015|103)(?:-Sample)?\.webp(?:\?.*)?$/, (route) => {
    const cardId = new URL(route.request().url()).pathname.split("/").pop()!.replace("-Sample", "");
    return route.fulfill({
      contentType: "image/webp",
      path: fileURLToPath(new URL(`../../../data/card-images/${cardId}`, import.meta.url)),
    });
  });
  const refs = await scenario.openFixture(
    {
      ...fixture,
      board: {
        ...fixture.board,
        0: {
          ...fixture.board[0],
          battleArea: [...fixture.board[0]!.battleArea!, { card: "BT27-015", as: "second-ouryumon" }],
        },
      },
    },
    "normal",
    "none",
  );
  await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
  await scenario.attack(refs.permanentId("ouryumon"));
  await scenario.resolveUntil((state) => state.pendingDecision?.kind === "orderTriggers");
  const panel = page.getByRole("dialog").filter({
    has: page.getByRole("heading", { name: "Order pending effects", exact: true }),
  });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Select all, top to bottom", exact: true }).click();
  await panel.getByRole("button", { name: "Yes to all", exact: true }).click();
  await panel.getByRole("button", { name: /^Resolve (next effect|in this order|effect)$/ }).click();
  await scenario.resolveUntil(
    (state) => state.pendingDecision?.kind === "chooseTargets",
    (decision) => (decision.kind === "chooseOption" ? { choice: 1 } : { instanceId: refs.instanceId("used-option") }),
  );
  const beforeDeletion = await scenario.snapshot();
  const deletion = (await scenario.presentation()).decisions.find(
    (decision) => decision.decisionId === beforeDeletion.pendingDecision?.decisionId,
  );
  expect(deletion?.options?.min).toBe(1);
  expect(beforeDeletion.players[1]!.battleArea).toHaveLength(2);
  await scenario.resolveUntil(
    (state) => state.players[1]!.battleArea.length === 1 && !!state.pendingDecision,
    () => ({ instanceId: refs.instanceId("first-enemy") }),
  );
  const afterDeletion = await scenario.snapshot();
  expect(afterDeletion.pendingDecision?.kind).toBe("optional");
  await expect(page.getByRole("button", { name: "No, decline", exact: true })).toBeVisible();
  await scenario.resolveUntil(
    (state) => !state.pendingDecision && !state.combatWindow,
    () => ({ accept: false }),
  );
  const after = await scenario.snapshot();
  expect(after.players[0]!.battleArea.map((permanent) => permanent.permanentId)).toEqual(
    expect.arrayContaining([
      refs.permanentId("ouryumon"),
      refs.permanentId("alphamon"),
      refs.permanentId("second-ouryumon"),
    ]),
  );
  expect(after.players[0]!.trash.some((card) => card.instanceId === refs.instanceId("used-option"))).toBe(true);
  expect(after.players[0]!.hand.some((card) => card.instanceId === refs.instanceId("unused-option"))).toBe(true);
  expect(after.players[1]!.battleArea).toHaveLength(1);
  expect(after.memory).toBe(6);
  await scenario.healthy();
});
