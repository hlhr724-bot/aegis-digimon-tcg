import { EffectTiming, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "#api/engine/effects/interpreter";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, drainMicrotasks, settle, setupEngine } from "#api/engine/testkit/harness";
import "#api/cards/index";
import { compiled } from "./BT27-088.js";

const cardId = "BT27-088";
const renamon = "BT27-022";
const tenkomon = "BT27-027";
const vanillaIceSnowLevel4 = "BT11-026";
const vanillaBlueLevel3 = "BT1-027";
const vanillaBlueLevel5 = "BT1-038";
const source = "BT1-028";

type Options = Parameters<typeof setupEngine>[1];

async function memoryAtMainPhaseWith(digimon: readonly string[]) {
  const s = setupEngine({
    0: {
      battleArea: [{ card: cardId, as: "valner" }, ...digimon.map((card, index) => ({ card, as: `digimon${index}` }))],
      deck: [vanillaBlueLevel3, vanillaBlueLevel3],
    },
  });
  s.state.memory = 3;
  await s.ready();
  const turn = s.engine.runOneTurn();
  await advance(s.engine).waitForMainPhase(0);
  await drainMicrotasks(20);
  const memory = s.state.memory;
  advance(s.engine).endMainPhaseIfOpen(0);
  await turn;
  return memory;
}

async function playFromHand(card: string, opponentSources: string[] | undefined, options: Options) {
  const s = setupEngine(
    {
      0: {
        battleArea: [{ card: cardId, as: "valner" }],
        hand: [{ card, as: "entering" }],
        deck: [vanillaBlueLevel3, vanillaBlueLevel3],
      },
      1: {
        battleArea:
          opponentSources === undefined ? [] : [{ card: vanillaBlueLevel5, as: "target", under: opponentSources }],
      },
    },
    { ...options, autoSelectCards: true },
  );
  s.state.memory = 5;
  await s.ready();
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("entering").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => s.state.players[0]!.battleArea.length === 2 && s.state.pendingDecision === undefined);
  return s;
}

describe("BT27-088 Valner Dragnogh", () => {
  it("matches the printed card", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      set: "BT27",
      nameEn: "Valner Dragnogh",
      nameJp: "ヴァルナー・ドラグノフ",
      colors: ["Blue"],
      kinds: ["Tamer"],
      playCost: 3,
      types: ["ALYSION"],
      rarity: "R",
      effectText:
        "[Start of Your Main Phase] If you have a Digimon with the [Ice-Snow] trait, gain 1 memory.\n[All Turns] When your Digimon are played or digivolve, if any of them have the [Ice-Snow] trait, by suspending this Tamer, trash the bottom 2 digivolution cards from 1 of your opponent's Digimon. After, if they don't have a Digimon with digivolution cards, gain 1 memory.",
      securityEffectText: "[Security] Play this card without paying the cost.",
    });
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
  });

  it("watches plays and digivolutions during all turns", () => {
    expect(compiled.effects.find((effect) => effect.trigger === "AllTurns")?.actions).toMatchObject([
      { kind: "SubTrigger", event: "whenPlayed" },
      { kind: "SubTrigger", event: "whenOneOfYoursDigivolves" },
    ]);
  });

  it.each([
    ["a Digimon with the printed Ice-Snow trait", [vanillaIceSnowLevel4], 4],
    ["a Digimon with the [Rule] Ice-Snow trait", [renamon], 4],
    ["only a Digimon without the trait", [vanillaBlueLevel5], 3],
  ])("at the start of your main phase with %s leaves you on %i memory", async (_label, digimon, expected) => {
    expect(await memoryAtMainPhaseWith(digimon)).toBe(expected);
  });

  it("suspends to trash the bottom 2 digivolution cards, then gains 1 memory once none remain", async () => {
    const s = await playFromHand(vanillaIceSnowLevel4, [source, vanillaBlueLevel3], { autoAcceptOptional: true });
    expect(s.perm("valner").isSuspended).toBe(true);
    expect(s.perm("target").stack).toHaveLength(0);
    expect(s.state.memory).toBe(1);
    assertNoLoudGap(s);
  });

  it("trashes only the bottom 2 and gains no memory while a digivolution card remains", async () => {
    const s = await playFromHand(vanillaIceSnowLevel4, [source, source, vanillaBlueLevel3], {
      autoAcceptOptional: true,
    });
    expect(s.perm("target").stack.map((card) => card.cardId)).toEqual([vanillaBlueLevel3]);
    expect(s.state.memory).toBe(0);
  });

  it("gains 1 memory after suspending when the opponent's only Digimon has no digivolution cards", async () => {
    const s = await playFromHand(vanillaIceSnowLevel4, [], { autoAcceptOptional: true });
    expect(s.perm("valner").isSuspended).toBe(true);
    expect(s.state.memory).toBe(1);
    assertNoLoudGap(s);
  });

  it("gains 1 memory after suspending when the opponent has no Digimon", async () => {
    const s = await playFromHand(vanillaIceSnowLevel4, undefined, { autoAcceptOptional: true });
    expect(s.perm("valner").isSuspended).toBe(true);
    expect(s.state.memory).toBe(1);
  });

  it("does nothing when the player declines to suspend", async () => {
    const s = await playFromHand(vanillaIceSnowLevel4, [source, source], { autoDeclineOptional: true });
    expect(s.perm("valner").isSuspended).toBe(false);
    expect(s.perm("target").stack).toHaveLength(2);
    expect(s.state.memory).toBe(0);
  });

  it("does not trigger for a Digimon without the Ice-Snow trait", async () => {
    const s = await playFromHand(vanillaBlueLevel3, [source], { autoAcceptOptional: true });
    expect(s.perm("valner").isSuspended).toBe(false);
    expect(s.perm("target").stack).toHaveLength(1);
  });

  it("does not trigger while already suspended", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "valner", suspended: true }],
          hand: [{ card: vanillaIceSnowLevel4, as: "entering" }],
        },
        1: { battleArea: [{ card: vanillaBlueLevel5, as: "target", under: [source] }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("entering").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 2 && s.state.pendingDecision === undefined);
    expect(s.perm("target").stack).toHaveLength(1);
    expect(s.state.memory).toBe(0);
  });

  it("triggers when a Digimon digivolves into a [Rule] Ice-Snow Digimon", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "valner" },
            { card: renamon, as: "base" },
          ],
          hand: [{ card: tenkomon, as: "tenkomon" }],
          deck: [vanillaBlueLevel3, vanillaBlueLevel3],
        },
        1: {
          battleArea: [{ card: vanillaBlueLevel5, as: "target", under: [source, source, source, source] }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds },
    );
    s.state.memory = 2;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("tenkomon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("valner").isSuspended && s.state.pendingDecision === undefined);

    expect(s.perm("target").stack).toHaveLength(0);
    expect(s.state.memory).toBe(1);
  });

  it("plays itself from security without paying the cost", async () => {
    const s = setupEngine({ 0: { security: [{ card: cardId, as: "valner", faceUp: true }] } });
    await s.ready();
    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("valner"));
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toContain(cardId);
  });
});
