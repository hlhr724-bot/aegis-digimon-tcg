import { fixtureZoneId } from "../../api/src/engine/scenario/references";
import type { ScenarioFixture } from "../../api/src/engine/scenario/types";
import { openFixturePage } from "./scenario-page";

import fixtureChuumonInherited from "../../api/src/engine/scenarios/chuumon-inherited.fixture";
import fixtureTsunomonInherited from "../../api/src/engine/scenarios/tsunomon-inherited.fixture";
import fixtureWeregarurumonTarget from "../../api/src/engine/scenarios/weregarurumon-target.fixture";
import fixtureRyugumonWatcher from "../../api/src/engine/scenarios/ryugumon-watcher.fixture";
import fixtureUkkomonMoving from "../../api/src/engine/scenarios/ukkomon-moving.fixture";
import fixtureYuukiEndTurn from "../../api/src/engine/scenarios/yuuki-end-turn.fixture";
import fixtureCandlemonMain from "../../api/src/engine/scenarios/candlemon-main.fixture";
import { test, expect, type Page } from "@playwright/test";
import { startBrowserServer } from "./server";
import { GamePage } from "./game-page";

async function openScenario(page: Page, id: ScenarioFixture) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(() => {
    localStorage.setItem("aegis:locale", "en");
    localStorage.setItem("aegis.action-confirmation.enabled", "false");
  });
  await openFixturePage(page, id);
  await expect(page.getByRole("button", { name: /^end breeding$/i })).toBeEnabled();
}

async function selectReveal(page: Page, name: string) {
  const dialog = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("button", { name: "Confirm targets", exact: true }) });
  await expect(dialog).toBeVisible();
  // The Chuumon scenario deliberately offers equivalent physical copies.
  const candidate = dialog
    .locator(".decision-overlay__candidate:not([disabled])")
    .filter({ has: page.getByRole("img", { name, exact: true }) })
    .first();
  await candidate.click();
  await dialog.getByRole("button", { name: "Confirm targets", exact: true }).click();
}

for (const [id, returned] of [
  [fixtureChuumonInherited, "Chuumon"],
  [fixtureTsunomonInherited, "Greymon"],
] as const) {
  test(`${id.name} resolves a selectable inherited effect after battle deletion`, async ({ page }) => {
    const server = await startBrowserServer();
    try {
      await openScenario(page, id);
      await new GamePage(page).endBreeding();
      await new GamePage(page).attack(
        `${fixtureZoneId(id, 0, "field", 0)}`,
        page.locator(`[data-drop="perm-opp"][data-id="${fixtureZoneId(id, 1, "field", 0)}"]`),
      );
      await page.getByRole("button", { name: /^(Use|Yes, activate)$/i }).click();
      await selectReveal(page, returned);
      if (returned === "Chuumon") {
        const revived = page
          .locator('[data-drop="perm-you"]')
          .filter({ has: page.getByRole("img", { name: returned, exact: true }) });
        await expect(revived).toHaveAttribute("data-suspended", "true");
      } else await expect(page.getByTestId("hand").getByRole("img", { name: returned, exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    } finally {
      await page.close();
      await server.close();
    }
  });
}

for (const [id, played, target] of [
  [fixtureWeregarurumonTarget, "WereGarurumon", "Kokatorimon"],
  [fixtureRyugumonWatcher, "Agumon", "Kokatorimon"],
] as const) {
  test(`${id.name} selects its opposing field target and returns to Main`, async ({ page }) => {
    const server = await startBrowserServer();
    try {
      await openScenario(page, id);
      await new GamePage(page).endBreeding();
      const card = page.getByTestId("hand").getByRole("button", { name: `Select ${played}`, exact: true });
      await card.focus();
      await card.press("Enter");
      await page.getByRole("button", { name: "Play Digimon", exact: true }).click();
      if (id === fixtureRyugumonWatcher) {
        await page.getByRole("button", { name: "[All Turns], Ryugumon, Field", exact: true }).click();
        await page.getByRole("button", { name: "Resolve next effect", exact: true }).click();
      }
      const region = page.getByRole("region", { name: "Confirm targets", exact: true });
      await expect(region).toBeVisible();
      const victim = page
        .locator('[data-drop="perm-opp"]')
        .filter({ has: page.getByRole("img", { name: target, exact: true }) });
      await victim.focus();
      await victim.press("Enter");
      await region.getByRole("button", { name: "Confirm targets", exact: true }).click();
      await expect(region).not.toBeVisible();
      if (id === fixtureRyugumonWatcher) await page.getByRole("button", { name: "Confirm order", exact: true }).click();
      await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    } finally {
      await page.close();
      await server.close();
    }
  });
}

test("Ukkomon's own movement reveals choices and reaches Main", async ({ page }) => {
  const server = await startBrowserServer();
  try {
    await openScenario(page, fixtureUkkomonMoving);
    await page.locator('[data-drop="breeding-you"]').click();
    await selectReveal(page, "Agumon");
    await page.getByRole("button", { name: "Confirm order", exact: true }).click();
    await page.getByRole("button", { name: /^(Not use|Don.t use|No, decline)$/i }).click();
    await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    await expect(page.getByTestId("hand").getByRole("img", { name: "Agumon", exact: true })).toHaveCount(1);
  } finally {
    await page.close();
    await server.close();
  }
});

test("Yuuki's End of All Turns exposes legal trash cards", async ({ page }) => {
  const server = await startBrowserServer();
  try {
    await openScenario(page, fixtureYuukiEndTurn);
    await page.getByRole("button", { name: /^end breeding$/i }).click();
    await page
      .getByRole("region", { name: "Hand selection", exact: true })
      .getByRole("button", { name: "No Selection", exact: true })
      .click();
    await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    await page.getByRole("button", { name: /^end turn$/i }).click();
    await page.getByRole("button", { name: /^(Use|Yes, activate)$/i }).click();
    await selectReveal(page, "Loudmon");
    await expect(page.getByTestId("hand").getByRole("img", { name: "Loudmon", exact: true })).toBeVisible();
  } finally {
    await page.close();
    await server.close();
  }
});

test("Candlemon runs its printed Start of Main security effect", async ({ page }) => {
  const server = await startBrowserServer();
  try {
    await openScenario(page, fixtureCandlemonMain);
    await page.getByRole("button", { name: /^end breeding$/i }).click();
    await page.getByRole("button", { name: /^(Security Top|Top of the security stack)$/i }).click();
    await page.getByRole("button", { name: /^(Use|Yes, activate)$/i }).click();
    await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    await expect(page.getByTestId("hand").getByRole("img", { name: "Candlemon", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Your security · 3", exact: true })).toBeVisible();
  } finally {
    await page.close();
    await server.close();
  }
});
