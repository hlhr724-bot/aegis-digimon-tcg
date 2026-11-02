import { describe, expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import fixture from "#api/engine/scenarios/multiple-retaliation.fixture";
import "#api/cards/index";

describe("Multiple Retaliation effects", () => {
  it.each([
    ["different inherited cards", "BT1-009", ["BT26-070", "ST23-12"]],
    ["duplicate inherited cards", "BT1-009", ["ST23-12", "ST23-12"]],
    ["native and inherited copies", "BT19-059", ["ST23-12"]],
  ] as const)("resolves %s separately when Evade prevents the first deletion", async (_name, card, under) => {
    const s = setupScenario(
      {
        ...fixture,
        board: {
          ...fixture.board,
          1: { ...fixture.board[1], battleArea: [{ card, as: "holder", under: [...under], suspended: true }] },
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Raid"] },
    );
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("winner").permanentId,
          target: { kind: "permanent", permanentId: s.perm("holder").permanentId },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.events.some((e) => e.kind === "evadePrompt"));
      expect(
        s.engine.applyIntent(0, { type: "respondEvade", permanentId: s.perm("winner").permanentId, accept: true }),
      ).toEqual({ ok: true });
      await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
      expect(
        s.events.filter((e) => e.kind === "effectResolved" && e.effectKey.startsWith("keyword/retaliation")),
      ).toHaveLength(2);
      expect(s.state.players[0]!.battleArea.map((p) => p.topCard.cardId)).not.toContain("EX13-045");
      expect(s.state.players[0]!.trash.map((c) => c.cardId)).toContain("EX13-045");
      expect(s.state.players[1]!.battleArea).toHaveLength(0);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
