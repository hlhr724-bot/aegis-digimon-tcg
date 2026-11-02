import { getCardDefinition, getCompiledCard } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "./ST2-14.js";

describe("ST2-14 Sorrow Blue", () => {
  it("matches the Main and Security restriction durations", () => {
    const definition = getCardDefinition("ST2-14")!;
    const compiled = getCompiledCard("ST2-14")!;

    expect(definition.effectText).toContain("can't attack or block");
    expect(definition.securityEffectText).toContain("can't attack or block");
    expect(compiled.effects).toEqual([
      {
        trigger: "Main",
        actions: [
          {
            effectTextPart:
              "[Main] Choose 1 of your opponent's Digimon with no digivolution cards. That Digimon can't attack or block until the end of your opponent's next turn.",
            kind: "Restrict",
            target: {
              filter: { controllerDefault: "opponent", kind: ["Digimon"], digivolutionCards: "hasNone" },
              count: 1,
            },
            restriction: "attackOrBlock",
            duration: "untilOpponentTurnEnd",
          },
        ],
      },
      {
        trigger: "Security",
        actions: [
          {
            kind: "Restrict",
            target: {
              filter: { controllerDefault: "opponent", kind: ["Digimon"], digivolutionCards: "hasNone" },
              count: 1,
            },
            restriction: "attackOrBlock",
            duration: "untilYourTurnEnd",
          },
        ],
        isSecurity: true,
      },
    ]);
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
  });

  it("prevents one source-less opposing Digimon from attacking or blocking", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: ["ST2-03"],
          hand: [{ card: "ST2-14", as: "option" }],
          deck: ["BT1-030"],
        },
        1: {
          battleArea: [{ card: "ST2-03", as: "target", suspended: true }],
          trash: [{ card: "ST2-01", as: "newSource" }],
          deck: ["BT1-031"],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 5;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).isRestricted(s.perm("target"), "attack"));
    expect(observe(s.engine).isRestricted(s.perm("target"), "attack")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("target"), "block")).toBe(true);

    await advance(s.engine).verb.placeUnder(s.perm("target").permanentId, [s.inst("newSource").instanceId]);
    expect(observe(s.engine).isRestricted(s.perm("target"), "attack")).toBe(true);

    await advance(s.engine).runTurn(0);
    expect(observe(s.engine).isRestricted(s.perm("target"), "attack")).toBe(true);
    s.state.turnSeat = 1;
    s.state.memory = -s.state.memory;
    await advance(s.engine).runTurn(1);
    expect(observe(s.engine).isRestricted(s.perm("target"), "attack")).toBe(false);
    expect(observe(s.engine).isRestricted(s.perm("target"), "block")).toBe(false);
  });

  it("activates the same restriction from security", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "ST2-14", as: "securityOption" }],
          deck: ["BT1-030"],
        },
        1: { battleArea: [{ card: "ST2-03", as: "target" }], deck: ["BT1-031"] },
      },
      { autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("target").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () => s.state.players[0]!.security.length === 0 && observe(s.engine).isRestricted(s.perm("target"), "attack"),
    );
    expect(observe(s.engine).isRestricted(s.perm("target"), "attack")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("target"), "block")).toBe(true);
    await advance(s.engine).runTurn(1);
    expect(observe(s.engine).isRestricted(s.perm("target"), "attack")).toBe(true);
    s.state.turnSeat = 0;
    s.state.memory = -s.state.memory;
    await advance(s.engine).runTurn(0);
    expect(observe(s.engine).isRestricted(s.perm("target"), "attack")).toBe(false);
    expect(observe(s.engine).isRestricted(s.perm("target"), "block")).toBe(false);
  });
});

describe("ST2-14 Sorrow Blue — KB Q&A rulings", () => {
  async function playSorrowBlueOnTarget(s: ReturnType<typeof setupEngine>): Promise<void> {
    s.state.memory = 5;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("sorrowBlue").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).isRestricted(s.perm("target"), "attack"));
    expect(observe(s.engine).isRestricted(s.perm("target"), "attack")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("target"), "block")).toBe(true);
  }

  it("lets you attack a suspended opposing Digimon that Sorrow Blue restricted (Q624)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-027", as: "attacker" }],
          hand: [{ card: "ST2-14", as: "sorrowBlue" }],
          deck: ["BT1-030"],
        },
        1: {
          battleArea: [{ card: "ST2-02", as: "target", suspended: true }],
          deck: ["BT1-031"],
        },
      },
      { autoSelectCards: true },
    );
    await playSorrowBlueOnTarget(s);
    const targetId = s.perm("target").permanentId;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: targetId },
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).finishAttack();

    expect(s.state.players[1]!.battleArea.some(({ permanentId }) => permanentId === targetId)).toBe(false);
    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toContain("ST2-02");
  });

  it("keeps the attack and block restriction after the target digivolves and gains digivolution cards (Q625)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: ["BT1-027"],
          hand: [{ card: "ST2-14", as: "sorrowBlue" }],
          deck: ["BT1-030", "BT1-030"],
        },
        1: {
          battleArea: [{ card: "ST2-02", as: "target" }],
          hand: [{ card: "ST2-05", as: "ikkakumon" }],
          deck: ["BT1-031", "BT1-031"],
        },
      },
      { autoSelectCards: true },
    );
    await playSorrowBlueOnTarget(s);
    advance(s.engine).endMainPhaseIfOpen(0);

    s.state.turnSeat = 1;
    s.state.memory = 3;
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);

    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: s.perm("target").permanentId,
        instanceId: s.inst("ikkakumon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").topCard.cardId === "ST2-05");
    expect(s.perm("target").stack.map(({ cardId }) => cardId)).toEqual(["ST2-02"]);

    expect(observe(s.engine).isRestricted(s.perm("target"), "attack")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("target"), "block")).toBe(true);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("target").permanentId,
        target: { kind: "player" },
      }).ok,
    ).toBe(false);

    advance(s.engine).endMainPhaseIfOpen(1);
    await turn;
    expect(observe(s.engine).isRestricted(s.perm("target"), "attack")).toBe(false);
  });
});
