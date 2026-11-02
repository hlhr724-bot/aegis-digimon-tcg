import { startBrowserServer } from "./server";
import { CATALOG_DECKS } from "@aegis/shared";
import type { ScenarioFixture } from "../../api/src/engine/scenario/types";
import { PHASE_PACING_SCENARIOS } from "../../api/src/engine/scenarios/phase-pacing.cases";
import {
  KEYWORD_PACING_SCENARIOS,
  KEYWORD_TURN_PACING_SCENARIOS,
  KEYWORD_PROTECTION_PACING_SCENARIOS,
  KEYWORD_STACK_PACING_SCENARIOS,
  KEYWORD_DECK_PACING_SCENARIOS,
  KEYWORD_ATTACK_PACING_SCENARIOS,
  KEYWORD_END_ATTACK_PACING_SCENARIOS,
  type KeywordPacingScenario,
} from "../../api/src/engine/scenarios/keyword-pacing.cases";

import fixtureOpponentChain from "../../api/src/engine/scenarios/opponent-chain.fixture";
import fixtureKeywordPacingVortexDecline from "../../api/src/engine/scenarios/keyword-pacing-vortex-decline.fixture";
import fixtureFieldGrouping from "../../api/src/engine/scenarios/field-grouping.fixture";
import fixtureOpponentPlay from "../../api/src/engine/scenarios/opponent-play.fixture";
import fixtureDrasilOptionalEffectPresets from "../../api/src/engine/scenarios/drasil-optional-effect-presets.fixture";
import { fixtureVariant, fixturePermanentId } from "../../api/src/engine/scenario/references";
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { GamePage } from "./game-page";
import { SPOTLIGHT_PADDING_PX, SPOTLIGHT_RADIUS_PX } from "../src/game/spotlight";
import { DEFAULT_PACING } from "../src/game/pacing";
import { getCardDefinition } from "@aegis/shared";
import { startPacingCapture, finishPacingCapture } from "./pacing-capture";
import { installAudioCapture, readAudioCapture } from "./audio-capture";
import { answerActivation, openFixturePage } from "./scenario-page";
import fixtureInterleavedFieldGrouping from "../../api/src/engine/scenarios/field-grouping-bt1-088-p-035.fixture";
import { MAX_SOUND_VOICES } from "../src/design/sound";
import { AUDIO_CUES } from "../src/design/audioBank";
import { cueKey } from "../src/design/audioRecipes";

test.use({ channel: "chromium" });

/* A paced chain must keep moving in a real browser. The jsdom pacing harness replays the
   same scenarios on a fake clock, but a wait cycle between presentation steps only closes
   under the browser's own timing, so this drives the effects lab and watches the queue's
   trace. A queue that still owes steps and has not queued, started or
   finished one for STALL_MS is wedged; server batches alone do not count as progress. */

let labServer: Awaited<ReturnType<typeof startBrowserServer>>;

const STALL_MS = 10_000;
const LAB_KEY = "__aegisEffectsLab";

interface LabState {
  pendingSteps: number;
  queueIdle: boolean;
  steps: {
    key: string;
    stepId: string;
    track: string;
    phase: string;
    at: number;
    failed: boolean;
    cancelled: boolean;
    timing?: string;
    sourceCardId?: string;
    batchId?: string;
  }[];
  events: {
    kind: string;
    sourcePermanentId?: string;
    phase?: string;
    turnSeat?: number;
    seat?: number;
    sourceCardId?: string;
    timing?: string;
    printedTiming?: string;
    effectKey?: string;
    revealedCardId?: string;
    redirected?: boolean;
    attackerPermanentId?: string;
    cardId?: string;
    permanentId?: string;
    inBreeding?: boolean;
    target?: { kind: string; permanentId?: string };
    batch?: string;
  }[];
  decision?: { kind: string; sourceCardId?: string; sourcePermanentId?: string; options?: { min?: number } };
  board?: {
    live: {
      stateVersion: number;
      pendingDecision?: unknown;
      players: {
        battleArea: {
          permanentId: string;
          topCard: { cardId: string };
          isSuspended: boolean;
          keywords?: string[];
          canAttackPlayer?: boolean;
        }[];
      }[];
    };
    displayed: { stateVersion: number };
    visible: {
      turn?: { seat: number; count: number };
      players: {
        breeding?: null | {
          permanentId: string;
          topCard: { cardId: string };
          stack: { cardId: string }[];
        };
        securityCount: number;
        handCount: number;
        deckCount: number;
        hand: { instanceId: string; cardId: string }[];
        battleArea: {
          permanentId: string;
          topCard: { cardId: string };
          stack: { cardId: string }[];
          isSuspended: boolean;
          currentDP: number;
        }[];
      }[];
    };
  };
  gateExpiries: string[];
  batches: { id: string; receivedAt: number; stateVersion: number; events: { kind: string }[] }[];
  truncated: boolean;
  counters: { boardBudgetHits: number; decisionBudgetHits: number; decisionStallHits: number };
}
type LabReader = (() => LabState) & { reset(): void };
interface ArrivalPaint {
  cardId: string;
  permanentId: string;
  revealAt?: number;
  revealExitAt?: number;
  landingAt?: number;
  landedAt?: { x: number; y: number };
}

/** A fresh live DP change supersedes the decoration on that same card. */
function expectOnlyCompletedDpReplacements(steps: LabState["steps"]) {
  for (const cancelled of steps.filter((step) => step.cancelled)) {
    expect(cancelled.track).toMatch(/^dpPulse-/);
    const replacement = steps.find(
      (step) =>
        step.key !== cancelled.key &&
        step.track === cancelled.track &&
        step.phase === "started" &&
        Math.abs(step.at - cancelled.at) < 1,
    );
    expect(replacement, `replacement for ${cancelled.key}`).toBeDefined();
    expect(
      steps.some(
        (step) => step.key === replacement!.key && step.phase === "finished" && !step.cancelled && !step.failed,
      ),
    ).toBe(true);
  }
}

/** Native clicks may answer a mounted prompt before its first sampled paint. */
async function waitForDecisionPaint(page: Page, label: string) {
  await expect
    .poll(() =>
      page.evaluate((name) => {
        const capture = (
          window as unknown as { __keywordPacingCapture: { decisions: { label: string | null; closedAt?: number }[] } }
        )["__keywordPacingCapture"];
        return capture.decisions.some((decision) => decision.label === name && decision.closedAt === undefined);
      }, label),
    )
    .toBe(true);
}

async function clickFieldArtwork(page: Page, permanentId: string, cardName: string) {
  const art = page.locator(`[data-drop][data-id="${permanentId}"]`).locator(`[title="${cardName}"][data-state]`);
  const position = await art.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    for (const [x, y] of [
      [0.85, 0.35],
      [0.5, 0.5],
      [0.25, 0.75],
    ]) {
      const point = { x: bounds.width * x!, y: bounds.height * y! };
      const hit = document.elementFromPoint(bounds.left + point.x, bounds.top + point.y);
      if (hit && element.contains(hit) && !hit.closest("[data-badge-hint], button")) return point;
    }
    return null;
  });
  expect(position, "the field card has exposed clickable art").not.toBeNull();
  await art.click({ position: position! });
}

class EffectsLabPage {
  constructor(readonly page: Page) {}
  button(name: RegExp) {
    return this.page.getByRole("button", { name }).filter({ visible: true });
  }
  async start(scenario: ScenarioFixture = fixtureOpponentChain, endTurn = true, speed = "normal", observePaint = true) {
    await this.page.addInitScript((initialSpeed) => {
      localStorage.setItem("aegis:locale", "en");
      // END TURN must hand the turn over at once; the confirmation dialog is not under test.
      localStorage.setItem("aegis.skip-end-turn-confirmation", "true");
      // Obsolete tuning must not shorten effects or switch the lab out of stacked.
      localStorage.setItem(
        "aegis.dev.effects-lab.pacing",
        JSON.stringify({ sourceHoldMs: 120, shortSourceHoldMs: 80, clauseStackMs: 0 }),
      );
      localStorage.setItem("aegis.effect-speed", initialSpeed);
    }, speed);
    labServer.useFixture(scenario);
    const deck = CATALOG_DECKS.find((d) => d.deckId === "bt26-dgo-2026-08-28-7-chronomon")!.decklist;
    await this.page.addInitScript(
      (deck) => {
        window.browserTestOptions = { displayName: "Pacing fixture", seed: 1, deck, devScenario: "local-fixture" };
        window.browserTestLab = true;
        window.browserTestBotDeckId = "bt26-dgo-2026-08-28-8-plutomon";
      },
      { mainDeck: [...deck.mainDeck], eggDeck: [...deck.eggDeck] },
    );
    await this.page.goto("/e2e/harness.html");
    await expect(this.button(/END BREEDING/i)).toBeEnabled({ timeout: 45_000 });
    await expect(this.page.getByRole("combobox", { name: /^pacing$/i })).toHaveCount(0);
    await expect(this.page.getByRole("button", { name: "Sequential", exact: true })).toHaveCount(0);
    await this.button(/^Collapse/i).click();
    await this.button(/END BREEDING/i).click();
    await expect(this.button(/END TURN/i)).toBeEnabled({ timeout: 20_000 });
    await this.page.evaluate(
      ({ key, observePaint }) => {
        const globals = window as unknown as Record<string, unknown>;
        (globals[key] as LabReader).reset();
        // The pacing capture already owns these DOM observations for attack scenarios.
        if (!observePaint) return;
        globals.__labPaintedNotices = new Set<string>();
        globals.__labNoticeAt = new Map<string, number>();
        globals.__labFocusedSources = new Set<string>();
        globals.__labFocusAt = new Map<string, number>();
        globals["__labFocusDurations"] = [] as { cardId: string; ms: number }[];
        globals.__labArrivals = new Map<string, ArrivalPaint>();
        let focused: { key: string; cardId: string; at: number } | undefined;
        const record = () => {
          // A phone folds its notices into one band that names the newest moment.
          for (const element of document.querySelectorAll<HTMLElement>(
            "[data-narration-id], [data-narration-peek-id]",
          )) {
            const bounds = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            if (bounds.width > 0 && bounds.height > 0 && style.visibility !== "hidden" && Number(style.opacity) > 0) {
              const id = element.dataset.narrationId ?? element.dataset.narrationPeekId!;
              (globals.__labPaintedNotices as Set<string>).add(id);
              const noticeAt = globals.__labNoticeAt as Map<string, number>;
              if (!noticeAt.has(id)) noticeAt.set(id, performance.now());
            }
          }
          for (const element of document.querySelectorAll<SVGElement>('[data-testid="effect-focus"]'))
            if (element.getBoundingClientRect().width > 0 && Number(getComputedStyle(element).opacity) > 0) {
              (globals.__labFocusedSources as Set<string>).add(element.dataset.sourceCardId!);
              const focusAt = globals.__labFocusAt as Map<string, number>;
              if (!focusAt.has(element.dataset.sourceCardId!))
                focusAt.set(element.dataset.sourceCardId!, performance.now());
            }
          const source = document.querySelector<SVGElement>('[data-testid="effect-focus"]');
          const focusKey = source?.dataset.sourcePermanentId;
          if (focused && focused.key !== focusKey) {
            (globals["__labFocusDurations"] as { cardId: string; ms: number }[]).push({
              cardId: focused.cardId,
              ms: performance.now() - focused.at,
            });
            focused = undefined;
          }
          if (source && focusKey && !focused)
            focused = { key: focusKey, cardId: source.dataset.sourceCardId!, at: performance.now() };
          const reveals = (globals.__labRevealTimes ??= new Map<string, { at: number; exitAt?: number }>()) as Map<
            string,
            { at: number; exitAt?: number }
          >;
          const showcase = document.querySelector<HTMLElement>('[data-testid="zone-showcase"]');
          for (const [cardId, reveal] of reveals)
            if (cardId !== showcase?.dataset.cardId) reveal.exitAt ??= performance.now();
          if (showcase?.dataset.cardId && !reveals.has(showcase.dataset.cardId))
            reveals.set(showcase.dataset.cardId, { at: performance.now() });
          for (const element of document.querySelectorAll<HTMLElement>('[data-testid="confirmed-play-landing"]')) {
            if (element.getBoundingClientRect().width <= 0) continue;
            const { cardId, permanentId } = element.dataset;
            if (!cardId || !permanentId) continue;
            const arrivals = globals.__labArrivals as Map<string, ArrivalPaint>;
            const reveal = reveals.get(cardId);
            const entry = arrivals.get(permanentId) ?? { cardId, permanentId };
            entry.revealAt = reveal?.at;
            entry.revealExitAt = reveal?.exitAt;
            entry.landingAt ??= performance.now();
            const art = (element.querySelector("img") ?? element).getBoundingClientRect();
            entry.landedAt = { x: art.left + art.width / 2, y: art.top + art.height / 2 };
            arrivals.set(permanentId, entry);
          }
          globals.__labPaintFrame = requestAnimationFrame(record);
        };
        record();
      },
      { key: LAB_KEY, observePaint },
    );
    if (endTurn) await this.button(/END TURN/i).click();
  }
  read() {
    return this.page.evaluate((key) => (window as unknown as Record<string, LabReader>)[key]!(), LAB_KEY);
  }
  async readEarlierNotices() {
    const column = this.page.locator('[data-slot="narration-text"]');
    const above = column.getByRole("button", { name: "Show more notices above" });
    const below = column.getByRole("button", { name: "Show more notices below" });
    await expect(above).toBeVisible({ timeout: 40_000 });
    const position = () => column.evaluate((element) => element.scrollTop);
    const before = await position();
    await above.click();
    await expect.poll(position).toBeLessThan(before - 24);
    await expect(below).toBeVisible();
    const newest = () => column.locator(".narration-item").last().getAttribute("data-narration-id");
    const reading = await newest();
    const upper = await position();
    await expect.poll(newest).not.toBe(reading);
    await expect.poll(position).toBeLessThanOrEqual(upper + 24);
    await expect(below).toBeVisible();
    const beforeDown = await position();
    await below.click();
    await expect.poll(position).toBeGreaterThan(beforeDown + 24);
  }
  async captureArrival(cardId: string, info: TestInfo) {
    await expect(this.page.locator(`[data-testid="zone-showcase"][data-card-id="${cardId}"]`)).toBeVisible();
    await this.page.screenshot({ path: info.outputPath("card-reveal.png") });
    await expect(this.page.locator(`[data-testid="confirmed-play-landing"][data-card-id="${cardId}"]`)).toBeVisible();
    await this.page.screenshot({ path: info.outputPath("confirmed-play-landing.png") });
  }
  async captureFocus(cardId: string, permanentId: string, info: TestInfo) {
    // The inspector is opened before accepting so its existing playback control can
    // freeze this source beat without adding a test-only command to the observation bridge.
    const focus = this.page.locator(
      `[data-testid="effect-focus"][data-source-card-id="${cardId}"][data-source-permanent-id="${permanentId}"]`,
    );
    await expect(focus).toBeVisible();
    const ready = () =>
      expect
        .poll(
          async () =>
            focus.evaluate(
              (element, config) => {
                const overlay = element.getBoundingClientRect();
                const field = element.parentElement!.getBoundingClientRect();
                const dim = element.querySelector(".game-effect-focus__shade");
                const maskHole = element.querySelector('mask rect[fill="black"]');
                const ring = element.querySelector<SVGRectElement>(".game-effect-focus__source");
                const permanent = [
                  ...document.querySelectorAll<HTMLElement>('[data-drop="perm-you"], [data-drop="perm-opp"]'),
                ].find((candidate) => candidate.dataset.id === element.dataset.sourcePermanentId);
                const art = (
                  permanent?.querySelector(".game-card-enter > [data-state]") ?? permanent
                )?.getBoundingClientRect();
                const hole = ring?.getBoundingClientRect();
                const viewBox = (element as SVGSVGElement).viewBox.baseVal;
                return {
                  opaque: Number(getComputedStyle(element).opacity) >= 0.9,
                  fillsField:
                    Math.abs(overlay.width - field.width) < 1 &&
                    Math.abs(overlay.height - field.height) < 1 &&
                    overlay.width > 0 &&
                    overlay.height > 0,
                  coversDock: [".game-hand-dock", ".game-breeding-dock"].every((selector) => {
                    const dock = element.closest(".game-board")?.querySelector(selector)?.getBoundingClientRect();
                    return (
                      !dock ||
                      (overlay.left <= Math.max(field.left, dock.left) + 1 &&
                        overlay.top <= Math.max(field.top, dock.top) + 1 &&
                        overlay.right >= Math.min(field.right, dock.right) - 1 &&
                        overlay.bottom >= Math.min(field.bottom, dock.bottom) - 1)
                    );
                  }),
                  currentViewBox:
                    Math.abs(viewBox.width - field.width) < 1 && Math.abs(viewBox.height - field.height) < 1,
                  dimmed: Boolean(dim && Number(getComputedStyle(dim).fillOpacity) > 0),
                  holeAligned: Boolean(
                    art &&
                    hole &&
                    Math.abs(hole.x - (art.x - config.padding)) < 1 &&
                    Math.abs(hole.y - (art.y - config.padding)) < 1 &&
                    Math.abs(hole.width - (art.width + 2 * config.padding)) < 1 &&
                    Math.abs(hole.height - (art.height + 2 * config.padding)) < 1,
                  ),
                  matchingMask: Boolean(
                    maskHole &&
                    ring &&
                    ["x", "y", "width", "height", "rx"].every(
                      (attribute) => maskHole.getAttribute(attribute) === ring.getAttribute(attribute),
                    ),
                  ),
                  rounded: Number(ring?.getAttribute("rx")) === config.radius,
                  measured: {
                    field: { width: field.width, height: field.height },
                    viewBox: { width: viewBox.width, height: viewBox.height },
                    art: art?.toJSON(),
                    hole: hole?.toJSON(),
                  },
                };
              },
              { padding: SPOTLIGHT_PADDING_PX, radius: SPOTLIGHT_RADIUS_PX },
            ),
          { timeout: 5000, intervals: [16, 32, 50] },
        )
        .toMatchObject({
          opaque: true,
          fillsField: true,
          coversDock: true,
          currentViewBox: true,
          dimmed: true,
          holeAligned: true,
          matchingMask: true,
          rounded: true,
        });
    // Pause also freezes CSS keyframes. Let the source's entrance paint fully first.
    await ready();
    await this.page.getByRole("button", { name: "Pause", exact: true }).click();
    await this.button(/^Collapse/i).click();
    await this.page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
    await ready();
    await this.page.screenshot({ path: info.outputPath("accepted-field-source-focus.png") });
    await this.page.getByRole("button", { name: "‹", exact: true }).click();
    await this.page.getByRole("button", { name: "Resume", exact: true }).click();
    await this.button(/^Collapse/i).click();
  }
  async finish(reduced: boolean) {
    let progressAt = Date.now();
    let progress = "";
    let last: LabState | undefined;
    await expect
      .poll(
        async () => {
          last = await this.read();
          expect(last.truncated, "the dev observation ring lost evidence").toBe(false);
          const next = `${last.steps.length}:${last.steps.at(-1)?.key}:${last.steps.at(-1)?.phase}`;
          if (progress !== next) {
            progress = next;
            progressAt = Date.now();
          }
          if (last.pendingSteps > 0)
            expect(
              Date.now() - progressAt,
              `queue stalled with ${last.pendingSteps} steps: ${JSON.stringify(last.steps.slice(-8))}`,
            ).toBeLessThan(STALL_MS);
          expect(
            last.steps.filter((step) => step.failed),
            "a cue threw while the queue continued",
          ).toEqual([]);
          expect(last.gateExpiries, "a presentation gate was rescued by timeout").toEqual([]);
          // After its start-of-main chain the bot can check the fixture's Asuna in security.
          // Decline that separate optional cost so the real room, rather than only the queue,
          // reaches a terminal state for the observation.
          if (
            last.decision?.kind === "selectCards" &&
            last.decision.sourceCardId === "BT24-088" &&
            last.decision.options?.min === 0
          ) {
            const decline = this.page.getByRole("button", { name: "No Selection", exact: true });
            if (await decline.isVisible()) await decline.click();
          }
          const resolved = last.events.filter((event) => event.kind === "effectResolved" && event.seat === 1);
          return (
            resolved.length >= 5 &&
            last.queueIdle &&
            last.pendingSteps === 0 &&
            last.board?.live.pendingDecision === undefined &&
            last.board?.live.stateVersion === last.board?.displayed.stateVersion
          );
        },
        { timeout: 75_000, intervals: [50, 100, 200] },
      )
      .toBe(true);
    const observation = last!;
    expect(observation.board?.live.stateVersion).toBeGreaterThan(0);
    expect(observation.events.filter((event) => event.kind === "effectTriggered" && event.seat === 1)).toHaveLength(5);
    expect(observation.steps.filter((step) => step.phase === "dropped" || step.cancelled)).toEqual([]);
    expect(observation.counters).toMatchObject({ boardBudgetHits: 0, decisionBudgetHits: 0, decisionStallHits: 0 });
    const paint = await this.page.evaluate(() => {
      const globals = window as unknown as Record<string, unknown>;
      cancelAnimationFrame(globals.__labPaintFrame as number);
      return {
        notices: [...(globals.__labPaintedNotices as Set<string>)],
        sources: [...(globals.__labFocusedSources as Set<string>)],
        focusDurations: globals["__labFocusDurations"] as { cardId: string; ms: number }[],
      };
    });
    if (!reduced) {
      const triggers = observation.events.filter(
        (event) =>
          event.kind === "effectTriggered" &&
          event.seat === 1 &&
          (event.printedTiming ?? event.timing) === "StartOfYourMainPhase",
      );
      expect(triggers.map((event) => event.effectKey)).toEqual([
        "LM-002/ir-1-0",
        "EX8-011/ir-1-0",
        "P-200/ir-1-0",
        "P-199/ir-1-0",
        "BT26-104/ir-1-0",
      ]);
      const clauses = triggers.flatMap((trigger) => {
        const matching = observation.steps.filter(
          (step) =>
            step.phase === "started" &&
            step.stepId.startsWith("narration-step-") &&
            step.batchId === trigger.batch &&
            step.sourceCardId === trigger.sourceCardId &&
            step.timing === (trigger.printedTiming ?? trigger.timing),
        );
        expect(matching, `the exact ${trigger.effectKey} batch never started its clause`).toHaveLength(1);
        return matching;
      });
      expect(clauses).toHaveLength(5);
      for (const clause of clauses) expect(paint.notices).toContain(clause.stepId.slice("narration-step-".length));
      expect(paint.sources.length).toBeGreaterThan(0);
      const fieldSources = paint.focusDurations.filter(({ cardId }) =>
        ["LM-002", "EX8-011", "P-200", "P-199"].includes(cardId),
      );
      expect(fieldSources).toHaveLength(4);
      for (const source of fieldSources)
        expect(source.ms, `${source.cardId} source focus was cut short`).toBeGreaterThanOrEqual(
          DEFAULT_PACING.sourceHoldMs - 100,
        );
    }
  }
}

test.describe("effects lab pacing in the browser", () => {
  test.beforeEach(async () => {
    labServer = await startBrowserServer({ holdBotAllTurns: false });
  });
  test.afterEach(async ({ page }, info) => {
    try {
      if (info.status === info.expectedStatus || page.isClosed()) return;
      const active = await page.evaluate(() =>
        Boolean((window as unknown as Record<string, unknown>)["__keywordPacingCapture"]),
      );
      if (!active) return;
      const capture = await finishPacingCapture(page);
      const state = await new EffectsLabPage(page).read();
      const layout = await page.locator('[data-drop="battle-you"], [data-field-key]').evaluateAll((elements) =>
        elements.map((element) => ({
          className: element.className,
          dataset: { ...(element as HTMLElement).dataset },
          rect: element.getBoundingClientRect().toJSON(),
        })),
      );
      await info.attach("pacing-failure-diagnostic.json", {
        body: Buffer.from(JSON.stringify({ capture, state, layout }, null, 2)),
        contentType: "application/json",
      });
    } finally {
      await page.close();
      await labServer.close();
    }
  });

  for (const scenario of KEYWORD_PACING_SCENARIOS as readonly KeywordPacingScenario[]) {
    const formats = [
      { name: "desktop", width: 1440, height: 1000, speed: "normal", reduced: false },
      { name: "desktop", width: 1440, height: 1000, speed: "fast", reduced: false },
      ...(scenario.decision
        ? [
            { name: "phone", width: 320, height: 844, speed: "normal", reduced: false },
            { name: "reduced motion", width: 1440, height: 1000, speed: "normal", reduced: true },
          ]
        : []),
    ];
    for (const format of formats) {
      const { speed } = format;
      test(`real keyword pacing: ${scenario.id} (${format.name}, ${speed})`, async ({ page }, info) => {
        await page.setViewportSize({ width: format.width, height: format.height });
        await page.emulateMedia({ reducedMotion: format.reduced ? "reduce" : "no-preference" });
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const lab = new EffectsLabPage(page);
        await lab.start(scenario.fixture, false, speed);
        const before = await lab.read();
        await startPacingCapture(page);
        const target =
          scenario.target === "player"
            ? page.locator('[data-drop="opp-security"]')
            : page.locator(`[data-drop="perm-opp"][data-id="${fixturePermanentId("opponent-keyword-defender")}"]`);
        await new GamePage(page).attack(fixturePermanentId("own-keyword-attacker"), target);
        if (scenario.decision?.kind === "Alliance") {
          const prompt = page.getByRole("region", { name: "Alliance window", exact: true });
          await expect(prompt).toBeVisible();
          await waitForDecisionPaint(page, "Alliance window");
          if (scenario.decision.accept) {
            await page.locator(`[data-drop="perm-you"][data-id="${fixturePermanentId("own-keyword-ally-0")}"]`).click();
            await page.getByRole("button", { name: "Use Alliance", exact: true }).click();
          } else await prompt.getByRole("button", { name: "Pass", exact: true }).click();
        }
        if (scenario.decision?.kind === "Barrier") {
          const prompt = page.getByRole("dialog", { name: "＜Barrier＞", exact: true });
          await expect(prompt).toBeVisible();
          await waitForDecisionPaint(page, "＜Barrier＞");
          await prompt
            .getByRole("button", {
              name: scenario.decision.accept ? "Use" : "Don't use",
              exact: true,
            })
            .click();
        }
        await expect
          .poll(
            async () => {
              const state = await lab.read();
              expect(state.gateExpiries).toEqual([]);
              expect(state.steps.filter((step) => step.failed)).toEqual([]);
              return (
                state.events.some((event) => event.kind === "attackEnded") &&
                state.queueIdle &&
                state.pendingSteps === 0 &&
                state.board?.live.stateVersion === state.board?.displayed.stateVersion
              );
            },
            { timeout: 40_000 },
          )
          .toBe(true);
        const state = await lab.read();
        expect(state.board!.live.players[0]!.battleArea.some((p) => p.topCard.cardId === scenario.attackerCardId)).toBe(
          scenario.attackerRemains,
        );
        expect(state.board!.live.players[1]!.battleArea.some((p) => p.topCard.cardId === scenario.defenderCardId)).toBe(
          scenario.defenderRemains,
        );
        expect(state.events.filter((event) => event.kind === "securityChecked")).toHaveLength(scenario.securityRemoved);
        expect(state.board!.visible.players[1]!.securityCount).toBe(
          before.board!.visible.players[1]!.securityCount - scenario.securityRemoved,
        );
        expect(state.board!.visible.players[0]!.securityCount).toBe(
          before.board!.visible.players[0]!.securityCount - (scenario.ownSecurityRemoved ?? 0),
        );
        if (scenario.decision?.kind === "Alliance") {
          expect(
            state.board!.live.players[0]!.battleArea.find(
              (p) => p.permanentId === fixturePermanentId("own-keyword-ally-0"),
            )?.isSuspended,
          ).toBe(scenario.decision.accept);
          expect(
            state.board!.live.players[0]!.battleArea.find(
              (p) => p.permanentId === fixturePermanentId("own-keyword-ally-1"),
            )?.isSuspended,
          ).toBe(false);
        }
        await expect(lab.button(/END TURN/i)).toBeEnabled();
        const capture = await finishPacingCapture(page);
        await info.attach("real-keyword-pacing.json", {
          body: Buffer.from(JSON.stringify({ scenario, speed, format, capture, state }, null, 2)),
          contentType: "application/json",
        });
        expect(capture.truncated || state.truncated).toBe(false);
        expect(capture.motion.captureQuality).toBe("usable");
        if (scenario.decision) {
          expect(
            capture.decisions.some(
              (decision) =>
                decision.label === (scenario.decision!.kind === "Alliance" ? "Alliance window" : "＜Barrier＞") &&
                decision.closedAt !== undefined,
            ),
          ).toBe(true);
        }
        if (scenario.decision?.kind === "Barrier") {
          const decision = capture.decisions.find((item) => item.label === "＜Barrier＞")!;
          const blows = capture.motion.animations.filter((animation) => animation.name === "battle-claw");
          expect(blows).toHaveLength(format.reduced ? 0 : 1);
          for (const blow of blows) {
            expect(blow.cutShort).toBe(false);
            expect(blow.lastAt).toBeLessThanOrEqual(decision.openedAt);
          }
          expect(
            state.steps.filter((step) => step.stepId.startsWith("field-clash-") && step.phase === "started"),
          ).toHaveLength(1);
        }
        expect(errors).toEqual([]);
        expectOnlyCompletedDpReplacements(state.steps);
      });
    }
  }

  for (const scenario of KEYWORD_TURN_PACING_SCENARIOS) {
    for (const format of [
      { name: "desktop", width: 1440, height: 1000, speed: "normal", reduced: false },
      { name: "desktop", width: 1440, height: 1000, speed: "fast", reduced: false },
      { name: "phone", width: 320, height: 844, speed: "normal", reduced: false },
      { name: "reduced motion", width: 1440, height: 1000, speed: "normal", reduced: true },
    ]) {
      test(`real keyword pacing: ${scenario.id} (${format.name}, ${format.speed})`, async ({ page }, info) => {
        await page.setViewportSize({ width: format.width, height: format.height });
        await page.emulateMedia({ reducedMotion: format.reduced ? "reduce" : "no-preference" });
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const lab = new EffectsLabPage(page);
        await lab.start(scenario.fixture, false, format.speed);
        await expect.poll(async () => (await lab.read()).queueIdle).toBe(true);
        await startPacingCapture(page);
        const actions: { label: string; observedAt: number }[] = [];
        const mark = async (label: string) =>
          actions.push({ label, observedAt: await page.evaluate(() => performance.now()) });
        if (scenario.flow === "reboot") {
          for (let index = 0; index < 3; index++) {
            await mark(`attack-${index}`);
            await new GamePage(page).attack(
              fixtureVariant(
                {
                  "0": fixturePermanentId("own-keyword-reboot-0"),
                  "1": fixturePermanentId("own-keyword-reboot-1"),
                  "2": fixturePermanentId("own-keyword-reboot-2"),
                },
                index,
              ),
              page.locator(
                `[data-drop="perm-opp"][data-id="${fixtureVariant({ "0": fixturePermanentId("opponent-keyword-reboot-target-0"), "1": fixturePermanentId("opponent-keyword-reboot-target-1"), "2": fixturePermanentId("opponent-keyword-reboot-target-2") }, index)}"]`,
              ),
            );
            await expect
              .poll(
                async () => {
                  const state = await lab.read();
                  return (
                    state.events.filter((event) => event.kind === "attackEnded").length === index + 1 && state.queueIdle
                  );
                },
                { timeout: 40_000 },
              )
              .toBe(true);
          }
          expect((await lab.read()).board!.visible.players[0]!.battleArea.map((card) => card.isSuspended)).toEqual([
            true,
            true,
            true,
          ]);
        }
        await mark("end-turn");
        await lab.button(/END TURN/i).click();
        if (scenario.flow === "block") {
          const prompt = page.getByRole("region", { name: "Block window", exact: true });
          await expect(prompt).toBeVisible({ timeout: 40_000 });
          await waitForDecisionPaint(page, "Block window");
          await mark(scenario.accept ? "declare-block" : "decline-block");
          if (scenario.accept)
            await page
              .locator(`[data-drop="perm-you"][data-id="${fixturePermanentId("own-keyword-blocker")}"]`)
              .click();
          else await prompt.getByRole("button", { name: "Take the attack, no block", exact: true }).click();
          await expect
            .poll(
              async () => {
                const state = await lab.read();
                return (
                  state.events.some((event) => event.kind === "attackEnded") &&
                  state.queueIdle &&
                  state.board?.live.stateVersion === state.board?.displayed.stateVersion
                );
              },
              { timeout: 40_000 },
            )
            .toBe(true);
        } else {
          // Observe the opponent's phase, before a later own turn can untap the control.
          await expect
            .poll(
              async () => {
                const state = await lab.read();
                const cards = state.board?.visible.players[0]?.battleArea;
                return (
                  state.board?.visible.turn?.seat === 1 &&
                  cards?.length === 3 &&
                  cards.every((card, index) => card.isSuspended === (index === 2))
                );
              },
              { timeout: 40_000 },
            )
            .toBe(true);
          const second = page.locator(
            `[data-drop="perm-you"][data-id="${fixturePermanentId("own-keyword-reboot-1")}"] .game-card-enter > [data-state]`,
          );
          await expect
            .poll(() => second.evaluate((element) => Number.parseFloat(getComputedStyle(element).rotate)))
            .toBe(0);
        }
        const capture = await finishPacingCapture(page);
        const state = await lab.read();
        await info.attach("real-keyword-pacing.json", {
          body: Buffer.from(
            JSON.stringify({ scenario, format, speed: format.speed, actions, capture, state }, null, 2),
          ),
          contentType: "application/json",
        });
        expect(capture.truncated || state.truncated).toBe(false);
        if (!format.reduced) expect(capture.motion.captureQuality).toBe("usable");
        expect(state.gateExpiries).toEqual([]);
        expect(state.steps.filter((step) => step.failed || step.cancelled)).toEqual([]);
        expect(errors).toEqual([]);
        if (scenario.flow === "block") {
          expect(
            state.board!.visible.players[0]!.battleArea.some(
              (card) => card.permanentId === fixturePermanentId("own-keyword-blocker"),
            ),
          ).toBe(!scenario.accept);
          expect(state.board!.visible.players[0]!.securityCount).toBe(scenario.accept ? 5 : 4);
          expect(state.events.filter((event) => event.kind === "blocked")).toHaveLength(scenario.accept ? 1 : 0);
          expect(
            capture.decisions.some((decision) => decision.label === "Block window" && decision.closedAt !== undefined),
          ).toBe(true);
          const blows = capture.motion.animations.filter((animation) => animation.name === "battle-claw");
          expect(blows).toHaveLength(format.reduced ? 0 : 1);
          expect(blows.every((blow) => !blow.cutShort)).toBe(true);
          const securityArrow = capture.arrows.find(
            (arrow) =>
              arrow.source === fixturePermanentId("opponent-keyword-attacker") && arrow.target === "security-you",
          );
          expect(securityArrow).toBeDefined();
          const blockerArrow = capture.arrows.find(
            (arrow) =>
              arrow.source === fixturePermanentId("opponent-keyword-attacker") &&
              arrow.target === fixturePermanentId("own-keyword-blocker"),
          );
          if (scenario.accept && !format.reduced) {
            expect(blockerArrow?.key).toBe(securityArrow!.key);
            expect(blockerArrow!.at).toBeGreaterThan(securityArrow!.at);
            expect(blockerArrow!.at).toBeLessThanOrEqual(blows[0]!.firstAt);
          } else if (!scenario.accept) expect(blockerArrow).toBeUndefined();
        } else {
          const unsuspended = capture.boards.find(
            (board) =>
              board.turnSeat === 1 &&
              !board.suspendedIds.includes(fixturePermanentId("own-keyword-reboot-0")) &&
              !board.suspendedIds.includes(fixturePermanentId("own-keyword-reboot-1")),
          );
          expect(unsuspended?.suspendedIds).toContain(fixturePermanentId("own-keyword-reboot-2"));
          expect(state.events.filter((event) => event.kind === "attackEnded")).toHaveLength(3);
          expect(
            state.events.some(
              (event) => event.kind === "phaseChanged" && event.phase === "Active" && event.turnSeat === 1,
            ),
          ).toBe(true);
          const ribbon = capture.phaseRibbons.find((phase) => /unsuspend/i.test(phase.label));
          if (!format.reduced) {
            expect(ribbon).toBeDefined();
            expect(unsuspended!.at).toBeGreaterThanOrEqual(ribbon!.at);
            for (let index = 0; index < 2; index++) {
              const rotation = capture.timings.find(
                (timing) =>
                  timing.permanentId ===
                    fixtureVariant(
                      {
                        "0": fixturePermanentId("own-keyword-reboot-0"),
                        "1": fixturePermanentId("own-keyword-reboot-1"),
                        "2": fixturePermanentId("own-keyword-reboot-2"),
                      },
                      index,
                    ) &&
                  timing.at >= ribbon!.at &&
                  timing.properties.includes("rotate") &&
                  timing.duration === 200,
              );
              expect(rotation?.delayMs).toBe(index * 60);
              const poses = capture.poses.filter(
                (pose) =>
                  pose.permanentId ===
                    fixtureVariant(
                      {
                        "0": fixturePermanentId("own-keyword-reboot-0"),
                        "1": fixturePermanentId("own-keyword-reboot-1"),
                        "2": fixturePermanentId("own-keyword-reboot-2"),
                      },
                      index,
                    ) && pose.at >= ribbon!.at,
              );
              expect(poses.some((pose) => pose.angle > 1 && pose.angle < 89)).toBe(true);
              expect(poses.at(-1)?.angle).toBe(0);
            }
          } else {
            expect(
              capture.timings.filter((timing) => timing.properties.includes("rotate") && timing.duration === 200),
            ).toEqual([]);
          }
          const controlPoses = capture.poses.filter(
            (pose) => pose.permanentId === fixturePermanentId("own-keyword-reboot-2") && pose.at >= unsuspended!.at,
          );
          expect(controlPoses.length).toBeGreaterThan(0);
          expect(controlPoses.every((pose) => pose.angle === 90)).toBe(true);
        }
      });
    }
  }

  for (const scenario of KEYWORD_PROTECTION_PACING_SCENARIOS) {
    for (const format of [
      { name: "desktop", width: 1440, height: 1000, speed: "normal", reduced: false },
      { name: "desktop", width: 1440, height: 1000, speed: "fast", reduced: false },
      { name: "phone", width: 320, height: 844, speed: "normal", reduced: false },
      { name: "reduced motion", width: 1440, height: 1000, speed: "normal", reduced: true },
    ]) {
      test(`real keyword pacing: ${scenario.id} (${format.name}, ${format.speed})`, async ({ page }, info) => {
        await page.setViewportSize({ width: format.width, height: format.height });
        await page.emulateMedia({ reducedMotion: format.reduced ? "reduce" : "no-preference" });
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const lab = new EffectsLabPage(page);
        await lab.start(scenario.fixture, false, format.speed);
        await expect.poll(async () => (await lab.read()).queueIdle).toBe(true);
        await startPacingCapture(page);
        const actions = [{ label: "attack", observedAt: await page.evaluate(() => performance.now()) }];
        await new GamePage(page).attack(
          scenario.flow === "evade"
            ? fixturePermanentId("own-keyword-attacker")
            : fixturePermanentId("own-keyword-protected"),
          scenario.flow === "evade"
            ? page.locator('[data-drop="opp-security"]')
            : page.locator(`[data-drop="perm-opp"][data-id="${fixturePermanentId("opponent-keyword-defender")}"]`),
        );
        let label: string;
        if (scenario.flow === "evade") {
          label = "＜Evade＞";
          const prompt = page.getByRole("dialog", { name: label, exact: true });
          await expect(prompt).toBeVisible();
          await waitForDecisionPaint(page, label);
          actions.push({
            label: scenario.accept ? "accept-evade" : "decline-evade",
            observedAt: await page.evaluate(() => performance.now()),
          });
          await prompt
            .getByRole("button", {
              name: scenario.accept ? "Use" : "Don't use",
              exact: true,
            })
            .click();
        } else {
          await expect.poll(async () => (await lab.read()).decision?.kind).toBe("selectCards");
          const prompt = page.locator('[data-testid="board-prompt"], [role="dialog"]').filter({ visible: true }).last();
          await expect(prompt).toBeVisible();
          label = (await prompt.getAttribute("aria-label"))!;
          expect(["Confirm targets", "Flamedramon · effect"]).toContain(label);
          await waitForDecisionPaint(page, label);
          actions.push({
            label: scenario.accept ? "accept-armor-purge" : "decline-armor-purge",
            observedAt: await page.evaluate(() => performance.now()),
          });
          if (scenario.accept) {
            if ((await prompt.getAttribute("role")) === "dialog")
              await prompt.getByRole("button", { name: /^Flamedramon/ }).click();
            else {
              const art = page
                .locator(`[data-drop="perm-you"][data-id="${fixturePermanentId("own-keyword-protected")}"]`)
                .locator('[title="Flamedramon"][data-state]');
              // Field badges overlap small suspended cards. Find exposed art using real hit testing.
              const position = await art.evaluate((element) => {
                const bounds = element.getBoundingClientRect();
                for (const [x, y] of [
                  [0.85, 0.35],
                  [0.5, 0.5],
                  [0.25, 0.75],
                ]) {
                  const point = { x: bounds.width * x!, y: bounds.height * y! };
                  const hit = document.elementFromPoint(bounds.left + point.x, bounds.top + point.y);
                  if (hit && element.contains(hit) && !hit.closest("[data-badge-hint], button")) return point;
                }
                return null;
              });
              expect(position, "the target card has exposed clickable art").not.toBeNull();
              await art.click({ position: position! });
            }
            await prompt.getByRole("button", { name: "Confirm targets", exact: true }).click();
          } else await prompt.getByRole("button", { name: /^(Pass|None)$/ }).click();
        }
        await expect
          .poll(
            async () => {
              const state = await lab.read();
              expect(state.gateExpiries).toEqual([]);
              expect(state.steps.filter((step) => step.failed || step.phase === "dropped")).toEqual([]);
              return (
                state.events.some((event) => event.kind === "attackEnded") &&
                state.queueIdle &&
                state.pendingSteps === 0 &&
                state.board?.live.stateVersion === state.board?.displayed.stateVersion
              );
            },
            { timeout: 40_000 },
          )
          .toBe(true);
        const capture = await finishPacingCapture(page);
        const state = await lab.read();
        await info.attach("real-keyword-pacing.json", {
          body: Buffer.from(
            JSON.stringify({ scenario, format, speed: format.speed, actions, capture, state }, null, 2),
          ),
          contentType: "application/json",
        });
        await info.attach("protected-field.png", { body: await page.screenshot(), contentType: "image/png" });
        expect(errors).toEqual([]);
        expect(capture.truncated || state.truncated).toBe(false);
        expect(capture.motion.captureQuality).toBe("usable");
        expectOnlyCompletedDpReplacements(state.steps);
        const holder = state.board!.visible.players[0]!.battleArea.find(
          (card) => card.permanentId === fixturePermanentId("own-keyword-protected"),
        );
        expect(Boolean(holder)).toBe(scenario.accept);
        if (holder) expect(holder.isSuspended).toBe(true);
        expect(state.board!.visible.players[1]!.securityCount).toBe(scenario.flow === "evade" ? 4 : 5);
        const decision = capture.decisions.find(
          (candidate) => candidate.label === label && candidate.closedAt !== undefined,
        );
        expect(decision).toBeDefined();
        const blows = capture.motion.animations.filter((animation) => animation.name === "battle-claw");
        if (scenario.flow === "evade") {
          expect(blows).toHaveLength(0);
          const turns = capture.timings.filter(
            (timing) =>
              timing.permanentId === fixturePermanentId("own-keyword-protected") &&
              timing.duration === 200 &&
              timing.properties.includes("rotate"),
          );
          expect(turns).toHaveLength(scenario.accept && !format.reduced ? 1 : 0);
          if (holder) expect(holder.topCard.cardId).toBe("BT14-021");
        } else {
          expect(blows).toHaveLength(format.reduced ? 0 : 1);
          expect(blows.every((blow) => !blow.cutShort && blow.lastAt <= decision!.openedAt)).toBe(true);
          if (holder) {
            expect(holder.topCard.cardId).toBe("BT1-009");
            expect(holder.currentDP).toBe(6000);
          }
          const peels = capture.peels.filter(
            (peel) => peel.permanentId === fixturePermanentId("own-keyword-protected") && peel.cardId === "BT8-012",
          );
          if (scenario.accept && !format.reduced) {
            expect(peels).toHaveLength(1);
            expect(peels[0]!.frames).toBeGreaterThan(2);
            const peelClocks = capture.motion.animations.filter((animation) =>
              animation.name.startsWith("battle-stack-strip-"),
            );
            expect(peelClocks.map((animation) => animation.name).sort()).toEqual([
              "battle-stack-strip-fade",
              "battle-stack-strip-lift",
              "battle-stack-strip-rim",
              "battle-stack-strip-sway",
            ]);
            // The authored source-removal recipe is 170 +85 +170 +170 ms.
            expect(
              peelClocks.every(
                (animation) => animation.durationMs === 595 && !animation.cutShort && !animation.undersampled,
              ),
            ).toBe(true);
            expect(peels[0]!.firstAt).toBeGreaterThanOrEqual(decision!.closedAt!);
            const promoted = capture.boards.find((board) =>
              board.permanents.some(
                (permanent) =>
                  permanent.permanentId === fixturePermanentId("own-keyword-protected") &&
                  permanent.cardId === "BT1-009",
              ),
            );
            expect(promoted).toBeDefined();
            expect(promoted!.at).toBeGreaterThanOrEqual(peels[0]!.lastAt);
            const promotedArt = capture.poses.find(
              (pose) =>
                pose.permanentId === fixturePermanentId("own-keyword-protected") && pose.cardName === "Monodramon",
            );
            expect(promotedArt).toBeDefined();
            expect(promotedArt!.at).toBeGreaterThanOrEqual(peels[0]!.lastAt);
            expect(
              capture.poses.some(
                (pose) =>
                  pose.permanentId === fixturePermanentId("own-keyword-protected") &&
                  pose.cardName === "Flamedramon" &&
                  pose.at >= peels[0]!.firstAt,
              ),
            ).toBe(true);
          } else expect(peels).toHaveLength(0);
        }
      });
    }
  }

  for (const scenario of KEYWORD_ATTACK_PACING_SCENARIOS) {
    for (const format of [
      { name: "desktop", width: 1440, height: 1000, speed: "normal", reduced: false },
      { name: "desktop", width: 1440, height: 1000, speed: "fast", reduced: false },
      { name: "phone", width: 320, height: 844, speed: "normal", reduced: false },
      { name: "reduced motion", width: 1440, height: 1000, speed: "normal", reduced: true },
    ]) {
      test(`real keyword pacing: ${scenario.id} (${format.name}, ${format.speed})`, async ({ page }, info) => {
        await page.setViewportSize({ width: format.width, height: format.height });
        await page.emulateMedia({ reducedMotion: format.reduced ? "reduce" : "no-preference" });
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const lab = new EffectsLabPage(page);
        await lab.start(scenario.fixture, false, format.speed, false);
        const before = await lab.read();
        await startPacingCapture(page);
        const actions: { name: string; observedAt: number }[] = [];
        const boundary = async (name: string) =>
          actions.push({ name, observedAt: await page.evaluate(() => performance.now()) });
        if (scenario.flow === "rush") {
          for (const cardId of [scenario.attackerCardIds[0], scenario.controlCardId]) {
            await boundary(`play-${cardId}`);
            await new GamePage(page).play(new RegExp(`^${getCardDefinition(cardId)!.nameEn}$`, "i"));
            await expect
              .poll(
                async () => {
                  const state = await lab.read();
                  return (
                    state.board?.visible.players[0]!.battleArea.some((p) => p.topCard.cardId === cardId) &&
                    state.queueIdle &&
                    state.board.live.stateVersion === state.board.displayed.stateVersion
                  );
                },
                { timeout: 40_000 },
              )
              .toBe(true);
          }
        }
        const ready = await lab.read();
        const attacker = ready.board!.visible.players[0]!.battleArea.find(
          (p) => p.topCard.cardId === scenario.attackerCardIds.at(-1),
        )!;
        await boundary("attack-security");
        await new GamePage(page).attack(attacker.permanentId, page.locator('[data-drop="opp-security"]'));
        if (scenario.flow === "raid") {
          const prompt = page.getByRole("region", { name: "Confirm targets", exact: true });
          await expect(prompt).toBeVisible();
          await waitForDecisionPaint(page, "Confirm targets");
          await boundary(scenario.accept ? "accept-raid" : "decline-raid");
          if (scenario.accept) {
            await clickFieldArtwork(page, fixturePermanentId("opponent-keyword-attack-defender-1"), "Monodramon");
            await prompt.getByRole("button", { name: "Confirm targets", exact: true }).click();
          } else await prompt.getByRole("button", { name: "Pass", exact: true }).click();
        }
        await expect
          .poll(
            async () => {
              const state = await lab.read();
              expect(state.gateExpiries).toEqual([]);
              expect(state.steps.filter((step) => step.failed)).toEqual([]);
              return (
                state.events.some((event) => event.kind === "attackEnded") &&
                state.queueIdle &&
                state.pendingSteps === 0 &&
                state.board?.live.stateVersion === state.board?.displayed.stateVersion
              );
            },
            { timeout: 40_000 },
          )
          .toBe(true);
        await expect(lab.button(/END TURN/i)).toBeEnabled();
        const capture = await finishPacingCapture(page);
        const state = await lab.read();
        await info.attach("real-keyword-pacing.json", {
          body: Buffer.from(
            JSON.stringify({ scenario, speed: format.speed, format, actions, capture, state }, null, 2),
          ),
          contentType: "application/json",
        });
        expect(capture.truncated || state.truncated).toBe(false);
        expect(errors).toEqual([]);
        expectOnlyCompletedDpReplacements(state.steps);
        const checked = state.events.filter((event) => event.kind === "securityChecked");
        const securityIds = ["BT1-011", "BT1-010", "BT1-009", "BT1-014"];
        expect(checked.map((event) => event.revealedCardId)).toEqual(securityIds.slice(0, scenario.securityRemoved));
        expect(state.board!.visible.players[1]!.securityCount).toBe(4 - scenario.securityRemoved);
        expect(state.board!.visible.players[0]!.securityCount).toBe(4);
        expect(state.board!.visible.players[1]!.hand).toEqual([]);
        expect(
          state.board!.visible.players[0]!.battleArea.find((p) => p.permanentId === attacker.permanentId)?.isSuspended,
        ).toBe(true);
        expect(state.events.filter((event) => event.kind === "attackDeclared" && !event.redirected)).toHaveLength(1);
        for (const seat of [0, 1])
          expect(
            state.board!.visible.players[seat]!.battleArea.find(
              (p) =>
                p.permanentId ===
                fixtureVariant(
                  {
                    "0": fixturePermanentId("own-keyword-attack-control"),
                    "1": fixturePermanentId("opponent-keyword-attack-control"),
                  },
                  seat,
                ),
            ),
          ).toMatchObject(before.board!.visible.players[seat]!.battleArea[0]!);
        if (scenario.flow === "rush") {
          expect(
            state.board!.visible.players[0]!.battleArea.find((p) => p.topCard.cardId === scenario.controlCardId)
              ?.isSuspended,
          ).toBe(false);
          expect(state.board!.visible.turn!.count).toBe(before.board!.visible.turn!.count);
        }
        if (scenario.flow === "raid") {
          const remaining = state
            .board!.visible.players[1]!.battleArea.filter((p) => p.topCard.cardId !== "BT1-089")
            .map((p) => p.permanentId);
          expect(remaining).toEqual(
            [0, ...(scenario.accept ? [] : [1]), 2].map((index) =>
              fixtureVariant(
                {
                  "0": fixturePermanentId("opponent-keyword-attack-defender-0"),
                  "1": fixturePermanentId("opponent-keyword-attack-defender-1"),
                  "2": fixturePermanentId("opponent-keyword-attack-defender-2"),
                },
                index,
              ),
            ),
          );
          expect(state.events.filter((event) => event.redirected)).toHaveLength(scenario.accept ? 1 : 0);
          expect(
            capture.decisions.some(
              (decision) => decision.label === "Confirm targets" && decision.closedAt !== undefined,
            ),
          ).toBe(true);
          if (scenario.accept && !format.reduced) {
            const decision = capture.decisions.find((item) => item.label === "Confirm targets")!;
            const original = capture.arrows.find(
              (arrow) => arrow.source === attacker.permanentId && arrow.target === "security-opp",
            );
            const redirected = capture.arrows.find(
              (arrow) =>
                arrow.source === attacker.permanentId &&
                arrow.target === fixturePermanentId("opponent-keyword-attack-defender-1") &&
                arrow.at >= decision.closedAt!,
            );
            expect(original).toBeDefined();
            expect(redirected?.key).toBe(original!.key);
            expect(redirected!.at).toBeGreaterThan(original!.at);
            const blows = capture.motion.animations.filter((animation) => animation.name === "battle-claw");
            expect(blows).toHaveLength(1);
            expect(redirected!.at).toBeLessThanOrEqual(blows[0]!.firstAt);
            expect(
              capture.poses.some(
                (pose) =>
                  pose.permanentId === fixturePermanentId("opponent-keyword-attack-defender-0") &&
                  pose.at > redirected!.at &&
                  pose.cardName === "Monodramon",
              ),
            ).toBe(true);
            const relayout = capture.timings.find(
              (timing) =>
                timing.permanentId === fixturePermanentId("opponent-keyword-attack-defender-2") &&
                timing.at >= decision.closedAt! &&
                timing.duration === 420 &&
                timing.properties.includes("translate"),
            );
            expect(relayout, "the unchosen Agumon repositions after the duplicate target leaves").toBeDefined();
            expect(relayout!.endMs).toBe(420);
            expect(relayout!.nativeMs).toBeGreaterThanOrEqual(
              relayout!.endMs! - 34 * Math.max(1, Math.abs(relayout!.playbackRate)),
            );
            const poses = capture.poses.filter(
              (pose) =>
                pose.permanentId === fixturePermanentId("opponent-keyword-attack-defender-2") &&
                pose.at >= relayout!.at,
            );
            const settled = poses.at(-1)!;
            expect(settled).toMatchObject({ cardName: "Agumon", currentDP: 2000 });
            expect(poses.some((pose) => Math.hypot(pose.x - settled.x, pose.y - settled.y) > 2)).toBe(true);
          }
        }
        if (!format.reduced) {
          expect(capture.motion.captureQuality, JSON.stringify(capture.motion.frames)).toBe("usable");
          expect(capture.securityChecks.map((check) => check.cardName)).toEqual(
            securityIds.slice(0, scenario.securityRemoved).map((id) => getCardDefinition(id)!.nameEn),
          );
          if (scenario.securityRemoved > 1) {
            const arrows = capture.arrows.filter((arrow) => arrow.source === attacker.permanentId);
            expect(arrows.length).toBeGreaterThan(1);
            expect(new Set(arrows.map((arrow) => arrow.key)).size).toBe(1);
            const later = arrows.filter((arrow) => arrow.at >= capture.securityChecks[0]!.removedAt!);
            expect(later.length).toBeGreaterThan(0);
            expect(later.every((arrow) => arrow.sweepMs !== undefined && arrow.sweepMs >= 380)).toBe(true);
          }
          for (const [index, check] of capture.securityChecks.entries()) {
            expect(check.attackerName).toBe(getCardDefinition(scenario.attackerCardIds.at(-1)!)!.nameEn);
            expect(check.outcomeAt).toBeDefined();
            expect(check.exitAt).toBeGreaterThanOrEqual(check.outcomeAt!);
            expect(check.removedAt).toBeDefined();
            const reveal = check.poses.filter(
              (pose) =>
                pose.revealMs !== undefined && pose.revealEndMs !== undefined && pose.revealMs < pose.revealEndMs - 1,
            );
            expect(reveal.some((pose) => pose.painted)).toBe(true);
            expect(
              check.poses.some((pose) => pose.painted && pose.artLoaded && pose.attackerArtLoaded),
              `loaded card artwork in security check ${check.key}`,
            ).toBe(true);
            for (const pose of reveal)
              expect(pose.securityCount, `count during native reveal ${check.key} at ${pose.revealMs}ms`).toBe(
                4 - index,
              );
            expect(check.poses.some((pose) => pose.securityCount === 3 - index)).toBe(true);
            const disposal = check.poses.filter((pose) => pose.disposalMs !== undefined);
            expect(disposal.length).toBeGreaterThan(2);
            expect(disposal.at(-1)!.disposalMs).toBeGreaterThanOrEqual(disposal.at(-1)!.disposalEndMs! - 34);
            const next = capture.securityChecks[index + 1];
            if (next) expect(next.firstAt).toBeGreaterThanOrEqual(check.removedAt!);
          }
          const clips = capture.motion.animations.filter(
            (animation) =>
              animation.visibleFrames > 0 &&
              ["battle-security-reveal", "battle-security-exit", "battle-claw", "battle-arrow-extend"].includes(
                animation.name,
              ),
          );
          expect(clips.every((animation) => !animation.undersampled && !animation.cutShort)).toBe(true);
        }
      });
    }
  }

  for (const format of [
    { name: "desktop", width: 1440, height: 1000, speed: "normal", reduced: false },
    { name: "desktop", width: 1440, height: 1000, speed: "fast", reduced: false },
    { name: "phone", width: 320, height: 844, speed: "normal", reduced: false },
    { name: "reduced motion", width: 1440, height: 1000, speed: "normal", reduced: true },
  ]) {
    test(`real bot phase pacing (${format.name}, ${format.speed})`, async ({ page }, info) => {
      await page.setViewportSize({ width: format.width, height: format.height });
      await page.emulateMedia({ reducedMotion: format.reduced ? "reduce" : "no-preference" });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const lab = new EffectsLabPage(page);
      // Reuse the conserved printed-card board, leaving GrandGalemon in hand.
      // Its three established opposing Digimon make three real autonomous attacks.
      await lab.start(fixtureKeywordPacingVortexDecline, false, format.speed, false);
      const before = await lab.read();
      await startPacingCapture(page);
      await lab.button(/END TURN/i).click();
      await expect
        .poll(
          async () => {
            const current = await lab.read();
            return (
              current.queueIdle &&
              !current.decision &&
              current.board?.visible.turn?.seat === 0 &&
              current.board.visible.turn.count === before.board!.visible.turn!.count + 2
            );
          },
          { timeout: 65_000, intervals: [50, 100, 200] },
        )
        .toBe(true);
      const capture = await finishPacingCapture(page);
      const state = await lab.read();
      await info.attach("real-phase-pacing.json", {
        body: Buffer.from(JSON.stringify({ format, before, capture, state }, null, 2)),
        contentType: "application/json",
      });
      expect(errors).toEqual([]);
      expect(capture.truncated).toBe(false);
      expect(state.gateExpiries).toEqual([]);
      expect(state.steps.filter((step) => step.failed)).toEqual([]);
      expect(state.board!.visible.players[1]!.hand).toEqual([]);
      const attacks = state.events.filter((event) => event.kind === "attackDeclared" && event.seat === 1);
      expect(attacks).toHaveLength(3);
      expect(new Set(attacks.map((event) => event.attackerPermanentId)).size).toBe(3);
      expect(state.board!.visible.players[0]!.securityCount).toBe(1);
      if (format.reduced) return; // Terminal behavior; skipped ribbons make no native-duration claim.
      const opponent = capture.phasePanels.filter((panel) => panel.side === "opp");
      expect(opponent.map((panel) => panel.label)).toEqual([
        "Opponent's turn",
        "Unsuspend Phase",
        "Draw Phase",
        "Breeding Phase",
        "Main Phase",
      ]);
      for (const [index, panel] of opponent.entries()) {
        expect(panel.poses.some((pose) => pose.painted)).toBe(true);
        if (index > 0) expect(panel.firstAt).toBeGreaterThanOrEqual(opponent[index - 1]!.removedAt!);
        if (!format.reduced) {
          const clock = panel.poses.filter((pose) => pose.nativeMs !== undefined).at(-1)!;
          expect(clock.nativeMs).toBeGreaterThanOrEqual(clock.endMs! - 34 * Math.max(1, Math.abs(clock.playbackRate!)));
        }
      }
      if (!format.reduced) {
        expect(capture.motion.captureQuality, JSON.stringify(capture.motion.frames)).toBe("usable");
        const phases = capture.motion.animations.filter(
          (animation) =>
            animation.visibleFrames > 0 && ["arena-phase-ribbon", "battle-banner"].includes(animation.name),
        );
        const breeding = opponent.find((panel) => panel.label === "Breeding Phase")!;
        // Receipt and native paint are separate clocks. An earlier batch is
        // allowed, but its visible action must follow the completed phase.
        const hatch = capture.hatches.find((arrival) => arrival.cardId === "BT1-001")!;
        expect(hatch).toBeDefined();
        expect(hatch.at).toBeGreaterThanOrEqual(breeding.removedAt!);
        const main = opponent.find((panel) => panel.label === "Main Phase")!;
        const firstAttack = capture.arrows.find((arrow) =>
          arrow.source?.startsWith(fixturePermanentId("opponent-keyword-attack-defender")),
        )!;
        expect(firstAttack).toBeDefined();
        expect(firstAttack.at).toBeGreaterThanOrEqual(main.removedAt!);
        for (const [index, attack] of attacks.entries()) {
          const arrow = capture.arrows.find((item) => item.source === attack.attackerPermanentId)!;
          expect(arrow).toBeDefined();
          if (index > 0) expect(arrow.at).toBeGreaterThanOrEqual(capture.securityChecks[index - 1]!.removedAt!);
        }
        // Keep causal assertions ahead of the quality verdict so rejected
        // recordings still distinguish a sequence bug from missing frame evidence.
        expect(
          phases
            .filter((animation) => animation.undersampled || animation.cutShort)
            .map(({ name, firstAt, undersampled, cutShort }) => ({ name, firstAt, undersampled, cutShort })),
          "phase motion must remain sampled through native completion",
        ).toEqual([]);
      }
    });
  }

  for (const scenario of PHASE_PACING_SCENARIOS) {
    for (const format of [
      { name: "desktop", width: 1440, height: 1000, speed: "normal", reduced: false },
      { name: "desktop", width: 1440, height: 1000, speed: "fast", reduced: false },
      { name: "phone", width: 320, height: 844, speed: "normal", reduced: false },
      { name: "reduced motion", width: 1440, height: 1000, speed: "normal", reduced: true },
    ]) {
      test(`real bot action pacing: ${scenario.id} (${format.name}, ${format.speed})`, async ({ page }, info) => {
        await page.setViewportSize({ width: format.width, height: format.height });
        await page.emulateMedia({ reducedMotion: format.reduced ? "reduce" : "no-preference" });
        await installAudioCapture(page);
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const lab = new EffectsLabPage(page);
        await lab.start(scenario.fixture, false, format.speed, false);
        const before = await lab.read();
        const audioBefore = await readAudioCapture(page);
        await startPacingCapture(page);
        await lab.button(/END TURN/i).click();
        await expect
          .poll(
            async () => {
              const current = await lab.read();
              return (
                current.queueIdle &&
                !current.decision &&
                current.board?.visible.turn?.seat === 0 &&
                current.board.visible.turn.count === before.board!.visible.turn!.count + 2
              );
            },
            { timeout: 65_000, intervals: [50, 100, 200] },
          )
          .toBe(true);
        const capture = await finishPacingCapture(page);
        const state = await lab.read();
        const audioAfter = await readAudioCapture(page);
        await info.attach("integrated-audio.json", {
          body: Buffer.from(JSON.stringify({ before: audioBefore, after: audioAfter }, null, 2)),
          contentType: "application/json",
        });
        await info.attach("real-phase-pacing.json", {
          body: Buffer.from(JSON.stringify({ scenario, format, before, capture, state }, null, 2)),
          contentType: "application/json",
        });
        expect(errors).toEqual([]);
        expect(
          audioBefore.contexts.map((context) => context.state),
          "trusted input unlocked native audio",
        ).toEqual(["running"]);
        expect(audioAfter.contexts.map((context) => context.state)).toEqual(["running"]);
        expect(audioAfter.contexts[0]!.effectsGain).toBeGreaterThan(0);
        expect(audioAfter.contexts[0]!.musicGain).toBeGreaterThan(0);
        expect(audioAfter.peakEffects).toBeLessThanOrEqual(MAX_SOUND_VOICES);
        expect(audioAfter.voices.some((voice) => voice.bus === "music" && voice.loop && voice.bufferDuration > 0)).toBe(
          true,
        );
        const turnVoices = audioAfter.voices
          .slice(audioBefore.voices.length)
          .filter((voice) => voice.bus === "effects");
        expect(turnVoices.length, "real autonomous actions scheduled native effect voices").toBeGreaterThan(0);
        if (!format.reduced) {
          for (const [index, cardId] of scenario.handCardIds.entries()) {
            const card = getCardDefinition(cardId)!;
            const occurrence = capture.arrivals.filter((entry) => entry.cardId === cardId)[
              scenario.flow === "play-grouping" ? index : 0
            ]!;
            const kind = scenario.flow === "play-grouping" ? "cardPlay" : "digivolve";
            const details = { cost: card.playCost, targetLevel: card.level };
            // Central showcases precede physical arrival metadata, so their source stays neutral.
            const key = cueKey(kind, details);
            const expectedCue = AUDIO_CUES[key]!;
            const voice = turnVoices.find(
              (entry) =>
                entry.at >= occurrence.firstAt - 50 &&
                entry.at <= occurrence.lastAt + 50 &&
                !entry.loop &&
                Math.abs(entry.offset - expectedCue.offset) < 0.000001 &&
                Math.abs((entry.duration ?? 0) - expectedCue.duration) < 0.000001,
            );
            expect(voice, `native packed cue ${key} accompanies painted ${cardId}`).toBeDefined();
            expect(voice!.showcase?.cardId).toBe(cardId);
            expect(voice!.showcase?.key).toBeTruthy();
            expect(voice!.bufferDuration).toBeGreaterThan(expectedCue.offset + expectedCue.duration);
            expect(voice!.sampleRate).toBeGreaterThanOrEqual(44_100);
            expect(voice!.playbackRate).toBe(1);
          }
        }
        expect(capture.truncated).toBe(false);
        expect(state.gateExpiries).toEqual([]);
        expect(state.steps.filter((step) => step.failed)).toEqual([]);
        expect(state.board!.visible.players[1]!.hand).toEqual([]);
        expect(state.board!.visible.players[0]!.securityCount).toBe(4 - scenario.securityRemoved);
        const attacks = state.events.filter((event) => event.kind === "attackDeclared" && event.seat === 1);
        expect(attacks).toHaveLength(scenario.securityRemoved);
        const evolved = state.events.filter((event) => event.kind === "digivolved" && event.seat === 1);
        const played = state.events.filter((event) => event.kind === "cardPlayed" && event.seat === 1);
        const moved = state.events.filter((event) => event.kind === "movedFromBreeding" && event.seat === 1);
        expect(evolved.map((event) => event.cardId)).toEqual(
          scenario.flow === "raising-evolution"
            ? scenario.handCardIds
            : scenario.flow === "raising-move"
              ? ["ST1-08"]
              : [],
        );
        expect(played.map((event) => event.cardId)).toEqual(
          scenario.flow === "play-grouping" ? scenario.handCardIds : [],
        );
        expect(moved).toHaveLength(scenario.flow === "raising-move" ? 1 : 0);
        if (scenario.flow === "raising-evolution") {
          const raised = state.board!.visible.players[1]!.breeding!;
          expect([...raised.stack, raised.topCard].map((card) => card.cardId)).toEqual([
            "ST1-01",
            ...scenario.handCardIds,
          ]);
          expect(
            state.events.filter((event) => event.kind === "effectTriggered" && event.sourceCardId === "ST1-08"),
          ).toEqual([]);
        }
        if (scenario.flow === "raising-move") {
          expect(state.board!.visible.players[1]!.breeding == null).toBe(true);
          expect(state.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "ST1-08")).toBe(
            true,
          );
        }
        // Reduced motion drains visual cues; its actual effect resolution is checked above.
        if (scenario.flow === "raising-move" && !format.reduced) {
          const evolutionIndex = state.events.indexOf(evolved[0]!);
          const sourceId = evolved[0]!.permanentId;
          // The opponent's private chooseTargets prompt is not sent to this seat.
          // Its synchronized DP delta is the public presentation of the chosen copy.
          const choices = capture.dpPulses.filter(
            (pulse) =>
              pulse.to - pulse.from === 3000 &&
              pulse.permanentId?.startsWith(fixturePermanentId("opponent-phase-pacing")),
          );
          expect(choices).toHaveLength(1);
          const choice = choices[0]!;
          expect(choice.deltaText).toBe("3K");
          expect(
            capture.poses.some(
              (pose) =>
                pose.memberIds.includes(choice.permanentId!) &&
                pose.painted &&
                pose.artLoaded &&
                pose.at >= choice.firstAt &&
                pose.at <= choice.lastAt,
            ),
            "the real +3000 DP choice painted over its physical target",
          ).toBe(true);
          const sourceFocuses = capture.sourceFocuses.filter(
            (focus) => focus.cardId === "ST1-08" && focus.permanentId === sourceId,
          );
          expect(sourceFocuses.length, "Garudamon's actual field source painted").toBeGreaterThan(0);
          expect(sourceFocuses.every((focus) => focus.removedAt !== undefined)).toBe(true);
          for (const focus of sourceFocuses) expect(choice.firstAt).toBeGreaterThanOrEqual(focus.removedAt!);
          const arrival = capture.arrivals.find((entry) => entry.cardId === "ST1-08")!;
          expect(arrival).toBeDefined();
          const landing = capture.poses.find(
            (pose) =>
              pose.memberIds.includes(sourceId!) && pose.cardName === "Garudamon" && pose.painted && pose.artLoaded,
          );
          expect(landing).toBeDefined();
          expect(arrival.removedAt).toBeDefined();
          expect(landing!.at + 1).toBeGreaterThanOrEqual(arrival.removedAt!);
          expect(choice.firstAt).toBeGreaterThanOrEqual(landing!.at);
          for (const attack of attacks.filter((event) => state.events.indexOf(event) > evolutionIndex)) {
            const arrow = capture.arrows.find((entry) => entry.source === attack.attackerPermanentId);
            expect(arrow, `painted post-evolution attack by ${attack.attackerPermanentId}`).toBeDefined();
            expect(arrow!.at).toBeGreaterThanOrEqual(landing!.at);
            expect(arrow!.at).toBeGreaterThanOrEqual(choice.lastAt);
            for (const focus of sourceFocuses) expect(arrow!.at).toBeGreaterThanOrEqual(focus.removedAt!);
          }
        }
        if (scenario.flow === "play-grouping") {
          const ids = played.map((event) => event.permanentId!);
          expect(new Set(ids).size).toBe(2);
          const grouped = capture.poses.filter(
            (pose) =>
              !pose.returning && ids.every((id) => pose.memberIds.includes(id)) && pose.painted && pose.artLoaded,
          );
          expect(grouped.length, "both physical copies share one actual rendered group").toBeGreaterThan(0);
          expect(grouped.at(-1)!.memberIds).toHaveLength(2);
          if (!format.reduced) {
            for (const id of ids) {
              expect(
                capture.poses.some(
                  (pose) => pose.memberIds.length === 1 && pose.memberIds[0] === id && pose.painted && pose.artLoaded,
                ),
                `physical copy ${id} painted before grouping`,
              ).toBe(true);
            }
            const returning = capture.poses.filter(
              (pose) =>
                pose.returning && pose.memberIds.some((id) => ids.includes(id)) && pose.painted && pose.artLoaded,
            );
            expect(returning.length, "the merging physical copy has a painted artwork flight").toBeGreaterThan(1);
            const first = returning[0]!;
            const last = returning.at(-1)!;
            expect(Math.hypot(last.x - first.x, last.y - first.y)).toBeGreaterThan(1);
            const destination = grouped.find((pose) => pose.at === last.at && pose.fieldKey === last.fieldKey);
            expect(destination, "the merge reaches its actual group's artwork").toBeDefined();
            expect(Math.hypot(last.x - destination!.x, last.y - destination!.y)).toBeLessThan(3);
          }
        }
        if (format.reduced) return;
        expect(capture.motion.captureQuality, JSON.stringify(capture.motion.frames)).toBe("usable");
        const phases = capture.phasePanels.filter((panel) => panel.side === "opp");
        expect(phases.map((panel) => panel.label)).toEqual([
          "Opponent's turn",
          "Unsuspend Phase",
          "Draw Phase",
          "Breeding Phase",
          "Main Phase",
        ]);
        const main = phases.find((panel) => panel.label === "Main Phase")!;
        expect(main.removedAt).toBeDefined();
        for (const panel of phases) {
          expect(panel.poses.some((pose) => pose.painted)).toBe(true);
          const clock = panel.poses.filter((pose) => pose.nativeMs !== undefined).at(-1)!;
          expect(clock.nativeMs).toBeGreaterThanOrEqual(clock.endMs! - 34 * Math.max(1, Math.abs(clock.playbackRate!)));
        }
        if (scenario.flow === "raising-evolution") {
          const raised = capture.raising.filter(
            (entry) => entry.permanentId === fixturePermanentId("opponent-phase-pacing-raising"),
          );
          expect(raised.map((entry) => entry.cardId)).toEqual(["ST1-01", ...scenario.handCardIds]);
          for (const [index, entry] of raised.entries()) {
            expect(entry.poses.some((pose) => pose.painted && pose.artLoaded)).toBe(true);
            if (index > 0) {
              expect(entry.firstAt).toBeGreaterThanOrEqual(main.removedAt!);
              const native = entry.poses.filter((pose) => pose.nativeMs !== undefined).at(-1)!;
              expect(native, `native evolution for ${entry.cardId}`).toBeDefined();
              expect(native.nativeMs).toBeGreaterThanOrEqual(
                native.endMs! - 34 * Math.max(1, Math.abs(native.playbackRate!)),
              );
              expect(raised[index - 1]!.removedAt).toBeLessThanOrEqual(entry.firstAt);
            }
          }
        } else {
          const expectedIds: readonly string[] = scenario.flow === "play-grouping" ? scenario.handCardIds : ["ST1-08"];
          const arrivals = capture.arrivals.filter((arrival) => expectedIds.includes(arrival.cardId));
          expect(arrivals.map((arrival) => arrival.cardId)).toEqual(expectedIds);
          for (const [index, arrival] of arrivals.entries()) {
            expect(arrival.firstAt).toBeGreaterThanOrEqual(main.removedAt!);
            const exit = arrival.poses.filter((pose) => pose.exitMs !== undefined).at(-1)!;
            expect(exit).toBeDefined();
            const endpoint = exit.at + Math.max(0, exit.exitEndMs! - exit.exitMs!) / Math.abs(exit.exitRate!);
            const permanentId =
              scenario.flow === "play-grouping" ? played[index]!.permanentId : evolved[0]!.permanentId;
            const name = getCardDefinition(arrival.cardId)!.nameEn;
            const landing = capture.poses.find(
              (pose) => pose.permanentId === permanentId && pose.cardName === name && pose.painted && pose.artLoaded,
            );
            expect(landing, `painted physical landing for ${permanentId}`).toBeDefined();
            expect(landing!.at + 1).toBeGreaterThanOrEqual(endpoint);
          }
          const relayout = capture.timings.filter(
            (timing) =>
              timing.duration === 420 &&
              (timing.permanentId?.startsWith(fixturePermanentId("opponent-phase-pacing")) ||
                played.some((event) => event.permanentId === timing.permanentId)) &&
              timing.properties.some((property) => ["transform", "translate"].includes(property)),
          );
          expect(relayout.length).toBeGreaterThan(0);
          expect(
            relayout.every(
              (timing) => (timing.nativeMs ?? 0) >= timing.endMs! - 34 * Math.max(1, Math.abs(timing.playbackRate)),
            ),
          ).toBe(true);
        }
        if (scenario.flow === "raising-move") {
          const transfer = capture.breedingTransfers.find((entry) => entry.permanentId === moved[0]!.permanentId)!;
          expect(transfer).toBeDefined();
          expect(transfer.poses.some((pose) => pose.painted && pose.artLoaded)).toBe(true);
          expect(transfer.firstAt).toBeGreaterThanOrEqual(
            phases.find((panel) => panel.label === "Breeding Phase")!.removedAt!,
          );
          expect(transfer.removedAt).toBeLessThanOrEqual(main.firstAt);
          const last = transfer.poses.at(-1)!;
          expect(last.nativeMs).toBeGreaterThanOrEqual(last.endMs! - 34 * Math.max(1, Math.abs(last.playbackRate!)));
          expect(Math.hypot(last.x - last.targetX!, last.y - last.targetY!)).toBeLessThan(3);
        }
        const clips = capture.motion.animations.filter(
          (animation) =>
            animation.visibleFrames > 0 &&
            ["battle-banner", "arena-phase-ribbon", "battle-showcase-exit", "battle-particle-clock"].includes(
              animation.name,
            ) &&
            (animation.undersampled || animation.cutShort),
        );
        expect(
          clips.map(({ name, firstAt, undersampled, cutShort }) => ({ name, firstAt, undersampled, cutShort })),
          "native action clips must finish with usable sampling",
        ).toEqual([]);
      });
    }
  }

  for (const scenario of KEYWORD_END_ATTACK_PACING_SCENARIOS) {
    for (const format of [
      { name: "desktop", width: 1440, height: 1000, speed: "normal", reduced: false },
      { name: "desktop", width: 1440, height: 1000, speed: "fast", reduced: false },
      { name: "phone", width: 320, height: 844, speed: "normal", reduced: false },
      { name: "reduced motion", width: 1440, height: 1000, speed: "normal", reduced: true },
    ]) {
      test(`real keyword pacing: ${scenario.id} (${format.name}, ${format.speed})`, async ({ page }, info) => {
        await page.setViewportSize({ width: format.width, height: format.height });
        await page.emulateMedia({ reducedMotion: format.reduced ? "reduce" : "no-preference" });
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const lab = new EffectsLabPage(page);
        await lab.start(scenario.fixture, false, format.speed, false);
        const before = await lab.read();
        await startPacingCapture(page);
        const actions: { name: string; observedAt: number }[] = [];
        const boundary = async (name: string) =>
          actions.push({ name, observedAt: await page.evaluate(() => performance.now()) });
        const game = new GamePage(page);
        await boundary(scenario.flow === "blitz" ? "digivolve" : "play-source");
        if (scenario.flow === "blitz") {
          await game.dragCardTo(
            /^Omnimon$/i,
            page.locator(`[data-drop="perm-you"][data-id="${fixturePermanentId("own-keyword-attack-attacker")}"]`),
          );
          await boundary("confirm-digivolution");
          await page.getByRole("button", { name: "Digivolve", exact: true }).click();
          await page.getByRole("button", { name: "Select all, top to bottom", exact: true }).click();
          await boundary("confirm-effect-order");
          await page.getByRole("button", { name: "Resolve in this order", exact: true }).click();
        } else {
          await game.play(/^GrandGalemon$/i);
          await expect
            .poll(
              async () => {
                const state = await lab.read();
                return (
                  state.board?.visible.players[0]!.battleArea.some((p) => p.topCard.cardId === scenario.sourceCardId) &&
                  state.queueIdle
                );
              },
              { timeout: 40_000 },
            )
            .toBe(true);
          await boundary("end-turn");
          await lab.button(/END TURN/i).click();
          await expect.poll(async () => (await lab.read()).decision?.kind).toMatch(/^(orderTriggers|optional)$/);
          if ((await lab.read()).decision?.kind === "orderTriggers") {
            await page.getByRole("button", { name: /GrandGalemon/i }).click();
            await page.getByRole("button", { name: "Resolve effect", exact: true }).click();
          }
        }
        const use = page.getByRole("button", { name: /^(Yes, activate|Use)$/i });
        await expect(use).toBeVisible();
        // Sample the actual mounted prompt before answering it; no injected engine response.
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                (window as unknown as { __keywordPacingCapture: { decisions: unknown[] } }).__keywordPacingCapture
                  .decisions.length,
            ),
          )
          .toBeGreaterThan(0);
        await boundary(scenario.accept ? "accept-attack" : "decline-attack");
        await (scenario.accept ? use : page.getByRole("button", { name: /^(No, decline|Don't use)$/i })).click();
        const ready = await lab.read();
        const attacker = ready.board!.visible.players[0]!.battleArea.find(
          (p) => p.topCard.cardId === scenario.sourceCardId,
        )!;
        if (scenario.accept) {
          if (scenario.flow === "blitz") {
            await expect
              .poll(async () => {
                const current = await lab.read();
                return (
                  current.queueIdle &&
                  !current.decision &&
                  current.board?.live.players[0]!.battleArea.some(
                    (card) => card.permanentId === attacker.permanentId && card.canAttackPlayer,
                  )
                );
              })
              .toBe(true);
            await expect(page.locator(".narration-peek")).toHaveCount(0);
            await boundary("attack-security");
            await game.attack(attacker.permanentId, page.locator('[data-drop="opp-security"]'));
          } else {
            const prompt = page.getByRole("region", { name: "Attack target", exact: true });
            await expect(prompt).toBeVisible();
            await waitForDecisionPaint(page, "Attack target");
            await boundary("choose-second-suspended-target");
            await clickFieldArtwork(page, fixturePermanentId("opponent-keyword-attack-defender-1"), "Monodramon");
            await prompt.getByRole("button", { name: "Attack", exact: true }).click();
          }
        }
        await expect
          .poll(
            async () => {
              const state = await lab.read();
              expect(state.gateExpiries).toEqual([]);
              expect(state.steps.filter((step) => step.failed)).toEqual([]);
              // Observe the first painted turn handoff. The autonomous opponent can
              // hatch/pass before its phase banners drain, so whole-game queue idle
              // is not a stable boundary for this outgoing-turn capture.
              return (
                state.board?.visible.turn?.seat === 1 &&
                state.board.visible.turn.count === before.board!.visible.turn!.count + 1 &&
                state.board.visible.players[1]!.securityCount === 4 - scenario.securityRemoved &&
                state.board.visible.players[0]!.battleArea.some(
                  (p) =>
                    p.permanentId === attacker.permanentId &&
                    p.isSuspended === (scenario.flow === "vortex" && scenario.accept),
                ) &&
                (!scenario.accept || state.events.some((event) => event.kind === "attackEnded"))
              );
            },
            { timeout: 45_000, intervals: [50, 100, 200] },
          )
          .toBe(true);
        const capture = await finishPacingCapture(page);
        const state = await lab.read();
        await info.attach("real-keyword-pacing.json", {
          body: Buffer.from(
            JSON.stringify({ scenario, format, speed: format.speed, actions, before, capture, state }, null, 2),
          ),
          contentType: "application/json",
        });
        expect(capture.truncated || state.truncated).toBe(false);
        expect(errors).toEqual([]);
        const handoffAt = capture.boards.find((board) => board.turnSeat === 1)?.at ?? capture.finishedAt;
        expectOnlyCompletedDpReplacements(state.steps.filter((step) => step.at < handoffAt));
        expect(state.board!.visible.turn!.count).toBe(before.board!.visible.turn!.count + 1);
        expect(state.board!.visible.players[1]!.hand).toEqual([]);
        expect(state.board!.visible.players[1]!.securityCount).toBe(4 - scenario.securityRemoved);
        expect(state.board!.visible.players[0]!.securityCount).toBe(4);
        expect(
          state.events.filter((event) => event.kind === "attackDeclared" && event.seat === 0 && !event.redirected),
        ).toHaveLength(scenario.accept ? 1 : 0);
        expect(
          state.events
            .filter((event) => event.kind === "securityChecked" && event.seat === 1)
            .map((event) => event.revealedCardId),
        ).toEqual(scenario.securityRemoved ? ["BT1-011"] : []);
        const final = state.board!.visible.players[0]!.battleArea.find((p) => p.permanentId === attacker.permanentId)!;
        expect(final.topCard.cardId).toBe(scenario.sourceCardId);
        expect(final.isSuspended).toBe(scenario.flow === "vortex" && scenario.accept);
        if (scenario.flow === "blitz") expect(final.stack.map((card) => card.cardId)).toEqual(["ST1-10"]);
        else
          expect(
            state
              .board!.visible.players[1]!.battleArea.filter((p) => p.topCard.cardId !== "BT1-089")
              .map((p) => p.permanentId),
          ).toEqual(
            [0, ...(scenario.accept ? [] : [1]), 2].map((index) =>
              fixtureVariant(
                {
                  "0": fixturePermanentId("opponent-keyword-attack-defender-0"),
                  "1": fixturePermanentId("opponent-keyword-attack-defender-1"),
                  "2": fixturePermanentId("opponent-keyword-attack-defender-2"),
                },
                index,
              ),
            ),
          );
        for (const seat of [0, 1])
          expect(
            state.board!.visible.players[seat]!.battleArea.find(
              (p) =>
                p.permanentId ===
                fixtureVariant(
                  {
                    "0": fixturePermanentId("own-keyword-attack-control"),
                    "1": fixturePermanentId("opponent-keyword-attack-control"),
                  },
                  seat,
                ),
            ),
          ).toMatchObject(before.board!.visible.players[seat]!.battleArea[0]!);
        if (!format.reduced) {
          expect(capture.motion.captureQuality).toBe("usable");
          const arrival = capture.arrivals.find((item) => item.cardId === scenario.sourceCardId)!;
          expect(arrival).toBeDefined();
          expect(arrival.poses.some((pose) => pose.painted && pose.artLoaded)).toBe(true);
          expect(arrival.removedAt).toBeDefined();
          const paintedExit = arrival.poses.filter((pose) => pose.exitMs !== undefined);
          expect(paintedExit.at(-1)!.exitMs).toBeGreaterThanOrEqual(paintedExit.at(-1)!.exitEndMs! - 34);
          const sourcePose = capture.poses.find(
            (pose) =>
              pose.permanentId === attacker.permanentId &&
              pose.cardName === getCardDefinition(scenario.sourceCardId)!.nameEn,
          );
          expect(sourcePose).toBeDefined();
          expect(sourcePose!.at).toBeGreaterThanOrEqual(arrival.lastAt);
          // The last rAF can precede the endpoint by one frame. Reconstruct the
          // native endpoint from that sample; a 30ms early field handoff must fail.
          const lastExit = paintedExit.at(-1)!;
          const nativeEndAt = lastExit.at + (lastExit.exitEndMs! - lastExit.exitMs!) / Math.abs(lastExit.exitRate!);
          expect(sourcePose!.at + 1).toBeGreaterThanOrEqual(nativeEndAt);
          const turn = capture.boards.find((board) => board.turnSeat === 1)!;
          expect(turn).toBeDefined();
          const attackArrow = capture.arrows.find((arrow) => arrow.source === attacker.permanentId);
          if (scenario.accept) {
            expect(attackArrow).toBeDefined();
            expect(attackArrow!.at).toBeGreaterThanOrEqual(sourcePose!.at);
            const blow = capture.motion.animations.find((animation) => animation.name === "battle-claw")!;
            expect(blow).toBeDefined();
            expect(blow.firstAt).toBeGreaterThanOrEqual(attackArrow!.at);
            expect(turn.at).toBeGreaterThan(blow.lastAt);
          } else expect(attackArrow).toBeUndefined();
          const clips = capture.motion.animations.filter(
            (animation) =>
              animation.firstAt < handoffAt &&
              animation.visibleFrames > 0 &&
              [
                "battle-showcase-turn",
                "battle-showcase-exit",
                "battle-claw",
                "battle-security-reveal",
                "battle-security-exit",
              ].includes(animation.name),
          );
          expect(clips.every((animation) => !animation.undersampled && !animation.cutShort)).toBe(true);
          if (scenario.flow === "vortex" && scenario.accept) {
            const relayout = capture.timings.find(
              (timing) =>
                timing.permanentId === fixturePermanentId("opponent-keyword-attack-defender-2") &&
                timing.duration === 420 &&
                timing.properties.includes("translate"),
            );
            expect(relayout).toBeDefined();
            expect(relayout!.nativeMs).toBeGreaterThanOrEqual(
              relayout!.endMs! - 34 * Math.max(1, Math.abs(relayout!.playbackRate)),
            );
          }
        }
      });
    }
  }

  for (const scenario of KEYWORD_DECK_PACING_SCENARIOS) {
    for (const format of [
      { name: "desktop", width: 1440, height: 1000, speed: "normal", reduced: false },
      { name: "desktop", width: 1440, height: 1000, speed: "fast", reduced: false },
      { name: "phone", width: 320, height: 844, speed: "normal", reduced: false },
      { name: "reduced motion", width: 1440, height: 1000, speed: "normal", reduced: true },
    ]) {
      test(`real keyword pacing: ${scenario.id} (${format.name}, ${format.speed})`, async ({ page }, info) => {
        await page.setViewportSize({ width: format.width, height: format.height });
        await page.emulateMedia({ reducedMotion: format.reduced ? "reduce" : "no-preference" });
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const lab = new EffectsLabPage(page);
        await lab.start(scenario.fixture, false, format.speed);
        await expect.poll(async () => (await lab.read()).queueIdle).toBe(true);
        const before = await lab.read();
        await startPacingCapture(page);
        const actions = [
          {
            label: scenario.sourceSeat === 0 ? "play-source" : "end-turn",
            observedAt: await page.evaluate(() => performance.now()),
          },
        ];
        if (scenario.sourceSeat === 0)
          await new GamePage(page).play(new RegExp(`^${getCardDefinition(scenario.sourceCardId)!.nameEn}$`, "i"));
        else await lab.button(/END TURN/i).click();
        await expect
          .poll(
            async () => {
              const state = await lab.read();
              expect(state.gateExpiries).toEqual([]);
              expect(state.steps.filter((step) => step.failed || step.cancelled || step.phase === "dropped")).toEqual(
                [],
              );
              return (
                state.board?.visible.players[scenario.sourceSeat]!.battleArea.some(
                  (card) => card.topCard.cardId === scenario.sourceCardId,
                ) &&
                (scenario.amount === 0 ||
                  state.events.some(
                    (event) => event.kind === "effectResolved" && event.sourceCardId === scenario.sourceCardId,
                  )) &&
                state.queueIdle &&
                state.pendingSteps === 0 &&
                !state.decision &&
                state.board?.live.stateVersion === state.board?.displayed.stateVersion
              );
            },
            { timeout: 45_000 },
          )
          .toBe(true);
        const capture = await finishPacingCapture(page);
        const state = await lab.read();
        await info.attach("real-keyword-pacing.json", {
          body: Buffer.from(
            JSON.stringify({ scenario, format, speed: format.speed, actions, before, capture, state }, null, 2),
          ),
          contentType: "application/json",
        });
        await info.attach("deck-effect-field.png", { body: await page.screenshot(), contentType: "image/png" });
        expect(errors).toEqual([]);
        expect(capture.truncated || state.truncated).toBe(false);
        // Drain mode has no effect motion to time; its immediate terminal DOM is
        // checked below. Only moving cases contribute native timing evidence.
        if (!format.reduced) expect(capture.motion.captureQuality).toBe("usable");
        expect(state.board!.visible.players[1]!.hand).toEqual([]);
        const sourceSeat = state.board!.visible.players[scenario.sourceSeat]!;
        expect(sourceSeat.securityCount).toBe(
          scenario.initialSecurity + (scenario.flow === "recovery" ? scenario.amount : 0),
        );
        for (const seat of [0, 1])
          expect(
            state.board!.visible.players[seat]!.battleArea.some(
              (card) =>
                card.permanentId ===
                fixtureVariant(
                  {
                    "0": fixturePermanentId("own-keyword-deck-control"),
                    "1": fixturePermanentId("opponent-keyword-deck-control"),
                  },
                  seat,
                ),
            ),
          ).toBe(true);
        const clause = state.steps.find(
          (step) =>
            step.phase === "started" &&
            step.timing === "OnPlay" &&
            step.sourceCardId === scenario.sourceCardId &&
            step.stepId.startsWith("narration-step-"),
        );
        if (scenario.amount === 0) {
          expect(clause).toBeUndefined();
          expect(capture.securityLandings).toEqual([]);
          expect(
            capture.securityPaints.every((paint) => paint.counts[scenario.sourceSeat] === scenario.initialSecurity),
          ).toBe(true);
          return;
        }
        expect(clause, "the printed On Play clause was presented").toBeDefined();
        const notice = capture.notices.find(
          (candidate) => candidate.id === clause!.stepId.slice("narration-step-".length),
        );
        expect(notice, "the actual On Play notice painted before its result").toBeDefined();
        const side = scenario.sourceSeat === 0 ? "you" : "opp";
        if (scenario.flow === "draw") {
          // Match physical presentation keys to their effect flight, not a time filter
          // that would silently omit an anticipatory effect draw. Turn draws have their own track.
          const effectKeys = new Set(
            state.steps
              .filter((step) => step.track === "drawFlight-presentation")
              .map((step) => step.stepId.slice("draw-flight-".length)),
          );
          const draws = capture.draws.filter((draw) => draw.side === side && effectKeys.has(draw.key));
          for (const draw of capture.draws.filter((candidate) => !effectKeys.has(candidate.key))) {
            const ribbon = capture.phaseRibbons.filter((candidate) => candidate.at <= draw.firstAt).at(-1);
            expect(ribbon, "a turn draw started under its own painted Draw ribbon").toMatchObject({
              label: "Draw Phase",
              side: draw.side,
            });
            const baseline = capture.boards.filter((sample) => sample.at < ribbon!.at).at(-1)!;
            const seat = draw.side === "you" ? 0 : 1;
            const handoff = seat === 0 ? 210 : 170;
            for (const pose of draw.poses.filter((candidate) => (candidate.ageMs ?? Infinity) < handoff)) {
              const shown = capture.boards.filter((sample) => sample.at <= pose.at).at(-1)!;
              expect(shown.handCounts[seat], "the turn draw's hand count waited for its native handoff").toBe(
                baseline.handCounts[seat],
              );
              expect(shown.deckCounts[seat], "the turn draw's deck count waited for its native handoff").toBe(
                baseline.deckCounts[seat],
              );
            }
            if (scenario.sourceSeat === 1 && draw.side === "you")
              expect(draw.firstAt).toBeGreaterThanOrEqual(draws.at(-1)!.lastAt);
          }
          expect(draws).toHaveLength(format.reduced ? 0 : scenario.amount);
          const clocks = capture.motion.animations.filter(
            (animation) =>
              animation.name ===
                (scenario.sourceSeat === 0 ? "battle-draw-presentation-viewer" : "battle-draw-presentation") &&
              draws.some((draw) => Math.abs(draw.firstAt - animation.firstAt) <= 34),
          );
          expect(clocks).toHaveLength(draws.length);
          expect(
            clocks.every(
              (clock) =>
                clock.durationMs === (scenario.sourceSeat === 0 ? 290 : 250) && !clock.cutShort && !clock.undersampled,
            ),
          ).toBe(true);
          for (const [index, draw] of draws.entries()) {
            expect(draw.firstAt).toBeGreaterThanOrEqual(notice!.firstAt);
            expect(draw.poses.length).toBeGreaterThan(2);
            if (index > 0) expect(draw.firstAt).toBeGreaterThanOrEqual(draws[index - 1]!.lastAt);
            if (scenario.sourceSeat === 0) {
              const arrival = capture.handArrivals.find((card) => card.instanceId === draw.instanceId);
              expect(arrival, "the physical drawn card arrived in the hand").toBeDefined();
              expect(arrival!.firstAt).toBeGreaterThan(draw.firstAt);
              expect(draw.cardName).toBe(getCardDefinition(arrival!.cardId)!.nameEn);
              const handedOver = draw.poses.find((pose) => (pose.ageMs ?? 0) >= 210);
              expect(handedOver, "the native card reached its handoff beat").toBeDefined();
              expect(arrival!.firstAt).toBeGreaterThanOrEqual(handedOver!.at);
            } else {
              expect(draw.cardName).toBeUndefined();
              expect(sourceSeat.hand).toEqual([]);
            }
            const previous = before.board!.visible.players[scenario.sourceSeat]!;
            const handBefore = previous.handCount - 1 + (scenario.sourceSeat === 1 ? 1 : 0) + index;
            const deckBefore = previous.deckCount - (scenario.sourceSeat === 1 ? 1 : 0) - index;
            const handoff = scenario.sourceSeat === 0 ? 210 : 170;
            const handedOver = draw.poses.find((pose) => (pose.ageMs ?? 0) >= handoff);
            expect(handedOver).toBeDefined();
            for (const pose of draw.poses.filter((candidate) => (candidate.ageMs ?? Infinity) < handoff)) {
              const board = capture.boards.filter((sample) => sample.at <= pose.at).at(-1)!;
              expect(board.handCounts[scenario.sourceSeat], "hand count stayed before this native handoff").toBe(
                handBefore,
              );
              expect(board.deckCounts[scenario.sourceSeat], "deck count stayed before this native handoff").toBe(
                deckBefore,
              );
            }
            const countAdvanced = capture.boards.find(
              (sample) =>
                sample.at >= draw.firstAt &&
                sample.handCounts[scenario.sourceSeat] === handBefore + 1 &&
                sample.deckCounts[scenario.sourceSeat] === deckBefore - 1,
            );
            expect(countAdvanced, "both counts advanced with this physical card").toBeDefined();
            expect(countAdvanced!.at).toBeGreaterThanOrEqual(handedOver!.at);
            if (index + 1 < draws.length) expect(countAdvanced!.at).toBeLessThanOrEqual(draws[index + 1]!.firstAt);
          }
          const countBefore = before.board!.visible.players[scenario.sourceSeat]!.handCount;
          expect(sourceSeat.handCount).toBe(countBefore - 1 + scenario.amount + (scenario.sourceSeat === 1 ? 1 : 0));
        } else {
          const landings = capture.securityLandings.filter((landing) => landing.side === side);
          expect(landings).toHaveLength(format.reduced ? 0 : 1);
          const increased = capture.securityPaints.find(
            (paint) => paint.counts[scenario.sourceSeat] === sourceSeat.securityCount,
          );
          expect(increased, "the actual security count was painted").toBeDefined();
          expect(capture.securityPaints.every((paint) => paint.faceUpCards[scenario.sourceSeat] === 0)).toBe(true);
          if (!format.reduced) {
            expect(increased!.at).toBeGreaterThanOrEqual(notice!.firstAt);
            const sourceFocus = capture.sourceFocuses.find((focus) => focus.cardId === scenario.sourceCardId);
            expect(sourceFocus, "Recovery's source painted before its consequence").toBeDefined();
            expect(landings[0]!.firstAt).toBeGreaterThanOrEqual(sourceFocus!.firstAt);
            expect(landings[0]!.firstAt).toBeGreaterThanOrEqual(notice!.firstAt);
            expect(increased!.at).toBeGreaterThanOrEqual(landings[0]!.firstAt - 34);
            expect(increased!.at).toBeLessThanOrEqual(landings[0]!.lastAt);
            expect(landings[0]!.frames).toBeGreaterThan(2);
            const clocks = capture.motion.animations.filter((animation) => animation.name === "battle-security-flight");
            expect(clocks).toHaveLength(1);
            expect(clocks[0]).toMatchObject({ durationMs: 200, cutShort: false, undersampled: false });
          }
        }
      });
    }
  }

  for (const scenario of KEYWORD_STACK_PACING_SCENARIOS) {
    for (const format of [
      { name: "desktop", width: 1440, height: 1000, speed: "normal", reduced: false },
      { name: "desktop", width: 1440, height: 1000, speed: "fast", reduced: false },
      { name: "phone", width: 320, height: 844, speed: "normal", reduced: false },
      { name: "reduced motion", width: 1440, height: 1000, speed: "normal", reduced: true },
    ]) {
      test(`real keyword pacing: ${scenario.id} (${format.name}, ${format.speed})`, async ({ page }, info) => {
        await page.setViewportSize({ width: format.width, height: format.height });
        await page.emulateMedia({ reducedMotion: format.reduced ? "reduce" : "no-preference" });
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const lab = new EffectsLabPage(page);
        await lab.start(scenario.fixture, false, format.speed);
        await expect.poll(async () => (await lab.read()).queueIdle).toBe(true);
        await startPacingCapture(page);
        const actions = [
          {
            label: scenario.flow === "de-digivolve" ? "play-option" : "activate-digi-burst",
            observedAt: await page.evaluate(() => performance.now()),
          },
        ];
        let decisionLabel: string;
        if (scenario.flow === "de-digivolve") {
          await new GamePage(page).play(
            new RegExp(scenario.optionCardId === "BT2-105" ? "Spider Shooter" : "Infinity Cannon"),
          );
          if (scenario.optionCardId === "BT2-106") {
            await expect.poll(async () => (await lab.read()).decision?.kind).toBe("chooseOption");
            const amountPrompt = page.getByRole("dialog", { name: "Infinity Cannon · effect", exact: true });
            await expect(amountPrompt).toBeVisible();
            await waitForDecisionPaint(page, "Infinity Cannon · effect");
            await amountPrompt.getByRole("button", { name: "4 cards", exact: true }).click();
          }
          await expect.poll(async () => (await lab.read()).decision?.kind).toBe("chooseTargets");
          const prompt = page.locator('[data-testid="board-prompt"], [role="dialog"]').filter({ visible: true }).last();
          await expect(prompt).toBeVisible();
          decisionLabel = (await prompt.getAttribute("aria-label"))!;
          await waitForDecisionPaint(page, decisionLabel);
          actions.push({ label: "select-stack", observedAt: await page.evaluate(() => performance.now()) });
          if ((await prompt.getAttribute("role")) === "dialog")
            await prompt
              .getByRole("button", { name: /^Phoenixmon/ })
              .first()
              .click();
          else await clickFieldArtwork(page, fixturePermanentId("opponent-keyword-stack-0"), "Phoenixmon");
          await prompt.getByRole("button", { name: "Confirm targets", exact: true }).click();
        } else {
          await clickFieldArtwork(page, fixturePermanentId("own-keyword-stack-0"), "WarGrowlmon");
          await page.getByRole("button", { name: /^Activate effect:/i }).click();
          const prompt = page.getByRole("dialog", { name: "WarGrowlmon · effect", exact: true });
          await expect(prompt).toBeVisible();
          decisionLabel = "WarGrowlmon · effect";
          await waitForDecisionPaint(page, decisionLabel);
          await prompt.getByRole("button", { name: /^Cupimon/ }).click();
          await prompt.getByRole("button", { name: /^Salamon/ }).click();
          actions.push({ label: "pay-source-cost", observedAt: await page.evaluate(() => performance.now()) });
          await prompt.getByRole("button", { name: "Confirm targets", exact: true }).click();
        }
        await expect
          .poll(
            async () => {
              const state = await lab.read();
              expect(state.gateExpiries).toEqual([]);
              expect(state.steps.filter((step) => step.failed || step.phase === "dropped")).toEqual([]);
              return (
                state.events.some((event) => event.kind === "effectResolved") &&
                state.queueIdle &&
                state.pendingSteps === 0 &&
                !state.decision &&
                state.board?.live.stateVersion === state.board?.displayed.stateVersion
              );
            },
            { timeout: 40_000 },
          )
          .toBe(true);
        const capture = await finishPacingCapture(page);
        const state = await lab.read();
        await info.attach("real-keyword-pacing.json", {
          body: Buffer.from(
            JSON.stringify({ scenario, format, speed: format.speed, actions, capture, state }, null, 2),
          ),
          contentType: "application/json",
        });
        await info.attach("stack-field.png", { body: await page.screenshot(), contentType: "image/png" });
        expect(errors).toEqual([]);
        expect(capture.truncated || state.truncated).toBe(false);
        expect(capture.motion.captureQuality).toBe("usable");
        expectOnlyCompletedDpReplacements(state.steps);
        const seat = scenario.flow === "de-digivolve" ? 1 : 0;
        const hostId = fixtureVariant(
          { "1": fixturePermanentId("opponent-keyword-stack-0"), "0": fixturePermanentId("own-keyword-stack-0") },
          seat,
        );
        const host = state.board!.visible.players[seat]!.battleArea.find((card) => card.permanentId === hostId)!;
        const control = state.board!.visible.players[seat]!.battleArea.find(
          (card) =>
            card.permanentId ===
            fixtureVariant(
              { "1": fixturePermanentId("opponent-keyword-stack-1"), "0": fixturePermanentId("own-keyword-stack-1") },
              seat,
            ),
        )!;
        const peels = capture.peels.filter((peel) => peel.permanentId === hostId);
        const removed = scenario.flow === "de-digivolve" ? scenario.removedCount : 2;
        expect(peels).toHaveLength(format.reduced ? 0 : removed);
        for (const family of ["lift", "sway", "fade", "rim"]) {
          const clocks = capture.motion.animations.filter(
            (animation) => animation.name === `battle-stack-strip-${family}`,
          );
          expect(clocks).toHaveLength(peels.length);
          expect(
            clocks.every((animation) => animation.durationMs === 595 && !animation.cutShort && !animation.undersampled),
          ).toBe(true);
        }
        const decision = capture.decisions.find(
          (candidate) => candidate.label === decisionLabel && candidate.closedAt !== undefined,
        )!;
        expect(decision).toBeDefined();
        for (const [index, peel] of peels.entries()) {
          expect(peel.frames).toBeGreaterThan(2);
          expect(peel.firstAt).toBeGreaterThanOrEqual(index === 0 ? decision.closedAt! : peels[index - 1]!.lastAt);
        }
        if (scenario.flow === "de-digivolve") {
          expect(host.topCard.cardId).toBe(scenario.expectedTopCardId);
          expect(host.stack).toHaveLength(4 - removed);
          expect(host.stack[0]!.cardId).toBe("BT1-001");
          expect(control.topCard.cardId).toBe("ST1-10");
          expect(control.stack).toHaveLength(4);
          expect(peels.map((peel) => peel.cardId)).toEqual(
            format.reduced ? [] : ["ST1-10", "ST1-08", "ST1-07"].slice(0, removed),
          );
          if (!format.reduced) {
            const expected = [
              { cardId: "ST1-08", cardName: "Garudamon", stackCount: 3, currentDP: 7000 },
              { cardId: "ST1-07", cardName: "Greymon", stackCount: 2, currentDP: 4000 },
              { cardId: "BT1-009", cardName: "Monodramon", stackCount: 1, currentDP: 3000 },
            ];
            for (const [index, promotion] of expected.slice(0, removed).entries()) {
              const board = capture.boards.find((sample) =>
                sample.permanents.some((card) => card.permanentId === hostId && card.cardId === promotion.cardId),
              );
              expect(board, `the ${promotion.cardId} handoff was projected`).toBeDefined();
              expect(board!.at).toBeGreaterThanOrEqual(peels[index]!.lastAt);
              expect(board!.permanents.find((card) => card.permanentId === hostId)).toMatchObject({
                cardId: promotion.cardId,
                stackCount: promotion.stackCount,
                currentDP: promotion.currentDP,
              });
              const artwork = capture.poses.find(
                (pose) => pose.permanentId === hostId && pose.cardName === promotion.cardName,
              );
              expect(artwork, `the ${promotion.cardName} artwork was painted`).toBeDefined();
              expect(artwork!.currentDP).toBe(promotion.currentDP);
              expect(artwork!.at).toBe(board!.at);
              expect(artwork!.at).toBeGreaterThanOrEqual(peels[index]!.lastAt);
              if (index + 1 < peels.length) expect(artwork!.at).toBeLessThanOrEqual(peels[index + 1]!.firstAt);
            }
          }
        } else {
          expect(host.topCard.cardId).toBe("BT4-046");
          expect(host.stack.map((card) => card.cardId)).toEqual(["BT1-051"]);
          expect(control.stack).toHaveLength(3);
          const target = state.board!.visible.players[1]!.battleArea.find(
            (card) => card.permanentId === fixturePermanentId("opponent-keyword-stack-target"),
          );
          expect(Boolean(target)).toBe(!scenario.deletesTarget);
          if (target) expect(target.currentDP).toBe(8000);
          expect(peels.map((peel) => peel.cardId)).toEqual(format.reduced ? [] : ["BT1-006", "ST3-02"]);
          if (!format.reduced) {
            const result = capture.boards.find((sample) =>
              scenario.deletesTarget
                ? !sample.permanents.some(
                    (card) => card.permanentId === fixturePermanentId("opponent-keyword-stack-target"),
                  )
                : sample.permanents.some(
                    (card) =>
                      card.permanentId === fixturePermanentId("opponent-keyword-stack-target") &&
                      card.currentDP === 8000,
                  ),
            );
            expect(result, "the paid effect's result was painted").toBeDefined();
            expect(result!.at).toBeGreaterThanOrEqual(peels.at(-1)!.lastAt);
            if (!scenario.deletesTarget) {
              const resultPose = capture.poses.find(
                (pose) =>
                  pose.permanentId === fixturePermanentId("opponent-keyword-stack-target") && pose.currentDP === 8000,
              );
              expect(resultPose, "the paid effect's DP was painted in the card chip").toBeDefined();
              expect(resultPose!.at).toBeGreaterThanOrEqual(peels.at(-1)!.lastAt);
            }
            const dpPulses = capture.dpPulses.filter(
              (pulse) => pulse.permanentId === fixturePermanentId("opponent-keyword-stack-target"),
            );
            // A zero-DP rule deletion can remove the target before its decoration paints.
            if (!scenario.deletesTarget) expect(dpPulses.length).toBeGreaterThan(0);
            expect(dpPulses.every((pulse) => pulse.firstAt >= peels.at(-1)!.lastAt)).toBe(true);
          }
        }
      });
    }
  }

  const groupFormats = [
    { name: "desktop", width: 1440, height: 1000, reduced: false },
    { name: "phone", width: 320, height: 844, reduced: false },
    { name: "tablet", width: 768, height: 1000, reduced: false },
    { name: "compact desktop", width: 1024, height: 1000, reduced: false },
    { name: "landscape", width: 844, height: 390, reduced: false },
    { name: "reduced motion", width: 1440, height: 1000, reduced: true },
  ];
  for (const format of groupFormats) {
    test(`real group pacing: activate, split and merge (${format.name})`, async ({ page }, info) => {
      await page.setViewportSize({ width: format.width, height: format.height });
      await page.emulateMedia({ reducedMotion: format.reduced ? "reduce" : "no-preference" });
      await page.addInitScript(() => localStorage.setItem("aegis.field-layout", "organized"));
      const lab = new EffectsLabPage(page);
      await lab.start(fixtureFieldGrouping, false);
      await expect(page.getByRole("button", { name: "Izzy Izumi (2 copies)", exact: true })).toBeVisible();
      await startPacingCapture(page);
      for (let index = 0; index < 2; index++) {
        await page
          .locator(
            `[data-drop="perm-you"][data-id="${fixtureVariant({ "0": fixturePermanentId("own-group-izzy-0"), "1": fixturePermanentId("own-group-izzy-1") }, index)}"]`,
          )
          .click();
        await page.getByRole("button", { name: /^Activate effect:/i }).click();
        const decision = page.getByRole("dialog", { name: "Izzy Izumi · effect", exact: true });
        await expect(decision).toBeVisible();
        await decision.getByRole("button", { name: /^Agumon$/i }).click();
        await decision.getByRole("button", { name: /^Confirm targets$/i }).click();
        await expect
          .poll(
            async () => {
              const state = await lab.read();
              expect(state.gateExpiries).toEqual([]);
              return (
                state.queueIdle &&
                state.pendingSteps === 0 &&
                state.events.filter((event) => event.kind === "effectResolved").length >= index + 1
              );
            },
            { timeout: 30_000 },
          )
          .toBe(true);
      }
      await expect(page.getByRole("button", { name: "Izzy Izumi (2 copies, Suspended)", exact: true })).toBeVisible();
      if (!format.reduced)
        await expect
          .poll(() =>
            page.evaluate(() =>
              (window as unknown as { __keywordPacingCapture: { timings: { returning: boolean }[] } })[
                "__keywordPacingCapture"
              ].timings.some((item) => item.returning),
            ),
          )
          .toBe(true);
      await expect(page.getByTestId("field-group-return")).toHaveCount(0);
      const capture = await finishPacingCapture(page);
      const state = await lab.read();
      await info.attach("real-group-pacing.json", {
        body: Buffer.from(JSON.stringify({ format, capture, state }, null, 2)),
        contentType: "application/json",
      });
      await info.attach("grouped-field.png", { body: await page.screenshot(), contentType: "image/png" });
      expect(capture.truncated).toBe(false);
      if (format.reduced) {
        expect(capture.timings.some((timing) => timing.returning)).toBe(false);
        return;
      }
      expect(capture.motion.captureQuality, JSON.stringify(capture.motion.frames)).toBe("usable");
      const turns = capture.timings.filter(
        (timing) => timing.properties.includes("rotate") && !timing.properties.includes("translate"),
      );
      expect(turns.length).toBeGreaterThan(0);
      expect(turns.every((timing) => timing.duration === 200)).toBe(true);
      const returns = capture.poses.filter((pose) => pose.returning);
      expect(returns.length).toBeGreaterThan(2);
      const lastReturn = returns.at(-1)!;
      const firstReturn = returns.find((pose) => pose.returnId === lastReturn.returnId)!;
      expect(Math.hypot(lastReturn.x - firstReturn.x, lastReturn.y - firstReturn.y)).toBeGreaterThan(10);
      const destination = capture.poses.find(
        (pose) => !pose.returning && pose.at === lastReturn.at && pose.fieldKey === lastReturn.fieldKey,
      );
      expect(destination, "return artwork must reach its surviving physical group").toBeDefined();
      expect(Math.hypot(lastReturn.x - destination!.x, lastReturn.y - destination!.y)).toBeLessThan(3);
    });
  }

  for (const phone of [false, true])
    test(`the opponent's hand play reveals then lands before On Play (${phone ? "phone" : "desktop"})`, async ({
      page,
    }, info) => {
      if (phone) await page.setViewportSize({ width: 390, height: 844 });
      const lab = new EffectsLabPage(page);
      await lab.start(fixtureOpponentPlay, false);
      await Promise.all([lab.captureArrival("BT1-029", info), lab.button(/END TURN/i).click()]);
      if (phone) await page.getByRole("button", { name: "Show the full notice", exact: true }).click();
      await expect
        .poll(
          async () => {
            const observed = await lab.read();
            expect(observed.gateExpiries).toEqual([]);
            expect(observed.truncated).toBe(false);
            return (
              observed.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT1-029") &&
              observed.queueIdle &&
              observed.pendingSteps === 0 &&
              observed.board?.live.stateVersion === observed.board?.displayed.stateVersion
            );
          },
          { timeout: 30_000, intervals: [50, 100, 200] },
        )
        .toBe(true);
      const observed = await lab.read();
      expect(
        observed.board?.visible.players[1]?.battleArea.some((permanent) => permanent.topCard.cardId === "BT1-029"),
        "the confirmed opponent play must remain on the rendered field",
      ).toBe(true);
      expect(observed.steps.filter((step) => step.failed || step.phase === "dropped" || step.cancelled)).toEqual([]);
      const visual = await page.evaluate(() => {
        const globals = window as unknown as {
          __labArrivals: Map<string, ArrivalPaint>;
          __labFocusAt: Map<string, number>;
          __labNoticeAt: Map<string, number>;
        };
        return {
          arrivals: [...globals.__labArrivals.values()],
          focusAt: globals.__labFocusAt.get("BT1-029"),
          notices: Object.fromEntries(globals.__labNoticeAt),
        };
      });
      const played = visual.arrivals.find((arrival) => arrival.cardId === "BT1-029");
      expect(played?.revealAt).toBeDefined();
      expect(played?.revealExitAt).toBeGreaterThan(played!.revealAt!);
      expect(played?.landingAt).toBeGreaterThanOrEqual(played!.revealExitAt!);
      expect(played!.revealExitAt! - played!.revealAt!).toBeGreaterThan(500);
      expect(played!.revealExitAt! - played!.revealAt!).toBeLessThan(750);
      expect(visual.focusAt).toBeGreaterThan(played!.landingAt!);
      const clause = observed.steps.find(
        (step) =>
          step.phase === "started" &&
          step.timing === "OnPlay" &&
          step.sourceCardId === "BT1-029" &&
          step.stepId.startsWith("narration-step-"),
      );
      expect(clause, "the On Play effect never started its narration").toBeDefined();
      expect(visual.notices[clause!.stepId.slice("narration-step-".length)]).toBeGreaterThan(played!.landingAt!);
    });

  for (const flow of [
    { accept: true, phone: false },
    { accept: true, phone: true },
    { accept: false, phone: false },
  ]) {
    const { accept, phone } = flow;
    test(`a played card activates optional watchers only after consent (${accept ? "accept" : "decline"}, ${phone ? "phone" : "desktop"})`, async ({
      page,
    }, info) => {
      if (phone) await page.setViewportSize({ width: 390, height: 844 });
      const lab = new EffectsLabPage(page);
      await lab.start(fixtureDrasilOptionalEffectPresets, false);
      await new GamePage(page).play(/^dracmon$/i);
      await lab.captureArrival("BT23-062", info);
      await page.getByRole("button", { name: "Select all, top to bottom", exact: true }).click();
      await page.getByRole("button", { name: "Resolve in this order", exact: true }).click();
      for (let index = 0; index < 2; index++) {
        const activation = page
          .getByRole("dialog")
          .filter({ has: page.getByRole("button", { name: "Yes, activate", exact: true }) });
        await expect(activation).toBeVisible();
        const before = await lab.read();
        expect(
          before.events.filter((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT23-072"),
        ).toHaveLength(accept ? index : 0);
        if (index === 0) {
          await expect(page.locator('[data-testid="effect-focus"][data-source-card-id="BT23-072"]')).toHaveCount(0);
          await expect(page.locator("[data-narration-id]").filter({ hasText: "King Drasil" })).toHaveCount(0);
        }
        if (accept && index === 1) {
          if (phone) await page.locator(".narration-peek").click();
          const accepted = page.locator("[data-narration-id]").filter({ hasText: "King Drasil" });
          await expect(accepted).toHaveCount(1);
          await expect(accepted).toBeVisible();
          const occurrence = await accepted.getAttribute("data-narration-id");
          const readingStartedAt = await page.evaluate(
            (id) => (window as unknown as { __labNoticeAt: Map<string, number> }).__labNoticeAt.get(id),
            occurrence!,
          );
          expect(readingStartedAt, "the accepted notice must have painted before its reading clock").toBeDefined();
          await page.waitForFunction((startedAt) => performance.now() - startedAt >= 5500, readingStartedAt!);
          await expect(accepted).toHaveAttribute("data-narration-id", occurrence!);
          await expect(accepted).toBeVisible();
          if (!phone) {
            const lane = await page.locator('[data-slot="narration-text"]').boundingBox();
            const prompt = await activation.boundingBox();
            expect(lane!.y + lane!.height).toBeLessThanOrEqual(prompt!.y);
          }
        }
        if (accept && index === 0) {
          if (phone) await page.getByRole("button", { name: /^view board$/i }).click();
          await page.getByRole("button", { name: "‹", exact: true }).click();
          if (phone) await page.getByRole("button", { name: "Return to decision", exact: true }).click();
        }
        await answerActivation(page, accept);
        if (accept && index === 0) {
          expect(
            before.decision?.sourcePermanentId,
            "the accepted watcher must name its physical source",
          ).toBeDefined();
          await lab.captureFocus("BT23-072", before.decision!.sourcePermanentId!, info);
        }
      }
      if (accept) {
        // The first notice has already been read for 5.5 seconds. Its independent
        // lifetime can expire during the second source focus; both accepted clauses
        // must still paint, each with its own occurrence, without extending that clock.
        await expect
          .poll(async () => {
            const observed = await lab.read();
            const clauses = observed.steps.filter(
              (step) =>
                step.phase === "started" &&
                step.sourceCardId === "BT23-072" &&
                step.stepId.startsWith("narration-step-"),
            );
            return new Set(clauses.map((step) => step.stepId)).size;
          })
          .toBe(2);
        const observed = await lab.read();
        const clauseIds = [
          ...new Set(
            observed.steps
              .filter(
                (step) =>
                  step.phase === "started" &&
                  step.sourceCardId === "BT23-072" &&
                  step.stepId.startsWith("narration-step-"),
              )
              .map((step) => step.stepId.slice("narration-step-".length)),
          ),
        ];
        await expect
          .poll(() =>
            page.evaluate((ids) => {
              const painted = (window as unknown as { __labPaintedNotices: Set<string> }).__labPaintedNotices;
              return ids.every((id) => painted.has(id));
            }, clauseIds),
          )
          .toBe(true);
      }
      await expect
        .poll(
          async () => {
            const observed = await lab.read();
            const drasil =
              observed.board?.visible.players[0]?.battleArea.filter(
                (permanent) => permanent.topCard.cardId === "BT23-072",
              ) ?? [];
            return (
              observed.queueIdle &&
              observed.pendingSteps === 0 &&
              observed.board?.live.pendingDecision === undefined &&
              drasil.length === 2 &&
              drasil.every((permanent) => permanent.isSuspended === accept)
            );
          },
          { timeout: 30_000, intervals: [50, 100, 200] },
        )
        .toBe(true);
      const after = await lab.read();
      expect(after.truncated).toBe(false);
      expect(
        after.events.filter((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT23-072"),
      ).toHaveLength(accept ? 2 : 0);
      expect(after.gateExpiries).toEqual([]);
      expect(after.steps.filter((step) => step.failed || step.phase === "dropped" || step.cancelled)).toEqual([]);
      const visual = await page.evaluate(() => {
        const globals = window as unknown as {
          __labArrivals: Map<string, ArrivalPaint>;
          __labFocusAt: Map<string, number>;
        };
        return { arrivals: [...globals.__labArrivals.values()], focusAt: globals.__labFocusAt.get("BT23-072") };
      });
      const played = visual.arrivals.find((arrival) => arrival.cardId === "BT23-062");
      expect(played?.revealAt, "the played hand card never painted its reveal").toBeDefined();
      expect(played?.revealExitAt).toBeGreaterThan(played!.revealAt!);
      expect(played?.landingAt, "the played hand card never painted its landing").toBeGreaterThanOrEqual(
        played!.revealExitAt!,
      );
      if (accept)
        expect(visual.focusAt, "the accepting watcher focused before the play landed").toBeGreaterThan(
          played!.landingAt!,
        );
      if (!accept) {
        await expect(page.locator("[data-narration-id]").filter({ hasText: "King Drasil" })).toHaveCount(0);
        const focused = await page.evaluate(() => [
          ...(window as unknown as { __labFocusedSources: Set<string> }).__labFocusedSources,
        ]);
        expect(focused).not.toContain("BT23-072");
      }
    });
  }

  const formats = [
    { name: "desktop", viewport: { width: 1440, height: 1000 }, reduced: false },
    { name: "phone", viewport: { width: 390, height: 844 }, reduced: false },
    { name: "reduced motion", viewport: { width: 1440, height: 1000 }, reduced: true },
  ];
  for (const phone of [false, true]) {
    test(`a repeated Tamer reveals and lights its physical card before grouping (${phone ? "phone" : "desktop"})`, async ({
      page,
    }) => {
      if (phone) await page.setViewportSize({ width: 390, height: 844 });
      await page.addInitScript(() => {
        localStorage.setItem("aegis:locale", "en");
        localStorage.setItem("aegis.field-layout", "organized");
      });
      await openFixturePage(page, fixtureInterleavedFieldGrouping);
      await new GamePage(page).endBreeding();
      const row = page.locator(".game-battle-row--you");
      await expect(row.getByRole("button", { name: "Izzy Izumi (3 copies)", exact: true })).toBeVisible();
      await page.evaluate(() => {
        const globals = window as unknown as {
          __groupedArrival?: {
            permanentId: string;
            target: { x: number; y: number };
            landing?: { x: number; y: number };
          };
        };
        const observe = () => {
          const landing = document.querySelector<HTMLElement>(
            '[data-testid="confirmed-play-landing"][data-card-id="BT1-088"]',
          );
          if (landing) {
            const art = landing.querySelector("img")!.getBoundingClientRect();
            const fieldArt = landing
              .closest("[data-id]")
              ?.querySelector<HTMLElement>("[data-state]")
              ?.getBoundingClientRect();
            if (fieldArt)
              globals["__groupedArrival"] = {
                permanentId: landing.dataset.permanentId!,
                target: { x: fieldArt.left + fieldArt.width / 2, y: fieldArt.top + fieldArt.height / 2 },
                landing: { x: art.left + art.width / 2, y: art.top + art.height / 2 },
              };
          }
          requestAnimationFrame(observe);
        };
        observe();
      });
      await new GamePage(page).play(/^izzy izumi$/i);
      await expect(row.locator('[data-testid="confirmed-play-landing"][data-card-id="BT1-088"]')).toBeVisible();
      await expect(row.getByRole("button", { name: "Izzy Izumi (4 copies)", exact: true })).toBeVisible();
      const arrival = await page.evaluate(
        () =>
          (
            window as unknown as {
              __groupedArrival?: {
                permanentId: string;
                target: { x: number; y: number };
                landing?: { x: number; y: number };
              };
            }
          )["__groupedArrival"],
      );
      expect(arrival?.landing, "the newly played physical copy must keep its landing cue").toBeDefined();
      expect(Math.abs(arrival!.landing!.x - arrival!.target.x)).toBeLessThan(3);
      expect(Math.abs(arrival!.landing!.y - arrival!.target.y)).toBeLessThan(3);
    });
  }
  for (const format of formats) {
    test(`the bot chain paints and settles (Stacked, ${format.name})`, async ({ page }) => {
      await page.setViewportSize(format.viewport);
      await page.emulateMedia({ reducedMotion: format.reduced ? "reduce" : "no-preference" });
      const lab = new EffectsLabPage(page);
      await lab.start();
      if (format.name === "desktop") {
        // This chain's short clauses can all fit on a tall desktop. Exercise a smaller
        // toast lane so reading position is tested while actual effects keep arriving.
        await page.addStyleTag({
          content: 'html .narration-slot[data-slot="narration-text"] { max-height: 12rem; overflow-y: auto; }',
        });
        await lab.readEarlierNotices();
      }
      if (format.name === "phone")
        await page.getByRole("button", { name: "Show the full notice", exact: true }).click();
      await lab.finish(format.reduced);
    });
  }
});
