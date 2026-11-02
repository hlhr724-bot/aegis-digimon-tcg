import { gzipSync } from "node:zlib";
import { test, expect, type Page } from "@playwright/test";
import { drawReplayFixture, replayFixture, securityReplayFixture } from "../test/replays/fixture";

class ReplayPage {
  constructor(readonly page: Page) {}
  async open(recording = replayFixture()) {
    await this.page.route("**/auth/me", (route) => route.fulfill({ contentType: "application/json", body: "null" }));
    await this.page.goto("/profile");
    await this.page.getByLabel("Open replay file").setInputFiles({
      name: "match.aegis-replay",
      mimeType: "application/gzip",
      buffer: gzipSync(JSON.stringify(recording)),
    });
    await expect(this.page.getByRole("heading", { name: "Agumon Player vs Gabumon Player" })).toBeVisible();
    await this.page.getByLabel("Playback options", { exact: true }).click();
  }
  position() {
    return this.page.getByRole("slider", { name: "Replay position" });
  }
}

for (const viewport of [
  { width: 320, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 1000 },
  { width: 844, height: 390 },
]) {
  test(`offline file playback and controls at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const sockets: string[] = [];
    const pageErrors: string[] = [];
    page.on(
      "websocket",
      (socket) =>
        new URL(socket.url()).port !== (process.env.AEGIS_E2E_WEB_PORT ?? "4175") && sockets.push(socket.url()),
    );
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const replay = new ReplayPage(page);
    await replay.open();
    await expect(replay.position()).toHaveValue("0");
    if (viewport.width >= 1024) {
      const controls = await page.locator(".replay-controls").boundingBox();
      expect(controls!.y + controls!.height).toBeLessThanOrEqual(viewport.height);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    }

    await expect(page.getByTestId("hand").getByRole("button", { name: /Agumon/i })).toBeVisible();
    await page.getByLabel("Recorded hand", { exact: true }).selectOption("hide");
    await expect(page.getByTestId("hand")).toHaveCount(0);
    await page.getByLabel("Recorded hand", { exact: true }).selectOption("show");
    await expect(page.getByTestId("hand").getByRole("button", { name: /Agumon/i })).toBeVisible();
    await page.getByRole("button", { name: "Next action", exact: true }).click();
    await expect(replay.position()).toHaveValue("1");
    await expect(page.locator('.game-permanent[data-permanent-id="agumon"]')).toBeVisible();
    await page.getByRole("button", { name: "Previous action", exact: true }).click();
    await expect(replay.position()).toHaveValue("0");
    await expect(page.locator('.game-permanent[data-permanent-id="agumon"]')).toHaveCount(0);
    await page.getByLabel("Turn", { exact: true }).selectOption("2");
    await expect(replay.position()).toHaveValue("2");
    await page.getByRole("button", { name: "Go to end", exact: true }).click();
    await expect(page.getByText("Replay finished", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next action", exact: true })).toBeDisabled();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Go to start", exact: true }).click();
    await expect(replay.position()).toHaveValue("0");
    const next = page.getByRole("button", { name: "Next action", exact: true });
    await next.scrollIntoViewIfNeeded();
    const bounds = await next.boundingBox();
    expect(bounds).toBeTruthy();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    expect(sockets).toEqual([]);
    expect(pageErrors).toEqual([]);
    await page.screenshot({ path: `test-results/replay-${viewport.width}x${viewport.height}.png`, fullPage: true });
  });
}

test("autoplay, pause, speed and restart from the final frame", async ({ page }) => {
  const replay = new ReplayPage(page);
  await replay.open();
  await page.getByLabel("Playback speed").selectOption("4");
  await page.locator(".replay-controls").getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => replay.position().inputValue()).not.toBe("0");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const pausedPosition = await replay.position().inputValue();
  await page.getByLabel("Playback speed").selectOption("0.5");
  // This wait verifies elapsed playback cannot move a paused cursor; it is not used to synchronize a page action.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 650)));
  await expect(replay.position()).toHaveValue(pausedPosition);
  await page.getByRole("button", { name: "Go to end", exact: true }).click();
  await page.locator(".replay-controls").getByRole("button", { name: "Play", exact: true }).click();
  await expect(replay.position()).toHaveValue("0");
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
});

test("rejects malformed files and permits selecting the same file again", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ contentType: "application/json", body: "null" }));
  await page.goto("/replays");
  await expect(page).toHaveURL(/\/profile$/);
  const input = page.getByLabel("Open replay file");
  const badFile = { name: "invalid.json", mimeType: "application/json", buffer: Buffer.from("{broken") };
  await input.setInputFiles(badFile);
  await expect(page.locator(".profile-guest-replays").getByRole("alert")).toHaveText(
    "This file is not a valid, complete Aegis replay.",
  );
  await input.setInputFiles(badFile);
  await expect(page.locator(".profile-guest-replays").getByRole("alert")).toHaveText(
    "This file is not a valid, complete Aegis replay.",
  );
  await input.setInputFiles({
    name: "old.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"format":"aegis-replay","version":999}'),
  });
  await expect(page.locator(".profile-guest-replays").getByRole("alert")).toHaveText(
    "This replay uses a format this version of Aegis cannot open.",
  );
});

test("autoplay presents a drawn card and ordinary pointer inspection stays read-only", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const replay = new ReplayPage(page);
  await replay.open(drawReplayFixture());
  await page.getByLabel("Playback speed").selectOption("4");
  await page.locator(".replay-controls").getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByText("Replay finished", { exact: true })).toBeVisible();
  const drawn = page.getByTestId("hand").getByRole("button", { name: /Agumon/i });
  await expect(drawn).toBeVisible();
  await drawn.click();
  await expect(page.getByRole("dialog", { name: "Agumon Expert", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("hand").getByRole("button", { name: /Agumon/i })).toBeVisible();
  expect(errors).toEqual([]);
});

test("autoplay resolves a security battle after its attacker has left the recorded board", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const replay = new ReplayPage(page);
  await replay.open(securityReplayFixture());
  await expect(page.locator('.game-permanent[data-permanent-id="agumon"]')).toBeVisible();
  await page.getByLabel("Playback speed").selectOption("4");
  await page.locator(".replay-controls").getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByText("Replay finished", { exact: true })).toBeVisible();
  await expect(page.locator('.game-permanent[data-permanent-id="agumon"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
