import fixture from "@api-fixtures/nokia-gabumon-hand-trash.fixture";
import { test, expect } from "@e2e/scenario-page";

test.use({ holdBotAfterTurn: 11 });

for (const { speed, waitForChoice } of [
  { speed: "normal", waitForChoice: false },
  { speed: "slow", waitForChoice: false },
  { speed: "normal", waitForChoice: true },
] as const) {
  test(`Nokia keeps trash Gabumon selectable after both confirmations at ${speed} speed${waitForChoice ? " after seven seconds" : ""}`, async ({
    scenario,
    page,
  }, info) => {
    page.on("response", (response) => {
      if (response.status() >= 400)
        info.annotations.push({ type: "http-error", description: `${response.status()} ${response.url()}` });
    });
    const darkMode = info.project.use.colorScheme === "dark";
    await page.addInitScript((dark) => localStorage.setItem("aegis:darkMode", String(dark)), darkMode);
    const touch = test.info().project.use.hasTouch === true;
    if (!touch) await page.setViewportSize({ width: 1227, height: 979 });
    const refs = await scenario.openFixture(fixture, speed, "none");
    expect(await page.locator("html").evaluate((element) => element.classList.contains("dark"))).toBe(darkMode);
    await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    const agumon = page
      .getByTestId("hand")
      .getByRole("button", { name: /^Select Agumon/ })
      .first();
    await agumon.focus();
    await agumon.press("Enter");
    await page.getByRole("button", { name: "Digivolve", exact: true }).click();
    await page.locator('[data-drop="breeding-you"]').click();
    await scenario.idle();
    await scenario.resolveUntil((state) => state.phase === "Main" && state.memory === 7 && !state.pendingDecision);
    await scenario.play("Agumon", "Digimon");
    await scenario.resolveUntil(
      (state) =>
        !state.pendingDecision &&
        state.players[0]!.hand.some((card) => card.instanceId === refs.instanceId("recovered-wargreymon")),
      (decision) => {
        if (decision.kind === "orderTriggers")
          return { triggerCardId: decision.options.triggerCardIds?.includes("BT22-008") ? "BT22-008" : undefined };
        if (decision.kind === "selectCards") return { instanceId: refs.instanceId("recovered-wargreymon") };
        return { accept: decision.sourceCardId === "BT22-008" };
      },
    );
    const war = page
      .getByTestId("hand")
      .locator(`[data-hand-instance-id="${refs.instanceId("recovered-wargreymon")}"]`);
    await war.focus();
    await war.press("Enter");
    await page.getByRole("button", { name: /^Activate effect:/ }).click();
    const passages = [
      "by suspending this Tamer",
      "you may play 1 [Gabumon] if that Digimon has [Greymon] in its name or 1 [Agumon] if it has [Garurumon] in its name from your hand or trash without paying the cost.",
    ];
    let confirmations = 0;
    await scenario.resolveUntil(
      (state) => state.pendingDecision?.kind === "selectCards",
      async (decision) => {
        if (decision.kind === "orderTriggers") return { triggerCardId: "EX13-067" };
        expect(decision.kind).toBe("optional");
        expect(decision.sourceCardId).toBe("EX13-067");
        await expect(page.getByRole("dialog").locator("strong")).toHaveText(passages[confirmations]!);
        confirmations += 1;
        return { accept: true };
      },
    );
    expect(confirmations).toBe(2);
    const pending = (await scenario.snapshot()).pendingDecision!;
    const request = (await scenario.presentation()).decisions.find(
      (decision) => decision.decisionId === pending.decisionId,
    )!;
    expect(request.sourceCardId).toBe("EX13-067");
    expect(request.options?.candidateInstanceIds).toHaveLength(3);
    expect(request.options?.visibleCards).toHaveLength(24);
    const gabumon = page.getByRole("dialog").locator(`[data-instance-id="${refs.instanceId("trash-gabumon")}"]`);
    await expect(gabumon).toBeVisible();
    await expect(gabumon).toBeEnabled();
    if (process.env.AEGIS_E2E_PRODUCTION === "true") {
      await expect(page.locator("style[data-vite-dev-id]")).toHaveCount(0);
      expect(await page.locator('link[rel="stylesheet"][href*="/assets/"]').count()).toBeGreaterThan(0);
    }
    await expect(page.getByRole("dialog").locator("[data-instance-id]")).toHaveCount(24);
    const delayMs = await page.evaluate((decisionId) => {
      const receipt = window
        .browserTestPresentation()
        .decisionReceipts.find((entry) => entry.decisionId === decisionId);
      return receipt ? performance.now() - receipt.at : undefined;
    }, pending.decisionId);
    expect(delayMs).toBeDefined();
    expect(delayMs).toBeLessThan(speed === "slow" ? 8_000 : 6_000);
    scenario.decisionTimings.push({
      decisionId: pending.decisionId,
      kind: pending.kind,
      sourceCardId: "EX13-067",
      delayMs: delayMs!,
    });
    await scenario.idle();
    for (const zone of await page.getByRole("dialog").locator(".decision-overlay__zone").all()) {
      const firstCandidate = zone.locator("[data-instance-id]").first();
      await expect(firstCandidate).toBeEnabled();
      await expect(firstCandidate).toBeInViewport({ ratio: 0.5 });
    }
    if (waitForChoice) {
      const openedAt = await page.evaluate(() => performance.now());
      await expect
        .poll(
          async () =>
            page.evaluate(
              ({ startedAt }) => ({
                decisionId: window.browserTestSnapshot().pendingDecision?.decisionId,
                elapsed: performance.now() - startedAt >= 7_000,
              }),
              { startedAt: openedAt },
            ),
          { timeout: 10_000 },
        )
        .toEqual({ decisionId: pending.decisionId, elapsed: true });
      await expect(gabumon).toBeEnabled();
      await expect(gabumon).toHaveAttribute("aria-pressed", "false");
      await scenario.healthy();
      return;
    }
    const selectionScreenshot = info.outputPath("nokia-selection.png");
    await page.screenshot({ path: selectionScreenshot });
    await info.attach("nokia-selection", { path: selectionScreenshot, contentType: "image/png" });
    for (const instanceId of request.options!.candidateInstanceIds!) {
      const candidate = page.getByRole("dialog").locator(`[data-instance-id="${instanceId}"]`);
      await candidate.scrollIntoViewIfNeeded();
      await expect(candidate).toBeInViewport({ ratio: 0.5 });
      await expect(candidate).toBeEnabled();
    }
    if (touch) await gabumon.tap();
    else await gabumon.click();
    await expect(gabumon).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /^(Confirm targets|End Selection|Confirm)$/i }).click();
    await expect
      .poll(async () =>
        (await scenario.snapshot()).players[0]!.battleArea.some(
          (permanent) => permanent.topCard.instanceId === refs.instanceId("trash-gabumon"),
        ),
      )
      .toBe(true);
    expect(
      (await scenario.snapshot()).players[0]!.trash.some(
        (card) => card.instanceId === refs.instanceId("trash-gabumon"),
      ),
    ).toBe(false);
    await scenario.resolveUntil(
      (state) => !state.pendingDecision && !state.combatWindow && state.turnSeat === 1,
      () => ({ accept: false, choice: 0 }),
    );
    await scenario.healthy();
  });
}
