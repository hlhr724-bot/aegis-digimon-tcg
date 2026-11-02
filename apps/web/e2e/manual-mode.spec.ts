import { expect, test, type Page } from "@playwright/test";
import { RED_DECK, BLUE_DECK } from "../../api/dist/engine/testDecks.js";
import { startManualBrowserServer } from "./startManualBrowserServer";
import type {} from "./harness";

test.describe("manual table", () => {
  let server: Awaited<ReturnType<typeof startManualBrowserServer>>;
  test.beforeAll(async () => {
    server = await startManualBrowserServer();
  });
  test.afterAll(async () => {
    await server.close();
  });

  async function openPlayer(page: Page, name: string, privateCode?: string) {
    await page.addInitScript(
      ({ playerName, deck, code }) => {
        localStorage.setItem("aegis:locale", "en");
        window.browserTestOptions = {
          displayName: playerName,
          deck,
          seed: 0,
          gameMode: "manual",
          betaBattleMode: true,
          matchTimer: false,
        };
        window.browserTestMode = code === "create" ? "private_host" : code ? "private_guest" : "casual";
        window.browserTestRoomCode = code === "create" ? undefined : code;
      },
      { playerName: name, deck: name === "First" ? RED_DECK : BLUE_DECK, code: privateCode },
    );
    await page.goto("/e2e/harness.html");
  }

  type BreedingStepParams = { player: Page; choice?: string };
  async function finishBreeding({ player, choice = "End breeding" }: BreedingStepParams) {
    if ((await player.evaluate(() => window.browserTestSnapshot().manual.turnPhase)) === "Breeding") {
      const panel = player.locator(".manual-table__toggle");
      const reopenPanel = (await panel.getAttribute("aria-expanded")) === "true";
      if (reopenPanel) {
        await panel.click();
      }
      if (choice === "Hatch egg") {
        await player.locator(".game-utility-slot--you-eggs.game-egg-deck--hatchable").click();
      } else if (choice === "Move to battle") {
        await player.locator(".game-utility-slot--you-raising .game-breeding-slot__box[data-arena-suggested]").click();
      } else {
        await player.getByRole("button", { name: "End breeding", exact: true }).click();
      }
      if (reopenPanel) {
        await panel.click();
      }
    }
    await expect.poll(() => player.evaluate(() => window.browserTestSnapshot().manual.turnPhase)).toBe("Main");
  }

  async function prepare(first: Page, second: Page, initialBreedingChoice = "End breeding") {
    await expect
      .poll(async () => {
        const firstReady = await first.getByRole("button", { name: "First", exact: true }).isVisible();
        const secondReady = await second.getByRole("button", { name: "First", exact: true }).isVisible();
        return firstReady || secondReady;
      })
      .toBe(true);
    const chooser = (await first.getByRole("button", { name: "First", exact: true }).isVisible()) ? first : second;
    await chooser.getByRole("button", { name: "First", exact: true }).click();
    await first.getByRole("button", { name: "Keep hand", exact: true }).click();
    await second.getByRole("button", { name: "Keep hand", exact: true }).click();
    await expect.poll(() => first.evaluate(() => window.browserTestSnapshot().turnCount)).toBe(1);
    await finishBreeding({ player: first, choice: initialBreedingChoice });
    for (const page of [first, second]) {
      await expect.poll(() => page.evaluate(() => window.browserTestSnapshot().turnCount)).toBe(1);
      await page.getByRole("button", { name: "Manual table", exact: false }).click();
      await expect(page.getByRole("button", { name: "Draw", exact: true })).toBeEnabled();
    }
  }

  test("plays out of turn, protects searches, reconnects and agrees to undo", async ({ page, context }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const second = await context.newPage();
    second.on("pageerror", (error) => errors.push(error.message));
    await openPlayer(page, "First");
    await openPlayer(second, "Second");
    await prepare(page, second);
    await second.getByRole("button", { name: "Draw", exact: true }).click();
    await expect.poll(() => second.evaluate(() => window.browserTestSnapshot().players[1].handCount)).toBe(6);
    await expect.poll(() => page.evaluate(() => window.browserTestSnapshot().players[1].handCount)).toBe(6);
    await second.getByRole("button", { name: "Piles", exact: true }).click();
    await second.getByRole("button", { name: "Search pile", exact: true }).click();
    await second.getByRole("button", { name: "Cards", exact: true }).click();
    await expect(second.getByLabel("Card or pile")).toContainText("Look at top cards");
    expect(await page.evaluate(() => window.browserTestSnapshot().players[1].manualInspectionJson ?? "[]")).toBe("[]");
    await second.reload();
    await second.getByRole("button", { name: "Manual table", exact: false }).click();
    await expect(second.getByLabel("Card or pile")).toContainText("Look at top cards");
    await second.getByRole("button", { name: "Piles", exact: true }).click();
    await second.getByRole("button", { name: "Close inspection", exact: true }).click();
    await second.getByRole("button", { name: "Cards", exact: true }).click();
    const cards = await second
      .getByLabel("Card or pile")
      .locator("option")
      .evaluateAll((options) =>
        options.map((option) => ({ value: (option as HTMLOptionElement).value, text: option.textContent ?? "" })),
      );
    const hand = cards.find((option) => option.text.startsWith("Hand ·"))!;
    await second.getByLabel("Card or pile").selectOption(hand.value);
    await second.getByLabel("Destination", { exact: true }).selectOption("battleArea");
    await second.getByRole("button", { name: "Move", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.browserTestSnapshot().players[1].battleArea.length)).toBe(1);
    const permanentId = await second.evaluate(() => window.browserTestSnapshot().players[1].battleArea[0].permanentId);
    await expect(second.locator(`[data-drop="perm-you"][data-id="${permanentId}"]`)).toBeVisible();
    await expect(page.locator(`[data-drop="perm-opp"][data-id="${permanentId}"]`)).toBeVisible();
    await second.getByRole("button", { name: "Request undo", exact: true }).click();
    await expect(page.getByRole("button", { name: "Accept", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Accept", exact: true }).click();
    await expect.poll(() => second.evaluate(() => window.browserTestSnapshot().players[1].battleArea.length)).toBe(0);
    await page.getByRole("button", { name: "Turn", exact: true }).click();
    await page.getByLabel("Memory for the active player").fill("-5");
    await page.getByRole("button", { name: "Set memory", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.browserTestSnapshot().memory)).toBe(-5);
    await page.getByRole("button", { name: "Pass turn", exact: true }).click();
    await expect.poll(() => second.evaluate(() => window.browserTestSnapshot().turnSeat)).toBe(1);
    await finishBreeding({ player: second });
    expect(await second.evaluate(() => window.browserTestSnapshot().memory)).toBe(5);
    await second.getByRole("button", { name: "Match", exact: true }).click();
    await second.getByRole("button", { name: "Propose result", exact: true }).click();
    await page.getByRole("button", { name: "Accept", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.browserTestSnapshot().gameOver)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("joins a private manual room through the production lookup route", async ({ page, context }) => {
    await openPlayer(page, "First", "create");
    await expect
      .poll(() =>
        page.evaluate(() =>
          typeof window.browserTestSnapshot === "function" ? window.browserTestSnapshot().roomCode : "",
        ),
      )
      .toMatch(/^[A-Z0-9]{6}$/);
    const code = await page.evaluate(() => window.browserTestSnapshot().roomCode);
    const second = await context.newPage();
    await openPlayer(second, "Second", code);
    await prepare(page, second);
    expect(await second.evaluate(() => window.browserTestSnapshot().gameMode)).toBe("manual");
    await page.getByRole("button", { name: "Piles", exact: true }).click();
    await page.getByRole("button", { name: "Recover from deck", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.browserTestSnapshot().players[0].securityCount)).toBe(6);
    await page.getByRole("button", { name: "Trash deck top", exact: true }).click();
    await expect.poll(() => second.evaluate(() => window.browserTestSnapshot().players[0].trash.length)).toBe(1);
    await page.getByRole("button", { name: "Reveal security top", exact: true }).click();
    await expect
      .poll(() => second.evaluate(() => JSON.parse(window.browserTestSnapshot().manual.revealedJson).length))
      .toBe(1);
    await page.getByRole("button", { name: "Cards", exact: true }).click();
    const handOption = await page
      .getByLabel("Card or pile")
      .locator("option")
      .evaluateAll((options) =>
        options.find((option) => option.textContent?.startsWith("Hand ·"))?.getAttribute("value"),
      );
    await page.getByLabel("Card or pile").selectOption(handOption!);
    await page.getByRole("button", { name: "Move", exact: true }).click();
    await page.locator('[data-drop="perm-you"]').click();
    const cardDialog = page.getByRole("dialog");
    await expect(cardDialog).toHaveClass(/arena-permanent-inspector/);
    await expect(cardDialog.locator('[data-role="top"]')).toBeVisible();
    await cardDialog.getByText("DP and markers", { exact: true }).click();
    await expect(cardDialog.getByRole("button", { name: "Increase DP by 1000", exact: true })).toBeVisible();
    const originalDp = await page.evaluate(() => window.browserTestSnapshot().players[0].battleArea[0].currentDP);
    await cardDialog.getByRole("button", { name: "Increase DP by 1000", exact: true }).click();
    await expect
      .poll(() => second.evaluate(() => window.browserTestSnapshot().players[0].battleArea[0].currentDP))
      .toBe(originalDp + 1000);
    const markerInput = cardDialog.getByLabel("Marker", { exact: true });
    const suggestionsId = await markerInput.getAttribute("list");
    expect(suggestionsId).toBeTruthy();
    const suggestions = await markerInput.evaluate((input) =>
      Array.from((document.getElementById(input.getAttribute("list")!) as HTMLDataListElement).options).map(
        (option) => option.value,
      ),
    );
    expect(suggestions).toEqual(expect.arrayContaining(["Blocker", "Security +1"]));
    await markerInput.fill("Custom reminder");
    await expect(markerInput).toHaveValue("Custom reminder");
    await markerInput.fill("Security +1");
    await cardDialog.getByRole("button", { name: "Set marker", exact: true }).click();
    await expect(page.locator(".game-keyword-badges")).toHaveAttribute("aria-label", /Security \+1/);
    await expect(second.locator(".game-keyword-badges")).toHaveAttribute("aria-label", /Security \+1/);
    await cardDialog.getByRole("button", { name: "Suspend", exact: true }).click();
    await expect(cardDialog.getByRole("button", { name: "Unsuspend", exact: true })).toBeVisible();
    await cardDialog.getByRole("button", { name: "Close", exact: true }).click();
    await page.locator('[data-drop="perm-you"]').click();
    await cardDialog.getByText("DP and markers", { exact: true }).click();
    await expect(cardDialog.getByLabel("Marker", { exact: true })).toHaveValue("Security +1");
    await cardDialog.getByRole("button", { name: "Close", exact: true }).click();
    const panel = page.getByTestId("manual-table");
    const handle = page.getByRole("button", { name: "Move control panel", exact: true });
    const beforeDrag = (await panel.boundingBox())!;
    const grip = (await handle.boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 - 90, grip.y + grip.height / 2 + 40, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => (await panel.boundingBox())!.x).toBeCloseTo(beforeDrag.x - 90, 0);
    await handle.press("Home");
    await expect.poll(async () => (await panel.boundingBox())!.x).toBeCloseTo(beforeDrag.x, 0);
    await handle.press("ArrowLeft");
    await expect.poll(async () => (await panel.boundingBox())!.x).toBeCloseTo(beforeDrag.x - 16, 0);
    await handle.press("Home");
    await page.setViewportSize({ width: 1000, height: 350 });
    await handle.press("Home");
    await expect
      .poll(async () => {
        const bounds = (await panel.boundingBox())!;
        return bounds.y + bounds.height;
      })
      .toBeLessThanOrEqual(342);
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const dark of [false, true]) {
        await page.evaluate((enabled) => document.documentElement.classList.toggle("dark", enabled), dark);
        await expect(page.getByRole("button", { name: "Draw", exact: true })).toBeVisible();
        const bounds = await page.getByTestId("manual-table").boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        if (width === 320) {
          expect(bounds!.height).toBeLessThan(650);
          await page.getByRole("button", { name: "Manual table", exact: true }).click();
          await page.locator('[data-drop="perm-you"]').click();
          await expect(cardDialog).toHaveClass(/arena-permanent-inspector/);
          await expect(cardDialog.locator('[data-role="top"]')).toBeVisible();
          await cardDialog.getByText("DP and markers", { exact: true }).click();
          await expect(cardDialog.getByLabel("Marker", { exact: true })).toHaveValue("Security +1");
          await page.screenshot({
            animations: "disabled",
            path: test.info().outputPath(`manual-card-dialog-${dark ? "dark" : "light"}.png`),
          });
          await cardDialog.getByRole("button", { name: "Close", exact: true }).click();
          const tableToggle = page.getByRole("button", { name: "Manual table", exact: true });
          if ((await tableToggle.getAttribute("aria-expanded")) === "false") await tableToggle.click();
          await page.getByRole("button", { name: "Piles", exact: true }).click();
          await expect(page.getByRole("button", { name: "Recover from deck", exact: true })).toBeVisible();
          await page.screenshot({
            animations: "disabled",
            path: test.info().outputPath(`manual-piles-${dark ? "dark" : "light"}.png`),
          });
          await page.getByRole("button", { name: "Cards", exact: true }).click();
        }
        await page.screenshot({
          animations: "disabled",
          path: test.info().outputPath(`manual-${width}-${dark ? "dark" : "light"}.png`),
        });
      }
    }
  });
  test("synchronizes modifiers, tokens, reveals, faces and manual combat steps", async ({ page, context }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const second = await context.newPage();
    second.on("pageerror", (error) => errors.push(error.message));
    await openPlayer(page, "First");
    await openPlayer(second, "Second");
    await prepare(page, second);
    for (const player of [page, second]) {
      await player.getByRole("button", { name: "Piles", exact: true }).click();
      await player.getByLabel("Token", { exact: true }).selectOption("TOKEN-Diaboromon-Token");
      await player.getByRole("button", { name: "Create token", exact: true }).click();
    }
    await expect
      .poll(() => page.evaluate(() => window.browserTestSnapshot().players.map((player) => player.battleArea.length)))
      .toEqual([1, 1]);
    const blockerId = await second.evaluate(() => window.browserTestSnapshot().players[1].battleArea[0].permanentId);
    await page.locator('[data-drop="perm-you"]').click();
    const editor = page.getByRole("dialog");
    await editor.getByText("DP and markers", { exact: true }).click();
    await editor.getByRole("button", { name: "Increase Security Attack", exact: true }).click();
    await editor.getByRole("button", { name: "Increase Security Attack", exact: true }).click();
    await editor.getByText(/^Keywords ·/).click();
    const keywords = editor.getByRole("group", { name: "Keywords", exact: true });
    await keywords.getByRole("button", { name: "Blocker", exact: true }).click();
    await keywords.getByRole("button", { name: "Rush", exact: true }).click();
    await editor
      .getByRole("group", { name: "Colors", exact: true })
      .getByRole("button", { name: "Red", exact: true })
      .click();
    await editor.getByRole("button", { name: "Apply modifiers", exact: true }).click();
    await expect
      .poll(() =>
        second.evaluate(() => {
          const permanent = window.browserTestSnapshot().players[0].battleArea[0];
          return {
            security: permanent.securityAttackModifier,
            keywords: permanent.keywords,
            colors: permanent.originalColorsOverride,
          };
        }),
      )
      .toEqual({ security: 2, keywords: ["Blocker", "Rush"], colors: ["Red"] });
    await page.screenshot({ animations: "disabled", path: test.info().outputPath("manual-structured-modifiers.png") });
    await editor.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Request undo", exact: true }).click();
    await second.getByRole("button", { name: "Accept", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.browserTestSnapshot().players[0].battleArea[0].securityAttackModifier))
      .toBe(0);
    await page.getByLabel("Number of cards to reveal", { exact: true }).fill("3");
    await page.getByRole("button", { name: "Reveal cards", exact: true }).click();
    await expect(second.getByRole("region", { name: "Revealed cards", exact: true }).locator("figure")).toHaveCount(3);
    await second.getByLabel("Pile to reveal", { exact: true }).selectOption("security");
    await second.getByRole("button", { name: "Reveal cards", exact: true }).click();
    await expect(page.getByRole("region", { name: "Revealed cards", exact: true }).locator("figure")).toHaveCount(4);
    await page.getByRole("button", { name: "Clear my revealed cards", exact: true }).click();
    await expect(second.getByRole("region", { name: "Revealed cards", exact: true }).locator("figure")).toHaveCount(1);
    expect(await page.evaluate(() => window.browserTestSnapshot().players[0].deckCount)).toBe(40);
    await page.getByRole("button", { name: "Cards", exact: true }).click();
    await page.getByLabel("Card or pile", { exact: true }).selectOption("security:top");
    await page.getByRole("button", { name: "Turn face up", exact: true }).click();
    await expect
      .poll(() => second.evaluate(() => window.browserTestSnapshot().players[0].securityView[0].faceUp))
      .toBe(true);
    await page.getByRole("button", { name: "Turn face down", exact: true }).click();
    await expect
      .poll(() => second.evaluate(() => window.browserTestSnapshot().players[0].securityView[0].faceUp))
      .toBe(false);
    const tokenInstanceId = await page.evaluate(
      () => window.browserTestSnapshot().players[0].battleArea[0].topCard.instanceId,
    );
    await page.getByLabel("Card or pile", { exact: true }).selectOption(tokenInstanceId);
    await page.getByRole("button", { name: "Turn face down", exact: true }).click();
    await expect
      .poll(() => second.evaluate(() => window.browserTestSnapshot().players[0].battleArea[0].topCard.faceUp))
      .toBe(false);
    const faceDownOpponent = second.locator('[data-drop="perm-opp"]');
    await expect(faceDownOpponent).toHaveAttribute("aria-label", /Face down/);
    await expect(faceDownOpponent).not.toHaveAttribute("aria-label", /Diaboromon/);
    await expect(faceDownOpponent.locator('img[alt="Diaboromon Token"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.browserTestSnapshot().players[0].battleArea[0].topCard.cardId)).toBe(
      "TOKEN-Diaboromon-Token",
    );
    await page.getByRole("button", { name: "Turn face up", exact: true }).click();
    await expect
      .poll(() => second.evaluate(() => window.browserTestSnapshot().players[0].battleArea[0].topCard.cardId))
      .toBe("TOKEN-Diaboromon-Token");
    for (const player of [page, second]) await player.getByRole("button", { name: "Turn", exact: true }).click();
    await expect(page.locator(".manual-combat__phases button")).toHaveCount(0);
    await expect(second.locator(".manual-combat__phases button")).toHaveCount(0);
    await expect.poll(() => second.evaluate(() => window.browserTestSnapshot().manual.turnPhase)).toBe("Main");
    expect(await page.evaluate(() => window.browserTestSnapshot().players[0].handCount)).toBe(5);
    async function declareAttack() {
      await page.locator('[data-drop="perm-you"]').click();
      await editor.getByText("DP and markers", { exact: true }).click();
      await editor.getByRole("button", { name: "Declare attack", exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.browserTestSnapshot().manual.combatStage)).toBe("attack");
      await editor.getByRole("button", { name: "Close", exact: true }).click();
    }
    await declareAttack();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect.poll(() => second.evaluate(() => window.browserTestSnapshot().manual.combatStage)).toBe("counter");
    await expect(page.getByRole("button", { name: "Continue", exact: true })).toHaveCount(0);
    await second.getByRole("button", { name: "Continue", exact: true }).click();
    await second.getByLabel("Blocker", { exact: true }).selectOption(blockerId);
    await second.getByRole("button", { name: "Declare block", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.browserTestSnapshot().manual.blockerPermanentId))
      .toBe(blockerId);
    await expect(page.getByRole("button", { name: "Continue", exact: true })).toHaveCount(0);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.getByRole("button", { name: "End attack", exact: true }).scrollIntoViewIfNeeded();
      for (const dark of [false, true]) {
        await page.evaluate((enabled) => document.documentElement.classList.toggle("dark", enabled), dark);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await page.screenshot({
          animations: "disabled",
          path: test.info().outputPath(`manual-combat-${width}-${dark ? "dark" : "light"}.png`),
        });
      }
    }
    await page.getByRole("button", { name: "End attack", exact: true }).click();
    await expect.poll(() => second.evaluate(() => window.browserTestSnapshot().manual.combatStage)).toBe("none");
    expect(
      await page.evaluate(() =>
        window.browserTestSnapshot().players.every((player) => !player.battleArea[0].isSuspended),
      ),
    ).toBe(true);
    await declareAttack();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await second.getByRole("button", { name: "Continue", exact: true }).click();
    await second.getByRole("button", { name: "Do not block", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect.poll(() => second.evaluate(() => window.browserTestSnapshot().manual.combatStage)).toBe("security");
    expect(
      await page.evaluate(() => window.browserTestSnapshot().players.map((player) => player.securityCount)),
    ).toEqual([5, 5]);
    await page.getByRole("button", { name: "End attack", exact: true }).click();
    await second.locator('[data-drop="perm-you"]').click();
    const secondEditor = second.getByRole("dialog");
    await secondEditor.getByText("DP and markers", { exact: true }).click();
    await secondEditor.getByRole("button", { name: "Remove token", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.browserTestSnapshot().players[1].battleArea.length)).toBe(0);
    expect(errors).toEqual([]);
  });

  test("signals effects, resets visual changes and restarts only by agreement", async ({ page, context }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const second = await context.newPage();
    second.on("pageerror", (error) => errors.push(error.message));
    await openPlayer(page, "First");
    await openPlayer(second, "Second");
    await prepare(page, second);
    const firstHand = await page.evaluate(() => window.browserTestSnapshot().players[0].hand[0].instanceId);
    await page.getByLabel("Card or pile", { exact: true }).selectOption(firstHand);
    await page.getByRole("button", { name: "Place on field", exact: true }).click();
    await expect.poll(() => second.evaluate(() => window.browserTestSnapshot().players[0].battleArea.length)).toBe(1);
    await page.locator('[data-drop="perm-you"]').click();
    const editor = page.getByRole("dialog");
    await editor.getByText("DP and markers", { exact: true }).click();
    const inspectorQuickActions = editor.getByRole("region", { name: "Quick actions", exact: true });
    await expect(inspectorQuickActions).toBeVisible();
    await expect(inspectorQuickActions.getByRole("button", { name: "Move to trash", exact: true })).toHaveCount(1);
    await editor.getByRole("button", { name: "Sick", exact: true }).click();
    await editor.getByRole("button", { name: "Immune", exact: true }).click();
    await editor.getByRole("button", { name: "Suspend", exact: true }).click();
    await editor.getByRole("button", { name: "Increase DP by 1000", exact: true }).click();
    await expect
      .poll(() => second.evaluate(() => window.browserTestSnapshot().players[0].battleArea[0].manualStatuses))
      .toEqual(["sick", "immune"]);
    await editor.getByRole("button", { name: "Reset modifiers", exact: true }).click();
    await expect
      .poll(() =>
        second.evaluate(() => {
          const permanent = window.browserTestSnapshot().players[0].battleArea[0];
          return {
            statuses: permanent.manualStatuses,
            suspended: permanent.isSuspended,
            dp: permanent.currentDP,
            base: permanent.baseDP,
          };
        }),
      )
      .toMatchObject({ statuses: [], suspended: true });
    expect(
      await page.evaluate(() => {
        const permanent = window.browserTestSnapshot().players[0].battleArea[0];
        return permanent.currentDP === permanent.baseDP;
      }),
    ).toBe(true);
    await editor.getByRole("button", { name: "Training: add deck top as source", exact: true }).click();
    await expect
      .poll(() => second.evaluate(() => window.browserTestSnapshot().players[0].battleArea[0].stack.length))
      .toBe(1);
    expect(await page.evaluate(() => window.browserTestSnapshot().players[0].deckCount)).toBe(39);
    await editor.getByRole("button", { name: "Close", exact: true }).click();
    const trainingSourceId = await page.evaluate(
      () => window.browserTestSnapshot().players[0].battleArea[0].stack[0].instanceId,
    );
    await page.getByLabel("Card or pile", { exact: true }).selectOption(trainingSourceId);
    await page.getByRole("button", { name: "Move to trash", exact: true }).click();
    await expect.poll(() => second.evaluate(() => window.browserTestSnapshot().players[0].trash.length)).toBe(1);
    await page.getByRole("button", { name: "Piles", exact: true }).click();
    await page.getByLabel("Number of cards to reveal", { exact: true }).fill("1");
    await page.getByRole("button", { name: "Reveal cards", exact: true }).click();
    const gallery = page.getByRole("region", { name: "Revealed cards", exact: true });
    await expect(gallery.getByRole("button", { name: "Move revealed card", exact: true })).toHaveCount(1);
    await expect(second.getByRole("button", { name: "Move revealed card", exact: true })).toHaveCount(0);
    await gallery.getByLabel("Reveal destination", { exact: true }).selectOption("hand");
    await gallery.getByRole("button", { name: "Move revealed card", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.browserTestSnapshot().players[0].handCount)).toBe(5);
    await page.getByRole("button", { name: "Turn", exact: true }).click();
    const signalSource = await page.evaluate(() => window.browserTestSnapshot().players[0].hand[0]);
    await page.getByLabel("Effect source", { exact: true }).selectOption(signalSource.instanceId);
    await page.getByLabel("Effect target", { exact: true }).selectOption("seat:1");
    await page.getByRole("button", { name: "Signal effect", exact: true }).click();
    await expect
      .poll(() =>
        second.evaluate(() => ({
          card: window.browserTestSnapshot().manual.signalCardId,
          target: window.browserTestSnapshot().manual.signalTargetSeat,
        })),
      )
      .toEqual({ card: signalSource.cardId, target: 1 });
    expect(await second.evaluate(() => window.browserTestSnapshot().players[0].hand?.length ?? 0)).toBe(0);
    const ownEffectToast = page.getByTestId("match-notice").filter({ hasText: "First signals an effect" });
    const opponentEffectToast = second.getByTestId("match-notice").filter({ hasText: "First signals an effect" });
    await expect(ownEffectToast).toHaveAttribute("data-side", "you");
    await expect(opponentEffectToast).toHaveAttribute("data-side", "opp");
    await expect(opponentEffectToast).toContainText("Effect target: Second");
    await ownEffectToast.locator(".match-notice__thumb > [data-state]").click();
    const signalCardDialog = page.getByRole("dialog");
    await expect(signalCardDialog).toBeVisible();
    await signalCardDialog.getByRole("button", { name: "Close", exact: true }).click();

    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const dark of [false, true]) {
        await page.evaluate((enabled) => document.documentElement.classList.toggle("dark", enabled), dark);
        await page.screenshot({
          animations: "disabled",
          path: test.info().outputPath(`manual-signal-${width}-${dark ? "dark" : "light"}.png`),
        });
      }
    }
    await second.getByRole("button", { name: "Turn", exact: true }).click();
    await expect(second.getByRole("button", { name: "Clear my effect signal", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Clear my effect signal", exact: true }).click();
    await expect.poll(() => second.evaluate(() => window.browserTestSnapshot().manual.signalSeat)).toBe(-1);
    const fieldId = await page.evaluate(() => window.browserTestSnapshot().players[0].battleArea[0].permanentId);
    await page.getByLabel("Effect source", { exact: true }).selectOption(fieldId);
    await page.getByLabel("Effect target", { exact: true }).selectOption(fieldId);
    await page.getByRole("button", { name: "Signal effect", exact: true }).click();
    await expect
      .poll(() =>
        second.evaluate(() => ({
          source: window.browserTestSnapshot().manual.signalPermanentId,
          target: window.browserTestSnapshot().manual.signalTargetPermanentId,
        })),
      )
      .toEqual({ source: fieldId, target: fieldId });
    await page.getByRole("button", { name: "Cards", exact: true }).click();
    await page.getByLabel("Card or pile", { exact: true }).selectOption(firstHand);
    await page.getByRole("button", { name: "Move to trash", exact: true }).click();
    await expect.poll(() => second.evaluate(() => window.browserTestSnapshot().manual.signalSeat)).toBe(-1);
    await page.getByRole("button", { name: "Match", exact: true }).click();
    await page.getByLabel("First player after restart", { exact: true }).selectOption("1");
    await page.getByRole("button", { name: "Propose restart", exact: true }).click();
    await expect(second.getByRole("button", { name: "Accept restart", exact: true })).toBeVisible();
    await expect(second.getByRole("button", { name: "Draw", exact: true }).first()).toBeDisabled();
    for (const width of [390, 1440]) {
      await second.setViewportSize({ width, height: 1000 });
      for (const dark of [false, true]) {
        await second.evaluate((enabled) => document.documentElement.classList.toggle("dark", enabled), dark);
        await second.screenshot({
          animations: "disabled",
          path: test.info().outputPath(`manual-restart-${width}-${dark ? "dark" : "light"}.png`),
        });
      }
    }
    await second.getByRole("button", { name: "Decline", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.browserTestSnapshot().manual.restartRequester)).toBe(-1);
    await page.getByRole("button", { name: "Propose restart", exact: true }).click();
    await page.getByRole("button", { name: "Cancel restart", exact: true }).click();
    await expect.poll(() => second.evaluate(() => window.browserTestSnapshot().manual.restartRequester)).toBe(-1);
    await page.getByRole("button", { name: "Propose restart", exact: true }).click();
    await second.getByRole("button", { name: "Accept restart", exact: true }).click();
    for (const player of [second, page]) {
      await player.getByRole("button", { name: "Keep hand", exact: true }).click();
    }
    await expect.poll(() => second.evaluate(() => window.browserTestSnapshot().turnCount)).toBe(1);
    await finishBreeding({ player: second });
    await expect
      .poll(() =>
        page.evaluate(() => ({
          turn: window.browserTestSnapshot().turnSeat,
          count: window.browserTestSnapshot().manual.restartCount,
          phase: window.browserTestSnapshot().manual.turnPhase,
        })),
      )
      .toEqual({ turn: 1, count: 1, phase: "Main" });
    await expect
      .poll(() =>
        page.evaluate(() => ({
          turnCount: window.browserTestSnapshot().turnCount,
          security: window.browserTestSnapshot().players.map((player) => player.securityCount),
        })),
      )
      .toEqual({ turnCount: 1, security: [5, 5] });
    const restarted = await page.evaluate(() => window.browserTestSnapshot());
    expect(
      restarted.players.map((player) => ({
        hand: player.handCount,
        security: player.securityCount,
        deck: player.deckCount,
        field: player.battleArea.length,
        trash: player.trash.length,
      })),
    ).toEqual([
      { hand: 5, security: 5, deck: 40, field: 0, trash: 0 },
      { hand: 5, security: 5, deck: 40, field: 0, trash: 0 },
    ]);
    expect(restarted.manual.signalSeat).toBe(-1);
    expect(restarted.manual.revealedJson).toBe("[]");
    expect(errors).toEqual([]);
  });

  test("dragging Agumon onto an occupied breeding stack preserves its egg without drawing", async ({
    page,
    context,
  }) => {
    const second = await context.newPage();
    await openPlayer(page, "First");
    await openPlayer(second, "Second");
    await prepare(page, second, "Hatch egg");
    let agumon = await page.evaluate(() =>
      window.browserTestSnapshot().players[0].hand.find((card) => card.cardId === "BT1-010"),
    );
    while (!agumon) {
      const beforeDraw = await page.evaluate(() => window.browserTestSnapshot().players[0].handCount);
      await page.getByRole("button", { name: "Draw", exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => window.browserTestSnapshot().players[0].handCount))
        .toBe(beforeDraw + 1);
      agumon = await page.evaluate(() =>
        window.browserTestSnapshot().players[0].hand.find((card) => card.cardId === "BT1-010"),
      );
    }
    const before = await page.evaluate(() => window.browserTestSnapshot().players[0]);
    const egg = before.breeding!;
    await page.locator(".manual-table__toggle").click();
    const handCard = page.locator(`[data-testid="hand"] [data-hand-instance-id="${agumon.instanceId}"]`);
    const target = page.locator(".game-utility-slot--you-raising .game-breeding-slot__box");
    const origin = (await handCard.boundingBox())!;
    const destination = (await target.boundingBox())!;
    await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
    await page.mouse.down();
    await page.mouse.move(origin.x + origin.width / 2, origin.y - 30, { steps: 5 });
    await page.mouse.move(destination.x + destination.width / 2, destination.y + destination.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect
      .poll(() => page.evaluate(() => window.browserTestSnapshot().players[0].breeding?.topCard.cardId))
      .toBe("BT1-010");
    const after = await page.evaluate(() => window.browserTestSnapshot().players[0]);
    expect(after.breeding!.permanentId).toBe(egg.permanentId);
    expect(after.breeding!.stack.map((card) => card.instanceId)).toEqual([egg.topCard.instanceId]);
    expect(after.handCount).toBe(before.handCount - 1);
    expect(after.deckCount).toBe(before.deckCount);
    await expect
      .poll(() => second.evaluate(() => window.browserTestSnapshot().players[0].breeding?.topCard.cardId))
      .toBe("BT1-010");
  });

  test("presents exactly one flight for each automatic turn draw", async ({ page, context }) => {
    const second = await context.newPage();
    await openPlayer(page, "First");
    await openPlayer(second, "Second");
    await prepare(page, second);
    for (const player of [page, second]) {
      await expect.poll(() => player.evaluate(() => window.browserTestPresentation().idle)).toBe(true);
    }
    const before = await Promise.all(
      [page, second].map((player) =>
        player.evaluate(
          () =>
            window
              .browserTestPresentation()
              .steps.filter((step) => step.phase === "started" && step.id.startsWith("draw-flight-")).length,
        ),
      ),
    );
    await page.getByRole("button", { name: "Turn", exact: true }).click();
    await page.getByRole("button", { name: "Pass turn", exact: true }).click();
    await expect.poll(() => second.evaluate(() => window.browserTestSnapshot().turnCount)).toBe(2);
    await finishBreeding({ player: second });
    for (const [index, player] of [page, second].entries()) {
      await expect.poll(() => player.evaluate(() => window.browserTestPresentation().idle)).toBe(true);
      const flights = await player.evaluate(
        () =>
          window
            .browserTestPresentation()
            .steps.filter((step) => step.phase === "started" && step.id.startsWith("draw-flight-")).length,
      );
      expect(await player.evaluate(() => window.browserTestSnapshot().players[1].handCount)).toBe(6);
      expect(flights - before[index]!).toBe(1);
    }
  });

  test("guides turns with one automatic draw and unsuspend, then one breeding choice", async ({ page, context }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const second = await context.newPage();
    second.on("pageerror", (error) => errors.push(error.message));
    await openPlayer(page, "First");
    await openPlayer(second, "Second");
    await prepare(page, second, "Hatch egg");
    expect(await page.evaluate(() => window.browserTestSnapshot().players[0].handCount)).toBe(5);
    expect(await page.evaluate(() => window.browserTestSnapshot().players[0].eggDeckCount)).toBe(
      RED_DECK.eggDeck.length - 1,
    );
    const breedingId = await page.evaluate(() => window.browserTestSnapshot().players[0].breeding!.permanentId);
    const evolveCard = await page.evaluate(() => window.browserTestSnapshot().players[0].hand[0]);
    await page.getByLabel("Card or pile", { exact: true }).selectOption(evolveCard.instanceId);
    await page.getByLabel("Destination", { exact: true }).selectOption(`${breedingId}:top`);
    await page.getByRole("button", { name: "Move", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.browserTestSnapshot().players[0].breeding!.stack.length))
      .toBe(1);
    expect(await page.evaluate(() => window.browserTestSnapshot().players[0].handCount)).toBe(4);
    type FieldPreparation = { player: Page; seat: number };
    async function placeAndSuspend({ player, seat }: FieldPreparation) {
      const handCard = await player.evaluate(
        (owner) => window.browserTestSnapshot().players[owner].hand[0].instanceId,
        seat,
      );
      await player.getByLabel("Card or pile", { exact: true }).selectOption(handCard);
      await player.getByRole("button", { name: "Place on field", exact: true }).click();
      await player.locator('[data-drop="perm-you"]').click();
      const dialog = player.getByRole("dialog");
      await dialog.getByText("DP and markers", { exact: true }).click();
      await dialog.getByRole("button", { name: "Suspend", exact: true }).click();
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
    }
    await placeAndSuspend({ player: page, seat: 0 });
    await placeAndSuspend({ player: second, seat: 1 });
    await page.getByRole("button", { name: "Turn", exact: true }).click();
    await page.getByRole("button", { name: "Pass turn", exact: true }).click();
    await expect
      .poll(() =>
        second.evaluate(() => ({
          seat: window.browserTestSnapshot().turnSeat,
          count: window.browserTestSnapshot().turnCount,
        })),
      )
      .toEqual({ seat: 1, count: 2 });
    await expect(second.locator(".game-utility-slot--you-eggs.game-egg-deck--hatchable")).toBeVisible();
    await expect(second.getByRole("dialog")).toHaveCount(0);
    expect(await second.evaluate(() => window.browserTestSnapshot().players[1].handCount)).toBe(5);
    expect(
      await second.evaluate(() =>
        window.browserTestSnapshot().players.map((player) => player.battleArea[0].isSuspended),
      ),
    ).toEqual([true, false]);
    await expect(second.getByRole("button", { name: "Move to battle", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Request undo", exact: true }).click();
    await expect(second.getByRole("dialog")).toHaveCount(0);
    await second.getByRole("button", { name: "Accept", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => ({
          seat: window.browserTestSnapshot().turnSeat,
          count: window.browserTestSnapshot().turnCount,
          phase: window.browserTestSnapshot().manual.turnPhase,
        })),
      )
      .toEqual({ seat: 0, count: 1, phase: "Main" });
    expect(await second.evaluate(() => window.browserTestSnapshot().players[1].handCount)).toBe(4);
    expect(
      await second.evaluate(() =>
        window.browserTestSnapshot().players.map((player) => player.battleArea[0].isSuspended),
      ),
    ).toEqual([true, true]);
    await page.getByRole("button", { name: "Pass turn", exact: true }).click();
    await expect.poll(() => second.evaluate(() => window.browserTestSnapshot().turnCount)).toBe(2);
    await expect(second.locator(".game-utility-slot--you-eggs.game-egg-deck--hatchable")).toBeVisible();
    await expect(second.getByRole("dialog")).toHaveCount(0);
    expect(await second.evaluate(() => window.browserTestSnapshot().players[1].handCount)).toBe(5);
    for (const width of [390, 1440]) {
      await second.setViewportSize({ width, height: 1000 });
      for (const dark of [false, true]) {
        await second.evaluate((enabled) => document.documentElement.classList.toggle("dark", enabled), dark);
        await second.screenshot({
          animations: "disabled",
          path: test.info().outputPath(`manual-breeding-${width}-${dark ? "dark" : "light"}.png`),
        });
      }
    }
    await finishBreeding({ player: second, choice: "Hatch egg" });
    expect(await second.evaluate(() => window.browserTestSnapshot().players[1].eggDeckCount)).toBe(
      BLUE_DECK.eggDeck.length - 1,
    );
    await page.locator('[data-drop="perm-you"]').click();
    await expect(page.getByRole("dialog")).toHaveClass(/arena-permanent-inspector/);
    await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
    await second.getByRole("button", { name: "Turn", exact: true }).click();
    await second.getByRole("button", { name: "Pass turn", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => ({
          seat: window.browserTestSnapshot().turnSeat,
          count: window.browserTestSnapshot().turnCount,
        })),
      )
      .toEqual({ seat: 0, count: 3 });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.locator(".game-utility-slot--you-raising .game-breeding-slot__box[data-arena-suggested]"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Hatch egg", exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => window.browserTestSnapshot().players[0].handCount)).toBe(4);
    expect(await page.evaluate(() => window.browserTestSnapshot().players[0].battleArea[0].isSuspended)).toBe(false);
    await finishBreeding({ player: page, choice: "Move to battle" });
    await expect.poll(() => page.evaluate(() => window.browserTestSnapshot().players[0].battleArea.length)).toBe(2);
    const afterMove = await page.evaluate(() => window.browserTestSnapshot());
    expect(afterMove.players[0].breeding).toBeUndefined();
    expect(afterMove.players[0].handCount).toBe(4);
    expect(
      afterMove.players[0].battleArea.find((permanent) => permanent.permanentId === breedingId)?.stack.length,
    ).toBe(1);
    expect(afterMove.manual.canMoveFromBreeding).toBe(false);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Pass turn", exact: true }).click();
    await expect
      .poll(() =>
        second.evaluate(() => ({
          seat: window.browserTestSnapshot().turnSeat,
          count: window.browserTestSnapshot().turnCount,
          phase: window.browserTestSnapshot().manual.turnPhase,
        })),
      )
      .toEqual({ seat: 1, count: 4, phase: "Main" });
    expect(await second.evaluate(() => window.browserTestSnapshot().players[1].handCount)).toBe(6);
    expect(await second.evaluate(() => window.browserTestSnapshot().players[1].eggDeckCount)).toBe(
      BLUE_DECK.eggDeck.length - 1,
    );
    expect(await second.evaluate(() => window.browserTestSnapshot().players[1].breeding!.stack.length)).toBe(0);
    await expect(second.getByRole("dialog")).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        window.browserTestPresentation().events.filter((event) => event.kind === "effectTriggered"),
      ),
    ).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("uses native breeding controls on consecutive turns without opening an extra dialog", async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const second = await context.newPage();
    second.on("pageerror", (error) => errors.push(error.message));
    await openPlayer(page, "First");
    await openPlayer(second, "Second");
    await prepare(page, second);
    await page.getByRole("button", { name: "Turn", exact: true }).click();
    await page.getByRole("button", { name: "Pass turn", exact: true }).click();
    await expect.poll(() => second.evaluate(() => window.browserTestSnapshot().turnSeat)).toBe(1);
    await expect(second.locator(".game-utility-slot--you-eggs.game-egg-deck--hatchable")).toBeVisible();
    await expect(second.getByRole("dialog")).toHaveCount(0);
    await finishBreeding({ player: second });
    await second.getByRole("button", { name: "Turn", exact: true }).click();
    await second.getByRole("button", { name: "Pass turn", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.browserTestSnapshot().turnCount)).toBe(3);
    await finishBreeding({ player: page });
    await page.getByRole("button", { name: "Pass turn", exact: true }).click();
    await expect.poll(() => second.evaluate(() => window.browserTestSnapshot().turnCount)).toBe(4);
    await expect(second.locator(".game-utility-slot--you-eggs.game-egg-deck--hatchable")).toBeVisible();
    await expect(second.getByRole("dialog")).toHaveCount(0);
    await finishBreeding({ player: second, choice: "Hatch egg" });
    expect(await second.evaluate(() => window.browserTestSnapshot().players[1].eggDeckCount)).toBe(
      BLUE_DECK.eggDeck.length - 1,
    );
    expect(errors).toEqual([]);
  });
});
