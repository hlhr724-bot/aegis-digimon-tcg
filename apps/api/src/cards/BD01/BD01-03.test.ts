import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { assertNoLoudGap, drainMicrotasks, settle, setupEngine } from "../../engine/testkit/harness.js";
import "../index.js";

const cardId = "BD01-03";

async function digivolveLiskmonOver(base: string, opponentDp: readonly number[]) {
  const s = setupEngine(
    {
      0: {
        battleArea: [{ card: base, as: "base" }],
        hand: [{ card: cardId, as: "liskmon" }],
        deck: ["BT1-009"],
      },
      1: {
        battleArea: opponentDp.map((dp, index) => ({ card: "BT1-009", as: `target${index}`, dp })),
      },
    },
    { autoSelectCards: true },
  );
  s.state.memory = 5;
  await s.ready();
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("base").permanentId,
      instanceId: s.inst("liskmon").instanceId,
    }),
  ).toEqual({ ok: true });
  await settle(() => s.perm("base").topCard.cardId === cardId);
  await drainMicrotasks(20);
  return s;
}

function remainingOpponentIds(s: Awaited<ReturnType<typeof digivolveLiskmonOver>>) {
  return s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId);
}

describe("BD01-03 Liskmon", () => {
  it("matches the printed card", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      set: "BD01",
      nameEn: "Liskmon",
      nameJp: "リスクモン",
      colors: ["Red"],
      kinds: ["Digimon"],
      level: 4,
      playCost: 5,
      dp: 5000,
      evoCosts: [{ color: "Red", level: 3, memoryCost: 2 }],
      forms: ["Champion"],
      attributes: ["Vaccine"],
      types: ["Bird Dragon", "ALYSION"],
      rarity: "C",
      effectText: "[When Digivolving] Delete 1 of your opponent's Digimon with 2000 DP or less.",
    });
    expect(getCardDefinition(cardId)!.inheritedEffectText).toBeUndefined();
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
  });

  it("digivolves from a red level 3 Digimon for 2 memory", async () => {
    const s = await digivolveLiskmonOver("BT1-009", []);

    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["BT1-009"]);
    expect(s.state.memory).toBe(3);
  });

  it("deletes an opposing Digimon with exactly 2000 DP and leaves one with 3000 DP", async () => {
    const s = await digivolveLiskmonOver("BT1-009", [2000, 3000]);
    await settle(() => s.state.players[1]!.battleArea.length === 1);

    expect(remainingOpponentIds(s)).toEqual([s.perm("target1").permanentId]);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("target0").instanceId]);
    expect(s.state.pendingDecision).toBeUndefined();
    assertNoLoudGap(s);
  });

  it("deletes nothing when every opposing Digimon has more than 2000 DP", async () => {
    const s = await digivolveLiskmonOver("BT1-009", [2001]);

    expect(remainingOpponentIds(s)).toEqual([s.perm("target0").permanentId]);
    expect(s.state.pendingDecision).toBeUndefined();
    assertNoLoudGap(s);
  });

  it("reaches 3000 DP over an inherited Gemmon because Liskmon has the ALYSION trait", async () => {
    const s = await digivolveLiskmonOver("BD01-02", [3000, 4000]);
    await settle(() => s.state.players[1]!.battleArea.length === 1);

    expect(s.engine.deletionMaxDp.bonusFor(0, s.perm("base").permanentId)).toBe(1000);
    expect(remainingOpponentIds(s)).toEqual([s.perm("target1").permanentId]);
    assertNoLoudGap(s);
  });

  it("does not delete when played from hand instead of digivolving", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: cardId, as: "liskmon" }], deck: ["BT1-009"] },
        1: { battleArea: [{ card: "BT1-009", as: "target", dp: 2000 }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("liskmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 1);
    await drainMicrotasks(20);

    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([
      s.perm("target").permanentId,
    ]);
  });
});
