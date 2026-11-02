import { expect, test } from "./fixtures";
import { GamePage } from "./game-page";

test.use({ hasTouch: true });

test("confirming surrender ends the match", async ({ page, match }) => {
  await match.start("reconnect");
  await page.getByRole("button", { name: "Surrender", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Surrender this match?" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Surrender", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Defeat", exact: true })).toBeVisible();
  await expect.poll(() => match.state().gameOver).toBe(true);
});

test("confirming browser back on mobile leaves the match with a pending decision", async ({ page, match }) => {
  await match.start("reconnect");
  const game = new GamePage(page);
  await game.endBreeding();
  await game.play(/yuuki/i);
  await expect.poll(() => match.state().pendingDecision?.seat).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/play/game");
  await expect(page.getByRole("group", { name: "Your battle area", exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.history.replaceState(null, "", "/play");
    window.history.pushState(null, "", "/play/game");
  });
  await page.goBack();
  const confirmation = page.getByRole("dialog", { name: "Leave this match?" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Leave match", exact: true }).tap();
  await expect.poll(() => match.state().gameOver).toBe(true);
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByRole("group", { name: "Your battle area", exact: true })).toBeHidden();
  expect(await page.evaluate(() => sessionStorage.getItem("aegis:matchSession"))).toBeNull();
});
