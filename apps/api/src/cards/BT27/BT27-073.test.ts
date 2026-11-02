import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import "#api/cards/index";

describe("Chiropmon evolution discount and inherited draw", () => {
  it.each([
    ["BT27-077", 1],
    ["BT26-070", 1],
    ["ST6-08", 1],
  ])("charges the correct evolution cost into %s", async (card, cost) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-073", as: "base" }],
          hand: [{ card, as: "evolution" }],
          deck: ["BT1-009", "BT1-009"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
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
    await settle(() => s.perm("base").topCard.cardId === card && !s.state.pendingDecision);
    expect(s.state.memory).toBe(10 - Number(cost));
    expect(s.perm("base").stack.map((c) => c.cardId)).toEqual(["BT27-073"]);
  });

  it("draws and trashes on an inherited attack only once per turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-077", as: "attacker", under: ["BT27-073"] }],
          hand: ["BT1-009"],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: { security: ["BT1-009", "BT1-009", "BT1-009"] },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.length === 1 && !s.state.pendingDecision);
    expect(s.state.players[0]!.deck).toHaveLength(2);
    expect(
      s.decisions
        .filter((d) => d.req.sourceCardId === "BT27-073" && d.req.kind === "selectCards")
        .map((d) => d.req.options?.effectTextEmphasis),
    ).toEqual(["and trash 1 card in your hand."]);
    await advance(s.engine).verb.unsuspend([s.perm("attacker").permanentId]);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 1);
    expect(s.state.players[0]!.trash).toHaveLength(1);
    expect(s.state.players[0]!.deck).toHaveLength(2);
  });
  it.each([
    ["BT25-003", true],
    ["BT26-004", true],
    ["BT1-003", false],
  ])("honors the egg trait and ordinary color requirements from %s", async (egg, allowed) => {
    const s = setupEngine({
      0: { breeding: { card: String(egg), as: "egg" }, hand: [{ card: "BT27-073", as: "card" }], deck: ["BT1-009"] },
    });
    await s.ready();
    s.state.memory = 10;
    const result = s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("egg").permanentId,
      instanceId: s.inst("card").instanceId,
    });
    expect(result.ok).toBe(allowed);
    if (allowed) {
      await settle(() => s.perm("egg").topCard.cardId === "BT27-073");
    }
    expect(s.state.memory).toBe(10);
    expect(s.perm("egg").topCard.cardId).toBe(allowed ? "BT27-073" : egg);
    expect(s.perm("egg").stack.map((c) => c.cardId)).toEqual(allowed ? [egg] : []);
  });
});
