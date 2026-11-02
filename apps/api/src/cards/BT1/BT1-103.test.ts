import { EffectTiming, getCardDefinition, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT1-103.js";

describe("BT1-103 Testament", () => {
  it("matches the catalog and compiles both printed effects", () => {
    expect(getCardDefinition("BT1-103")).toMatchObject({ nameEn: "Testament", playCost: 3 });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects).toEqual([
      {
        trigger: "Main",
        actions: [
          {
            effectTextPart:
              "[Main] Until the end of your opponent's next turn, 1 of your Digimon gains ＜Blocker＞. (When an opponent's Digimon attacks, you may suspend this Digimon to force the opponent to attack it instead.)",
            kind: "GainKeyword",
            target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
            keyword: { keyword: "Blocker" },
            duration: "untilOpponentTurnEnd",
          },
        ],
      },
      {
        trigger: "Security",
        actions: [
          {
            kind: "Draw",
            controller: "mine",
            amount: 1,
            effectTextPart: "[Security] Trigger <Draw 1＞. (Draw 1 card from your deck.)",
          },
          { kind: "AddToHandSelf" },
        ],
        isSecurity: true,
      },
    ]);
  });

  it("gives exactly one of your Digimon Blocker through the opponent's next turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-053", as: "chosen" },
            { card: "BT1-054", as: "other" },
          ],
          hand: [{ card: "BT1-103", as: "option" }],
          deck: ["BT1-009", "BT1-010"],
        },
        1: { deck: ["BT1-009"] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).hasKeyword(s.perm("chosen"), "Blocker"));

    expect(observe(s.engine).hasKeyword(s.perm("chosen"), "Blocker")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("other"), "Blocker")).toBe(false);

    await advance(s.engine).runTurn(0);
    expect(observe(s.engine).hasKeyword(s.perm("chosen"), "Blocker")).toBe(true);

    s.state.turnSeat = 1;
    s.state.memory = 0;
    await advance(s.engine).runTurn(1);
    expect(observe(s.engine).hasKeyword(s.perm("chosen"), "Blocker")).toBe(false);
  });

  it("draws before returning itself to hand when revealed in security", async () => {
    const s = setupEngine({
      0: {
        security: [{ card: "BT1-103", as: "securityOption", faceUp: true }],
        deck: [{ card: "BT1-009", as: "drawn" }],
      },
    });
    const drawnId = s.inst("drawn").instanceId;
    const optionId = s.inst("securityOption").instanceId;

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("securityOption"));

    expect(s.state.players[0]!.deck).toHaveLength(0);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([drawnId, optionId]);
  });

  it("targets a Digimon reached by public hatch, evolution, and move", async () => {
    const s = setupEngine({
      0: {
        eggDeck: [{ card: "BT1-005", as: "egg" }],
        hand: [
          { card: "BT1-047", as: "lv3" },
          { card: "BT1-053", as: "lv4" },
          { card: "BT1-103", as: "option" },
        ],
        deck: ["BT1-009", "BT1-010", "BT1-011"],
      },
      1: { deck: ["BT1-012", "BT1-013", "BT1-014"] },
    });
    const loop = s.engine.startTurnLoop();

    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "hatchEgg" })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT1-005");
    const permanentId = s.state.players[0]!.breeding!.permanentId;
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 4;
    expect(s.engine.applyIntent(0, { type: "digivolve", permanentId, instanceId: s.inst("lv3").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.breeding?.topCard?.instanceId === s.inst("lv3").instanceId);
    s.state.memory = 4;
    expect(s.engine.applyIntent(0, { type: "digivolve", permanentId, instanceId: s.inst("lv4").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.breeding?.topCard?.instanceId === s.inst("lv4").instanceId);
    expect(s.state.players[0]!.breeding!.stack.map(({ cardId }) => cardId)).toEqual(["BT1-005", "BT1-047"]);

    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.permanentId === permanentId));
    await advance(s.engine).waitForMainPhase(0);

    s.state.memory = 3;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).hasKeyword(permanentId, "Blocker"));
    expect(s.state.players[0]!.battleArea.find((p) => p.permanentId === permanentId)!.stack).toHaveLength(2);
    expect(observe(s.engine).hasKeyword(permanentId, "Blocker")).toBe(true);
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});
