import { getCardDefinition, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { advance } from "../../engine/testkit/advance.js";
import { assertNoLoudGap, settle, setupEngine, type PermanentSpec } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";

const cardId = "ST26-03";
const renamon = "ST26-02";
const valnerDragnogh = "ST26-06";
const earlierValnerDragnogh = "BD02-08";
const otherTamer = "BD01-10";
const vanillaBlueLevel3 = "BT1-027";

const tamerIds = (s: ReturnType<typeof setupEngine>) =>
  s.state.players[0]!.battleArea.filter((permanent) => permanent.topCard.cardId !== cardId).map(
    (p) => p.topCard.cardId,
  );

async function playTenkomon(battleArea: PermanentSpec[], options: { autoDeclineOptional?: boolean } = {}) {
  const s = setupEngine(
    {
      0: {
        battleArea,
        hand: [{ card: cardId, as: "tenkomon" }, { card: valnerDragnogh, as: "valner" }, earlierValnerDragnogh],
      },
    },
    { autoAcceptOptional: options.autoDeclineOptional !== true, ...options, autoSelectCards: true },
  );
  s.state.memory = 4;
  await s.ready();
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("tenkomon").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => s.state.pendingDecision === undefined && !observe(s.engine).isAttacking());
  return s;
}

describe("ST26-03 Tenkomon", () => {
  it("matches the printed card", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      set: "ST26",
      nameEn: "Tenkomon",
      nameJp: "テンコモン",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 4,
      playCost: 4,
      dp: 5000,
      evoCosts: [{ color: "Blue", level: 3, memoryCost: 2 }],
      forms: ["Champion"],
      attributes: ["Virus"],
      types: ["Mysterious Beast", "ALYSION"],
      rarity: "C",
      inheritedEffectText: "[End of Attack] [Once Per Turn] Gain 1 memory.",
    });
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
  });

  it("has the Ice-Snow trait through its [Rule]", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: cardId, as: "tenkomon" }] } });
    await s.ready();
    expect(observe(s.engine).hasEffectiveTrait(s.perm("tenkomon"), "Ice-Snow")).toBe(true);
  });

  it("plays the ST26 Valner Dragnogh from hand for free with no Tamers", async () => {
    const s = await playTenkomon([]);
    expect(tamerIds(s)).toEqual([valnerDragnogh]);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual([earlierValnerDragnogh]);
    expect(s.state.memory).toBe(0);
    assertNoLoudGap(s);
  });

  it("still plays Valner Dragnogh with exactly 1 Tamer", async () => {
    const s = await playTenkomon([{ card: otherTamer }]);
    expect(tamerIds(s)).toEqual([otherTamer, valnerDragnogh]);
  });

  it("plays nothing with 2 Tamers", async () => {
    const s = await playTenkomon([{ card: otherTamer }, { card: otherTamer }]);
    expect(tamerIds(s)).toEqual([otherTamer, otherTamer]);
    expect(s.state.players[0]!.hand).toHaveLength(2);
  });

  it("lets the player decline the free play", async () => {
    const s = await playTenkomon([], { autoDeclineOptional: true });
    expect(tamerIds(s)).toEqual([]);
  });

  it("plays Valner Dragnogh when it digivolves from Renamon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: renamon, as: "base" }],
          hand: [{ card: cardId, as: "tenkomon" }, valnerDragnogh],
          deck: [vanillaBlueLevel3, vanillaBlueLevel3],
        },
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
    await settle(() => s.state.players[0]!.battleArea.length === 2 && s.state.pendingDecision === undefined);

    expect(s.perm("base").topCard.cardId).toBe(cardId);
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toContain(valnerDragnogh);
  });

  it("gains 1 memory at the end of its host's attack, once per turn", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: vanillaBlueLevel3, as: "host", under: [cardId], dp: 20_000 }] },
      1: { security: [vanillaBlueLevel3, vanillaBlueLevel3, vanillaBlueLevel3] },
    });
    await s.ready();
    const attackPlayer = async () => {
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("host").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.phase === Phase.Main && !observe(s.engine).isAttacking(), 5000);
    };

    await attackPlayer();
    expect(s.state.memory).toBe(1);
    expect(s.state.players[1]!.security).toHaveLength(2);

    await advance(s.engine).verb.unsuspend([s.perm("host").permanentId]);
    await attackPlayer();
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.memory).toBe(1);
  });
});
