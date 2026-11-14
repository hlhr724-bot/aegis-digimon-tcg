import { EffectTiming, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { advance } from "../../engine/testkit/advance.js";
import { assertNoLoudGap, settle, setupEngine } from "../../engine/testkit/harness.js";
import "../index.js";
import { compiled } from "./ST26-06.js";

const cardId = "ST26-06";
const renamon = "ST26-02";
const tenkomon = "ST26-03";
const vanillaIceSnowLevel4 = "BT11-026";
const vanillaBlueLevel3 = "BT1-027";
const vanillaBlueLevel5 = "BT1-038";
const source = "BT1-028";

type Setup = ReturnType<typeof setupEngine>;

async function playFromHand(
  card: string,
  opponentSources: string[],
  options: { autoAcceptOptional?: boolean; autoDeclineOptional?: boolean },
) {
  const s = setupEngine(
    {
      0: {
        battleArea: [{ card: cardId, as: "valner" }],
        hand: [{ card, as: "entering" }],
        deck: [vanillaBlueLevel3, vanillaBlueLevel3],
      },
      1: { battleArea: [{ card: vanillaBlueLevel5, as: "target", under: opponentSources }] },
    },
    { ...options, autoSelectCards: true },
  );
  s.state.memory = 10;
  await s.ready();
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("entering").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => s.state.players[0]!.battleArea.length === 2 && s.state.pendingDecision === undefined);
  return s;
}

const handSize = (s: Setup) => s.state.players[0]!.hand.length;

describe("ST26-06 Valner Dragnogh", () => {
  it("matches the printed card", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      set: "ST26",
      nameEn: "Valner Dragnogh",
      nameJp: "ヴァルナー・ドラグノフ",
      colors: ["Blue"],
      kinds: ["Tamer"],
      playCost: 4,
      types: ["ALYSION"],
      rarity: "R",
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
    [2, 3],
    [0, 3],
    [4, 4],
  ])("at the start of your turn turns %i memory into %i", async (memory, expected) => {
    const s = setupEngine({ 0: { battleArea: [{ card: cardId, as: "valner" }] } });
    s.state.memory = memory;
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnStartTurn, s.perm("valner"));
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.memory).toBe(expected);
  });

  it("suspends to trash the bottom 2 digivolution cards, then draws once none remain", async () => {
    const s = await playFromHand(vanillaIceSnowLevel4, [source, vanillaBlueLevel3], { autoAcceptOptional: true });
    expect(s.perm("valner").isSuspended).toBe(true);
    expect(s.perm("target").stack).toHaveLength(0);
    expect(handSize(s)).toBe(1);
    assertNoLoudGap(s);
  });

  it("trashes only the bottom 2 and does not draw while a digivolution card remains", async () => {
    const s = await playFromHand(vanillaIceSnowLevel4, [source, source, vanillaBlueLevel3], {
      autoAcceptOptional: true,
    });
    expect(s.perm("target").stack.map((card) => card.cardId)).toEqual([vanillaBlueLevel3]);
    expect(handSize(s)).toBe(0);
  });

  it("does nothing when the player declines to suspend", async () => {
    const s = await playFromHand(vanillaIceSnowLevel4, [source, source], { autoDeclineOptional: true });
    expect(s.perm("valner").isSuspended).toBe(false);
    expect(s.perm("target").stack).toHaveLength(2);
    expect(handSize(s)).toBe(0);
  });

  it("does not trigger for a Digimon without the Ice-Snow trait", async () => {
    const s = await playFromHand(vanillaBlueLevel3, [source], { autoAcceptOptional: true });
    expect(s.perm("valner").isSuspended).toBe(false);
    expect(s.perm("target").stack).toHaveLength(1);
  });

  it("triggers when a Digimon digivolves into a [Rule] Ice-Snow Digimon", async () => {
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
        1: { battleArea: [{ card: vanillaBlueLevel5, as: "target", under: [source, source] }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
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
    expect(handSize(s)).toBe(2);
  });

  it("plays itself from security without paying the cost", async () => {
    const s = setupEngine({ 0: { security: [{ card: cardId, as: "valner", faceUp: true }] } });
    await s.ready();
    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("valner"));
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toContain(cardId);
  });
});
