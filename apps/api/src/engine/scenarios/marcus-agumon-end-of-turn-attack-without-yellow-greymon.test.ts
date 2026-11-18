import "#api/cards/index";
import { describe, expect, it } from "vitest";
import marcusWithoutYellowGreymonFixture from "#api/engine/scenarios/marcus-agumon-end-of-turn-attack-without-yellow-greymon.fixture";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("Marcus Damon & Agumon's [End of Your Turn] attack", () => {
  it("is offered without a yellow [Agumon]/[Greymon] Digimon, while Marcus stays a Tamer", async () => {
    const s = setupScenario(marcusWithoutYellowGreymonFixture, { autoAcceptOptional: true, autoSelectCards: true });
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const decisionsBeforeEndOfTurn = s.decisions.length;
      advance(s.engine).endMainPhaseIfOpen(0);
      await advance(s.engine).waitForMainPhase(1);

      const endOfTurnPrompts = s.decisions
        .slice(decisionsBeforeEndOfTurn)
        .filter(({ req }) => req.kind === "optional")
        .map(({ req }) => req.options?.effectTextPart);
      expect(endOfTurnPrompts).toEqual(["Then, 1 of your Digimon may attack."]);
      expect(s.events.flatMap((event) => (event.kind === "attackDeclared" ? [event.attackerPermanentId] : []))).toEqual(
        [s.perm("redDigimon").permanentId],
      );
      expect(s.state.players[1]!.security).toHaveLength(2);
      expect(s.perm("marcus").currentDP).not.toBe(6000);
      expect(observe(s.engine).hasKeyword(s.perm("marcus"), "Rush")).toBe(false);
      expect(observe(s.engine).isRestricted(s.perm("marcus"), "digivolve")).toBe(false);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
