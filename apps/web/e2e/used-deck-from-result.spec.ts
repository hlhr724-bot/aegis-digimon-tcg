import { expect, test } from "./fixtures";

test("viewing the used deck from the result screen shows the deck in front of the board", async ({ page, match }) => {
  await match.start("reconnect");
  match.opponent.room.onMessage("replay", () => {});
  match.opponent.room.send("surrender", {});
  const result = page.getByRole("dialog", { name: "Victory" });
  await expect(result).toBeVisible();

  await page.getByRole("button", { name: "Your deck" }).click();
  const deck = page.getByRole("dialog", { name: /Deck/ });
  await expect(deck).toBeVisible();
  await expect(result).toBeHidden();
  await page.screenshot({ path: test.info().outputPath("used-deck-open.png") });

  await deck.getByRole("button", { name: "Close" }).first().click();
  await expect(deck).toBeHidden();
  await expect(result).toBeHidden();
  await page.getByRole("button", { name: "Show result" }).click();
  await expect(result).toBeVisible();
});
