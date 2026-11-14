import { EffectTiming, getCardDefinition, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { advance } from "../../engine/testkit/advance.js";
import { assertNoLoudGap, settle, setupEngine, type PermanentSpec } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";

const cardId = "ST26-04";
const tenkomon = "ST26-03";
const vanillaIceSnowLevel4 = "BT11-026";
const vanillaBlueLevel3 = "BT1-027";
const vanillaBlueLevel5 = "BT1-038";
const opponentTamer = "BD01-10";
const source = "BT1-028";

type Setup = ReturnType<typeof setupEngine>;

const remainingOpponentSources = (s: Setup) =>
  s.state.players[1]!.battleArea.reduce((total, permanent) => total + permanent.stack.length, 0);

async function playSekkamon(opponentBattleArea: PermanentSpec[], preferredTarget?: string) {
  const preferInstanceIds: string[] = [];
  const s = setupEngine(
    {
      0: { hand: [{ card: cardId, as: "sekkamon" }] },
      1: { battleArea: opponentBattleArea },
    },
    { autoSelectCards: true, preferInstanceIds },
  );
  if (preferredTarget !== undefined) preferInstanceIds.push(s.perm(preferredTarget).topCard.instanceId);
  s.state.memory = 7;
  await s.ready();
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("sekkamon").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => s.state.players[0]!.battleArea.length === 1 && s.state.pendingDecision === undefined);
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

describe("ST26-04 Sekkamon", () => {
  it("matches the printed card", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      set: "ST26",
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
      rarity: "U",
    });
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
  });

  it("has Iceclad and the Ice-Snow trait through its [Rule]", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: cardId, as: "sekkamon" }] } });
    await s.ready();
    expect(observe(s.engine).hasKeyword(s.perm("sekkamon"), "IceClad")).toBe(true);
    expect(observe(s.engine).hasEffectiveTrait(s.perm("sekkamon"), "Ice-Snow")).toBe(true);
  });

  it("wins a battle by digivolution card count through Iceclad", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: cardId, as: "sekkamon", under: [vanillaBlueLevel3] }] },
        1: { battleArea: [{ card: vanillaBlueLevel5, as: "defender", dp: 20_000, suspended: true }] },
      },
      { autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("sekkamon").permanentId,
        target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.phase === Phase.Main && !observe(s.engine).isAttacking(), 5000);

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
  });

  it("on play trashes 3 digivolution cards across the opponent's Digimon", async () => {
    const s = await playSekkamon([
      { card: vanillaBlueLevel5, as: "first", under: [source, source] },
      { card: vanillaBlueLevel5, as: "second", under: [source, source] },
    ]);
    expect(remainingOpponentSources(s)).toBe(1);
    expect(s.state.players[1]!.trash).toHaveLength(3);
    assertNoLoudGap(s);
  });

  it("then stops 1 of the opponent's Tamers from suspending until their turn ends", async () => {
    const s = await playSekkamon(
      [
        { card: vanillaBlueLevel5, as: "digimon", under: [source] },
        { card: opponentTamer, as: "tamer" },
      ],
      "tamer",
    );
    expect(observe(s.engine).isRestricted(s.perm("tamer"), "suspend")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("digimon"), "suspend")).toBe(false);
  });

  it("stops 1 of the opponent's Digimon from suspending even when nothing could be trashed", async () => {
    const s = await playSekkamon([{ card: vanillaBlueLevel5, as: "digimon" }]);
    expect(observe(s.engine).isRestricted(s.perm("digimon"), "suspend")).toBe(true);
  });

  it("trashes 3 digivolution cards when it digivolves from Tenkomon", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: tenkomon, as: "base" }], hand: [{ card: cardId, as: "sekkamon" }] },
        1: { battleArea: [{ card: vanillaBlueLevel5, as: "target", under: [source, source, source, source] }] },
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
    await settle(() => s.perm("target").stack.length === 1 && s.state.pendingDecision === undefined);

    expect(s.perm("base").topCard.cardId).toBe(cardId);
    expect(observe(s.engine).isRestricted(s.perm("target"), "suspend")).toBe(true);
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
