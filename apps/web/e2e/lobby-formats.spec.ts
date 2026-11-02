import { expect, test } from "@playwright/test";

for (const width of [320, 768, 1024, 1440]) {
  test(`historical rules persist across Random, Bot and Private at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/e2e/lobby-formats.html");
    await page.getByText("Advanced settings", { exact: true }).click();
    const pool = page.getByRole("combobox", { name: "Cards through", exact: true });
    const rules = page.getByRole("combobox", { name: "Rules", exact: true });
    await expect(pool).toHaveValue("BT13");
    await expect(rules).toHaveValue("pauper");
    for (const opponent of ["Practice vs AI", "Private Match", "Quick Match"]) {
      await page.getByRole("button", { name: new RegExp(opponent) }).click();
      await expect(pool).toHaveValue("BT13");
      await expect(rules).toHaveValue("pauper");
    }
    await page.getByRole("button", { name: "Enter queue", exact: true }).click();
    await expect(page.getByRole("status", { name: "Match request" })).toHaveText(
      '["casual",null,null,null,null,null,"BT13:pauper"]',
    );
    await rules.selectOption("unlimited");
    await expect(pool).toHaveValue("BT13");
    await page.getByRole("button", { name: "Enter queue", exact: true }).click();
    await expect(page.getByRole("status", { name: "Match request" })).toHaveText(
      '["unlimited",null,null,null,null,true,"BT13:unlimited"]',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: test.info().outputPath(`lobby-bt13-unlimited-${width}.png`), fullPage: true });
  });
}

test("combined formats gate deck selection and bot/private starts", async ({ page }) => {
  await page.goto("/e2e/lobby-formats.html");
  await page.getByText("Advanced settings", { exact: true }).click();
  const banned = page.getByRole("button", { name: "Historical banned card", exact: true });
  const later = page.getByRole("button", { name: "Later set card", exact: true });
  await expect(banned).toBeDisabled();
  await expect(later).toBeDisabled();
  await page.getByRole("combobox", { name: "Rules", exact: true }).selectOption("unlimited");
  await expect(banned).toBeEnabled();
  await expect(later).toBeDisabled();
  await banned.click();
  await page.getByRole("button", { name: /Practice vs AI/ }).click();
  await page.getByRole("button", { name: "Play vs Bot", exact: true }).click();
  await expect(page.getByRole("status", { name: "Match request" })).toHaveText(
    '["bot",null,null,false,null,true,"BT13:unlimited"]',
  );
  await page.getByRole("button", { name: /Private Match/ }).click();
  await page.getByRole("button", { name: "Create Room", exact: true }).click();
  await expect(page.getByRole("status", { name: "Match request" })).toHaveText(
    '["private_host",null,null,null,null,true,"BT13:unlimited"]',
  );
});

test("private guests see both fixed host controls", async ({ page }) => {
  await page.route("**/room/lookup", (route) =>
    route.fulfill({ json: { roomId: "private-room", unlimited: false, format: "BT13:pauper" } }),
  );
  await page.goto("/e2e/lobby-formats.html");
  await page.getByText("Advanced settings", { exact: true }).click();
  await page.getByRole("button", { name: /Private Match/ }).click();
  await page.getByRole("tab", { name: "Join", exact: true }).click();
  await page.getByRole("textbox", { name: "Enter room code" }).fill("ABC234");
  await expect(page.getByRole("combobox", { name: "Cards through", exact: true })).toHaveValue("BT13");
  await expect(page.getByRole("combobox", { name: "Rules", exact: true })).toHaveValue("pauper");
  await expect(page.getByRole("combobox", { name: "Rules", exact: true })).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "Cards through", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Join Room", exact: true }).click();
  await expect(page.getByRole("status", { name: "Match request" })).toHaveText(
    '["private_guest","ABC234",null,null,null,null,"BT13:pauper"]',
  );
});

test("switches manual matchmaking with touch and keyboard at narrow and wide widths", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("aegis:locale", "en"));
  await page.goto("/e2e/lobby-formats.html");
  await page.getByText("Advanced settings", { exact: true }).click();
  const modeSwitch = page.getByRole("switch", { name: "Game mode", exact: true });
  await expect(modeSwitch).not.toBeChecked();
  await modeSwitch.click();
  await expect(modeSwitch).toBeChecked();
  await page.getByRole("button", { name: "Enter queue", exact: true }).click();
  await expect(page.getByRole("status", { name: "Match request" })).toContainText('"manual"');
  await modeSwitch.press("ArrowLeft");
  await expect(modeSwitch).not.toBeChecked();
  await modeSwitch.press("ArrowRight");
  await expect(modeSwitch).toBeChecked();
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const dark of [false, true]) {
      await page.evaluate((enabled) => document.documentElement.classList.toggle("dark", enabled), dark);
      await modeSwitch.scrollIntoViewIfNeeded();
      const bounds = (await modeSwitch.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: test.info().outputPath(`manual-switch-${width}-${dark ? "dark" : "light"}.png`) });
    }
  }
});
