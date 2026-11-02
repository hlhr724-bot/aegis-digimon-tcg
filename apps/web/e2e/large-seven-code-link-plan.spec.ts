import fixture from "../../api/src/engine/scenarios/large-seven-code-link-plan.fixture";
import { test, expect } from "./scenario-page";

for (const width of [1440, 390]) {
  test(`Cyber Engage resolves seven linked effects without reconnecting at ${width}px`, async ({ scenario, page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const closed: string[] = [];
    const frames: number[] = [];
    page.on("websocket", (socket) => {
      socket.on("close", () => closed.push(socket.url()));
      socket.on("framesent", ({ payload }) => frames.push(Buffer.byteLength(payload)));
    });
    const refs = await scenario.openFixture(fixture, "normal", "none");
    await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    await page.locator(`[data-drop="perm-you"][data-id="${refs.permanentId("cyber-engage")}"]`).click();
    await page.getByRole("button", { name: /^Activate effect:/ }).click();
    await scenario.resolveUntil(
      (state) =>
        state.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT26-086" && p.linked.length === 7) &&
        !state.pendingDecision &&
        !state.combatWindow,
      (decision) => {
        if (
          decision.kind === "selectCards" &&
          (decision.options?.assemblyCardId || decision.sourceCardId === "BT26-086")
        ) {
          return { instanceIds: decision.options.candidateInstanceIds };
        }
        if (decision.sourceCardId === "BT25-098") {
          return { cardId: "BT26-086", accept: true };
        }
        return {
          accept:
            decision.kind !== "optional" || (decision.sourceCardId === "BT26-086" && decision.promptText === "Link"),
          decisionBudgetMs: decision.options?.timing === "WhenLinking" ? 12_000 : 6_000,
        };
      },
      30_000,
    );
    expect(closed).toEqual([]);
    expect(Math.max(...frames)).toBeLessThan(4 * 1024);
    const order = (await scenario.presentation()).decisions.find(
      (decision) => (decision.options?.triggerKeys?.length ?? 0) >= 7,
    );
    expect(order?.options?.acceptsIndexedResolutionPlan).toBe(true);
    await scenario.healthy();
  });
}
