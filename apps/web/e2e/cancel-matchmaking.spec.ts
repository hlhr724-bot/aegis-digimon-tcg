import { expect, test } from "@playwright/test";
import { RED_DECK } from "../../api/dist/engine/testDecks.js";
import { roomRegistry } from "../../api/dist/rooms/AegisRoom.js";
import { startBrowserServer } from "./server";

let server: Awaited<ReturnType<typeof startBrowserServer>>;

test.beforeEach(async () => {
  server = await startBrowserServer();
});

test.afterEach(async () => {
  await server.close();
});

for (const width of [390, 1440]) {
  for (const dark of [false, true]) {
    test(`cancels a resumed search without a loss at ${width}px in ${dark ? "dark" : "light"} mode`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(
        ({ deck, dark: darkMode }) => {
          localStorage.setItem("aegis:locale", "en");
          localStorage.setItem("aegis:darkMode", String(darkMode));
          window.browserTestOptions = { displayName: "Searching Tamer", seed: 1, deck };
          window.browserTestMode = "casual";
        },
        { deck: RED_DECK, dark },
      );
      await page.goto("/e2e/harness.html");
      const cancel = page.getByRole("button", { name: "Cancel search", exact: true });
      await expect(cancel).toBeVisible();
      await expect.poll(() => roomRegistry.size).toBe(1);
      const room = [...roomRegistry.values()][0]!;
      await expect.poll(() => room.clients.length).toBe(1);
      await expect.poll(() => page.evaluate(() => sessionStorage.getItem("aegis:matchSession"))).not.toBeNull();
      await page.reload();
      await expect(cancel).toBeVisible();
      await expect(page.getByText(/Cancelling before an opponent joins does not count as a loss/)).toBeVisible();
      await expect.poll(() => room.clients.length).toBe(1);
      expect(room.state.gameOver).toBe(false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await cancel.focus();
      await expect(cancel).toBeFocused();
      await cancel.press("Enter");
      await expect(page.getByRole("status")).toHaveText("Returned to lobby");
      await expect.poll(() => room.clients.length).toBe(0);
      expect(room.state.gameOver).toBe(false);
      expect(await page.evaluate(() => sessionStorage.getItem("aegis:matchSession"))).toBeNull();
    });
  }
}
