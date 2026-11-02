import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { observe } from "../../engine/testkit/observe.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./EX2-069.js";
import "./EX2-069.js";

const inertDeck = ["BT1-009", "BT1-010", "BT1-011", "BT1-012"];
const inertSecurity = ["BT1-013", "BT1-014"];

describe("EX2-069 Fist of the Beast King", () => {
  it("matches the catalog and typed IR", () => {
    expect(getCardDefinition("EX2-069")).toMatchObject({
      cardId: "EX2-069",
      nameEn: "Fist of the Beast King",
      colors: ["Blue"],
      kinds: ["Option"],
      playCost: 2,
      dp: 0,
      evoCosts: [],
      rarity: "C",
      maxCountInDeck: 4,
      effectText:
        "While you have a Digimon with [Beelzemon] in its name in play, you may use this card without meeting its color requirements.[Main] Unsuspend 1 of your Digimon with [Leomon] or [Beelzemon] in its name.",
      securityEffectText: "[Security] Activate this card's [Main] effect.",
    });
    expect(compiled.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          trigger: "Static",
          actions: [
            expect.objectContaining({
              kind: "WaiveColorRequirement",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              condition: expect.objectContaining({
                kind: "youHave",
                filter: {
                  zone: "battleArea",
                  controllerDefault: "mine",
                  kind: ["Digimon"],
                  nameOrTrait: [{ tokens: ["Beelzemon"], match: "name" }],
                },
              }),
            }),
          ],
        }),
        expect.objectContaining({
          trigger: "Main",
          actions: [
            {
              effectTextPart: "[Main] Unsuspend 1 of your Digimon with [Leomon] or [Beelzemon] in its name.",
              kind: "Unsuspend",
              target: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  nameOrTrait: [{ tokens: ["Leomon", "Beelzemon"], match: "name" }],
                },
                count: 1,
              },
            },
          ],
        }),
        expect.objectContaining({ trigger: "Security", actions: [{ kind: "ActivateMain" }], isSecurity: true }),
      ]),
    );
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
  });

  it("unsuspends Leomon or Beelzemon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX2-044", as: "beelzemon", suspended: true }],
          hand: [{ card: "EX2-069", as: "option" }],
        },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => !s.perm("beelzemon").isSuspended);
    expect(s.perm("beelzemon").isSuspended).toBe(false);
  });

  it("unsuspends exactly one selected Leomon-or-Beelzemon and leaves an unrelated Digimon suspended", async () => {
    const preferredInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX2-017", as: "leomon", suspended: true },
            { card: "EX2-044", as: "beelzemon", suspended: true },
            { card: "EX2-014", as: "unrelated", suspended: true },
          ],
          hand: [{ card: "EX2-069", as: "option" }],
        },
      },
      { autoSelectCards: true, autoOrderTriggers: true, preferInstanceIds: preferredInstanceIds },
    );
    preferredInstanceIds.push(s.perm("leomon").permanentId);
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => !s.perm("leomon").isSuspended);
    expect(s.perm("leomon").isSuspended).toBe(false);
    expect(s.perm("beelzemon").isSuspended).toBe(true);
    expect(s.perm("unrelated").isSuspended).toBe(true);
  });

  it("activates its Main effect from Security through a public attack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX2-017", as: "leomon", suspended: true }],
          deck: inertDeck,
          security: [{ card: "EX2-069", as: "securityOption" }, ...inertSecurity],
        },
        1: { battleArea: [{ card: "EX2-050", as: "attacker" }], deck: inertDeck, security: ["BT1-009", "BT1-010"] },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 3;
    const turnLoop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("leomon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.perm("leomon").isSuspended);
    expect(s.perm("leomon").isSuspended).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && !s.perm("leomon").isSuspended);
    expect(s.perm("leomon").isSuspended).toBe(false);
    expect(s.state.players[0]!.security.some((card) => card.instanceId === s.inst("securityOption").instanceId)).toBe(
      false,
    );
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await turnLoop;
  });

  it("does not waive the blue color requirement without Beelzemon in play", async () => {
    const s = setupEngine({ 0: { battleArea: ["EX2-019"], hand: [{ card: "EX2-069", as: "option" }] } });
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: false,
      reason: "color-requirement-unmet",
    });
  });
});
