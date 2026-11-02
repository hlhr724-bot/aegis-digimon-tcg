import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/index";

describe("Armalizamon Tamer recruitment and inherited Piercing", () => {
  it.each([0, 1, 2])("recruits Tomoro on evolution with %i existing Tamers", async (count) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-044", as: "base" }, ...Array.from({ length: count }, () => ({ card: "BT1-085" }))],
          hand: [{ card: "BT27-046", as: "evolution" }, "BT26-095", "BT27-091"],
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
    await settle(() => s.perm("base").topCard.cardId === "BT27-046" && !s.state.pendingDecision);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT27-091")).toBe(count <= 1);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT26-095")).toBe(false);
    expect(s.state.memory).toBe(9);
  });

  it("can refuse the free Tamer", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-044", as: "base" }],
          hand: [{ card: "BT27-046", as: "evolution" }, "BT27-091"],
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
    await settle(() => s.perm("base").topCard.cardId === "BT27-046" && !s.state.pendingDecision);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.state.players[0]!.hand.some((c) => c.cardId === "BT27-091")).toBe(true);
  });

  it("plays Tomoro from security", async () => {
    const s = setupEngine(
      { 0: { security: ["BT27-046"], hand: ["BT27-091"] }, 1: { battleArea: [{ card: "BT1-060", as: "attacker" }] } },
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
    await settle(() => s.state.players[0]!.trash.some((c) => c.cardId === "BT27-046") && !s.state.pendingDecision);
    expect(s.state.players[0]!.battleArea.map((p) => p.topCard.cardId)).toContain("BT27-091");
  });

  it("gives Piercing only to a Digimon with Armalizamon among its digivolution cards", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT27-050", as: "host", under: ["BT27-046"] },
          { card: "BT10-064", as: "plain" },
        ],
      },
    });
    await s.ready();
    expect([...s.perm("host").keywords]).toContain("Piercing");
    expect([...s.perm("plain").keywords]).not.toContain("Piercing");
  });
});

it("does not recruit a different Glowing Dawn Tamer when no Tomoro Tenma is in hand", async () => {
  const s = setupEngine(
    {
      0: {
        battleArea: [{ card: "ST23-06", as: "base", under: ["ST23-01"] }, "ST23-13"],
        hand: [{ card: "BT27-046", as: "evolution" }, "ST23-14"],
        deck: ["BT1-009"],
      },
    },
    { autoAcceptOptional: true, autoSelectCards: true },
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
  await settle(() => s.perm("base").topCard.cardId === "BT27-046" && !s.state.pendingDecision);
  expect(s.state.players[0]!.battleArea.filter((permanent) => permanent.topCard.cardId === "ST23-14")).toHaveLength(0);
  expect(s.state.players[0]!.hand.some((card) => card.cardId === "ST23-14")).toBe(true);
});
