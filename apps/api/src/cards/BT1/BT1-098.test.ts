import { Phase, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT1-098.js";

describe("BT1-098 V-Nova Blast", () => {
  it("matches the catalog and compiles its temporary Jamming and Security effects", () => {
    expect(getCardDefinition("BT1-098")).toMatchObject({
      cardId: "BT1-098",
      set: "BT1",
      nameEn: "V-Nova Blast",
      colors: ["Blue"],
      kinds: ["Option"],
      playCost: 2,
      dp: 0,
      evoCosts: [],
      effectText:
        "[Main] 1 of your Digimon gains ＜Jamming＞ (This Digimon can't be deleted in battles against Security Digimon) for the turn.",
      securityEffectText: "[Security] Add this card to its owner's hand.",
      rarity: "C",
      maxCountInDeck: 4,
      imageId: "BT1-098",
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects).toEqual([
      {
        trigger: "Main",
        actions: [
          {
            effectTextPart:
              "[Main] 1 of your Digimon gains ＜Jamming＞ (This Digimon can't be deleted in battles against Security Digimon) for the turn.",
            kind: "GainKeyword",
            target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
            keyword: { keyword: "Jamming" },
            duration: "forTheTurn",
          },
        ],
      },
      { trigger: "Security", actions: [{ kind: "AddToHandSelf" }], isSecurity: true },
    ]);
  });

  it("gives exactly 1 Digimon Jamming so it survives battle against a stronger Security Digimon", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-028", as: "target" },
            { card: "BT1-029", as: "other" },
          ],
          hand: [{ card: "BT1-098", as: "option" }],
          deck: ["BT1-029"],
        },
        1: { security: ["BT1-025"], deck: ["BT1-029", "BT1-030", "BT1-031"] },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("target").topCard.instanceId);
    const targetId = s.perm("target").permanentId;
    s.state.memory = 2;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).hasKeyword(targetId, "Jamming"));

    expect(observe(s.engine).hasKeyword(s.perm("other"), "Jamming")).toBe(false);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: targetId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0 && !observe(s.engine).isAttacking());

    expect(s.state.players[0]!.battleArea.some((entry) => entry.permanentId === targetId)).toBe(true);
    await advance(s.engine).runTurn(0);
    expect(observe(s.engine).hasKeyword(targetId, "Jamming")).toBe(false);
  });

  it("selects a Digimon reached through a public hatch, Blue digivolution, and move", async () => {
    const s = setupEngine(
      {
        0: {
          eggDeck: [{ card: "BT1-003", as: "egg" }],
          hand: [
            { card: "BT1-028", as: "evolving" },
            { card: "BT1-098", as: "option" },
          ],
          deck: [{ card: "BT1-029", as: "drawn" }, "BT1-030", "BT1-031", "BT1-032", "BT1-033"],
        },
        1: { security: ["BT1-025"], deck: ["BT1-029", "BT1-030", "BT1-031"] },
      },
      { autoSelectCards: true },
    );
    const loop = s.engine.startTurnLoop();

    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "hatchEgg" })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT1-003");
    const breedingPermanentId = s.state.players[0]!.breeding!.permanentId;
    const eggInstanceId = s.state.players[0]!.breeding!.topCard!.instanceId;

    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 2;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: breedingPermanentId,
        instanceId: s.inst("evolving").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT1-028");
    expect(s.state.players[0]!.breeding!.stack.map(({ instanceId }) => instanceId)).toEqual([eggInstanceId]);

    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: breedingPermanentId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some(({ permanentId }) => permanentId === breedingPermanentId));
    await advance(s.engine).waitForMainPhase(0);
    const target = s.state.players[0]!.battleArea.find(({ permanentId }) => permanentId === breedingPermanentId)!;
    expect(target.topCard?.cardId).toBe("BT1-028");
    expect(target.stack.map(({ instanceId }) => instanceId)).toEqual([eggInstanceId]);

    s.state.memory = 2;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).hasKeyword(breedingPermanentId, "Jamming"));
    expect(observe(s.engine).hasKeyword(breedingPermanentId, "Jamming")).toBe(true);
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("resolves without a target decision when the user controls no Digimon", async () => {
    const s = setupEngine({
      0: {
        battleArea: ["BT1-086"],
        hand: [{ card: "BT1-098", as: "option" }],
      },
    });
    const optionId = s.inst("option").instanceId;
    s.state.memory = 2;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === optionId));

    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("adds itself from security to its owner's hand", async () => {
    const s = setupEngine({
      0: { security: [{ card: "BT1-098", as: "securityOption" }] },
      1: { battleArea: [{ card: "BT1-010", as: "attacker", dp: 5000 }] },
    });
    const instanceId = s.inst("securityOption").instanceId;

    s.state.turnSeat = 1;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 0 && !observe(s.engine).isAttacking());

    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([instanceId]);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === instanceId)).toBe(false);
  });
});
