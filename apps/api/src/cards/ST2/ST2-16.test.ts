import { getCardDefinition, getCompiledCard } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "./ST2-16.js";

describe("ST2-16 Cocytus Breath", () => {
  it("matches the printed return-and-source-cleanup contract", () => {
    const definition = getCardDefinition("ST2-16")!;
    const compiled = getCompiledCard("ST2-16")!;

    expect(definition.kinds).toEqual(["Option"]);
    expect(definition.colors).toEqual(["Blue"]);
    expect(definition.playCost).toBe(7);
    expect(definition.effectText).toContain("Trash all of the digivolution cards");
    expect(definition.securityEffectText).toContain("Activate this card's [Main] effect");
    expect(compiled.effects).toEqual([
      {
        trigger: "Main",
        actions: [
          {
            effectTextPart:
              "[Main] Return 1 of your opponent's Digimon to its owner's hand. (Trash all of the digivolution cards of that Digimon.)",
            kind: "Return",
            target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
            to: "hand",
          },
        ],
      },
      { trigger: "Security", actions: [{ kind: "ActivateMain" }], isSecurity: true },
    ]);
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
  });

  it("returns an opposing Digimon to hand and trashes all of its sources", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "ST2-03", as: "friendly", under: [{ card: "ST2-01", as: "friendlySource" }] }],
          hand: [{ card: "ST2-16", as: "option" }],
        },
        1: {
          battleArea: [
            {
              card: "ST2-09",
              as: "target",
              under: [
                { card: "ST2-03", as: "source" },
                { card: "ST1-03", as: "secondSource" },
              ],
            },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.players[1]!.hand.some((card) => card.instanceId === s.inst("target").instanceId) &&
        s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("option").instanceId),
    );
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toEqual([
      s.inst("source").instanceId,
      s.inst("secondSource").instanceId,
    ]);
    expect(
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard?.instanceId === s.inst("friendly").instanceId,
      ),
    ).toBe(true);
    expect(s.perm("friendly").stack.map((card) => card.instanceId)).toEqual([s.inst("friendlySource").instanceId]);
    expect(s.state.memory).toBe(3);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([s.inst("option").instanceId]);
  });

  it("activates the same return effect from security", async () => {
    const s = setupEngine(
      {
        0: { security: [{ card: "ST2-16", as: "securityOption" }], deck: ["BT1-030"] },
        1: {
          battleArea: [
            { card: "ST2-09", as: "target", under: [{ card: "ST2-03", as: "securitySource" }] },
            { card: "BT1-009", as: "attacker" },
          ],
          deck: ["BT1-031"],
        },
      },
      { autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.security.length === 0 &&
        !observe(s.engine).isAttacking() &&
        s.state.players[1]!.hand.some((card) => card.instanceId === s.inst("target").instanceId) &&
        s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("securityOption").instanceId),
    );
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toEqual([s.inst("securitySource").instanceId]);
    expect(s.perm("attacker").isSuspended).toBe(true);
  });
});
