import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  for (const dark of [false, true]) {
    test(`quick chat keeps drafts and unread messages at ${width}px in ${dark ? "dark" : "light"} mode`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((darkMode) => {
        localStorage.setItem("aegis:locale", "en");
        localStorage.setItem("aegis:darkMode", String(darkMode));
      }, dark);
      const api = process.env.AEGIS_E2E_API_URL ?? `http://127.0.0.1:${process.env.AEGIS_E2E_EDGE_PORT ?? 2569}`;
      await page.route(`${api}/friends`, (route) =>
        route.fulfill({
          json: {
            friends: [
              { accountId: "friend", displayName: "Quick Friend", avatarId: null, avatarUrl: null, since: Date.now() },
            ],
          },
        }),
      );
      await page.route(`${api}/friends/requests`, (route) => route.fulfill({ json: { requests: [] } }));
      await page.route(`${api}/account/blocks`, (route) => route.fulfill({ json: { blocks: [] } }));
      await page.route(`${api}/messages/**`, (route) => route.fulfill({ json: { messages: [] } }));
      await page.route(`${api}/friends/friend/detail`, (route) =>
        route.fulfill({
          json: {
            friend: {
              accountId: "friend",
              displayName: "Quick Friend",
              avatarId: null,
              avatarUrl: null,
              since: 1,
              status: "online",
            },
            stats: null,
            replays: [],
          },
        }),
      );
      await page.goto("/e2e/quick-chat.html");
      await page.getByRole("button", { name: "Message", exact: true }).click();
      const chat = page.getByRole("complementary", { name: "Quick chat", exact: true });
      const input = chat.getByRole("textbox", { name: "Message", exact: true });
      await input.fill("Keep my draft");
      await chat.getByRole("button", { name: "Minimize chat", exact: true }).click();
      await page.evaluate(() =>
        window.dispatchEvent(
          new CustomEvent("quick-chat-fixture-message", {
            detail: {
              id: "incoming",
              senderId: "friend",
              recipientId: "me",
              body: "Bora testar os decks?",
              createdAt: Date.now(),
              readAt: null,
            },
          }),
        ),
      );
      await expect(chat.getByRole("button", { name: "Open quick chat, 1 unread messages", exact: true })).toBeVisible();
      expect(await page.evaluate(() => window.quickChatFixtureMessages[0]?.readAt)).toBeNull();
      await page.screenshot({
        path: fileURLToPath(
          new URL(
            `../../../.local/validation/quick-chat-collapsed-${width}-${dark ? "dark" : "light"}.png`,
            import.meta.url,
          ),
        ),
      });
      await page.getByRole("button", { name: "Home", exact: true }).click();
      await chat.getByRole("button", { name: "Open quick chat, 1 unread messages", exact: true }).click();
      await expect(input).toHaveValue("Keep my draft");
      await expect(chat.getByText("Bora testar os decks?", { exact: true })).toBeVisible();
      await expect.poll(async () => page.evaluate(() => window.quickChatFixtureMessages[0]?.readAt)).not.toBeNull();
      await input.fill("Bora! Me chama quando terminar.");
      await chat.getByRole("button", { name: "Send", exact: true }).click();
      await expect(chat.getByText("Bora! Me chama quando terminar.", { exact: true })).toBeVisible();
      await expect(input).toHaveValue("");
      const rect = await chat.boundingBox();
      expect(rect!.x).toBeGreaterThanOrEqual(0);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({
        path: fileURLToPath(
          new URL(
            `../../../.local/validation/quick-chat-open-${width}-${dark ? "dark" : "light"}.png`,
            import.meta.url,
          ),
        ),
      });
      await input.fill("Next match?");
      await chat.getByRole("button", { name: "Friend details", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Friend details", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(input).toHaveValue("Next match?");
      await chat.getByRole("button", { name: "Back to friends", exact: true }).click();
      await expect(chat.getByRole("searchbox", { name: "Find a player", exact: true })).toBeFocused();
      await page.screenshot({
        path: fileURLToPath(
          new URL(
            `../../../.local/validation/quick-chat-directory-${width}-${dark ? "dark" : "light"}.png`,
            import.meta.url,
          ),
        ),
      });
      const more = chat.getByLabel("More actions for Quick Friend");
      const beforeMore = await more.boundingBox();
      const beforeScrollHeight = await chat
        .locator(".friends-screen-compact")
        .evaluate((element) => element.scrollHeight);
      await more.click();
      const afterMore = await more.boundingBox();
      expect(afterMore!.y).toBeCloseTo(beforeMore!.y, 0);
      expect(await chat.locator(".friends-screen-compact").evaluate((element) => element.scrollHeight)).toBe(
        beforeScrollHeight,
      );
      const menu = page.getByRole("menu");
      await expect(menu.getByRole("menuitem", { name: "Remove friend" })).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: "Block player" })).toBeVisible();
      const menuRect = await menu.boundingBox();
      expect(menuRect!.x).toBeGreaterThanOrEqual(0);
      expect(menuRect!.x + menuRect!.width).toBeLessThanOrEqual(width);
      expect(menuRect!.y + menuRect!.height).toBeLessThanOrEqual(1000);
      await page.screenshot({
        path: fileURLToPath(
          new URL(
            `../../../.local/validation/quick-chat-menu-${width}-${dark ? "dark" : "light"}.png`,
            import.meta.url,
          ),
        ),
      });
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(more).toBeFocused();
      await more.press("ArrowDown");
      await expect(menu.getByRole("menuitem", { name: "Remove friend" })).toBeFocused();
      await page.getByRole("heading", { name: "Aegis", exact: true }).click();
      await expect(menu).toHaveCount(0);
      await expect(more).toBeVisible();
      await page.setViewportSize({ width, height: 600 });
      await more.click();
      await expect(menu).toBeVisible();
      const shortMenuRect = await menu.boundingBox();
      expect(shortMenuRect!.y).toBeGreaterThanOrEqual(0);
      expect(shortMenuRect!.y + shortMenuRect!.height).toBeLessThanOrEqual(600);
      await page.keyboard.press("Escape");
      await page.setViewportSize({ width, height: 1000 });

      await chat.getByRole("button", { name: "Message", exact: true }).click();
      await expect(chat.getByText("Bora testar os decks?", { exact: true })).toBeVisible();
      await chat.getByRole("button", { name: "Close", exact: true }).click();
      await expect(chat.getByRole("button", { name: "Open quick chat", exact: true })).toBeVisible();
    });
  }
}
