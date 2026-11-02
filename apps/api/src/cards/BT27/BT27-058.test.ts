import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/index";

describe("Wolvermon Tamer recruitment and inherited Blocker", () => {
  it.each([0, 1, 2])("recruits Reina on evolution with %i existing Tamers", async (count) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-056", as: "base" }, ...Array.from({ length: count }, () => ({ card: "BT1-085" }))],
          hand: [{ card: "BT27-058", as: "evolution" }, "BT26-095", "BT26-093"],
          deck: ["BT1-009", "BT1-009"],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT27-058" && !s.state.pendingDecision);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT26-093")).toBe(count <= 1);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT26-095")).toBe(false);
    expect(s.state.memory).toBe(9);
  });

  it("can refuse the free Tamer", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-056", as: "base" }],
          hand: [{ card: "BT27-058", as: "evolution" }, "BT26-093"],
          deck: ["BT1-009"],
        },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT27-058" && !s.state.pendingDecision);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.state.players[0]!.hand.some((c) => c.cardId === "BT26-093")).toBe(true);
  });

  it("plays Reina from security", async () => {
    const s = setupEngine(
      { 0: { security: ["BT27-058"], hand: ["BT26-093"] }, 1: { battleArea: [{ card: "BT1-060", as: "attacker" }] } },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    await s.ready();
    s.state.turnSeat = 1;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((c) => c.cardId === "BT27-058") && !s.state.pendingDecision);
    expect(s.state.players[0]!.battleArea.map((p) => p.topCard.cardId)).toContain("BT26-093");
  });

  it("gives Blocker only to a Digimon with Wolvermon among its digivolution cards", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT27-064", as: "host", under: ["BT27-058"] },
          { card: "BT10-064", as: "plain" },
        ],
      },
    });
    await s.ready();
    expect([...s.perm("host").keywords]).toContain("Blocker");
    expect([...s.perm("plain").keywords]).not.toContain("Blocker");
  });
});
