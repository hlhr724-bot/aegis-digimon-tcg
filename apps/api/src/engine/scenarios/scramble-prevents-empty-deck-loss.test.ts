import "#api/cards/index";
import { describe, expect, it } from "vitest";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/scramble-prevents-empty-deck-loss.fixture";
import { advance } from "#api/engine/testkit/advance";

describe("Scramble resolves before the draw phase", () => {
  it("returns a card to an empty deck before the mandatory draw", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true });
    await s.ready();
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.state.gameOver).toBe(false);
    expect(s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("returned").instanceId)).toBe(true);
    expect(s.state.players[0]!.deck).toHaveLength(0);
    s.engine.applyIntent(0, { type: "surrender" });
    await turn;
    await settle();
  });
});
