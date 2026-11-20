import type { Page, TestInfo } from "@playwright/test";
import fixture from "@api-fixtures/crowded-field-touch-access.fixture";
import { expect, test } from "@e2e/device-page";
import type {} from "@e2e/harness";

type FrameReport = {
  fps: number;
  frames: number;
  p50FrameMs: number;
  p95FrameMs: number;
  worstFrameMs: number;
  longFrames: number;
  longTasks: number;
  longTaskMs: number;
  canvasFps: number;
  slowFrames: SlowFrame[];
};

type SlowFrame = { durationMs: number; styleAndLayoutMs: number; scripts: string[] };

type LongAnimationFrame = PerformanceEntry & {
  styleAndLayoutStart: number;
  scripts: {
    duration: number;
    forcedStyleAndLayoutDuration: number;
    invoker: string;
    sourceFunctionName: string;
    sourceURL: string;
    sourceCharPosition: number;
  }[];
};

type ProbeWindow = Window & { aegisDeviceProbe?: { stop(): FrameReport } };

const tracing = process.env.AEGIS_DEVICE_TRACE === "1";
const cpuThrottle = Number(process.env.AEGIS_PERF_CPU_THROTTLE ?? 1);
const arenaQuality = process.env.AEGIS_DEVICE_ARENA_QUALITY ?? "auto";

function startProbe() {
  const deltas: number[] = [];
  let longTasks = 0;
  let longTaskMs = 0;
  let running = true;
  let last = 0;
  const startedAt = performance.now();
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      longTasks += 1;
      longTaskMs += entry.duration;
    }
  });
  observer.observe({ type: "longtask" });
  const slowFrames: SlowFrame[] = [];
  const frameObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as unknown as LongAnimationFrame[]) {
      if (entry.duration < 100) continue;
      slowFrames.push({
        durationMs: Math.round(entry.duration),
        styleAndLayoutMs: Math.round(entry.startTime + entry.duration - entry.styleAndLayoutStart),
        scripts: [...entry.scripts]
          .sort((a, b) => b.duration - a.duration)
          .slice(0, 3)
          .map(
            (script) =>
              `${Math.round(script.duration)}ms forced=${Math.round(script.forcedStyleAndLayoutDuration)} ${script.invoker} ${script.sourceFunctionName}@${script.sourceURL.split("/").pop()}:${script.sourceCharPosition}`,
          ),
      });
    }
  });
  frameObserver.observe({ type: "long-animation-frame" });
  let canvasFrames = 0;
  const originalClear = WebGL2RenderingContext.prototype.clear;
  WebGL2RenderingContext.prototype.clear = function clear(mask) {
    canvasFrames += 1;
    originalClear.call(this, mask);
  };
  const tick = (now: number) => {
    if (!running) return;
    if (last) deltas.push(now - last);
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  (window as ProbeWindow).aegisDeviceProbe = {
    stop() {
      running = false;
      observer.disconnect();
      frameObserver.disconnect();
      WebGL2RenderingContext.prototype.clear = originalClear;
      const sorted = [...deltas].sort((a, b) => a - b);
      const percentile = (ratio: number) =>
        Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0);
      return {
        fps: Math.round((deltas.length / (performance.now() - startedAt)) * 1000),
        frames: deltas.length,
        p50FrameMs: percentile(0.5),
        p95FrameMs: percentile(0.95),
        worstFrameMs: Math.round(sorted.at(-1) ?? 0),
        longFrames: deltas.filter((delta) => delta > 50).length,
        longTasks,
        longTaskMs: Math.round(longTaskMs),
        canvasFps: Math.round((canvasFrames / (performance.now() - startedAt)) * 1000),
        slowFrames,
      };
    },
  };
}

async function measure(page: Page, info: TestInfo, surface: string, action: () => Promise<void>, minimumMs = 3000) {
  const browser = page.context().browser();
  const tracePath = info.outputPath(`${surface.replace("/", "-")}.trace.json`);
  if (tracing && browser) await browser.startTracing(page, { path: tracePath });
  await page.evaluate(startProbe);
  const startedAt = Date.now();
  await action();
  const remainingMs = minimumMs - (Date.now() - startedAt);
  if (remainingMs > 0) await page.evaluate((ms) => new Promise((resolve) => setTimeout(resolve, ms)), remainingMs);
  const report = await page.evaluate(() => (window as ProbeWindow).aegisDeviceProbe!.stop());
  expect(await page.evaluate(() => document.visibilityState), "keep Chrome open on the phone").toBe("visible");
  if (tracing && browser) await browser.stopTracing();
  const body = JSON.stringify({ surface, ...report });
  console.log(`[device-perf] ${body}`);
  await info.attach(surface, { body, contentType: "application/json" });
}

for (const boardStyle of ["classic", "arena3d"] as const) {
  test(`crowded board stays responsive on the connected phone in ${boardStyle}`, async ({ scenario, page }, info) => {
    test.setTimeout(300_000);
    await page.addInitScript(
      ([style, quality]) => {
        localStorage.setItem("aegis.board-style", style);
        localStorage.setItem("aegis.arena-3d-quality", quality);
      },
      [boardStyle, arenaQuality],
    );
    await expect
      .poll(() => page.evaluate(() => document.visibilityState), "keep Chrome open on the phone")
      .toBe("visible");
    const refs = await scenario.openFixture(fixture);
    await scenario.idle(30_000);
    if (cpuThrottle > 1) {
      const session = await page.context().newCDPSession(page);
      await session.send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle });
    }
    const attacker = page.locator(`[data-drop="perm-you"][data-id="${refs.permanentId("attacker-1")}"]`);
    const attack = page.getByRole("button", { name: "Attack", exact: true });

    await measure(page, info, `${boardStyle}/idle`, async () => {}, 5000);

    await measure(page, info, `${boardStyle}/select-permanent`, async () => {
      await attacker.click();
      await expect(attack).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(attack).toHaveCount(0);
    });

    if (boardStyle === "classic") {
      await measure(page, info, `${boardStyle}/scroll-lane`, () =>
        page.getByRole("group", { name: "Your Digimon", exact: true }).evaluate(async (lane) => {
          for (let step = 0; step < 90; step += 1) {
            lane.scrollLeft = Math.abs(Math.sin(step / 15)) * (lane.scrollWidth - lane.clientWidth);
            await new Promise((resolve) => requestAnimationFrame(resolve));
          }
        }),
      );
    }

    const dragged = page.locator(`[data-drop="perm-you"][data-id="${refs.permanentId("attacker-2")}"]`);
    await dragged.scrollIntoViewIfNeeded();
    const start = (await dragged.boundingBox())!;
    const origin = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
    await measure(page, info, `${boardStyle}/drag-permanent`, async () => {
      await page.mouse.move(origin.x, origin.y);
      await page.mouse.down();
      for (let step = 1; step <= 40; step += 1) {
        const lift = Math.sin((step / 40) * Math.PI) * 220;
        await page.mouse.move(origin.x + Math.sin(step / 6) * 40, origin.y - lift);
      }
      await page.mouse.move(origin.x, origin.y);
      await page.mouse.up();
    });
    expect(
      await page.evaluate(
        (permanentId) =>
          window.browserTestSnapshot().players[0]!.battleArea.find((permanent) => permanent.permanentId === permanentId)
            ?.isSuspended,
        refs.permanentId("attacker-2"),
      ),
      "the drag returns the Digimon without attacking",
    ).toBe(false);
    await page.keyboard.press("Escape");

    await measure(page, info, `${boardStyle}/attack-security`, async () => {
      await scenario.attack(refs.permanentId("attacker-1"));
      await page.waitForFunction(
        () => {
          const state = window.browserTestSnapshot();
          return (
            state.players[1]!.securityCount === 4 &&
            !state.pendingDecision &&
            !state.combatWindow &&
            window.browserTestPresentation().idle
          );
        },
        undefined,
        { polling: 500, timeout: 60_000 },
      );
    });

    await measure(
      page,
      info,
      `${boardStyle}/opponent-turn`,
      async () => {
        await page.getByRole("button", { name: /^end turn$/i }).click();
        await page.waitForFunction(
          (turnCount) => {
            const state = window.browserTestSnapshot();
            return state.gameOver || state.turnCount > turnCount + 1;
          },
          fixture.turnCount,
          { polling: 500, timeout: 60_000 },
        );
      },
      10_000,
    );
  });
}
