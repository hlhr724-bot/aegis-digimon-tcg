import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { replayFixture, securityReplayFixture } from "../test/replays/fixture";

for (const width of [320, 1440]) {
  for (const scheme of ["light", "dark"] as const) {
    test(`timeline seeks to turns and security removals at ${width} in ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: scheme });
      await page.addInitScript((theme) => {
        document.documentElement.classList.toggle("dark", theme === "dark");
      }, scheme);
      await page.goto("/e2e/replay-harness.html");
      await page.getByLabel("Open replay file").setInputFiles({
        name: "security.aegis-replay",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(securityReplayFixture())),
      });
      const position = page.getByRole("slider", { name: "Replay position" });
      const turn = page.getByRole("button", { name: "Turn 1 · Agumon Player · Action 1", exact: true });
      await expect(turn).toBeVisible();
      const marker = page.getByRole("button", { name: "Gabumon Player: 1 security removed · Action 3", exact: true });
      await marker.click();
      await expect(position).toHaveValue("2");
      const security = page.getByRole("button", { name: "Go to action 3", exact: true });
      await expect(security).toBeFocused();
      await expect(page.locator(".replay-timeline__event > span")).toHaveText(
        "Turn 2 · Combat resolved. Agumon deleted",
      );
      await security.click();
      await expect(position).toHaveValue("2");
      await expect(marker).toBeFocused();
      await page.getByRole("button", { name: "Next action", exact: true }).click();
      await expect(position).toHaveValue("3");
      await page.getByRole("button", { name: "Previous action", exact: true }).click();
      await expect(position).toHaveValue("2");
      await marker.focus();
      await page.keyboard.press("Enter");
      await expect(security).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(security).toHaveCount(0);
      await expect(marker).toBeFocused();
      const move = page.getByRole("button", { name: "Move playback controls", exact: true });
      await move.focus();
      for (let step = 0; step < 20; step++) {
        await page.keyboard.press("Shift+ArrowUp");
      }
      await marker.click();
      await expect(security).toBeVisible();
      const eventBounds = await security.boundingBox();
      expect(eventBounds!.y).toBeGreaterThanOrEqual(0);
      expect(eventBounds!.y + eventBounds!.height).toBeLessThanOrEqual(900);
      await page.keyboard.press("Escape");
      await move.focus();
      await page.keyboard.press("Home");
      await turn.click();
      await expect(position).toHaveValue("0");
      await expect(turn).toHaveAttribute("aria-current", "step");
      await page.getByRole("button", { name: "Turn 2 · Gabumon Player · Action 3", exact: true }).click();
      await expect(position).toHaveValue("2");
      const controls = page.getByRole("group", { name: "Replays", exact: true });
      const bounds = await controls.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      const captures = resolve(process.cwd(), "../../.local/captures");
      mkdirSync(captures, { recursive: true });
      await controls.screenshot({ path: resolve(captures, `replay-timeline-${width}-${scheme}.png`) });
    });
  }
}

test("a marker pauses autoplay and ordinary playback resumes from the selected event", async ({ page }) => {
  await page.goto("/e2e/replay-harness.html");
  await page.getByLabel("Open replay file").setInputFiles({
    name: "turns.aegis-replay",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(replayFixture())),
  });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Turn 2 · Gabumon Player · Action 3", exact: true }).click();
  const position = page.getByRole("slider", { name: "Replay position" });
  await expect(position).toHaveValue("2");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(position).toHaveValue("3");
  await expect(page.getByText("Replay finished", { exact: true })).toBeVisible();
});

test("dragging the playhead scrubs across turn segments", async ({ page }) => {
  await page.goto("/e2e/replay-harness.html");
  await page.getByLabel("Open replay file").setInputFiles({
    name: "turns.aegis-replay",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(replayFixture())),
  });
  const position = page.getByRole("slider", { name: "Replay position" });
  const bounds = (await position.boundingBox())!;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(bounds.x + 8, y);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width - 8, y, { steps: 8 });
  await page.mouse.up();
  await expect(position).toHaveValue("3");
});

test("event jumps and next action animate while slider jumps cut directly", async ({ page }) => {
  await page.goto("/e2e/replay-harness.html");
  await page.getByLabel("Open replay file").setInputFiles({
    name: "security.aegis-replay",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(securityReplayFixture())),
  });
  const position = page.getByRole("slider", { name: "Replay position" });
  const startedSteps = () =>
    page.evaluate(
      () =>
        (window as unknown as { replayEvidence: () => { steps: { phase: string }[] } })
          .replayEvidence()
          .steps.filter((step) => step.phase === "started").length,
    );
  await position.fill("3");
  await expect(position).toHaveValue("3");
  const afterCut = await startedSteps();
  await page.getByRole("button", { name: "Gabumon Player: 1 security removed · Action 3", exact: true }).click();
  await expect(position).toHaveValue("2");
  await expect.poll(startedSteps).toBeGreaterThan(afterCut);
  const afterJump = await startedSteps();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Next action", exact: true }).click();
  await expect(position).toHaveValue("3");
  await expect.poll(startedSteps).toBeGreaterThan(afterJump);
});
