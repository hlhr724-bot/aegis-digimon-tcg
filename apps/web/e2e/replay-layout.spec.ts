import { test, expect } from "@playwright/test";
import { replayFixture } from "../test/replays/fixture";

for (const viewport of [
  { width: 320, height: 844 },
  { width: 844, height: 390 },
  { width: 390, height: 844 },
  { width: 1440, height: 1000 },
]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`replay controls stay anchored across hand changes at ${viewport.width} in ${colorScheme}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme });
      await page.addInitScript((scheme) => {
        document.documentElement.classList.toggle("dark", scheme === "dark");
      }, colorScheme);
      await page.goto("/e2e/replay-harness.html");
      await page.getByLabel("Open replay file").setInputFiles({
        name: "layout.aegis-replay",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(replayFixture())),
      });
      const controls = page.getByRole("group", { name: "Replays", exact: true });
      await expect(page.getByTestId("hand")).toBeVisible();
      const original = await controls.boundingBox();
      const handle = page.getByRole("button", { name: "Move playback controls", exact: true });
      const grip = await handle.boundingBox();
      await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2);
      await page.mouse.down();
      await page.mouse.move(grip!.x + grip!.width / 2 + 120, grip!.y + grip!.height / 2 - 160, { steps: 8 });
      await page.mouse.up();
      await expect.poll(async () => (await controls.boundingBox())?.y).toBeCloseTo(original!.y - 160, 0);
      const initial = await controls.boundingBox();
      expect(initial).not.toBeNull();
      await page.getByRole("button", { name: "Next action", exact: true }).click();
      await expect(page.getByRole("slider", { name: "Replay position" })).toHaveValue("1");
      await expect(page.getByTestId("hand")).toHaveCount(0);
      await expect.poll(async () => (await controls.boundingBox())?.y).toBeCloseTo(initial!.y, 0);
      await expect.poll(async () => (await controls.boundingBox())?.height).toBeCloseTo(initial!.height, 0);
      await page.getByLabel("Playback options", { exact: true }).click();
      await page.getByRole("button", { name: "Flip board", exact: true }).click();
      await expect.poll(async () => (await controls.boundingBox())?.y).toBeCloseTo(initial!.y, 0);
      const final = await controls.boundingBox();
      expect(final!.x).toBeGreaterThanOrEqual(0);
      expect(final!.x + final!.width).toBeLessThanOrEqual(viewport.width);
      expect(final!.y + final!.height).toBeLessThanOrEqual(viewport.height);
      const board = await page.locator(".replay-player__body").boundingBox();
      expect(board!.height).toBe(viewport.height);
      await page.getByLabel("Playback options", { exact: true }).click();
      await handle.focus();
      await page.keyboard.press("ArrowDown");
      await expect.poll(async () => (await controls.boundingBox())?.y).toBeCloseTo(initial!.y + 16, 0);
      await page.keyboard.press("Home");
      await expect.poll(async () => (await controls.boundingBox())?.y).toBeCloseTo(original!.y, 0);
      await page.keyboard.press("Shift+ArrowRight");
      await page.getByLabel("Playback options", { exact: true }).click();
      await page.setViewportSize({ width: 320, height: 390 });
      await expect
        .poll(async () => {
          const bounds = await controls.boundingBox();
          return bounds!.x + bounds!.width;
        })
        .toBeLessThanOrEqual(320);
      await expect
        .poll(async () => {
          const bounds = await controls.boundingBox();
          return bounds!.y + bounds!.height;
        })
        .toBeLessThanOrEqual(390);
      const settings = page.locator(".replay-controls__settings");
      await expect(settings).toBeVisible();
      const popup = await settings.boundingBox();
      expect(popup!.x).toBeGreaterThanOrEqual(0);
      expect(popup!.y).toBeGreaterThanOrEqual(0);
      expect(popup!.x + popup!.width).toBeLessThanOrEqual(320);
      expect(popup!.y + popup!.height).toBeLessThanOrEqual(390);
    });
  }
}
