import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { startSocialBrowserServer } from "./startSocialBrowserServer";
import { FriendStore } from "../../api/dist/friends/FriendStore.js";

for (const width of [390, 1440]) {
  for (const dark of [false, true]) {
    test(`friends exchange and report private messages at ${width}px in ${dark ? "dark" : "light"} mode`, async ({
      browser,
    }) => {
      const server = await startSocialBrowserServer();
      const contexts = [];
      try {
        const first = await server.accounts.accountForIdentity("email", "sender@test.invalid", "Message Sender");
        const second = await server.accounts.accountForIdentity("email", "recipient@test.invalid", "Message Recipient");
        const friends = new FriendStore(server.accounts);
        await friends.request({ accountId: first.id, displayName: second.displayName });
        await friends.accept({ accountId: second.id, otherId: first.id });
        const pages = [];
        for (const account of [first, second]) {
          const session = await server.accounts.issueSession(account);
          const context = await browser.newContext({
            viewport: { width, height: 1000 },
            recordVideo:
              width === 1440 && !dark
                ? {
                    dir: fileURLToPath(new URL("../../../.local/validation/videos/", import.meta.url)),
                    size: { width, height: 1000 },
                  }
                : undefined,
          });
          contexts.push(context);
          await context.addCookies([{ name: "aegis_session", value: session.id, domain: "127.0.0.1", path: "/" }]);
          await context.addInitScript((darkMode) => {
            localStorage.setItem("aegis:locale", "en");
            localStorage.setItem("aegis:darkMode", String(darkMode));
          }, dark);
          const page = await context.newPage();
          await page.goto("/friends");
          await expect(page.getByText("Connected to friends", { exact: true })).toBeVisible();
          await page.getByRole("button", { name: "Message", exact: true }).click();
          pages.push(page);
        }
        const [sender, recipient] = pages;
        await sender.getByRole("textbox", { name: "Message", exact: true }).fill("Ready to test our decks?");
        await sender.getByRole("button", { name: "Send", exact: true }).click();
        await expect(recipient.getByText("Ready to test our decks?", { exact: true })).toBeVisible();
        await expect(sender.getByText("Read", { exact: true })).toBeVisible();
        await recipient.getByRole("textbox", { name: "Message", exact: true }).fill("Yes, let's play!");
        await recipient.getByRole("button", { name: "Send", exact: true }).click();
        await expect(sender.getByText("Yes, let's play!", { exact: true })).toBeVisible();
        await recipient.getByRole("button", { name: "Report", exact: true }).click();
        await expect(recipient.getByRole("button", { name: "Reported", exact: true })).toBeDisabled();
        const report = (await server.accounts.pool.query("SELECT github_status FROM feedback_reports")).rows;
        expect(report).toEqual([{ github_status: "disabled" }]);
        expect(await recipient.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await sender.getByRole("textbox", { name: "Message", exact: true }).fill("Next match?");
        await sender.getByRole("button", { name: "Friend details", exact: true }).click();
        const profile = sender.getByRole("dialog", { name: "Friend details", exact: true });
        await expect(profile.getByRole("heading", { name: "Message Recipient", exact: true })).toBeVisible();
        await sender.screenshot({
          path: fileURLToPath(
            new URL(`../../../.local/validation/profile-${width}-${dark ? "dark" : "light"}.png`, import.meta.url),
          ),
        });
        await sender.keyboard.press("Escape");
        await expect(sender.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("Next match?");
        await sender.getByRole("textbox", { name: "Message", exact: true }).fill("");
        await sender.screenshot({
          path: fileURLToPath(
            new URL(`../../../.local/validation/messages-${width}-${dark ? "dark" : "light"}.png`, import.meta.url),
          ),
        });
        await recipient.getByRole("button", { name: "Close", exact: true }).click();
        await recipient.getByLabel("More actions for Message Sender", { exact: true }).click();
        await recipient.getByRole("button", { name: "Block player", exact: true }).click();
        await expect(sender.getByText("This conversation is unavailable.", { exact: true })).toBeVisible();
        await expect(sender.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
      } finally {
        for (const context of contexts) {
          await context.close();
        }
        await server.close();
      }
    });
  }
}
