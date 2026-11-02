#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const { chromium } = createRequire(new URL("../../apps/web/package.json", import.meta.url))("@playwright/test");
const { values } = parseArgs({ options: { base: { type: "string", default: "http://localhost:5174" } } });
const output = new URL("../../.local/motion-reference/aegis-field-shatter/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [320, 768, 1024, 1440]) {
    for (const speed of ["normal", "fast"]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.addInitScript((setting) => {
          localStorage.setItem("aegis:locale", "en");
          localStorage.setItem("aegis.effect-speed", setting);
        }, speed);
        await page.goto(new URL("/dev/arena?mode=visual", values.base).href);
        await page.getByRole("button", { name: "Demo tools", exact: true }).waitFor();
        await page.locator(".game-battle-row .game-permanent").evaluateAll(async (cards) => {
          await Promise.all(cards.flatMap((card) => [...card.querySelectorAll("img")].map((image) => image.decode())));
          await Promise.all(
            cards.flatMap((card) =>
              card
                .getAnimations({ subtree: true })
                .filter((animation) => animation.effect.getComputedTiming().iterations !== Infinity)
                .map((animation) => animation.finished.catch(() => {})),
            ),
          );
        });
        await page.evaluate(() => {
          const capture = (window.aegisShatter = { rows: [], complete: false });
          const originals = new Map();
          const readRect = Element.prototype.getBoundingClientRect;
          Element.prototype.getBoundingClientRect = function () {
            const rect = readRect.call(this);
            if (this.matches(".game-card-enter > [data-state]") && this.closest(".game-battle-row")) {
              const permanent = this.closest(".game-permanent");
              originals.set(permanent.dataset.permanentId, {
                rect: rect.toJSON(),
                image: this.querySelector("img")?.currentSrc,
                rotation: getComputedStyle(this).rotate,
                border: getComputedStyle(this).border,
              });
            }
            return rect;
          };
          let active = false;
          function sample() {
            for (const card of document.querySelectorAll(".game-battle-row .game-permanent")) {
              const face = card.querySelector(".game-card-enter > [data-state]");
              if (face)
                originals.set(card.dataset.permanentId, {
                  rect: face.getBoundingClientRect().toJSON(),
                  image: face.querySelector("img")?.currentSrc,
                  rotation: getComputedStyle(face).rotate,
                  border: getComputedStyle(face).border,
                });
            }
            const roots = [...document.querySelectorAll("[data-field-shatter]")];
            for (const root of roots) {
              active = true;
              const shards = [...root.querySelectorAll(".game-field-shatter__shard")];
              const face = shards[0]?.querySelector(".game-field-shatter__face > *");
              const clocks = shards.flatMap((shard) => shard.getAnimations());
              const light = root.querySelector(".battle-burst");
              const original = [...originals.values()].find(
                (entry) => entry.image === face?.querySelector("img")?.currentSrc,
              );
              capture.rows.push({
                key: root.dataset.fieldShatter,
                time: clocks[0]?.currentTime,
                duration: clocks[0]?.effect.getTiming().duration,
                ages: clocks.map((clock) => clock.currentTime),
                count: shards.length,
                original,
                root: root.getBoundingClientRect().toJSON(),
                border: face && getComputedStyle(face).border,
                image: face?.querySelector("img")?.currentSrc,
                rotates: shards.map((shard) => getComputedStyle(shard).rotate),
                scales: shards.map((shard) => getComputedStyle(shard).scale),
                opacity: shards.map((shard) => Number(getComputedStyle(shard).opacity)),
                translation: shards.map((shard) => getComputedStyle(shard).translate),
                end: shards.map((shard) => ({
                  x:
                    (parseFloat(shard.style.getPropertyValue("--field-shard-x")) / 100) *
                    parseFloat(getComputedStyle(shard).width),
                  y:
                    (parseFloat(shard.style.getPropertyValue("--field-shard-y")) / 100) *
                    parseFloat(getComputedStyle(shard).height),
                })),
                lightBase: light && getComputedStyle(light).getPropertyValue("--battle-burst-base").trim(),
                lightEdge: light && getComputedStyle(light).getPropertyValue("--battle-burst-edge").trim(),
                ring: !!root.querySelector(".game-delete-burst--effect"),
                overflow: document.documentElement.scrollWidth > innerWidth,
                interactive: !!root.querySelector("[tabindex], [data-drop]"),
              });
            }
            if (active && !roots.length) {
              Element.prototype.getBoundingClientRect = readRect;
              capture.complete = true;
              return;
            }
            requestAnimationFrame(sample);
          }
          requestAnimationFrame(sample);
        });
        await page.getByRole("button", { name: "Demo tools", exact: true }).click();
        await page.getByRole("menuitem", { name: "Preview activation: On Deletion", exact: true }).click();
        await page.waitForFunction(() => window.aegisShatter.complete);
        const capture = await page.evaluate(() => window.aegisShatter);
        await writeFile(new URL("last-case.json", output), JSON.stringify({ width, speed, capture, errors }, null, 2));
        assert.deepEqual(errors, []);
        assert.ok(capture.rows.length > 5);
        const moving = capture.rows.filter((row) => row.time > 0 && row.time < 250);
        assert.ok(moving.some((row) => row.time < 100) && moving.some((row) => row.time > 100));
        assert.ok(
          capture.rows.some((row) => row.time >= 250 && row.opacity.every((opacity) => opacity === 0)),
          "final clock was cut short",
        );
        for (const row of capture.rows) {
          assert.equal(row.count, 41);
          assert.equal(row.duration, 250);
          assert.ok(row.original, "physical source artwork missing");
          assert.equal(row.image, row.original.image);
          assert.equal(row.border, row.original.border);
          assert.equal(row.lightBase, "#ffffff");
          assert.notEqual(row.lightEdge, "#3ddc84");
          assert.ok(!row.overflow && !row.interactive && !row.ring);
          assert.ok(row.rotates.every((rotate) => rotate === "none") && row.scales.every((scale) => scale === "none"));
          assert.ok(row.ages.every((time) => Math.abs(time - row.time) < 0.01));
          for (const key of ["x", "y", "width", "height"])
            assert.ok(Math.abs(row.root[key] - row.original.rect[key]) < 0.2, `physical ${key} jumped`);
          const expectedOpacity = Math.max(0, Math.min(1, (250 - row.time) / 150));
          assert.ok(
            row.opacity.every((opacity) => Math.abs(opacity - expectedOpacity) < 0.01),
            `fragment fade disagrees with its clock at ${row.time}ms`,
          );
          const progress = row.time < 100 ? row.time / 3100 : Math.min(1, (100 + (row.time - 100) * 20) / 3100);
          row.translation.forEach((translate, index) => {
            const components = translate
              .split(" ")
              .map(
                (value, axis) =>
                  parseFloat(value) * (value.endsWith("%") ? (axis ? row.root.height : row.root.width) / 100 : 1),
              );
            assert.ok(Math.abs(components[0] - row.end[index].x * progress) < 0.2);
            assert.ok(Math.abs(components[1] - row.end[index].y * progress) < 0.2);
          });
        }
        results.push({ width, speed, capture });
        console.log(
          `${width}px ${speed}: 41 simultaneous fragments, physical face, acceleration, fade and cleanup passed`,
        );
      } finally {
        await page.close();
      }
    }
  }
  for (const width of [320, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.addInitScript(() => localStorage.setItem("aegis:locale", "en"));
      await page.goto(new URL("/dev/arena?mode=visual", values.base).href);
      await page.getByRole("button", { name: "Demo tools", exact: true }).waitFor();
      await page.evaluate(() => {
        window.aegisReducedShatter = { observed: false };
        const observer = new MutationObserver(() => {
          if (document.querySelector(".game-field-shatter")) window.aegisReducedShatter.observed = true;
        });
        observer.observe(document.querySelector(".game-board"), { subtree: true, childList: true });
        window.aegisReducedShatter.observer = observer;
      });
      await page.getByRole("button", { name: "Demo tools", exact: true }).click();
      await page.getByRole("menuitem", { name: "Preview activation: On Deletion", exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('.game-permanent[data-permanent-id="you-chronomon"]'));
      assert.equal(await page.evaluate(() => window.aegisReducedShatter.observed), false);
      await page.evaluate(async () => {
        window.aegisReducedShatter.observer.disconnect();
        const { createElement } = (await import("/node_modules/.vite/deps/react.js")).default;
        const { createRoot } = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
        const { FieldCardShatter } = await import("/src/game/FieldCardShatter.tsx");
        const host = document.createElement("div");
        document.querySelector(".game-board").append(host);
        window.aegisRetainedShatter = createRoot(host);
        window.aegisRetainedShatter.render(
          createElement(FieldCardShatter, {
            cardId: "BT26-016",
            color: "Red",
            face: { x: 0, y: 0, width: 44, height: 62, angle: 0 },
          }),
        );
      });
      await page.locator(".game-field-shatter").waitFor({ state: "attached" });
      const retained = await page.locator(".game-field-shatter").evaluate((element) => ({
        display: getComputedStyle(element).display,
        clocks: element.getAnimations({ subtree: true }).length,
      }));
      assert.deepEqual(retained, { display: "none", clocks: 0 });
      assert.deepEqual(errors, []);
      await page.evaluate(() => window.aegisRetainedShatter.unmount());
      results.push({ width, reduced: true, naturalAndRetained: true, retained });
      console.log(`${width}px reduced: natural departure and retained renderer have no decorative shatter/clock`);
    } finally {
      await page.close();
    }
  }
  for (const width of [320, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      await page.goto(new URL("/dev/arena?mode=visual", values.base).href);
      await page.locator(".game-board").waitFor();
      for (const planeScale of [0.5, 0.86])
        for (const planeAngle of [0, 90])
          for (const planeFallback of [false, true]) {
            const planeResult = await page.evaluate(
              async ({ scale, angle, fallback }) => {
                const { createElement } = (await import("/node_modules/.vite/deps/react.js")).default;
                const { createRoot } = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
                const { captureFieldShatterFace } = await import("/src/game/fieldShatter.ts");
                const { FieldCardShatter } = await import("/src/game/FieldCardShatter.tsx");
                const board = document.querySelector(".game-board");
                const source = document.createElement("div");
                source.className = "game-permanent";
                Object.assign(source.style, {
                  position: "absolute",
                  left: "30px",
                  top: "140px",
                  transform: `scale(${scale}) rotate(${angle}deg)`,
                });
                const enter = document.createElement("div");
                enter.className = "game-card-enter";
                enter.style.animation = "none";
                const face = document.createElement("div");
                face.dataset.state = "active";
                Object.assign(face.style, {
                  width: "100px",
                  height: "140px",
                  position: "relative",
                  boxSizing: "border-box",
                  overflow: "hidden",
                  border: "2px solid red",
                });
                const art = document.createElement(fallback ? "div" : "img");
                Object.assign(art.style, { width: "100px", height: "140px" });
                if (fallback) art.textContent = "Printed fallback";
                else art.src = board.querySelector(".game-permanent img").currentSrc;
                face.append(art);
                enter.append(face);
                source.append(enter);
                board.append(source);
                if (!fallback) await art.decode();
                const original = art.getBoundingClientRect().toJSON();
                const pose = captureFieldShatterFace(source, board);
                const host = document.createElement("div");
                Object.assign(host.style, {
                  position: "absolute",
                  left: `${pose.x - pose.width / 2}px`,
                  top: `${pose.y - pose.height / 2}px`,
                  width: `${pose.width}px`,
                  height: `${pose.height}px`,
                  rotate: `${pose.angle}deg`,
                });
                board.append(host);
                const root = createRoot(host);
                root.render(createElement(FieldCardShatter, { cardId: "BT26-016", color: "Red", face: pose }));
                for (let frame = 0; frame < 8 && !host.querySelector(".game-field-shatter__face > *"); frame++)
                  await new Promise(requestAnimationFrame);
                const copied = host.querySelector(".game-field-shatter__face > * > *");
                const actual = copied.getBoundingClientRect().toJSON();
                const result = {
                  original,
                  actual,
                  fallback,
                  text: copied.textContent,
                  inert: host.querySelector(".game-field-shatter__face > *").inert,
                };
                root.unmount();
                host.remove();
                source.remove();
                return result;
              },
              { scale: planeScale, angle: planeAngle, fallback: planeFallback },
            );
            assert.ok(Math.abs(planeResult.original.width - planeResult.actual.width) < 0.02);
            assert.ok(Math.abs(planeResult.original.height - planeResult.actual.height) < 0.02);
            assert.ok(planeResult.inert);
            if (planeFallback) assert.equal(planeResult.text, "Printed fallback");
            results.push({
              width,
              scale: planeScale,
              angle: planeAngle,
              fallback: planeFallback,
              syntheticPhysicalPlane: true,
              result: planeResult,
            });
          }
      console.log(`${width}px: eight scaled/rotated decoded/fallback physical-plane probes passed`);
    } finally {
      await page.close();
    }
  }
  // Separately sought poses are visual inspection artifacts, not natural-clock evidence.
  for (const width of [320, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      await page.addInitScript(() => localStorage.setItem("aegis:locale", "en"));
      await page.goto(new URL("/dev/arena?mode=visual", values.base).href);
      await page.getByRole("button", { name: "Demo tools", exact: true }).click();
      await page.getByRole("menuitem", { name: "Preview activation: On Deletion", exact: true }).click();
      await page.locator(".game-field-shatter").waitFor({ state: "attached" });
      await page.locator(".game-field-shatter").evaluate((root) => {
        for (const animation of root.getAnimations({ subtree: true })) {
          animation.pause();
          animation.currentTime = 100;
        }
      });
      await page.screenshot({ path: new URL(`pose-${width}-100.png`, output).pathname });
    } finally {
      await page.close();
    }
  }
  await writeFile(
    new URL("capture.json", output),
    JSON.stringify(
      {
        results,
        note: "Eight natural Arena cases, four natural/retained reduced-motion cases and16 synthetic physical-plane regressions. PNGs seek100ms separately. Authored mesh/timing and physical Aegis face verified. Planar spread and retained Aegis light remain adaptations; source physics/camera/material parity is unproven.",
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
