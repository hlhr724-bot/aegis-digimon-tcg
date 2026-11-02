import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/index";

describe("NightChiropmon Tamer recruitment", () => {
  it.each([0, 1, 2])("recruits Makoto on evolution with %i existing Tamers", async (count) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-073", as: "base" }, ...Array.from({ length: count }, () => ({ card: "BT1-085" }))],
          hand: [{ card: "BT27-077", as: "evolution" }, "BT26-095", "BT1-085"],
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
    await settle(() => s.perm("base").topCard.cardId === "BT27-077" && !s.state.pendingDecision);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT26-095")).toBe(count <= 1);
    expect(s.state.players[0]!.hand.some((c) => c.cardId === "BT1-085")).toBe(true);
    expect(s.state.memory).toBe(9);
  });

  it("can refuse the free Tamer", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-073", as: "base" }],
          hand: [{ card: "BT27-077", as: "evolution" }, "BT26-095"],
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
    await settle(() => s.perm("base").topCard.cardId === "BT27-077" && !s.state.pendingDecision);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.state.players[0]!.hand.some((c) => c.cardId === "BT26-095")).toBe(true);
  });
  it("plays Makoto from security before the checked Digimon is trashed", async () => {
    const s = setupEngine(
      { 0: { security: ["BT27-077"], hand: ["BT26-095"] }, 1: { battleArea: [{ card: "BT1-060", as: "attacker" }] } },
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
    await settle(() => s.state.players[0]!.trash.some((c) => c.cardId === "BT27-077") && !s.state.pendingDecision);
    expect(s.state.players[0]!.battleArea.map((p) => p.topCard.cardId)).toContain("BT26-095");
  });

  it("deletes the battle winner through inherited Retaliation", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-080", as: "host", under: ["BT27-077"] }] },
        1: { battleArea: [{ card: "BT1-084", as: "defender", suspended: true }] },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 0 && s.state.players[1]!.battleArea.length === 0);
    expect(s.state.players[0]!.trash.map((c) => c.cardId)).toContain("BT27-077");
  });
});
