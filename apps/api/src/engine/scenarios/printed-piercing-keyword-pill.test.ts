import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";

describe("printed Piercing keyword pill", () => {
  it("publishes printed Piercing beside the other printed keywords and checks security after a blocked win", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-084", as: "lordKnightmon" }] },
        1: {
          battleArea: [{ card: "BT14-011", as: "monochromon" }],
          security: ["BT1-009", "BT1-010", "BT1-011"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, declinePrompts: ["Alliance"] },
    );
    await s.ready();
    const lordKnightmon = s.perm("lordKnightmon");
    expect([...lordKnightmon.keywords]).toEqual(
      expect.arrayContaining(["Alliance", "Collision", "Piercing", "Blocker"]),
    );
    expect([...lordKnightmon.grantedKeywords]).toEqual(
      expect.arrayContaining(["Alliance", "Collision", "Piercing", "Blocker"]),
    );
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: lordKnightmon.permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.combatWindow?.kind === "block" && s.state.combatWindow.seat === 1);
    expect(
      s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: s.perm("monochromon").permanentId }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.events.filter((event) => event.kind === "securityChecked")).toHaveLength(1);
    expect(s.state.players[1]!.security).toHaveLength(2);
  });
});
