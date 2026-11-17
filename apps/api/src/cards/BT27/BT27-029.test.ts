import { EffectTiming, getCardDefinition, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "#api/engine/effects/interpreter";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, makeInstance, settle, setupEngine, type PermanentSpec } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import "#api/cards/index";

const cardId = "BT27-029";
const tenkomon = "BT27-027";
const vanillaIceSnowLevel4 = "BT11-026";
const vanillaBlueLevel3 = "BT1-027";
const vanillaBlueLevel5 = "BT1-038";
const vanillaBlueLevel6 = "ST2-10";
const source = "BT1-028";

type Setup = ReturnType<typeof setupEngine>;

const remainingOpponentSources = (s: Setup) =>
  s.state.players[1]!.battleArea.reduce((total, permanent) => total + permanent.stack.length, 0);

async function playSekkamon(opponentBattleArea: PermanentSpec[]) {
  const s = setupEngine(
    {
      0: { hand: [{ card: cardId, as: "sekkamon" }], deck: [vanillaBlueLevel3, vanillaBlueLevel3] },
      1: { battleArea: opponentBattleArea, deck: [vanillaBlueLevel3, vanillaBlueLevel3] },
    },
    { autoSelectCards: true },
  );
  s.state.memory = 7;
  await s.ready();
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("sekkamon").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => s.state.players[0]!.battleArea.length === 1 && s.state.pendingDecision === undefined);
  return s;
}

async function digivolveIntoSekkamon(opponentBattleArea: PermanentSpec[], opponentSecurity: string[]) {
  const s = setupEngine(
    {
      0: { battleArea: [{ card: tenkomon, as: "base" }], hand: [{ card: cardId, as: "sekkamon" }] },
      1: { battleArea: opponentBattleArea, security: opponentSecurity },
    },
    { autoSelectCards: true },
  );
  s.state.memory = 3;
  await s.ready();
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("base").permanentId,
      instanceId: s.inst("sekkamon").instanceId,
    }),
  ).toEqual({ ok: true });
  await settle(() => s.perm("base").topCard.cardId === cardId && s.state.pendingDecision === undefined);
  return s;
}

async function endTurnWith(host: string, opponentSources: string[], suspended = true) {
  const s = setupEngine(
    {
      0: { battleArea: [{ card: host, as: "host", under: [cardId], suspended }] },
      1: { battleArea: [{ card: vanillaBlueLevel5, as: "target", under: opponentSources }] },
    },
    { autoAcceptOptional: true, autoSelectCards: true },
  );
  await s.ready();
  await advance(s.engine).fire(EffectTiming.EndOfYourTurn, s.perm("host"));
  await settle(() => s.state.pendingDecision === undefined);
  return s;
}

const sekkamonOf = (s: Setup) => s.state.players[0]!.battleArea[0]!;

describe("BT27-029 Sekkamon", () => {
  it("matches the printed card", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      set: "BT27",
      nameEn: "Sekkamon",
      nameJp: "セッカモン",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 5,
      playCost: 7,
      dp: 7000,
      evoCosts: [{ color: "Blue", level: 4, memoryCost: 3 }],
      forms: ["Ultimate"],
      attributes: ["Virus"],
      types: ["Beastkin", "ALYSION"],
      rarity: "R",
      effectText:
        "＜Iceclad＞\n[On Play] [When Digivolving] Trash any 3 digivolution cards from your opponent's Digimon. Then, if they don't have a Digimon with digivolution cards, this Digimon gains ＜Blocker＞ and can't be deleted other than in battle until their turn ends.\n[Rule] Trait: Has [Ice-Snow] Type.",
      inheritedEffectText:
        "[End of Your Turn] [Once Per Turn] Trash the bottom 2 digivolution cards of 1 of your opponent's Digimon. If this effect didn't trash, this [Ice-Snow] trait Digimon may unsuspend.",
    });
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
  });

  it("has Iceclad and the Ice-Snow trait through its [Rule], and no printed Blocker", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: cardId, as: "sekkamon" }] } });
    await s.ready();
    expect(observe(s.engine).hasKeyword(s.perm("sekkamon"), "IceClad")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("sekkamon"), "Blocker")).toBe(false);
    expect(observe(s.engine).hasEffectiveTrait(s.perm("sekkamon"), "Ice-Snow")).toBe(true);
  });

  it("on play trashes 3 digivolution cards across the opponent's Digimon and stays unprotected while one remains", async () => {
    const s = await playSekkamon([
      { card: vanillaBlueLevel5, as: "first", under: [source, source] },
      { card: vanillaBlueLevel5, as: "second", under: [source, source] },
    ]);
    expect(remainingOpponentSources(s)).toBe(1);
    expect(s.state.players[1]!.trash).toHaveLength(3);
    expect(observe(s.engine).hasKeyword(sekkamonOf(s), "Blocker")).toBe(false);
    expect(observe(s.engine).isRestricted(sekkamonOf(s), "beDeleted")).toBe(false);
    assertNoLoudGap(s);
  });

  it("gains Blocker and deletion protection once the last digivolution card is trashed", async () => {
    const s = await playSekkamon([
      { card: vanillaBlueLevel5, as: "first", under: [source, source] },
      { card: vanillaBlueLevel5, as: "second", under: [source] },
    ]);
    expect(remainingOpponentSources(s)).toBe(0);
    expect(observe(s.engine).hasKeyword(sekkamonOf(s), "Blocker")).toBe(true);
    expect(observe(s.engine).isRestricted(sekkamonOf(s), "beDeleted")).toBe(true);
    assertNoLoudGap(s);
  });

  it("gains the protection when the opponent has no Digimon", async () => {
    const s = await playSekkamon([]);
    expect(observe(s.engine).hasKeyword(sekkamonOf(s), "Blocker")).toBe(true);
    expect(observe(s.engine).isRestricted(sekkamonOf(s), "beDeleted")).toBe(true);
  });

  it.each([
    ["an effect", "byEffect", 0],
    ["a rule", "byRule", 0],
    ["battle", "byBattle", 1],
  ] as const)("while protected, deletion by %s removes %i Digimon", async (_label, cause, removed) => {
    const s = await playSekkamon([{ card: vanillaBlueLevel5, as: "bare" }]);
    expect(await advance(s.engine).verb.deletePermanent([sekkamonOf(s).permanentId], cause)).toBe(removed);
    expect(s.state.players[0]!.battleArea).toHaveLength(1 - removed);
  });

  it("is still deleted by a lost battle against another Digimon while protected", async () => {
    const s = await digivolveIntoSekkamon([{ card: vanillaBlueLevel5, as: "defender", suspended: true }], []);
    s.perm("defender").stack.push(makeInstance(source, 1, true), makeInstance(source, 1, true));
    await advance(s.engine).recompute();
    expect(observe(s.engine).isRestricted(s.perm("base"), "beDeleted")).toBe(true);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.phase === Phase.Main && !observe(s.engine).isAttacking(), 5000);

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });

  it("is still deleted by a lost battle against a Security Digimon while protected", async () => {
    const s = await digivolveIntoSekkamon([], [vanillaBlueLevel6]);
    expect(observe(s.engine).isRestricted(s.perm("base"), "beDeleted")).toBe(true);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.phase === Phase.Main && !observe(s.engine).isAttacking(), 5000);

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.security).toHaveLength(0);
  });

  it("loses Blocker and the protection when the opponent's turn ends", async () => {
    const s = await playSekkamon([]);
    const sekkamon = sekkamonOf(s);
    s.state.turnSeat = 1;
    s.state.memory = 3;
    await advance(s.engine).runTurn(1);

    expect(observe(s.engine).hasKeyword(sekkamon, "Blocker")).toBe(false);
    expect(observe(s.engine).isRestricted(sekkamon, "beDeleted")).toBe(false);
  });

  it("resolves the same effect when it digivolves from Tenkomon", async () => {
    const s = await digivolveIntoSekkamon(
      [{ card: vanillaBlueLevel5, as: "target", under: [source, source, source] }],
      [],
    );

    expect(s.perm("target").stack).toHaveLength(0);
    expect(s.perm("base").topCard.cardId).toBe(cardId);
    expect(observe(s.engine).hasKeyword(s.perm("base"), "Blocker")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("base"), "beDeleted")).toBe(true);
    expect(s.state.memory).toBe(0);
  });

  it("at the end of your turn trashes the bottom 2 digivolution cards and leaves its host suspended", async () => {
    const s = await endTurnWith(vanillaIceSnowLevel4, [vanillaBlueLevel3, source, source]);
    expect(s.perm("target").stack.map((card) => card.cardId)).toEqual([source]);
    expect(s.perm("host").isSuspended).toBe(true);
  });

  it("unsuspends an Ice-Snow host when it trashed nothing", async () => {
    const s = await endTurnWith(vanillaIceSnowLevel4, []);
    expect(s.perm("host").isSuspended).toBe(false);
    assertNoLoudGap(s);
  });

  it("does not unsuspend a host without the Ice-Snow trait", async () => {
    const s = await endTurnWith(vanillaBlueLevel3, []);
    expect(s.perm("host").isSuspended).toBe(true);
  });

  it("resolves the end-of-turn effect only once per turn", async () => {
    const s = await endTurnWith(vanillaIceSnowLevel4, [source, source, source, source]);
    await advance(s.engine).fire(EffectTiming.EndOfYourTurn, s.perm("host"));
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.perm("target").stack).toHaveLength(2);
  });
});
