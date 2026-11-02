import { writeFile } from "node:fs/promises";
import { expect, test as base, type Page, type Locator, type TestInfo } from "@playwright/test";
import { RED_DECK } from "../../api/dist/engine/testDecks.js";
import { CATALOG_DECKS, getCardDefinition, type DecisionRequest, type Intent } from "@aegis/shared";
import { startBrowserServer, useBrowserFixture } from "./server";
import type {} from "./harness";
import type { ScenarioFixture, ScenarioReferences } from "../../api/src/engine/scenario/types.js";

type Snapshot = ReturnType<Window["browserTestSnapshot"]>;
type Decision = NonNullable<Snapshot["pendingDecision"]> &
  Pick<DecisionRequest, "sourceCardId" | "sourceInstanceId" | "sourcePermanentId"> & {
    options: NonNullable<DecisionRequest["options"]>;
  };
type Selection = {
  accept?: boolean;
  decisionBudgetMs?: number;
  cardId?: string;
  instanceId?: string;
  instanceIds?: string[];
  triggerCardId?: string;
  choice?: number;
};
export type DecisionPolicy = (decision: Decision) => Selection | Promise<Selection>;

type HealthyOptions = {
  resumedEffectBudgets?: Record<string, number>;
  expectedCancelledStepIds?: readonly string[];
};

/** Drives only visible controls; snapshots and probes are read-only evidence. */
export class ScenarioPage {
  readonly errors: string[] = [];
  readonly decisionTimings: { decisionId: string; kind: string; sourceCardId?: string; delayMs: number }[] = [];
  private speed: "normal" | "slow" = "normal";
  constructor(
    readonly page: Page,
    private readonly useFixture?: (fixture: ScenarioFixture) => ScenarioReferences,
  ) {
    page.on("pageerror", (error) => this.errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") this.errors.push(message.text());
    });
  }
  async openFixture(
    fixture: ScenarioFixture,
    speed: "normal" | "slow" = "normal",
    breeding: "end" | "move" | "none" = fixture.turnSeat === 0 ? "end" : "none",
    allowRollback = false,
  ) {
    if (!this.useFixture) throw new Error("This ScenarioPage has no fixture server");
    const references = this.useFixture(fixture);
    await this.open("local-fixture", speed, breeding, allowRollback);
    return references;
  }
  /** `none`: the scenario opens on the opponent's turn, or the engine passes this Breeding phase itself. */
  async open(
    id: string,
    speed: "normal" | "slow" = "normal",
    breeding: "end" | "move" | "none" = "end",
    allowRollback = false,
  ) {
    this.speed = speed;
    await this.page.addInitScript(
      ({ id: scenarioId, speed: effectSpeed, deck, allowRollback: rollbackAllowed }) => {
        localStorage.setItem("aegis:locale", "en");
        localStorage.setItem("aegis.effect-speed", effectSpeed);
        localStorage.setItem("aegis.action-confirmation.enabled", "false");
        localStorage.setItem("aegis.skip-end-turn-confirmation", "true");
        window.browserTestOptions = {
          displayName: "Scenario E2E",
          allowRollback: rollbackAllowed,
          seed: 1,
          deck,
          botDeck: deck,
          devScenario: scenarioId as Window["browserTestOptions"]["devScenario"],
        };
      },
      { id, speed, deck: RED_DECK, allowRollback },
    );
    await this.page.goto("/e2e/harness.html");
    if (breeding === "move") {
      await expect(this.page.getByRole("button", { name: /^end breeding$/i })).toBeEnabled();
      const slot = this.page.locator('[data-drop="breeding-you"]');
      await slot.focus();
      await slot.press("Enter");
    } else if (breeding === "end") await this.page.getByRole("button", { name: /^end breeding$/i }).click();
    else
      await this.page.waitForFunction(
        () =>
          typeof window.browserTestSnapshot === "function" &&
          window.browserTestSnapshot().players?.length === 2 &&
          window.browserTestPresentation().events.some((event) => event.kind === "matchStarted"),
      );
  }
  snapshot() {
    return this.page.evaluate(() => window.browserTestSnapshot());
  }
  presentation() {
    return this.page.evaluate(() => window.browserTestPresentation());
  }
  async idle(timeout = 15_000) {
    await expect.poll(async () => (await this.presentation()).idle, { timeout }).toBe(true);
  }
  async hand(name: string) {
    const card = this.page.getByTestId("hand").getByRole("button", { name: `Select ${name}`, exact: true });
    await card.focus();
    await card.press("Enter");
  }
  async play(name: string, kind: "Digimon" | "Option" | "Tamer") {
    await expect(this.page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    await this.hand(name);
    await this.page.getByRole("button", { name: `Play ${kind}`, exact: true }).click();
  }
  async evolve(name: string, permanentId: string, cheapest = false) {
    await expect(this.page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    await this.hand(name);
    await this.page.getByRole("button", { name: "Digivolve", exact: true }).click();
    await this.page.locator(`[data-drop="perm-you"][data-id="${permanentId}"]`).click();
    if (cheapest) await this.page.locator(".evo-cost-prompt__option[data-recommended]").click();
  }
  async attack(permanentId: string) {
    await this.page.locator(`[data-drop="perm-you"][data-id="${permanentId}"]`).click();
    await this.page.getByRole("button", { name: "Attack", exact: true }).click();
    await this.page.getByRole("button", { name: /^Opponent security/ }).click();
  }
  // An upper bound from server receipt to the test observing the visible control.
  // Selection and response time come after this sample. Manually handled combat
  // windows outside resolveUntil are covered by the queue checks, not this metric.
  private async decisionReady(control: Locator, decision: Decision, budgetMs = this.speed === "slow" ? 8_000 : 6_000) {
    await expect(control).toBeVisible({ timeout: budgetMs });
    const delayMs = await this.page.evaluate((decisionId) => {
      const receipt = window.browserTestPresentation().decisionReceipts.find((r) => r.decisionId === decisionId);
      return receipt ? performance.now() - receipt.at : undefined;
    }, decision.decisionId);
    expect(delayMs, `receipt for ${decision.decisionId}`).toBeDefined();
    this.decisionTimings.push({
      decisionId: decision.decisionId,
      kind: decision.kind,
      sourceCardId: decision.sourceCardId,
      delayMs: delayMs!,
    });
    expect(
      delayMs,
      `${decision.kind} ${decision.sourceCardId ?? ""}: server decision to observed visible control`,
    ).toBeLessThan(budgetMs);
  }
  async resolveUntil(
    done: (state: Snapshot) => boolean,
    policy: DecisionPolicy = () => ({}),
    presentationTimeout = 15_000,
  ) {
    for (let count = 0; count < 40; count++) {
      await expect
        .poll(
          async () => {
            const state = await this.snapshot();
            if (done(state)) return true;
            // The shared snapshot also carries the bot's transient decisions.
            // Only the requests received on our connection are ours to answer.
            return (
              !!state.pendingDecision &&
              (await this.presentation()).decisions.some(
                (request) => request.decisionId === state.pendingDecision!.decisionId,
              )
            );
          },
          { timeout: presentationTimeout },
        )
        .toBe(true);
      const state = await this.snapshot();
      if (done(state)) {
        if (!state.pendingDecision && !state.combatWindow) await this.idle(presentationTimeout);
        return;
      }
      const pending = state.pendingDecision;
      if (!pending) continue;
      const request = (await this.presentation()).decisions.find((d) => d.decisionId === pending.decisionId);
      if (!request) continue;
      const decision = {
        ...pending,
        ...request,
        options: request?.options ?? JSON.parse(pending.payloadJson || "{}"),
      } as Decision;
      const selection = await policy(decision);
      await base.step(`${decision.kind}: ${decision.promptText}`, async () => {
        if (
          decision.kind === "optional" ||
          (decision.kind === "selectCards" && decision.options.selectionContext === "materialSaveActivation")
        ) {
          const answer = this.page.getByRole("button", {
            name: selection.accept === false ? DECLINE : ACTIVATE,
            exact: true,
          });
          await this.decisionReady(answer, decision, selection.decisionBudgetMs);
          await answer.click();
        } else if (decision.kind === "orderTriggers") {
          const triggerKeys = decision.options.triggerKeys ?? [];
          const deletionOrder =
            decision.options.acceptsResolutionPlan !== true &&
            triggerKeys.some((key) => key.startsWith("ascension/")) &&
            triggerKeys.some((key) => key.startsWith("on-deletion/")) &&
            triggerKeys.every((key) => /^(ascension|on-deletion)\//.test(key));
          const panel = this.page.getByRole("dialog").filter({
            has: this.page.getByRole("heading", {
              name: deletionOrder ? decision.promptText : "Order pending effects",
              exact: true,
            }),
          });
          await this.decisionReady(panel, decision, selection.decisionBudgetMs);
          if (deletionOrder) {
            await panel.getByRole("button", { name: "ascension", exact: true }).click();
          } else if (selection.triggerCardId) {
            const name = getCardDefinition(selection.triggerCardId)!.nameEn;
            await panel
              .getByRole("button", { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })
              .and(panel.locator("[aria-pressed]"))
              .first()
              .click();
          } else {
            const all = panel.getByRole("button", { name: "Select all, top to bottom", exact: true });
            if (await all.count()) await all.click();
          }
          await panel.getByRole("button", { name: /^Resolve (next effect|in this order|effect)$/ }).click();
        } else if (decision.kind === "orderCards") {
          const confirmOrder = this.page.getByRole("button", { name: "Confirm order", exact: true });
          await this.decisionReady(confirmOrder, decision, selection.decisionBudgetMs);
          await confirmOrder.click();
        } else if (decision.kind === "chooseOption") {
          const index = selection.choice ?? (selection.accept === false ? decision.options.declineIndex : 0) ?? 0;
          const choice = decision.options.digivolveCostChoice
            ? this.page.locator(".digivolve-cost-choice__option").nth(index)
            : decision.options.choiceEffects !== undefined || decision.options.choiceClauses !== undefined
              ? this.page.getByRole("dialog").locator(".effect-choice__option").nth(index)
              : this.page
                  .getByRole("dialog")
                  .getByRole("button", { name: decision.options.choices![index]!, exact: true });
          await this.decisionReady(choice, decision, selection.decisionBudgetMs);
          await choice.click();
        } else if (decision.kind === "selectCards" && decision.options.assemblyCardId) {
          const panel = this.page.getByRole("dialog", { name: /^＜Assembly＞/ });
          await this.decisionReady(panel, decision, selection.decisionBudgetMs);
          if (selection.accept === false) {
            await panel.getByRole("button", { name: "Play without Assembly", exact: true }).click();
          } else {
            const ids = selection.instanceIds ?? decision.options.candidateInstanceIds ?? [];
            for (const id of ids) {
              const card = decision.options.visibleCards?.find((entry) => entry.instanceId === id);
              expect(card, `visible Assembly material ${id}`).toBeDefined();
              const name = getCardDefinition(card!.cardId)!.nameEn;
              await panel
                .getByRole("button", { name: `${name} (trash)`, exact: true })
                .and(panel.locator('[aria-pressed="false"]'))
                .first()
                .click();
            }
            await panel.getByRole("button", { name: /^Assembly \(\d+ cards\)$/ }).click();
          }
        } else if (decision.kind === "selectCards" && decision.options.digiXrosCardId) {
          const noXros = this.page.getByRole("button", { name: "Play without DigiXros", exact: true });
          await this.decisionReady(noXros, decision, selection.decisionBudgetMs);
          await noXros.click();
        } else if (decision.kind === "selectCards" || decision.kind === "chooseTargets") {
          if (selection.accept === false && decision.options.min === 0) {
            const pass = this.page.getByRole("button", { name: /^(No selection|Pass · no selection|Pass|None)$/i });
            await this.decisionReady(pass, decision, selection.decisionBudgetMs);
            await pass.click();
          } else {
            const candidates = decision.options.candidateInstanceIds!;
            const cards = [
              ...state.players.flatMap((player) => [
                ...(player.hand ?? []),
                ...(player.trash ?? []),
                ...player.battleArea.flatMap((p) => [p.topCard, ...p.stack]),
              ]),
              ...(decision.options.visibleCards ?? []),
            ];
            const instanceId =
              selection.instanceId ??
              (selection.cardId
                ? candidates.find(
                    (id) =>
                      cards.find((card) => card.instanceId === id)?.cardId === selection.cardId ||
                      state.players.some((player) =>
                        player.battleArea.some((p) => p.permanentId === id && p.topCard.cardId === selection.cardId),
                      ),
                  )
                : candidates[0]);
            expect(instanceId, `legal candidate for ${selection.cardId ?? decision.promptText}`).toBeTruthy();
            const confirm = this.page.getByRole("button", {
              name: /^(Confirm targets|End Selection|Confirm|Declare attack|Attack)$/i,
            });
            const pickedIds =
              decision.options.selectionContext === "attackTarget" &&
              candidates.length === 1 &&
              (decision.options.min ?? 0) >= 1
                ? [] // The mandatory single attack target is already selected by the UI.
                : (selection.instanceIds ??
                  (selection.instanceId || selection.cardId
                    ? [instanceId!]
                    : candidates.slice(0, Math.max(1, decision.options.min ?? 1))));
            const sourceHosts = state.players.flatMap((player) => [...player.battleArea]);
            const hostForSource = (id: string) =>
              sourceHosts.find((host) => host.stack.some((card) => card.instanceId === id));
            const pooledSources =
              candidates.every((id) => hostForSource(id) !== undefined) &&
              new Set(candidates.map((id) => hostForSource(id)!.permanentId)).size > 1;
            if (pooledSources) {
              // The first visible control asks for a physical source host. Switching
              // stacks is response time, so sample receipt-to-control only once.
              const chooseHost = this.page.getByRole("region", { name: "Choose a Digimon", exact: true });
              await this.decisionReady(chooseHost, decision, selection.decisionBudgetMs);
              let openHost: string | undefined;
              let pickedCount = 0;
              for (const pickedId of pickedIds) {
                const host = hostForSource(pickedId)!;
                if (openHost !== host.permanentId) {
                  if (openHost !== undefined)
                    await this.page.getByRole("button", { name: "Choose another Digimon", exact: true }).click();
                  await expect(chooseHost).toBeVisible({ timeout: 6_000 });
                  await this.page.locator(`[data-id="${host.permanentId}"][role="button"]`).click();
                  openHost = host.permanentId;
                }
                const card = this.page.getByRole("dialog").locator(`[data-instance-id="${pickedId}"]`);
                await expect(card).toBeVisible({ timeout: 6_000 });
                if ((await card.getAttribute("aria-pressed")) !== "true") await card.click();
                await expect(card).toHaveAttribute("aria-pressed", "true");
                pickedCount += 1;
                await expect(
                  this.page.getByRole("dialog").getByText(`${pickedCount} chosen`, { exact: true }),
                ).toBeVisible();
              }
              await expect(confirm).toBeEnabled();
              await confirm.click();
              await expect
                .poll(async () => (await this.snapshot()).pendingDecision?.decisionId, { timeout: 8_000 })
                .not.toBe(decision.decisionId);
              return;
            }
            await this.decisionReady(confirm, decision, selection.decisionBudgetMs);
            for (const pickedId of pickedIds) {
              const modal = this.page.getByRole("dialog").locator(`[data-instance-id="${pickedId}"]`);
              if (await modal.count()) {
                if ((await modal.getAttribute("aria-pressed")) !== "true") await modal.click();
              } else {
                const hand = this.page.locator(`.game-hand--selecting [data-hand-instance-id="${pickedId}"]`);
                if (await hand.count()) {
                  await hand.focus();
                  await hand.press("Enter");
                } else {
                  const permanent = state.players
                    .flatMap((p) => [...p.battleArea])
                    .find((p) => p.permanentId === pickedId || p.topCard.instanceId === pickedId);
                  if (!permanent && pickedId === "player") {
                    await this.page.getByRole("button", { name: /^Opponent security/ }).click();
                    continue;
                  }
                  expect(permanent, `physical field candidate ${instanceId}`).toBeDefined();
                  await this.page.locator(`[data-id="${permanent!.permanentId}"][role="button"]`).click();
                }
              }
            }
            await confirm.click();
          }
        } else throw new Error(`Unsupported visible decision: ${decision.kind}`);
        await expect
          .poll(async () => (await this.snapshot()).pendingDecision?.decisionId, { timeout: 8_000 })
          .not.toBe(decision.decisionId);
      });
    }
    throw new Error("Scenario exceeded 40 decisions");
  }
  async healthy({ resumedEffectBudgets = {}, expectedCancelledStepIds = [] }: HealthyOptions = {}) {
    await this.idle();
    const probe = await this.presentation();
    expect(this.errors).toEqual([]);
    expect(probe.pending).toBe(0);
    expect(probe.gateExpiries).toEqual([]);
    expect(probe.steps.filter((s) => s.failed)).toEqual([]);
    expect(
      probe.steps
        .filter((step) => step.cancelled)
        .map((step) => step.id)
        .sort(),
    ).toEqual([...expectedCancelledStepIds].sort());
    expect(probe.steps.filter((s) => s.skipping).map((s) => s.id)).toEqual([]);
    expect(probe.counters).toEqual({
      boardBudgetHits: 0,
      decisionBudgetHits: 0,
      decisionStallHits: 0,
      // A match timer does not fast-forward anything either.
      skips: 0,
      manualAdvances: 0,
    });
    const finished = probe.steps.filter((s) => s.phase === "finished");
    // Even non-blocking execution slots must finish; a 45 s ceiling is not success.
    for (const step of finished.filter((s) => s.id.startsWith("draw-presentation-") || s.id.startsWith("zone-change-")))
      expect(step.durationMs, step.id).toBeLessThan(6_000);
    // Bound resumed effects as well as individual flights. A scenario that
    // deliberately waits through several consecutive security scenes may supply
    // its own aggregate budget; individual flights keep their checks above.
    for (const id of Object.keys(resumedEffectBudgets))
      expect(
        finished.some((step) => step.id === id),
        `aggregate budget refers to a completed step: ${id}`,
      ).toBe(true);
    for (const step of finished.filter((s) => s.id.startsWith("effect-unit-resettle-")))
      expect(step.durationMs, step.id).toBeLessThan(
        resumedEffectBudgets[step.id] ?? (this.speed === "slow" ? 7_500 : 6_000),
      );
    expect(
      probe.steps
        .filter((s) => s.phase === "started")
        .map((s) => s.id)
        .sort(),
    ).toEqual(finished.map((s) => s.id).sort());
  }
  async evidence(info: TestInfo) {
    if (this.page.isClosed()) return;
    const evidence = await this.page.evaluate(() =>
      typeof window.browserTestPresentation === "function"
        ? { ...window.browserTestPresentation(), snapshot: window.browserTestSnapshot?.() }
        : { unavailable: true },
    );
    const path = info.outputPath("presentation-timings.json");
    await writeFile(path, JSON.stringify({ ...evidence, decisionTimings: this.decisionTimings }, null, 2));
    await info.attach("presentation-timings", { path, contentType: "application/json" });
  }
}
const ACTIVATE = "Yes, activate";
const DECLINE = "No, decline";

/**
 * Answers an optional effect's "Use this effect?" dialog. When two activation prompts
 * follow each other, pass `text` from the expected clause: the answer then waits until
 * that prompt closes, so the next call cannot click the old dialog again.
 */
export async function answerActivation(page: Page, accept: boolean, text?: string | RegExp): Promise<void> {
  const prompts = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: ACTIVATE, exact: true }) });
  const prompt = text === undefined ? prompts : prompts.filter({ hasText: text });
  await prompt.getByRole("button", { name: accept ? ACTIVATE : DECLINE, exact: true }).click();
  if (text !== undefined) await expect(prompt).toHaveCount(0);
}

export const test = base.extend<{
  scenario: ScenarioPage;
  botOptionalScript: { sourceCardId: string; answers: boolean[] } | undefined;
  holdBotAfterTurn: number;
  botMainIntents: Intent[] | undefined;
}>({
  botOptionalScript: [undefined, { option: true }],
  holdBotAfterTurn: [2, { option: true }],
  botMainIntents: [undefined, { option: true }],
  scenario: async ({ page, botOptionalScript, holdBotAfterTurn, botMainIntents }, use, info) => {
    const server = await startBrowserServer({
      holdBotAllTurns: false,
      botOptionalScript,
      holdBotAfterTurn,
      botMainIntents,
    });
    const scenario = new ScenarioPage(page, server.useFixture);
    try {
      await use(scenario);
    } finally {
      try {
        await scenario.evidence(info);
      } finally {
        try {
          await page.close();
        } finally {
          await server.close();
        }
      }
    }
  },
});
export { expect };

/** Open a fixture with the catalog decks used by full-board presentation regressions. */
export async function openFixturePage(page: Page, fixture: ScenarioFixture): Promise<void> {
  useBrowserFixture(fixture);
  const human = CATALOG_DECKS.find((deck) => deck.deckId === "bt26-dgo-2026-08-28-7-chronomon")!;
  await page.addInitScript(
    ({ deck, botDeck }) => {
      localStorage.setItem("aegis:locale", "en");
      localStorage.setItem("aegis.action-confirmation.enabled", "false");
      localStorage.setItem("aegis.skip-end-turn-confirmation", "true");
      window.browserTestOptions = { displayName: "Fixture E2E", seed: 1, deck, botDeck, devScenario: "local-fixture" };
    },
    { deck: { mainDeck: [...human.decklist.mainDeck], eggDeck: [...human.decklist.eggDeck] }, botDeck: RED_DECK },
  );
  await page.goto("/e2e/harness.html");
}
