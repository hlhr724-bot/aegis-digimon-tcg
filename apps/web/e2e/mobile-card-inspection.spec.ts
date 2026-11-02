import { getCardDefinition } from "@aegis/shared/cards/registry";
import { normalizeKeywordBrackets } from "@/game/keywordReminders";
import { openFixturePage, ScenarioPage } from "./scenario-page";
import fixtureMobileInspection from "../../api/src/engine/scenarios/mobile-inspection.fixture";

import { fixturePermanentId } from "../../api/src/engine/scenario/references";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { startBrowserServer } from "./server";
import { exposedCardPoint } from "./exposedCardPoint";

class MobileInspectionArena {
  constructor(readonly page: Page) {}

  async open(pendingChoice = true) {
    await this.page.addInitScript(() => {
      localStorage.setItem("aegis:locale", "en");
      localStorage.setItem("aegis.action-confirmation.enabled", "false");
    });
    await this.page.route("**/assets/card-images/**", (route) =>
      route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGP4/x8AAwAB//wl3FEAAAAASUVORK5CYII=",
          "base64",
        ),
      }),
    );
    await openFixturePage(this.page, fixtureMobileInspection);
    await this.page.getByRole("button", { name: /^end breeding$/i }).click();
    await expect(this.page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    await expect(this.page.locator(".game-permanent__inspect")).toHaveCount(0);
    if (!pendingChoice) return;
    await this.page.getByTestId("hand").getByRole("img", { name: "Leopardmon", exact: true }).tap();
    await this.page.getByRole("button", { name: "Play Digimon", exact: true }).tap();
    const targets = this.page.getByRole("region", { name: "Confirm targets", exact: true });
    await expect(targets).toBeVisible();
    await expect
      .poll(() => targets.evaluate((element) => element.scrollHeight - element.clientHeight))
      .toBeLessThanOrEqual(1);
    expect(
      await targets.evaluate((element) => {
        const count = element
          .querySelector(window.innerWidth < 768 ? ".board-prompt__clause" : ".board-prompt__detail")!
          .getBoundingClientRect();
        const actions = element.querySelector(".board-prompt__actions")!.getBoundingClientRect();
        return actions.top - count.bottom;
      }),
    ).toBeLessThanOrEqual(16);
    expect(
      await targets.evaluate(
        (element) =>
          element.getBoundingClientRect().bottom -
          element.querySelector(".board-prompt__actions")!.getBoundingClientRect().bottom,
      ),
    ).toBeLessThanOrEqual(24);
    if (this.page.viewportSize()!.width < 768) {
      const art = targets.locator(".board-prompt__art-crop");
      const crop = (await art.boundingBox())!;
      expect(crop.width).toBe(64);
      expect(crop.height).toBe(48);
      const heading = (await targets.locator(".board-prompt__heading").boundingBox())!;
      expect(heading.x).toBeGreaterThanOrEqual(crop.x + crop.width);
      await expect(targets.locator(".board-prompt__clause")).toBeVisible();
      await expect(targets.getByRole("button", { name: "View effect", exact: true })).toHaveCount(0);
      await expect(targets.getByRole("button", { name: "Hide effect", exact: true })).toHaveCount(0);
      const sheet = (await targets.boundingBox())!;
      expect(sheet.x).toBe(0);
      expect(sheet.width).toBe(this.page.viewportSize()!.width);
      expect(sheet.y + sheet.height).toBeCloseTo(this.page.viewportSize()!.height, 0);
    }
    await expect(this.page.getByRole("button", { name: "Use", exact: true })).toHaveCount(0);
    await expect(this.page.getByRole("dialog")).toHaveCount(0);
    await targets.getByRole("button", { name: "Select on board", exact: true }).tap();
    await expect(targets).toHaveCount(0);
    await this.pickFieldCard(this.alphamon());
    await this.page.getByRole("button", { name: "Return to decision", exact: true }).tap();
    await expect(targets.getByRole("button", { name: "Confirm targets", exact: true })).toBeEnabled();
    await targets.getByRole("button", { name: "Confirm targets", exact: true }).tap();
    await expect(this.alphamon()).toHaveAttribute("data-suspended", "true");
    await expect(targets).toBeVisible();
    await expect(targets).toContainText("Then, you may return");
    await expect(this.page.getByRole("button", { name: "Use", exact: true })).toHaveCount(0);
    await expect(this.page.getByRole("dialog")).toHaveCount(0);
    await this.page.keyboard.press("Escape");
    await expect(targets).toBeVisible();
    await expect(this.page.getByRole("dialog")).toHaveCount(0);
    // Both copies are legal physical targets. Deliberately keep the first picked through inspection.
    await targets.getByRole("button", { name: "Select on board", exact: true }).tap();
    await expect(targets).toHaveCount(0);
    await this.pickFieldCard(
      this.page.locator(`[data-drop="perm-opp"][data-id="${fixturePermanentId("opponent-inspection-dorumon-first")}"]`),
    );
    await this.page.getByRole("button", { name: "Return to decision", exact: true }).tap();
    await expect(targets.getByRole("button", { name: "Confirm targets", exact: true })).toBeEnabled();
    await this.page.getByRole("button", { name: "Select on board", exact: true }).tap();
    await expect(this.page.getByRole("button", { name: "Return to decision", exact: true })).toBeVisible();
    await expect(this.alphamon().getByRole("button", { name: "Read Alphamon", exact: true })).toBeVisible();
    await expect(this.page.getByRole("button", { name: "Read Coredramon", exact: true })).toBeVisible();
  }

  private async pickFieldCard(target: Locator) {
    const point = await exposedCardPoint({ target, touch: true });
    const bounds = (await target.boundingBox())!;
    await target.tap({ position: { x: point.x - bounds.x, y: point.y - bounds.y } });
  }

  alphamon() {
    return this.page
      .locator('[data-drop="perm-opp"]')
      .filter({ has: this.page.getByRole("img", { name: "Alphamon", exact: true }) });
  }

  async hold(target: Locator, cardName = "Alphamon") {
    const point = await exposedCardPoint({ target, touch: true });
    const dialog = this.page.getByRole("dialog", { name: cardName, exact: true });
    if (this.page.context().browser()?.browserType().name() !== "chromium") {
      // Playwright keeps a trusted finger down only through Chromium's CDP. Elsewhere
      // the same touch pointer sequence is dispatched at the same point, which runs
      // the app's hold logic in that engine (it does not check isTrusted).
      await this.page.evaluate(({ x, y }) => {
        const init = {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 41,
          pointerType: "touch",
          isPrimary: true,
          clientX: x,
          clientY: y,
        };
        document.elementFromPoint(x, y)!.dispatchEvent(new PointerEvent("pointerdown", init));
      }, point);
      try {
        await expect(dialog).toBeVisible({ timeout: 2000 });
      } finally {
        await this.page.evaluate(({ x, y }) => {
          const init = {
            bubbles: true,
            cancelable: true,
            composed: true,
            pointerId: 41,
            pointerType: "touch",
            isPrimary: true,
            clientX: x,
            clientY: y,
          };
          (document.elementFromPoint(x, y) ?? document.body).dispatchEvent(new PointerEvent("pointerup", init));
        }, point);
      }
      return;
    }
    const session = await this.page.context().newCDPSession(this.page);
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    try {
      // Wait for the hold gesture's actual result while the finger remains down.
      await expect(dialog).toBeVisible({ timeout: 2000 });
    } finally {
      await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await session.detach();
    }
  }
}

// Gecko has no isMobile emulation; requesting it leaves Playwright's Firefox page
// blank after a viewport resize.
test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: async ({ browserName }, use) => use(browserName !== "firefox"),
});

for (const viewport of [
  { width: 2048, height: 1191 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 720, height: 700 },
  { width: 390, height: 844 },
]) {
  test(`inspect Alphamon without changing a target at ${viewport.width}px`, async ({ page }) => {
    const server = await startBrowserServer();
    const evidence = new ScenarioPage(page);
    try {
      await page.setViewportSize(viewport);
      const arena = new MobileInspectionArena(page);
      await arena.open();
      await arena.hold(arena.alphamon());
      const inspector = page.getByRole("dialog", { name: "Alphamon", exact: true });
      await expect(inspector).toContainText("When any of your [Chronicle] trait Digimon would leave");
      if (viewport.width >= 768) {
        const sources = inspector.getByRole("region", { name: "4 sources" });
        await expect(sources).toBeInViewport();
        await expect(sources.getByRole("button", { name: "Open Grademon" })).toBeInViewport();
        expect(await sources.evaluate((element) => element.scrollTop)).toBe(0);
        await expect
          .poll(() => sources.evaluate((element) => element.scrollHeight - element.clientHeight))
          .toBeLessThanOrEqual(1);
        await expect(sources.getByRole("button", { name: "Open Bebydomon" })).toBeInViewport();
      } else {
        const strip = inspector.getByRole("group", { name: "4 sources" });
        const second = strip.getByRole("button").nth(1);
        await second.tap();
        await expect(second).toHaveAttribute("aria-pressed", "true");
        const selected = inspector.locator(".arena-permanent-inspector__strip-detail");
        await expect(selected).toBeInViewport();
        await expect(selected).toContainText(
          normalizeKeywordBrackets(getCardDefinition("EX13-055")!.inheritedEffectText!),
        );
      }
      await inspector.locator(".arena-permanent-inspector__art").tap();
      await expect(page.locator(".card-zoom")).toBeVisible();
      await page.locator(".card-zoom").getByRole("button", { name: "Close", exact: true }).tap();
      await inspector.getByRole("button", { name: "Close", exact: true }).tap();
      await arena.alphamon().getByRole("button", { name: "Read Alphamon", exact: true }).tap();
      await expect(inspector).toBeVisible();
      await inspector.getByRole("button", { name: "Close", exact: true }).tap();
      await page.getByRole("button", { name: "Return to decision", exact: true }).tap();
      await expect(
        page
          .getByRole("region", { name: "Confirm targets", exact: true })
          .getByRole("button", { name: "Confirm targets", exact: true }),
      ).toBeEnabled();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.getByRole("button", { name: "Confirm targets", exact: true }).tap();
      await expect(arena.alphamon()).toBeVisible();
      // Grademon's inherited effect can protect any Chronicle Digimon, including the chosen Dorumon.
      // Reaching this reaction proves that confirming, rather than inspecting, sent the target choice.
      await expect.poll(() => server.pendingBotDecision()?.sourceCardId).toBe("EX13-057");
      expect(server.pendingBotDecision()?.kind).toBe("optional");
      server.releaseBotDecision();
      await expect(page.getByText("The opponent is selecting cards.", { exact: true })).toHaveCount(0);
      await expect(
        page.locator(`[data-permanent-id="${fixturePermanentId("opponent-inspection-dorumon-first")}"]`),
      ).toBeVisible();
      await expect(
        page.locator(`[data-permanent-id="${fixturePermanentId("opponent-inspection-dorumon-second")}"]`),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Return to decision", exact: true })).toHaveCount(0);
      await expect(page.locator(".game-permanent__inspect")).toHaveCount(0);
    } finally {
      await evidence.evidence(test.info());
      await page.screenshot({ path: test.info().outputPath("final-ui.png") });
      await page.close();
      await server.close();
    }
  });
}

test("holding an attack-capable own Digimon outside selection reads it without attacking", async ({ page }) => {
  const server = await startBrowserServer();
  try {
    const arena = new MobileInspectionArena(page);
    await arena.open(false);
    const coredramon = page
      .locator('[data-drop="perm-you"]')
      .filter({ has: page.getByRole("img", { name: "Coredramon", exact: true }) });
    await arena.hold(coredramon, "Coredramon");
    const inspector = page.getByRole("dialog", { name: "Coredramon", exact: true });
    await expect(inspector.getByRole("button", { name: "Attack", exact: true })).toBeEnabled();
    await inspector.getByRole("button", { name: "Close", exact: true }).tap();
    await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    await expect(coredramon).not.toHaveAttribute("data-suspended", "true");
    await expect(page.getByTestId("drag-ghost")).toHaveCount(0);
  } finally {
    await page.close();
    await server.close();
  }
});

test("keeps the room mounted when switching translated digivolution source effects", async ({ page }) => {
  const server = await startBrowserServer();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    const arena = new MobileInspectionArena(page);
    await arena.open(false);
    await arena.hold(arena.alphamon());
    const inspector = page.getByRole("dialog", { name: "Alphamon", exact: true });
    const sources = inspector.getByRole("group", { name: "4 sources" }).getByRole("button");
    const selected = inspector.locator(".arena-permanent-inspector__strip-detail");
    await sources.nth(0).tap();
    await expect(selected).toContainText(normalizeKeywordBrackets(getCardDefinition("EX13-057")!.inheritedEffectText!));
    const marker = selected.locator("mark[data-kind=timing]").first();
    await expect(marker).toBeVisible();
    await marker.evaluate((element) => {
      const translated = document.createElement("font");
      translated.style.verticalAlign = "inherit";
      element.replaceWith(translated);
      translated.append(element);
    });

    await sources.nth(1).tap();

    await expect(inspector).toBeVisible();
    await expect(sources.nth(1)).toHaveAttribute("aria-pressed", "true");
    await sources.nth(0).tap();
    await expect(selected).toContainText(normalizeKeywordBrackets(getCardDefinition("EX13-057")!.inheritedEffectText!));
    await inspector.getByRole("button", { name: "Close", exact: true }).tap();
    await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    expect(errors).toEqual([]);
  } finally {
    await page.close();
    await server.close();
  }
});
