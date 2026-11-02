import { describe, expect, it } from "vitest";
import { advance } from "#api/engine/testkit/advance";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/index";

describe("dragon battle departure", () => {
  it.each([false, true])(
    "uses only Rock Dragons already in trash before Metallicdramon leaves: %s",
    async (hasTrashTarget) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "EX7-049", as: "metallic", suspended: true, under: ["EX7-012"] }],
            trash: hasTrashTarget ? [{ card: "BT2-011", as: "rock" }] : ["BT10-095", "BT14-001", "BT16-082"],
            deck: ["BT1-009", "BT1-009"],
          },
          1: {
            battleArea: [{ card: "BT1-024", as: "attacker", dp: 14000 }],
            deck: ["BT1-009", "BT1-009"],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      const loop = s.engine.startTurnLoop();
      try {
        await advance(s.engine).waitForMainPhase(0);
        s.perm("metallic").isSuspended = true;
        advance(s.engine).endMainPhaseIfOpen(0);
        await advance(s.engine).waitForMainPhase(1);
        expect(
          s.engine.applyIntent(1, {
            type: "attack",
            attackerPermanentId: s.perm("attacker").permanentId,
            target: { kind: "permanent", permanentId: s.perm("metallic").permanentId },
          }),
        ).toEqual({ ok: true });
        await settle(
          () =>
            s.state.players[0]!.trash.some((card) => card.cardId === "EX7-049") &&
            s.state.pendingDecision === undefined,
        );
        expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(
          hasTrashTarget ? ["BT2-011"] : [],
        );
        expect(s.state.players[0]!.trash.map((card) => card.cardId)).toContain("EX7-012");
      } finally {
        s.engine.applyIntent(0, { type: "surrender" });
        await loop;
      }
    },
  );
});
