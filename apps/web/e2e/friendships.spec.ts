import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { expect, test, type Page } from "@playwright/test";

const requireApi = createRequire(new URL("../../api/package.json", import.meta.url));
const express = requireApi("express");
const { newDb } = requireApi("pg-mem");

async function loadApiModule(name: string) {
  return import(new URL(`../../api/dist/${name}.js`, import.meta.url).href);
}

class FriendsPage {
  constructor(private readonly page: Page) {}

  async open(path: string) {
    await this.page.goto(path);
  }

  async openRequests() {
    await this.page.getByRole("button", { name: /^Requests \(/ }).click();
  }

  async expectNoOverflow() {
    expect(await this.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
}

for (const width of [390, 1440]) {
  for (const dark of [false, true]) {
    test(`players become friends from history and enforce blocking at ${width}px in ${dark ? "dark" : "light"} mode`, async ({
      browser,
    }) => {
      const { AccountStore } = await loadApiModule("accounts/AccountStore");
      const { installAccountRoutes } = await loadApiModule("accounts/routes");
      const store = new AccountStore(new (newDb({ noAstCoverageCheck: true }).adapters.createPg().Pool)());
      const app = express();
      app.use(express.json());
      installAccountRoutes(app, store);
      const first = await store.accountForIdentity("email", "first@test.invalid", "First Tamer");
      const second = await store.accountForIdentity("email", "second@test.invalid", "Second Tamer");
      await store.recordRecentMatch(first.id, "friends-finished-room", {
        id: "friends-finished-match",
        mode: "casual",
        opponentKind: "human",
        opponentName: second.displayName,
        opponentAccountId: second.id,
        result: "win",
        reason: "security",
        finishedAt: Date.now(),
      });
      const server = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server.once("listening", resolve));
      const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const contexts = [];
      try {
        const players = [];
        for (const account of [first, second]) {
          const session = await store.issueSession(account);
          const context = await browser.newContext({ viewport: { width, height: 1000 } });
          contexts.push(context);
          const page = await context.newPage();
          await page.addInitScript((darkMode) => {
            localStorage.setItem("aegis:locale", "en");
            localStorage.setItem("aegis:darkMode", String(darkMode));
          }, dark);
          await page.route(`http://127.0.0.1:${process.env.AEGIS_E2E_EDGE_PORT ?? 2569}/**`, async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            const response = await route.fetch({
              url: `${origin}${url.pathname}${url.search}`,
              headers: { ...request.headers(), cookie: `aegis_session=${session.id}` },
            });
            await route.fulfill({ response });
          });
          players.push({ page, friends: new FriendsPage(page) });
        }
        const [sender, recipient] = players;
        await sender.friends.open("/profile");
        await sender.page.getByRole("button", { name: "Add friend", exact: true }).click();
        await expect(sender.page.getByRole("button", { name: "Request sent", exact: true })).toBeDisabled();
        await recipient.friends.open("/friends");
        await recipient.friends.openRequests();
        await expect(recipient.page.getByRole("region", { name: "Requests", exact: true })).toContainText(
          first.displayName,
        );
        await recipient.page.getByRole("button", { name: "Accept", exact: true }).click();
        await recipient.page.getByRole("button", { name: "Friends (1)", exact: true }).click();
        await expect(recipient.page.getByRole("region", { name: "Friends", exact: true })).toContainText(
          first.displayName,
        );
        await sender.friends.open("/friends");
        await expect(sender.page.getByRole("region", { name: "Friends", exact: true })).toContainText(
          second.displayName,
        );
        await sender.page.getByLabel(/More actions for/).click();
        await sender.page.getByRole("button", { name: "Block player", exact: true }).click();
        await sender.page.getByRole("button", { name: "Blocked (1)", exact: true }).click();
        await expect(sender.page.getByRole("region", { name: "Blocked", exact: true })).toContainText(
          second.displayName,
        );
        await recipient.page.reload();
        await expect(
          recipient.page.getByText("No friends yet. Add a player to get started.", { exact: true }),
        ).toBeVisible();
        await recipient.page.getByRole("textbox", { name: "Player display name" }).fill(first.displayName);
        await recipient.page.getByRole("button", { name: "Add friend", exact: true }).click();
        await expect(recipient.page.getByRole("status")).toHaveText("This request is unavailable.");
        await sender.friends.expectNoOverflow();
        await recipient.friends.expectNoOverflow();
      } finally {
        for (const context of contexts) {
          await context.close();
        }
        await new Promise<void>((resolve) => server.close(() => resolve()));
        await store.close();
      }
    });
  }
}
