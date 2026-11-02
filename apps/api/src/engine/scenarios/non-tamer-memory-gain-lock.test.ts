import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/non-tamer-memory-gain-lock.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";

it("blocks Option memory gain after the Option is placed under a Tamer", async () => {
  const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true });
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(1);
    expect(s.perm("tamer").stack.map((card) => card.cardId)).toContain("ST23-15");
    expect(s.state.players[1]!.hand).toHaveLength(2);
    expect(s.state.memory).toBe(4);
  } finally {
    s.engine.applyIntent(1, { type: "surrender" });
    await loop;
  }
});
