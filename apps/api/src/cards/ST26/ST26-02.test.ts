import { getCardDefinition, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { assertNoLoudGap, settle, setupEngine, type PermanentSpec } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";

const cardId = "ST26-02";
const viximon = "ST26-01";
const vanillaIceSnowLevel4 = "BT11-026";
const vanillaBlueLevel3 = "BT1-027";
const vanillaBlueLevel5 = "BT1-038";
const weakBlueLevel3 = "BT1-028";
const bottomSource = "BT1-003";

async function playRenamon(opponentBattleArea: PermanentSpec[]) {
  const s = setupEngine(
    {
      0: { hand: [{ card: cardId, as: "renamon" }], deck: [vanillaBlueLevel3, vanillaBlueLevel3] },
      1: { battleArea: opponentBattleArea },
    },
    { autoSelectCards: true },
  );
  s.state.memory = 3;
  await s.ready();
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("renamon").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => s.state.players[0]!.battleArea.length === 1 && s.state.pendingDecision === undefined);
  return s;
}

async function attackPlayerWith(host: string) {
  const s = setupEngine(
    {
      0: { battleArea: [{ card: host, as: "host", under: [cardId], dp: 7000 }] },
      1: {
        battleArea: [
          { card: vanillaBlueLevel3, as: "suspendedBare", suspended: true },
          { card: weakBlueLevel3, as: "stacked", under: [bottomSource] },
          { card: vanillaBlueLevel5, as: "bare" },
        ],
        security: [weakBlueLevel3, weakBlueLevel3, weakBlueLevel3],
      },
    },
    { autoAcceptOptional: true, autoSelectCards: true },
  );
  await s.ready();
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("host").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.phase === Phase.Main && !observe(s.engine).isAttacking(), 5000);
  return s;
}

const handSize = (s: ReturnType<typeof setupEngine>) => s.state.players[0]!.hand.length;
const opponentBattleAreaIds = (s: ReturnType<typeof setupEngine>) =>
  s.state.players[1]!.battleArea.map((permanent) => permanent.permanentId);

describe("ST26-02 Renamon", () => {
  it("matches the printed card", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      set: "ST26",
      nameEn: "Renamon",
      nameJp: "レナモン",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 3,
      playCost: 3,
      dp: 1000,
      evoCosts: [{ color: "Blue", level: 2, memoryCost: 0 }],
      forms: ["Rookie"],
      attributes: ["Data"],
      types: ["Beastkin", "ALYSION"],
      rarity: "R",
    });
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
  });

  it("has the Ice-Snow trait through its [Rule]", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: cardId, as: "renamon" }] } });
    await s.ready();
    expect(observe(s.engine).hasEffectiveTrait(s.perm("renamon"), "Ice-Snow")).toBe(true);
  });

  it("on play trashes the bottom digivolution card and draws once no opposing Digimon has any", async () => {
    const s = await playRenamon([{ card: vanillaBlueLevel5, as: "target", under: [bottomSource] }]);
    expect(s.perm("target").stack).toHaveLength(0);
    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toEqual([bottomSource]);
    expect(handSize(s)).toBe(1);
    assertNoLoudGap(s);
  });

  it("on play trashes only the bottom card and does not draw while digivolution cards remain", async () => {
    const s = await playRenamon([{ card: vanillaBlueLevel5, as: "target", under: [bottomSource, weakBlueLevel3] }]);
    expect(s.perm("target").stack.map((card) => card.cardId)).toEqual([weakBlueLevel3]);
    expect(handSize(s)).toBe(0);
  });

  it("draws when the opponent already has no Digimon with digivolution cards", async () => {
    const s = await playRenamon([{ card: vanillaBlueLevel5, as: "target" }]);
    expect(handSize(s)).toBe(1);
  });

  it("trashes and draws when it moves out of the breeding area", async () => {
    const s = setupEngine(
      {
        0: { breeding: { card: cardId, as: "renamon", under: [viximon] }, deck: [vanillaBlueLevel3] },
        1: { battleArea: [{ card: vanillaBlueLevel5, as: "target", under: [bottomSource] }] },
      },
      { autoSelectCards: true },
    );
    s.state.phase = Phase.Breeding;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: s.perm("renamon").permanentId })).toEqual({
      ok: true,
    });
    await settle(() => handSize(s) === 1 && s.state.pendingDecision === undefined);

    expect(s.perm("target").stack).toHaveLength(0);
    expect(handSize(s)).toBe(1);
  });

  it("lets an Ice-Snow host redirect to the unsuspended Digimon with the fewest digivolution cards", async () => {
    const s = await attackPlayerWith(vanillaIceSnowLevel4);
    expect(opponentBattleAreaIds(s)).toEqual([s.perm("suspendedBare").permanentId, s.perm("stacked").permanentId]);
    expect(s.state.players[1]!.security).toHaveLength(3);
    assertNoLoudGap(s);
  });

  it("gives no redirect to a host without the Ice-Snow trait", async () => {
    const s = await attackPlayerWith(vanillaBlueLevel3);
    expect(s.state.players[1]!.battleArea).toHaveLength(3);
    expect(s.state.players[1]!.security).toHaveLength(2);
  });
});
