import fixture from "../../api/src/engine/scenarios/training-hand-effects-independent.fixture";
import { test, expect } from "./scenario-page";

test.use({ holdBotAfterTurn: 1 });

for (const first of ["war", "metal"] as const) {
  test(`Training resolves independently before the ${first}-first hand evolution`, async ({ scenario, page }, info) => {
    await page.setViewportSize(first === "war" ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    const refs = await scenario.openFixture(fixture, "normal", "none");
    await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
    expect((await scenario.snapshot()).memory).toBe(4);

    await page.locator(`[data-drop="perm-you"][data-id="${refs.permanentId("training")}"]`).click();
    await page.getByRole("button", { name: /^Activate effect:/ }).click();
    await scenario.resolveUntil(
      (state) =>
        !state.pendingDecision &&
        state.players[0]!.trash.some((card) => card.instanceId === refs.instanceId("training-card")),
      () => {
        throw new Error("Training must not offer a level 6 evolution from Agumon or Gabumon");
      },
    );

    const afterTraining = await scenario.snapshot();
    expect(afterTraining.memory).toBe(4);
    expect(afterTraining.turnSeat).toBe(0);
    expect(afterTraining.players[0]!.hand.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([refs.instanceId("war"), refs.instanceId("metal")]),
    );
    expect((await scenario.presentation()).events.filter((event) => event.kind === "digivolved")).toHaveLength(0);

    if (first === "war") await page.getByLabel("Match menu", { exact: true }).click();
    await page.getByRole("button", { name: "Match log", exact: true }).first().click();
    const log = page.getByRole("dialog", { name: "Play log", exact: true });
    await expect(log).toContainText("Wall Training's effect resolved — no digivolution performed");
    await page.screenshot({ path: info.outputPath("training-without-digivolution-log.png"), fullPage: true });
    await log.getByRole("button", { name: "Close the play log", exact: true }).click();

    await scenario.hand(first === "war" ? "WarGreymon" : "MetalGarurumon");
    await page.getByRole("button", { name: /^Activate effect:/ }).click();
    await scenario.resolveUntil(
      (state) =>
        !state.pendingDecision &&
        state.turnSeat === 1 &&
        state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === refs.instanceId("war")) &&
        state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === refs.instanceId("metal")),
      (decision) => {
        if (decision.kind === "chooseOption") {
          const firstCardId = first === "war" ? "BT22-013" : "BT22-026";
          return { choice: decision.sourceCardId === firstCardId ? 0 : 1 };
        }
        return {};
      },
    );

    const after = await scenario.snapshot();
    expect(after.memory).toBe(2);
    expect(after.players[0]!.trash.map((card) => card.instanceId)).toEqual([refs.instanceId("training-card")]);
    for (const [base, evolution] of [
      ["agumon", "war"],
      ["gabumon", "metal"],
    ] as const) {
      const permanent = after.players[0]!.battleArea.find((entry) => entry.permanentId === refs.permanentId(base))!;
      expect(permanent.topCard.instanceId).toBe(refs.instanceId(evolution));
      expect(permanent.stack.map((card) => card.instanceId)).toEqual([refs.instanceId(`${base}-card`)]);
    }
    const events = (await scenario.presentation()).events;
    expect(
      events.flatMap((event) =>
        event.kind === "memoryChanged" && event.reason === "digivolve" ? [[event.from, event.to]] : [],
      ),
    ).toEqual([[4, -2]]);
    expect(events.filter((event) => event.kind === "digivolved")).toHaveLength(2);
    await scenario.healthy();
    await page.screenshot({ path: info.outputPath("training-and-hand-evolution.png"), fullPage: true });
  });
}

test("Training discounts a legal level 5 evolution without activating the hand effect", async ({ scenario, page }) => {
  const refs = await scenario.openFixture(
    {
      ...fixture,
      board: {
        ...fixture.board,
        0: {
          ...fixture.board[0],
          hand: [{ card: "BT22-013", as: "war", faceUp: false }],
          battleArea: [
            { card: "LM-057", as: "training", top: { card: "LM-057", as: "training-card" } },
            { card: "BT1-021", as: "host", top: { card: "BT1-021", as: "host-card" } },
          ],
        },
      },
    },
    "normal",
    "none",
  );
  await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
  await page.locator(`[data-drop="perm-you"][data-id="${refs.permanentId("training")}"]`).click();
  await page.getByRole("button", { name: /^Activate effect:/ }).click();
  await scenario.resolveUntil(
    (state) =>
      !state.pendingDecision &&
      state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === refs.instanceId("war")),
    () => ({ choice: 1 }),
  );
  const after = await scenario.snapshot();
  expect(after.memory).toBe(3);
  expect(after.turnSeat).toBe(0);
  const host = after.players[0]!.battleArea.find((permanent) => permanent.permanentId === refs.permanentId("host"))!;
  expect(host.stack.map((card) => card.instanceId)).toEqual([refs.instanceId("host-card")]);
  const events = (await scenario.presentation()).events;
  expect(
    events.flatMap((event) =>
      event.kind === "memoryChanged" && event.reason === "digivolve" ? [[event.from, event.to]] : [],
    ),
  ).toEqual([[4, 3]]);
  expect(
    events.filter(
      (event) => event.kind === "effectTriggered" && event.sourceCardId === "BT22-013" && event.timing === "Main",
    ),
  ).toHaveLength(0);
  await scenario.healthy();
  await page.getByRole("button", { name: "Match log", exact: true }).first().click();
  const log = page.getByRole("dialog", { name: "Play log", exact: true });
  await expect(log).toContainText("Wall Training's effect resolved");
  await expect(log).not.toContainText("no digivolution performed");
  const search = log.getByRole("searchbox", { name: "Search match history" });
  await search.fill("Wall Training");
  await expect(log.getByText("Wall Training's effect resolved")).toBeVisible();
  await expect(log.getByText(/^Match started\./)).toHaveCount(0);
  await log.getByRole("button", { name: "Open Wall Training" }).first().hover();
  await expect(page.getByTestId("card-zoom-preview")).toBeVisible();
  await log.getByRole("button", { name: "Clear search" }).click();
  await expect(log.getByText(/^Match started\./)).toBeVisible();
});
