import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/option-trash-respects-dual-digimon.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";

it.each([
  ["BT26-032", true],
  ["BT26-032", false],
  ["BT26-033", true],
  ["BT25-059", true],
] as const)(
  "keeps %s out of Option targets and trashes security with an Option present: %s",
  async (card, hasOption) => {
    const preferred: string[] = [];
    const s = setupScenario(
      {
        ...fixture,
        board: {
          ...fixture.board,
          1: {
            ...fixture.board[1],
            battleArea: [
              { card, as: "ceresmon", suspended: true, under: ["BT25-059"] },
              { card: "BT1-010", as: "victim", suspended: true },
              ...(hasOption ? [{ card: "P-039", as: "option" }] : []),
            ],
          },
        },
      },
      { autoSelectCards: true, autoDeclineOptional: true, preferInstanceIds: preferred },
    );
    await s.ready();
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    try {
      preferred.push(s.perm("ceresmon").permanentId);
      const ceresmonId = s.perm("ceresmon").permanentId;
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("omnimon").permanentId,
          target: { kind: "permanent", permanentId: s.perm("victim").permanentId },
        }),
      ).toEqual({ ok: true });
      await settle(
        () => s.state.players[1]!.security.length === 2 && !s.state.pendingDecision && !observe(s.engine).isAttacking(),
      );
      const candidates = s.decisions
        .filter(({ req }) => req.sourceCardId === "AD1-025")
        .flatMap(({ req }) => req.options?.candidateInstanceIds ?? []);
      expect(candidates).not.toContain(ceresmonId);
      expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toContain(ceresmonId);
      expect(s.perm("ceresmon").stack).toHaveLength(1);
      expect(s.state.players[1]!.trash.some(({ cardId }) => cardId === "P-039")).toBe(hasOption);
    } finally {
      advance(s.engine).endMainPhaseIfOpen(0);
      await turn;
    }
  },
);
