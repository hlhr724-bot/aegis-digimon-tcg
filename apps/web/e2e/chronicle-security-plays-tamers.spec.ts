import fixture from "../../api/src/engine/scenarios/chronicle-security-plays-tamers.fixture";
import { fixturePermanentId } from "../../api/src/engine/scenario/references";
import { test, expect } from "./scenario-page";

test.use({
  botMainIntents: [
    [
      { type: "attack", attackerPermanentId: fixturePermanentId("fellowship-attacker"), target: { kind: "player" } },
      { type: "endPhase" },
    ],
    { scope: "test" },
  ],
});

for (const { width, cardId } of [
  { width: 1440, cardId: "EX13-072" },
  { width: 390, cardId: "BT20-087" },
]) {
  test(`Fellowship plays Chronicle Tamer ${cardId} through Security at ${width}px`, async ({ scenario, page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await scenario.openFixture(fixture, "normal", "none");
    await scenario.resolveUntil(
      (state) =>
        state.players[0]!.battleArea.some((p) => p.topCard.cardId === cardId) &&
        state.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT20-095") &&
        !state.pendingDecision &&
        !state.combatWindow,
      () => ({ cardId, accept: true }),
    );
    const request = (await scenario.presentation()).decisions.find(
      (decision) => decision.sourceCardId === "BT20-095" && decision.kind === "selectCards",
    );
    expect(request?.options?.candidateInstanceIds).toHaveLength(2);
    expect((await scenario.snapshot()).players[0]!.battleArea.some((p) => p.topCard.cardId === cardId)).toBe(true);
    await scenario.healthy();
  });
}
