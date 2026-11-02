import { test, expect } from "@e2e/scenario-page";
import { stubCardArtwork } from "@e2e/card-artwork";
import { opponentTurnRuleCheckDnaIntoChaosdramon } from "@api-fixtures/opponent-turn-rule-check-dna-into-chaosdramon.fixture";

test.use({ holdBotAfterTurn: 3 });
test.beforeEach(async ({ page }) => stubCardArtwork(page));

test("a rule-check DNA in the opponent's turn waits for the turn player and keeps Machinedramon's lock", async ({
  scenario,
  page,
}) => {
  const refs = await scenario.openFixture(opponentTurnRuleCheckDnaIntoChaosdramon, "normal", "none");
  const machinedramonPermanentId = refs.permanentId("andromon");
  await scenario.evolve("Machinedramon", machinedramonPermanentId, true);
  await scenario.resolveUntil((state) => {
    const machinedramon = state.players[0]!.battleArea.find((p) => p.permanentId === machinedramonPermanentId);
    return machinedramon?.stack.length === 3 && !state.pendingDecision;
  });
  await page.getByRole("button", { name: /^end turn$/i }).click();

  const chaosdramonInstanceId = refs.instanceId("chaosdramon");
  const orderPromptTexts: string[] = [];
  let atChaosdramonOnPlay: { suspended: boolean; protectedFromStackTrash: boolean } | undefined;
  await scenario.resolveUntil(
    (state) => atChaosdramonOnPlay !== undefined && !state.pendingDecision,
    async (decision) => {
      if (decision.kind === "orderTriggers") {
        orderPromptTexts.push(...(decision.options.triggerDescriptions ?? []), ...(decision.options.triggerKeys ?? []));
      }
      const dnaChainBudget = { decisionBudgetMs: 10_000 };
      const state = await scenario.snapshot();
      const chaosdramon = state.players[0]!.battleArea.find((p) => p.topCard.instanceId === chaosdramonInstanceId);
      if (chaosdramon === undefined || decision.sourceCardId !== "EX12-060") return dnaChainBudget;
      atChaosdramonOnPlay ??= {
        suspended: chaosdramon.isSuspended,
        protectedFromStackTrash: chaosdramon.protectedFromStackTrash,
      };
      return { ...dnaChainBudget, accept: false };
    },
    30_000,
  );

  expect(atChaosdramonOnPlay).toEqual({ suspended: true, protectedFromStackTrash: true });
  expect(orderPromptTexts.filter((text) => /later entrant/i.test(text))).toEqual([]);
  const state = await scenario.snapshot();
  const chaosdramon = state.players[0]!.battleArea.find((p) => p.topCard.instanceId === chaosdramonInstanceId)!;
  await expect(
    page.locator(
      `[data-id="${chaosdramon.permanentId}"] .game-restriction-badge[data-label*="Stacked cards protected from trashing"]`,
    ),
  ).toHaveCount(1);
  await scenario.healthy();
});
