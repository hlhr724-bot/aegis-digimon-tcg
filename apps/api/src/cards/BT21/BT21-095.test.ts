import { EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { settle, setupEngine } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT21-095.js";
import "../index.js";

describe("BT21-095 Wind Guardians", () => {
  it("keeps the face-up-security color waiver and security/Main branches faithful", () => {
    const staticEffect = compiled.effects.find((entry) => entry.trigger === "Static");
    expect(staticEffect?.actions[0]).toMatchObject({
      kind: "WaiveColorRequirement",
      condition: { kind: "youHaveNone", filter: { zone: "security", faceUp: true } },
    });

    const securityAllTurns = compiled.effects.find((entry) => entry.trigger === "AllTurns");
    expect(securityAllTurns).toMatchObject({ isSecurity: true });
    expect(securityAllTurns?.actions[0]).toMatchObject({
      kind: "GainKeyword",
      keyword: { keyword: "Vortex" },
      target: { filter: { controller: "mine", kind: ["Digimon"], nameOrTrait: [{ tokens: ["WG"], match: "trait" }] } },
    });

    const main = compiled.effects.find((entry) => entry.trigger === "Main");
    expect(main?.actions).toHaveLength(2);
    expect(main?.actions[0]).toMatchObject({ kind: "SecurityManipulation", op: "toHand", controller: "mine" });
    expect(main?.actions[1]).toMatchObject({ kind: "SecurityManipulation", op: "placeAsSecurity", faceUp: true });

    const security = compiled.effects.find((entry) => entry.trigger === "Security");
    expect(security).toMatchObject({ isSecurity: true });
    expect(security?.actions[0]).toMatchObject({
      kind: "PlayWithoutCost",
      optional: true,
      from: ["hand"],
      target: {
        filter: { levelComparison: { op: "lte", value: 5 }, nameOrTrait: [{ tokens: ["WG"], match: "trait" }] },
      },
    });
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
  });

  it("returns the bottom security card and places itself face-up as security", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-029", as: "color" }],
          hand: [{ card: "BT21-095", as: "option" }],
          security: [
            { card: "BT1-002", as: "topSecurity" },
            { card: "BT1-001", as: "bottomSecurity" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    const optionInstanceId = s.inst("option").instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionInstanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.security.some((card) => card.instanceId === optionInstanceId));

    expect(s.state.players[0]!.hand.some((card) => card.cardId === "BT1-001")).toBe(true);
    expect(s.state.players[0]!.security.map((card) => card.instanceId)).toEqual([
      s.inst("topSecurity").instanceId,
      optionInstanceId,
    ]);
    expect(s.state.players[0]!.security[1]!.faceUp).toBe(true);
    expect(s.state.memory).toBe(1);
  });

  it("Q4609/Q4610 works with zero security: it only places itself face-up", async () => {
    const s = setupEngine({
      0: { hand: [{ card: "BT21-095", as: "option" }] },
    });
    s.state.memory = 6;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.security.some((card) => card.instanceId === s.inst("option").instanceId));
    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.state.players[0]!.security[0]!.faceUp).toBe(true);
  });

  it("waives its color only for its controller's face-up-security condition", async () => {
    const ownFaceUp = setupEngine({
      0: { hand: [{ card: "BT21-095", as: "option" }], security: [{ card: "BT1-001", faceUp: true }] },
    });
    ownFaceUp.state.memory = 2;
    await ownFaceUp.ready();
    expect(
      ownFaceUp.engine.applyIntent(0, { type: "playCard", instanceId: ownFaceUp.inst("option").instanceId }),
    ).toEqual({ ok: false, reason: "color-requirement-unmet" });

    const opponentFaceUp = setupEngine({
      0: { hand: [{ card: "BT21-095", as: "option" }] },
      1: { security: [{ card: "BT1-001", faceUp: true }] },
    });
    opponentFaceUp.state.memory = 2;
    await opponentFaceUp.ready();
    expect(
      opponentFaceUp.engine.applyIntent(0, {
        type: "playCard",
        instanceId: opponentFaceUp.inst("option").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => opponentFaceUp.state.players[0]!.security.length === 1);
    expect(opponentFaceUp.state.players[0]!.security[0]!.faceUp).toBe(true);
  });

  it("Security plays a level-5 WG Digimon from hand without paying cost", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "BT21-095", as: "option" }],
          hand: [{ card: "BT21-038", as: "wg" }],
        },
        1: { battleArea: [{ card: "BT1-019", as: "attacker" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 0;
    await s.ready();

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.state.players[0]!.battleArea.length === 1);
    expect(s.state.players[0]!.battleArea[0]!.topCard.instanceId).toBe(s.inst("wg").instanceId);
    expect(observe(s.engine).hasKeyword(s.perm("wg"), "Vortex")).toBe(false);
    expect(s.state.memory).toBe(0);
  });

  it("public Security resolution rejects an over-level WG hand candidate", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "BT21-095", as: "option" }],
          hand: [{ card: "BT21-039", as: "tooLarge" }],
        },
        1: { battleArea: [{ card: "BT1-019", as: "attacker" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 0;
    await s.ready();

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.state.players[0]!.security.length === 0);

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("tooLarge").instanceId)).toBe(true);
    expect(s.state.memory).toBe(0);
  });

  it("Security rejects an over-level hand target (direct timing supplement)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT21-038", as: "wg" }],
          security: [{ card: "BT21-095", as: "option" }],
          hand: [{ card: "BT21-039", as: "tooLarge" }],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("option"));
    await settle(() => observe(s.engine).hasKeyword(s.perm("wg"), "Vortex"));
    expect(observe(s.engine).hasKeyword(s.perm("wg"), "Vortex")).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("tooLarge").instanceId)).toBe(true);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
  });

  it("publicly declines an eligible level-5 WG Security play and leaves the card in hand", async () => {
    const s = setupEngine(
      {
        0: { security: [{ card: "BT21-095", as: "option" }], hand: [{ card: "BT21-038", as: "wg" }] },
        1: { battleArea: [{ card: "BT21-032", as: "attacker", dp: 2000 }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 0;
    await s.ready();

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.state.players[0]!.security.length === 0);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("wg").instanceId)).toBe(true);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
  });

  it("publicly grants Vortex to existing and newly played own WG Digimon while face-up in Security", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT21-038", as: "existing" },
            { card: "BT1-029", as: "nonWG" },
          ],
          security: [{ card: "BT1-001", as: "securityCard" }],
          hand: [
            { card: "BT21-095", as: "option" },
            { card: "BT21-038", as: "entrant" },
          ],
        },
        1: { battleArea: [{ card: "BT21-038", as: "opponentWG" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 8;
    const optionId = s.inst("option").instanceId;
    const entrantId = s.inst("entrant").instanceId;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.some((card) => card.instanceId === optionId));
    expect(observe(s.engine).hasKeyword(s.perm("existing"), "Vortex")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("nonWG"), "Vortex")).toBe(false);
    expect(observe(s.engine).hasKeyword(s.perm("opponentWG"), "Vortex")).toBe(false);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: entrantId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === entrantId));
    expect(observe(s.engine).hasKeyword(s.perm("entrant"), "Vortex")).toBe(true);
    expect(s.state.memory).toBe(0);
  });

  it("does not offer a Vortex attack against a player when no opposing Digimon exist", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT21-038", as: "wg" }],
          security: [{ card: "BT21-095", faceUp: true }],
          deck: ["BT1-009", "BT1-009"],
        },
        1: { security: ["BT1-009"], deck: ["BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(observe(s.engine).hasKeyword(s.perm("wg"), "Vortex")).toBe(true);
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
    await settle();
    expect(s.events.filter((event) => event.kind === "attackDeclared")).toHaveLength(0);
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("loses the Security Vortex grant when the face-up source is checked", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT21-038", as: "wg" }],
          hand: [{ card: "BT21-095", as: "option" }],
          security: [{ card: "BT1-001", as: "securityCard" }],
        },
        1: { battleArea: [{ card: "BT21-032", as: "attacker", dp: 2000 }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 3;
    const optionId = s.inst("option").instanceId;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.some((card) => card.instanceId === optionId));
    expect(observe(s.engine).hasKeyword(s.perm("wg"), "Vortex")).toBe(true);

    s.state.turnSeat = 1;
    s.state.memory = 0;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        !observe(s.engine).isAttacking() && !s.state.players[0]!.security.some((card) => card.instanceId === optionId),
    );
    expect(observe(s.engine).hasKeyword(s.perm("wg"), "Vortex")).toBe(false);
  });
});

describe("BT21-095 Wind Guardians — KB Q&A rulings", () => {
  it("keeps a face-up security card revealed and counts it as a security card like any other (Q4611)", async () => {
    async function useCostOfRagingSerpentineAgainst(faceDownSecurityCount: number) {
      const s = setupEngine(
        {
          0: { battleArea: [{ card: "BT1-009" }], hand: [{ card: "BT21-093", as: "counter" }] },
          1: {
            security: [
              ...Array.from({ length: faceDownSecurityCount }, () => "BT1-001"),
              { card: "BT21-095", as: "faceUpSecurity", faceUp: true },
            ],
          },
        },
        { autoSelectCards: true },
      );
      s.state.memory = 8;
      await s.ready();
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("counter").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT21-093"));
      expect(s.state.players[1]!.security.find((card) => card.cardId === "BT21-095")?.faceUp).toBe(true);
      return 8 - s.state.memory;
    }

    expect(await useCostOfRagingSerpentineAgainst(3)).toBe(8);
    expect(await useCostOfRagingSerpentineAgainst(2)).toBe(4);
  });

  it("checks a face-up security Digimon while revealed and battles it like any security Digimon (Q4612)", async () => {
    const s = setupEngine(
      {
        0: { security: [{ card: "BT1-019", as: "faceUpDigimon", faceUp: true }, "BT1-001"] },
        1: { battleArea: [{ card: "BT1-009", as: "attacker" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 0;
    await s.ready();
    const faceUpId = s.inst("faceUpDigimon").instanceId;
    const attackerId = s.inst("attacker").instanceId;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.state.players[0]!.security.length === 1);

    expect(s.state.players[1]!.battleArea.some((p) => p.topCard.instanceId === attackerId)).toBe(false);
    expect(s.state.players[1]!.trash.some((card) => card.instanceId === attackerId)).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === faceUpId)).toBe(true);
    expect(s.state.players[0]!.security.map((card) => card.cardId)).toEqual(["BT1-001"]);
  });

  it("triggers its [Security] effect when checked after being placed face-up by its [Main] effect (Q4613)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT21-095", as: "option" },
            { card: "BT21-038", as: "wg" },
          ],
        },
        1: { battleArea: [{ card: "BT1-019", as: "attacker" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 3;
    await s.ready();
    const optionId = s.inst("option").instanceId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.some((card) => card.instanceId === optionId));
    expect(s.state.players[0]!.security[0]!.faceUp).toBe(true);

    s.state.turnSeat = 1;
    s.state.memory = 0;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.state.players[0]!.security.length === 0);

    expect(s.state.players[0]!.battleArea.map((p) => p.topCard.instanceId)).toEqual([s.inst("wg").instanceId]);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === optionId)).toBe(true);
  });

  it("turns every face-up security card face down when the security stack is shuffled (Q4614)", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT21-095", as: "option" },
            { card: "BT1-087", as: "shuffler" },
          ],
          security: [{ card: "BT1-010", as: "taken" }, "BT1-011", "BT1-012"],
          deck: ["BT1-013", "BT1-014"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds },
    );
    preferInstanceIds.push(s.inst("taken").instanceId);
    s.state.memory = 10;
    await s.ready();
    const optionId = s.inst("option").instanceId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.some((card) => card.instanceId === optionId));
    expect(s.state.players[0]!.security.find((card) => card.instanceId === optionId)?.faceUp).toBe(true);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("shuffler").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("taken").instanceId));
    await settle(() => false, 30);

    expect(s.state.players[0]!.security.map((card) => card.cardId).sort()).toEqual(["BT1-011", "BT21-095"]);
    expect(s.state.players[0]!.security.every((card) => !card.faceUp)).toBe(true);
  });
});
