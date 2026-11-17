import { getCardDefinition, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "#api/engine/effects/interpreter";
import { assertNoLoudGap, settle, setupEngine } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import "#api/cards/index";

const cardId = "BT27-027";
const ruleIceSnowLevel3 = "BT27-022";
const ruleIceSnowLevel5 = "ST26-04";
const vanillaIceSnowLevel4 = "BT11-026";
const vanillaBlueLevel3 = "BT1-027";
const vanillaBlueLevel5 = "BT1-038";
const source = "BT1-028";
const allySource = "BT1-003";

type Setup = ReturnType<typeof setupEngine>;
type Options = Parameters<typeof setupEngine>[1];

async function playTenkomon(handCard: string | undefined, opponentSources: string[], options: Options = {}) {
  const preferInstanceIds: string[] = [];
  const s = setupEngine(
    {
      0: {
        battleArea: [{ card: vanillaBlueLevel5, as: "ally", under: [allySource] }],
        hand: [{ card: cardId, as: "tenkomon" }, ...(handCard === undefined ? [] : [{ card: handCard, as: "placed" }])],
      },
      1: { battleArea: [{ card: vanillaBlueLevel5, as: "target", under: opponentSources }] },
    },
    { autoAcceptOptional: true, ...options, autoSelectCards: true, preferInstanceIds },
  );
  preferInstanceIds.push(s.perm("ally").topCard.instanceId);
  s.state.memory = 5;
  await s.ready();
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("tenkomon").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => s.state.players[0]!.battleArea.length === 2 && s.state.pendingDecision === undefined);
  return s;
}

const stackIds = (s: Setup, alias: string) => s.perm(alias).stack.map((card) => card.cardId);

describe("BT27-027 Tenkomon", () => {
  it("matches the printed card", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      set: "BT27",
      nameEn: "Tenkomon",
      nameJp: "テンコモン",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 4,
      playCost: 5,
      dp: 5000,
      evoCosts: [{ color: "Blue", level: 3, memoryCost: 2 }],
      forms: ["Champion"],
      attributes: ["Virus"],
      types: ["Mysterious Beast", "ALYSION"],
      rarity: "C",
      effectText:
        "＜Iceclad＞\n[On Play] [When Digivolving] Trash the bottom 2 digivolution cards of 1 of your opponent's Digimon. Then, you may place 1 level 4 or lower [Ice-Snow] trait Digimon card from your hand as any of your Digimon's bottom digivolution card.\n[Rule] Trait: Has [Ice-Snow] Type.",
      inheritedEffectText: "[End of Attack] [Once Per Turn] Gain 1 memory.",
    });
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
  });

  it("has Iceclad and the Ice-Snow trait through its [Rule]", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: cardId, as: "tenkomon" }] } });
    await s.ready();
    expect(observe(s.engine).hasKeyword(s.perm("tenkomon"), "IceClad")).toBe(true);
    expect(observe(s.engine).hasEffectiveTrait(s.perm("tenkomon"), "Ice-Snow")).toBe(true);
  });

  it("on play trashes only the bottom 2 digivolution cards of 1 opposing Digimon", async () => {
    const s = await playTenkomon(undefined, [source, source, vanillaBlueLevel3]);
    expect(stackIds(s, "target")).toEqual([vanillaBlueLevel3]);
    expect(s.state.players[1]!.trash).toHaveLength(2);
    expect(s.state.memory).toBe(0);
    assertNoLoudGap(s);
  });

  it("then places a level 3 [Rule] Ice-Snow Digimon card from hand at the bottom of another Digimon", async () => {
    const s = await playTenkomon(ruleIceSnowLevel3, [source]);
    expect(stackIds(s, "ally")).toEqual([ruleIceSnowLevel3, allySource]);
    expect(s.state.players[0]!.hand).toHaveLength(0);
    assertNoLoudGap(s);
  });

  it("places a level 4 card with the printed Ice-Snow trait even when nothing was trashed", async () => {
    const s = await playTenkomon(vanillaIceSnowLevel4, []);
    expect(stackIds(s, "ally")).toEqual([vanillaIceSnowLevel4, allySource]);
  });

  it("can place the card under itself", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: cardId, as: "tenkomon" },
            { card: ruleIceSnowLevel3, as: "placed" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds },
    );
    s.state.memory = 5;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("tenkomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.length === 0 && s.state.pendingDecision === undefined);
    expect(s.state.players[0]!.battleArea[0]!.stack.map((card) => card.cardId)).toEqual([ruleIceSnowLevel3]);
  });

  it.each([
    ["a level 5 Ice-Snow Digimon card", ruleIceSnowLevel5],
    ["a level 3 Digimon card without the trait", vanillaBlueLevel3],
  ])("does not place %s", async (_label, handCard) => {
    const s = await playTenkomon(handCard, [source]);
    expect(stackIds(s, "ally")).toEqual([allySource]);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual([handCard]);
  });

  it("keeps the card in hand when the player declines to place it", async () => {
    const s = await playTenkomon(ruleIceSnowLevel3, [source, source], {
      autoAcceptOptional: false,
      autoDeclineOptional: true,
    });
    expect(stackIds(s, "target")).toEqual([]);
    expect(stackIds(s, "ally")).toEqual([allySource]);
    expect(s.state.players[0]!.hand).toHaveLength(1);
  });

  it("resolves the same effect when it digivolves from Renamon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: ruleIceSnowLevel3, as: "base" }],
          hand: [
            { card: cardId, as: "tenkomon" },
            { card: vanillaIceSnowLevel4, as: "placed" },
          ],
          deck: [vanillaBlueLevel3, vanillaBlueLevel3],
        },
        1: { battleArea: [{ card: vanillaBlueLevel5, as: "target", under: [source, source, source] }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
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
    await settle(() => s.perm("base").stack.length === 2 && s.state.pendingDecision === undefined);

    expect(stackIds(s, "target")).toEqual([source]);
    expect(stackIds(s, "base")).toEqual([vanillaIceSnowLevel4, ruleIceSnowLevel3]);
    expect(s.state.memory).toBe(0);
  });

  it("gains 1 memory at the end of an attack once per turn as an inherited effect", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: vanillaBlueLevel5, as: "first", under: [cardId] },
            { card: vanillaBlueLevel5, as: "second", under: [cardId] },
          ],
        },
        1: { security: [vanillaBlueLevel3, vanillaBlueLevel3, vanillaBlueLevel3] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 1;
    await s.ready();
    for (const [alias, expected] of [
      ["first", 2],
      ["second", 3],
    ] as const) {
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm(alias).permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.phase === Phase.Main && !observe(s.engine).isAttacking(), 5000);
      expect(s.state.memory).toBe(expected);
    }
  });
});
