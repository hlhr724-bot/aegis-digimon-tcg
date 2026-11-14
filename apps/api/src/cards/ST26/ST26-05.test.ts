import { getCardDefinition, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { assertNoLoudGap, settle, setupEngine, type PermanentSpec } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";

const cardId = "ST26-05";
const sekkamon = "ST26-04";
const vanillaBlueLevel3 = "BT1-027";
const vanillaBlueLevel5 = "BT1-038";
const opponentTamer = "BD01-10";
const source = "BT1-028";

type Setup = ReturnType<typeof setupEngine>;

async function digivolveFromSekkamon(opponentBattleArea: PermanentSpec[]) {
  const s = setupEngine(
    {
      0: {
        battleArea: [{ card: sekkamon, as: "base" }],
        hand: [{ card: cardId, as: "yukinamon" }],
        deck: [vanillaBlueLevel3, vanillaBlueLevel3],
      },
      1: { battleArea: opponentBattleArea, security: [source, source, source] },
    },
    { autoAcceptOptional: true, autoSelectCards: true },
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
  await settle(() => s.state.pendingDecision === undefined && !observe(s.engine).isAttacking(), 5000);
  return s;
}

async function attackPlayer(opponentBattleArea: PermanentSpec[], options: { autoDeclineOptional?: boolean }) {
  const s = setupEngine(
    {
      0: { battleArea: [{ card: cardId, as: "yukinamon" }] },
      1: { battleArea: opponentBattleArea, security: [source, source, source] },
    },
    { autoAcceptOptional: options.autoDeclineOptional !== true, ...options, autoSelectCards: true },
  );
  await s.ready();
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("yukinamon").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.phase === Phase.Main && !observe(s.engine).isAttacking(), 5000);
  return s;
}

async function useIceBeastCaricatures(opponentBattleArea: PermanentSpec[], preferred: string[] = []) {
  const preferInstanceIds: string[] = [];
  const s = setupEngine(
    {
      0: { battleArea: [{ card: vanillaBlueLevel3 }], hand: [{ card: cardId, as: "option" }] },
      1: { battleArea: opponentBattleArea },
    },
    { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds, declinePrompts: ["Arts Digivolve"] },
  );
  preferInstanceIds.push(...preferred.map((alias) => s.perm(alias).topCard.instanceId));
  s.state.memory = 10;
  await s.ready();
  expect(
    s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }),
  ).toEqual({ ok: true });
  await settle(() => s.state.players[0]!.trash.some((card) => card.cardId === cardId));
  return s;
}

const remainingOpponentSources = (s: Setup) =>
  s.state.players[1]!.battleArea.reduce((total, permanent) => total + permanent.stack.length, 0);

const opponentDeckBottom = (s: Setup) => s.state.players[1]!.deck.at(-1)?.cardId;

describe("ST26-05 Yukinamon", () => {
  it("matches the printed card", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      set: "ST26",
      nameEn: "Yukinamon",
      nameJp: "ユキナモン/氷獣戯画",
      colors: ["Blue"],
      kinds: ["Digimon", "Option"],
      level: 6,
      playCost: 5,
      dp: 12_000,
      evoCosts: [{ color: "Blue", level: 5, memoryCost: 3 }],
      forms: ["Mega"],
      attributes: ["Virus"],
      types: ["Ice-Snow", "ALYSION"],
      rarity: "SR",
      isDualCard: true,
      dualEffect: "Ice Beast Caricatures",
      optionColorRequirements: ["Blue"],
    });
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
  });

  it("prints Iceclad, Piercing and Blocker", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: cardId, as: "yukinamon" }] } });
    await s.ready();
    expect(observe(s.engine).hasKeyword(s.perm("yukinamon"), "IceClad")).toBe(true);
    expect(observe(s.engine).hasPierce(s.perm("yukinamon"))).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("yukinamon"), "Blocker")).toBe(true);
  });

  it("can't be played to the field", async () => {
    const s = setupEngine({ 0: { hand: [{ card: cardId, as: "yukinamon" }] } });
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("yukinamon").instanceId, useAs: "digimon" }).ok,
    ).toBe(false);
  });

  it("strips the last 3 digivolution cards when digivolving, then attacks without suspending", async () => {
    const s = await digivolveFromSekkamon([
      { card: vanillaBlueLevel5, as: "first", under: [source, source], suspended: true },
      { card: vanillaBlueLevel5, as: "second", under: [source] },
    ]);
    expect(s.perm("base").topCard.cardId).toBe(cardId);
    expect(remainingOpponentSources(s)).toBe(0);
    expect(s.state.players[1]!.trash.filter((card) => card.cardId === source).length).toBeGreaterThanOrEqual(3);
    expect(observe(s.engine).hasAttackedThisTurn(s.perm("base"))).toBe(true);
    expect(s.perm("base").isSuspended).toBe(false);
    assertNoLoudGap(s);
  });

  it("does not attack while an opposing Digimon keeps a digivolution card", async () => {
    const s = await digivolveFromSekkamon([
      { card: vanillaBlueLevel5, as: "target", under: [source, source, source, source] },
    ]);
    expect(s.perm("target").stack).toHaveLength(1);
    expect(observe(s.engine).hasAttackedThisTurn(s.perm("base"))).toBe(false);
  });

  it("when attacking returns an opposing Digimon with no digivolution cards to the bottom of the deck", async () => {
    const s = await attackPlayer(
      [
        { card: vanillaBlueLevel5, as: "stacked", under: [source] },
        { card: vanillaBlueLevel3, as: "bare" },
      ],
      {},
    );
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.permanentId)).toEqual([
      s.perm("stacked").permanentId,
    ]);
    expect(opponentDeckBottom(s)).toBe(vanillaBlueLevel3);
  });

  it("lets the player decline the return", async () => {
    const s = await attackPlayer([{ card: vanillaBlueLevel3, as: "bare" }], { autoDeclineOptional: true });
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });

  it("uses Ice Beast Caricatures: trashes every card under 1 Digimon and stops 2 suspends", async () => {
    const s = await useIceBeastCaricatures(
      [
        { card: vanillaBlueLevel5, as: "stacked", under: [source, source, source] },
        { card: opponentTamer, as: "tamer" },
        { card: vanillaBlueLevel3, as: "bystander" },
      ],
      ["stacked", "tamer"],
    );
    expect(s.perm("stacked").stack).toHaveLength(0);
    expect(observe(s.engine).isRestricted(s.perm("stacked"), "suspend")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("tamer"), "suspend")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("bystander"), "suspend")).toBe(false);
    expect(s.state.memory).toBe(10 - 5);
    assertNoLoudGap(s);
  });

  it("trashes every card under an opposing Tamer", async () => {
    const s = await useIceBeastCaricatures([{ card: opponentTamer, as: "tamer", under: [source, source] }]);
    expect(s.perm("tamer").stack).toHaveLength(0);
    expect(s.state.players[1]!.trash).toHaveLength(2);
  });
});
