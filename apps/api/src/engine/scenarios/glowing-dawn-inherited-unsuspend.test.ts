import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/index";

describe("Glowing Dawn inherited unsuspend", () => {
  it.each([
    ["ST23-04", "EX13-077", true],
    ["ST23-08", "EX13-077", true],
    ["BT25-041", "EX13-077", true],
    ["ST23-04", "ST23-09", false],
    ["ST23-08", "ST23-09", false],
    ["BT25-041", "ST23-09", false],
  ])("limits %s to a Glowing Dawn host after an attack by %s", async (source, host, remainsSuspended) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: host, as: "attacker", under: [source] },
            { card: "BT1-085", as: "tamer", under: [{ card: "BT1-009", as: "cost", faceUp: false }] },
          ],
        },
        1: { security: ["BT1-009", "BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("cost").instanceId) &&
        s.state.pendingDecision === undefined,
    );
    expect(s.perm("attacker").isSuspended).toBe(remainsSuspended);
    expect(s.perm("tamer").stack).toHaveLength(0);
    expect(s.perm("attacker").stack.map((card) => card.cardId)).toEqual([source]);
    expect(s.state.players[1]!.security).toHaveLength(host === "ST23-09" ? 1 : 2);
  });
});
