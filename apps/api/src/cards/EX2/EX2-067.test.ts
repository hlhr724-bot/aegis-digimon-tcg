import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./EX2-067.js";
import "./EX2-050.js";
import "./EX2-067.js";
import "../BT14/BT14-062.js";

const inertDeck = ["BT1-009", "BT1-013", "BT1-009", "BT1-013"];
const inertSecurity = ["BT1-009", "BT1-013"];

describe("EX2-067 Fire Ball", () => {
  it("matches the catalog, Q3353 ruling, and compiled Main/Security IR", () => {
    expect(getCardDefinition("EX2-067")).toMatchObject({
      cardId: "EX2-067",
      nameEn: "Fire Ball",
      colors: ["Red"],
      kinds: ["Option"],
      playCost: 2,
      dp: 0,
      evoCosts: [],
      rarity: "U",
      maxCountInDeck: 4,
      effectText:
        "[Main] Delete 1 of your opponent's Digimon with 3000 DP or less. If an opponent's Digimon wasn't deleted by this effect, ＜Draw 2＞. (Draw 2 cards from your deck.)",
      securityEffectText: "[Security] Activate this card's [Main] effect.",
    });
    expect(compiled.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          trigger: "Main",
          actions: [
            {
              effectTextPart: "[Main] Delete 1 of your opponent's Digimon with 3000 DP or less.",
              kind: "Delete",
              target: {
                filter: { controller: "opponent", kind: ["Digimon"], dp: { op: "lte", value: 3000 } },
                count: 1,
              },
            },
            {
              effectTextPart:
                "If an opponent's Digimon wasn't deleted by this effect, ＜Draw 2＞. (Draw 2 cards from your deck.)",
              kind: "Draw",
              controller: "mine",
              amount: 2,
              condition: {
                kind: "ifThisEffectDidNotDelete",
                raw: "an opponent's Digimon wasn't deleted by this effect",
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

  it("draws 2 when it can't delete an opposing 3000-DP-or-lower Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-009", as: "redSource" }],
          hand: [{ card: "EX2-067", as: "option" }],
          deck: [
            { card: "BT1-009", as: "drawOne" },
            { card: "BT1-013", as: "drawTwo" },
          ],
          security: inertSecurity,
        },
        1: { battleArea: ["BT1-013"], deck: inertDeck, security: inertSecurity },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawTwo").instanceId));
    expect(s.state.players[0]!.hand).toHaveLength(2);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("drawOne").instanceId, s.inst("drawTwo").instanceId]),
    );
  });

  it("deletes a 3000-DP target and does not draw when deletion succeeds", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-009", as: "redSource" }],
          hand: [{ card: "EX2-067", as: "option" }],
          deck: inertDeck,
          security: inertSecurity,
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "target" },
            { card: "BT1-009", as: "otherTarget" },
          ],
          deck: inertDeck,
          security: inertSecurity,
        },
      },
      { autoSelectCards: false, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    expect(s.state.pendingDecision?.kind).toBe("chooseTargets");
    const targetPayload = JSON.parse(s.state.pendingDecision!.payloadJson) as { candidateInstanceIds?: string[] };
    expect(targetPayload.candidateInstanceIds).toEqual(
      expect.arrayContaining([s.perm("target").permanentId, s.perm("otherTarget").permanentId]),
    );
    expect(s.decisions.some(({ req }) => req.kind === "optional")).toBe(false);
    const targetDecision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: targetDecision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("target").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 1);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.state.players[1]!.battleArea[0]!.topCard.instanceId).toBe(s.inst("otherTarget").instanceId);
    expect(s.state.players[0]!.hand).toHaveLength(0);
  });

  it("activates its Main effect from security", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-013", as: "attacker" },
            { card: "BT1-009", as: "target" },
          ],
          deck: inertDeck,
          security: inertSecurity,
        },
        1: {
          deck: inertDeck,
          security: [{ card: "EX2-067", as: "securityOption" }, ...inertSecurity],
        },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
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
        !observe(s.engine).isAttacking() && !s.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT1-009"),
    );
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT1-009")).toBe(false);
  });

  it("draws 2 when an eligible 3000-DP Digimon is immune to the deletion", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-009", as: "redSource" }],
          hand: [{ card: "EX2-067", as: "option" }],
          deck: [
            { card: "BT1-009", as: "drawOne" },
            { card: "BT1-013", as: "drawTwo" },
          ],
          security: inertSecurity,
        },
        1: { battleArea: [{ card: "BT14-062", as: "immuneTarget" }], deck: inertDeck, security: inertSecurity },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawTwo").instanceId));
    expect(s.perm("immuneTarget").topCard.cardId).toBe("BT14-062");
    expect(s.state.players[0]!.hand).toHaveLength(2);
  });
});
