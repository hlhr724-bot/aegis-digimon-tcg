import { expect, test } from "@playwright/test";
import fixtureKudamonMoving from "../../api/src/engine/scenarios/kudamon-moving.fixture";
import { ScenarioPage } from "./scenario-page";
import { startBrowserServer } from "./server";

for (const { viewport, dark } of [
  { viewport: { width: 1366, height: 768 }, dark: false },
  { viewport: { width: 1366, height: 768 }, dark: true },
  { viewport: { width: 390, height: 844 }, dark: false },
  { viewport: { width: 390, height: 844 }, dark: true },
]) {
  test(`inspect inherited effects before deciding breeding at ${viewport.width}px dark=${dark}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript((darkMode) => {
      localStorage.setItem("aegis:locale", "en");
      localStorage.setItem("aegis:darkMode", String(darkMode));
      localStorage.setItem("aegis.action-confirmation.enabled", "false");
    }, dark);
    const server = await startBrowserServer();
    try {
      const arena = new ScenarioPage(page, server.useFixture);
      await arena.openFixture(fixtureKudamonMoving, "normal", "none");
      if (dark) {
        await expect(page.locator("html")).toHaveClass(/dark/);
      } else {
        await expect(page.locator("html")).not.toHaveClass(/dark/);
      }
      const endBreeding = page.getByRole("button", { name: /^end breeding$/i });
      const raised = page.locator('[data-drop="breeding-you"]');
      await expect(endBreeding).toBeEnabled();
      await raised.locator(".game-permanent").click({ button: "right" });
      const inspector = page.getByRole("dialog", { name: "Kudamon", exact: true });
      await expect(inspector).toBeVisible();
      await expect(inspector).toContainText("Pinamon");
      await expect(inspector).toContainText("By trashing the bottom face-down card from under any of your Tamers");
      await inspector.getByRole("button", { name: "Close", exact: true }).click();
      await expect(endBreeding).toBeEnabled();
      await expect(raised.getByRole("img", { name: "Kudamon", exact: true })).toBeVisible();
      const read = raised.getByRole("button", { name: "Read Kudamon", exact: true });
      if (viewport.width < 768) {
        await expect(read).toBeHidden();
        await raised.locator(".game-permanent").dispatchEvent("pointerdown", {
          pointerId: 1,
          pointerType: "touch",
          isPrimary: true,
          bubbles: true,
        });
        await expect(inspector).toBeVisible();
        await raised.locator(".game-permanent").dispatchEvent("pointerup", {
          pointerId: 1,
          pointerType: "touch",
          isPrimary: true,
          bubbles: true,
        });
      } else {
        await expect(read).toBeInViewport();
        await read.click();
      }
      await expect(inspector).toBeVisible();
      await inspector.getByRole("button", { name: "Close", exact: true }).click();
      await expect(endBreeding).toBeEnabled();
      await raised.locator(".game-permanent").click();
      await expect(raised.getByRole("img", { name: "Kudamon", exact: true })).toHaveCount(0);
      await expect(
        page.locator('[data-drop="perm-you"]').getByRole("img", { name: "Kudamon", exact: true }),
      ).toBeVisible();
    } finally {
      await page.close();
      await server.close();
    }
  });
}
