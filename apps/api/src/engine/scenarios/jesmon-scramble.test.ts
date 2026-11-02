import fixtureJesmonScrambleDpBlocked from "./jesmon-scramble-dp-blocked.fixture.js";
import fixtureJesmonScrambleDpAllowed from "./jesmon-scramble-dp-allowed.fixture.js";
import { Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import "../../cards/index.js";
import { BLUE_DECK, RED_DECK } from "../testDecks.js";
import { advance } from "#api/engine/testkit/advance";
import { setupEngine, settle } from "../testkit/harness.js";

describe("Jesmon Red Scramble arena scenarios", () => {
  it.each([
    { scenario: fixtureJesmonScrambleDpBlocked, allowed: false, memory: 3 },
    { scenario: fixtureJesmonScrambleDpAllowed, allowed: true, memory: 2 },
  ] as const)("plays Red Scramble through the live turn loop: $scenario", async ({ scenario, allowed, memory }) => {
    const s = setupEngine({ 0: {}, 1: {} }, { autoAcceptOptional: true, autoSelectCards: true, preferOptionIndex: 2 });
    s.engine.stagedDecks[0] = BLUE_DECK;
    s.engine.stagedDecks[1] = RED_DECK;
    s.engine.startScenarioFixture(scenario);

    try {
      for (let tick = 0; tick < 400 && s.state.phase !== Phase.Main; tick += 1) {
        if (s.state.phase === Phase.Breeding) s.engine.applyIntent(0, { type: "endPhase" });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      expect(s.state.phase).toBe(Phase.Main);
      expect(s.state.memory).toBe(5);
      const human = s.state.players[0]!;
      const huckmon = human.battleArea.find(({ topCard }) => topCard.cardId === "EX13-009")!;
      const option = human.hand.find(({ cardId }) => cardId === "LM-027")!;
      const jesmon = human.hand.find(({ cardId }) => cardId === "BT23-013")!;
      expect(human.hand.some(({ cardId }) => cardId === "BT1-085")).toBe(true);
      expect(s.state.players[1]!.battleArea.map(({ currentDP }) => currentDP)).toContain(5000);

      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: option.instanceId })).toEqual({ ok: true });
      await settle(() => human.battleArea.some(({ topCard }) => topCard.cardId === "LM-027"));
      await settle(() => s.state.pendingDecision === undefined);
      await advance(s.engine).finishAttack();
      await settle(() => s.state.pendingDecision === undefined);

      expect(huckmon.topCard.cardId).toBe(allowed ? "BT23-013" : "EX13-009");
      expect(human.hand.some(({ instanceId }) => instanceId === jesmon.instanceId)).toBe(!allowed);
      // Jesmon plays a white token, activating Huckmon's inherited memory gain.
      expect(human.battleArea.some(({ topCard }) => topCard.cardId === "TOKEN-AthoRenePor-Token")).toBe(allowed);
      expect(
        s.events.filter(
          (event) => event.kind === "effectTriggered" && event.sourceCardId === "EX13-009" && event.isInherited,
        ),
      ).toHaveLength(allowed ? 1 : 0);
      expect(s.state.memory).toBe(memory);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
    }
  });
});
