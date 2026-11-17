import { EffectTiming, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "#api/engine/effects/interpreter";
import { advance } from "#api/engine/testkit/advance";
import { playByAssembly } from "#api/engine/testkit/assembly";
import { assertNoLoudGap, makeInstance, settle, setupEngine, type PermanentSpec } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import "#api/cards/index";
import { compiled } from "./BT27-033.js";

const cardId = "BT27-033";
const renamon = "BT27-022";
const tenkomon = "BT27-027";
const sekkamon = "BT27-029";
const vanillaIceSnowLevel4 = "BT11-026";
const vanillaBlueLevel3 = "BT1-027";
const vanillaBlueLevel5 = "BT1-038";
const vanillaBlueLevel6 = "ST2-10";
const blueTamer = "BT1-086";
const source = "BT1-028";

type Setup = ReturnType<typeof setupEngine>;
type Options = Parameters<typeof setupEngine>[1];

async function playYukinamon(opponentBattleArea: PermanentSpec[], opponentHand: PermanentSpec[] = []) {
  const s = setupEngine(
    {
      0: { hand: [{ card: cardId, as: "yukinamon" }], deck: [vanillaBlueLevel3, vanillaBlueLevel3] },
      1: { battleArea: opponentBattleArea, hand: opponentHand, deck: [vanillaBlueLevel3, vanillaBlueLevel3] },
    },
    { autoSelectCards: true },
  );
  s.state.memory = 12;
  await s.ready();
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("yukinamon").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => s.state.players[0]!.battleArea.length === 1 && s.state.pendingDecision === undefined);
  return s;
}

async function endTurnWithYukinamon(
  allies: PermanentSpec[],
  opponentBattleArea: PermanentSpec[],
  options: Options = { autoAcceptOptional: true },
) {
  const preferInstanceIds: string[] = [];
  const s = setupEngine(
    {
      0: { battleArea: [{ card: cardId, as: "yukinamon", suspended: true }, ...allies] },
      1: { battleArea: opponentBattleArea, security: [vanillaBlueLevel3, vanillaBlueLevel3, vanillaBlueLevel3] },
    },
    { ...options, autoSelectCards: true, preferInstanceIds },
  );
  preferInstanceIds.push(s.state.players[0]!.battleArea[1]!.permanentId);
  await s.ready();
  await advance(s.engine).fire(EffectTiming.EndOfYourTurn, s.perm("yukinamon"));
  await settle(() => s.state.pendingDecision === undefined && !observe(s.engine).isAttacking(), 5000);
  return s;
}

const isLocked = (s: Setup, alias: string) =>
  (["digivolve", "suspend"] as const).map((restriction) => observe(s.engine).isRestricted(s.perm(alias), restriction));

describe("BT27-033 Yukinamon", () => {
  it("matches the printed card", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      set: "BT27",
      nameEn: "Yukinamon",
      nameJp: "ユキナモン",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 12,
      dp: 12000,
      evoCosts: [{ color: "Blue", level: 5, memoryCost: 3 }],
      forms: ["Mega"],
      attributes: ["Virus"],
      types: ["Ice-Snow", "ALYSION"],
      rarity: "SR",
      effectText:
        "＜Iceclad＞ ＜Piercing＞ ＜Blocker＞\n[On Play] [When Digivolving] Trash the top 2 digivolution cards of all of your opponent's Digimon. Then, until their turn ends, none of their Digimon without digivolution cards can digivolve or suspend.\n[End of Your Turn] [Once Per Turn] If your opponent has no Digimon with digivolution cards, 1 of your [Ice-Snow] trait Digimon may gain ＜Rush＞ for the turn and attack.\n[Assembly -5] Lv.5 × Lv.4 × Lv.3, all w/[Ice-Snow] trait",
    });
    expect(getCardDefinition(cardId)?.isDualCard).toBeUndefined();
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects.map((effect) => [effect.trigger, effect.frequency])).toEqual([
      ["Static", undefined],
      ["OnPlay", undefined],
      ["WhenDigivolving", undefined],
      ["EndOfYourTurn", "OncePerTurn"],
    ]);
  });

  it("has Iceclad, Piercing and Blocker", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: cardId, as: "yukinamon" }] } });
    await s.ready();
    for (const keyword of ["IceClad", "Piercing", "Blocker"]) {
      expect(observe(s.engine).hasKeyword(s.perm("yukinamon"), keyword)).toBe(true);
    }
  });

  it("on play trashes the top 2 digivolution cards of every opposing Digimon", async () => {
    const s = await playYukinamon([
      { card: vanillaBlueLevel5, as: "three", under: [vanillaBlueLevel3, source, source] },
      { card: vanillaBlueLevel5, as: "two", under: [source, source] },
      { card: vanillaBlueLevel5, as: "one", under: [source] },
      { card: vanillaBlueLevel5, as: "bare" },
    ]);
    expect(s.perm("three").stack.map((card) => card.cardId)).toEqual([vanillaBlueLevel3]);
    expect(s.perm("two").stack).toHaveLength(0);
    expect(s.perm("one").stack).toHaveLength(0);
    expect(s.state.players[1]!.trash).toHaveLength(5);
    expect(s.state.memory).toBe(0);
    assertNoLoudGap(s);
  });

  it("then locks only the opponent's Digimon without digivolution cards from digivolving and suspending", async () => {
    const s = await playYukinamon([
      { card: vanillaBlueLevel5, as: "three", under: [vanillaBlueLevel3, source, source] },
      { card: vanillaBlueLevel5, as: "two", under: [source, source] },
      { card: vanillaBlueLevel5, as: "bare" },
      { card: blueTamer, as: "tamer" },
    ]);
    expect(isLocked(s, "three")).toEqual([false, false]);
    expect(isLocked(s, "two")).toEqual([true, true]);
    expect(isLocked(s, "bare")).toEqual([true, true]);
    expect(isLocked(s, "tamer")).toEqual([false, false]);
    expect(isLocked(s, "yukinamon")).toEqual([false, false]);
  });

  it("follows each Digimon as it gains or loses digivolution cards", async () => {
    const s = await playYukinamon([
      { card: vanillaBlueLevel5, as: "three", under: [vanillaBlueLevel3, source, source] },
      { card: vanillaBlueLevel5, as: "bare" },
    ]);
    s.perm("bare").stack.push(makeInstance(source, 1, true));
    s.perm("three").stack.pop();
    expect(isLocked(s, "bare")).toEqual([false, false]);
    expect(isLocked(s, "three")).toEqual([true, true]);
  });

  it("stops the locked Digimon from attacking and digivolving on the opponent's turn, then expires", async () => {
    const s = await playYukinamon(
      [
        { card: vanillaBlueLevel5, as: "bare" },
        { card: vanillaBlueLevel5, as: "stacked", under: [vanillaBlueLevel3, source, source] },
      ],
      [{ card: vanillaBlueLevel6, as: "mega" }],
    );
    s.state.turnSeat = 1;
    s.state.memory = 6;
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("bare").permanentId,
        target: { kind: "player" },
      }),
    ).toMatchObject({ ok: false });
    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: s.perm("bare").permanentId,
        instanceId: s.inst("mega").instanceId,
      }),
    ).toMatchObject({ ok: false });
    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: s.perm("stacked").permanentId,
        instanceId: s.inst("mega").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);
    advance(s.engine).endMainPhaseIfOpen(1);
    await turn;

    expect(isLocked(s, "bare")).toEqual([false, false]);
  });

  it("resolves the same effect when it digivolves from Sekkamon", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: sekkamon, as: "base" }], hand: [{ card: cardId, as: "yukinamon" }] },
        1: { battleArea: [{ card: vanillaBlueLevel5, as: "target", under: [source, source] }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("yukinamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").stack.length === 0 && s.state.pendingDecision === undefined);

    expect(s.perm("base").topCard.cardId).toBe(cardId);
    expect(isLocked(s, "target")).toEqual([true, true]);
    expect(s.state.memory).toBe(0);
  });

  it("at the end of your turn gives Rush to an Ice-Snow Digimon that entered this turn and attacks with it", async () => {
    const s = await endTurnWithYukinamon(
      [{ card: tenkomon, as: "ally", enteredThisTurn: true }],
      [{ card: vanillaBlueLevel5, as: "bare" }],
    );
    expect(s.perm("ally").isSuspended).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("ally"), "Rush")).toBe(true);
    expect(s.state.players[1]!.security).toHaveLength(2);
    assertNoLoudGap(s);
  });

  it("does not attack while the opponent has a Digimon with digivolution cards", async () => {
    const s = await endTurnWithYukinamon(
      [{ card: tenkomon, as: "ally" }],
      [{ card: vanillaBlueLevel5, as: "stacked", under: [source] }],
    );
    expect(s.perm("ally").isSuspended).toBe(false);
    expect(s.state.players[1]!.security).toHaveLength(3);
  });

  it("offers no Digimon without the Ice-Snow trait", async () => {
    const s = await endTurnWithYukinamon([{ card: vanillaBlueLevel5, as: "ally" }], []);
    expect(observe(s.engine).hasKeyword(s.perm("yukinamon"), "Rush")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("ally"), "Rush")).toBe(false);
    expect(s.state.players[1]!.security).toHaveLength(3);
  });

  it("neither grants Rush nor attacks when the player declines", async () => {
    const s = await endTurnWithYukinamon([{ card: vanillaIceSnowLevel4, as: "ally" }], [], {
      autoDeclineOptional: true,
    });
    expect(s.perm("ally").isSuspended).toBe(false);
    expect(observe(s.engine).hasKeyword(s.perm("ally"), "Rush")).toBe(false);
    expect(s.state.players[1]!.security).toHaveLength(3);
  });

  it("resolves the end-of-turn effect only once per turn", async () => {
    const s = await endTurnWithYukinamon(
      [
        { card: vanillaIceSnowLevel4, as: "first" },
        { card: vanillaIceSnowLevel4, as: "second" },
      ],
      [],
    );
    await advance(s.engine).fire(EffectTiming.EndOfYourTurn, s.perm("yukinamon"));
    await settle(() => s.state.pendingDecision === undefined && !observe(s.engine).isAttacking(), 5000);
    expect([s.perm("first").isSuspended, s.perm("second").isSuspended].filter(Boolean)).toHaveLength(1);
    expect(s.state.players[1]!.security).toHaveLength(2);
  });

  it("plays by Assembly for 7 with the BT27 Ice-Snow line", async () => {
    const { s, result } = await playByAssembly(cardId, [sekkamon, tenkomon, renamon], 7);

    expect(result).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 1 && s.state.pendingDecision === undefined);
    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.battleArea[0]!.stack.map(({ cardId: id }) => id)).toEqual([renamon, tenkomon, sekkamon]);
  });

  it("accepts a level 4 card with the printed Ice-Snow trait as Assembly material", async () => {
    const { result } = await playByAssembly(cardId, [sekkamon, vanillaIceSnowLevel4, renamon], 7);

    expect(result).toEqual({ ok: true });
  });

  it.each([
    ["a level 5 card without the Ice-Snow trait", [vanillaBlueLevel5, tenkomon, renamon]],
    ["a level 3 card without the Ice-Snow trait", [sekkamon, tenkomon, vanillaBlueLevel3]],
    ["two level 4 cards", [tenkomon, vanillaIceSnowLevel4, renamon]],
  ])("rejects Assembly with %s", async (_label, materials) => {
    const { result } = await playByAssembly(cardId, materials, 12);

    expect(result).toMatchObject({ ok: false });
  });
});
