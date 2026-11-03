import { getCardDefinition } from "@aegis/shared";
import { afterEach, describe, expect, it } from "vitest";
import { registerIrCard, runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { unregisterIrCard } from "../../engine/effects/interpreter/registration/unregisterIrCard.js";
import { assertNoLoudGap, drainMicrotasks, settle, setupEngine } from "../../engine/testkit/harness.js";
import { syntheticDefinitions } from "../../engine/testkit/syntheticDefinitions.js";
import { compiled as gallantmonCompiled } from "../BT19/BT19-015.js";
import "../index.js";
import { compiled } from "./BD01-02.js";

const cardId = "BD01-02";
const alysionGallantmon = "TEST-BD01-02-ALYSION-GALLANTMON";

function registerAlysionGallantmon() {
  const gallantmon = getCardDefinition("BT19-015")!;
  syntheticDefinitions.set(alysionGallantmon, {
    ...gallantmon,
    cardId: alysionGallantmon,
    imageId: alysionGallantmon,
    types: [...(gallantmon.types ?? []), "ALYSION"],
  });
  registerIrCard(alysionGallantmon, gallantmonCompiled);
}

async function digivolveGallantmonOverGemmon(host: string, opponentDp: readonly number[]) {
  const s = setupEngine(
    {
      0: {
        battleArea: [{ card: "BT19-012", as: "base", under: [cardId] }],
        hand: [{ card: host, as: "host" }],
        deck: ["BT1-010"],
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
      instanceId: s.inst("host").instanceId,
    }),
  ).toEqual({ ok: true });
  return s;
}

describe("BD01-02 Gemmon", () => {
  afterEach(() => {
    for (const id of syntheticDefinitions.keys()) unregisterIrCard(id);
    syntheticDefinitions.clear();
  });

  it("matches the printed card", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      set: "BD01",
      nameEn: "Gemmon",
      nameJp: "ジェムモン",
      colors: ["Red"],
      kinds: ["Digimon"],
      level: 3,
      playCost: 3,
      dp: 2000,
      evoCosts: [{ color: "Red", level: 2, memoryCost: 0 }],
      forms: ["Rookie"],
      attributes: ["Vaccine"],
      types: ["Mythical Beast", "ALYSION"],
      rarity: "R",
      inheritedEffectText: "[Your Turn] Add 1000 to this [ALYSION] trait Digimon's DP deletion effect's maximum.",
    });
    expect(getCardDefinition(cardId)!.effectText).toBeUndefined();
  });

  it("compiles the inherited clause as a Your Turn self maximum gated by the ALYSION trait", () => {
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects).toEqual([
      {
        trigger: "YourTurn",
        isInherited: true,
        actions: [
          {
            kind: "DeletionMaxDpModifier",
            amount: 1000,
            scope: "self",
            duration: "permanent",
            condition: {
              kind: "selfHasTrait",
              filter: { nameOrTrait: [{ tokens: ["ALYSION"], match: "trait" }] },
            },
          },
        ],
      },
    ]);
  });

  it("digivolves from a red level 2 Digimon for 0 memory", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-001", as: "egg" }],
        hand: [{ card: cardId, as: "gemmon" }],
        deck: ["BT1-010"],
      },
    });
    s.state.memory = 2;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("egg").permanentId,
        instanceId: s.inst("gemmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("egg").topCard.cardId === cardId);

    expect(s.perm("egg").stack.map((card) => card.cardId)).toEqual(["BT1-001"]);
    expect(s.state.memory).toBe(2);
  });

  it("raises an ALYSION host's printed 8000 maximum by exactly 1000: 9000 DP is deleted, 10000 DP is not", async () => {
    registerAlysionGallantmon();
    const s = await digivolveGallantmonOverGemmon(alysionGallantmon, [9000, 10_000]);
    await settle(() => s.state.players[1]!.battleArea.length === 1);
    await drainMicrotasks(20);

    expect(s.engine.deletionMaxDp.bonusFor(0, s.perm("base").permanentId)).toBe(1000);
    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual([cardId, "BT19-012"]);
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([
      s.perm("target1").permanentId,
    ]);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("target0").instanceId]);
    expect(s.state.pendingDecision).toBeUndefined();
    assertNoLoudGap(s);
  });

  it("leaves the maximum alone when ALYSION is only in the digivolution cards, not on the host", async () => {
    const s = await digivolveGallantmonOverGemmon("BT19-015", [9000]);
    await settle(() => s.perm("base").topCard.cardId === "BT19-015");
    await drainMicrotasks(20);

    expect(s.engine.deletionMaxDp.bonusFor(0, s.perm("base").permanentId)).toBe(0);
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([
      s.perm("target0").permanentId,
    ]);
    assertNoLoudGap(s);
  });

  it("does not raise the maximum during the opponent's turn", async () => {
    registerAlysionGallantmon();
    const s = setupEngine({
      0: { battleArea: [{ card: alysionGallantmon, as: "host", under: [cardId] }] },
    });
    s.state.turnSeat = 1;
    await s.ready();

    expect(s.engine.deletionMaxDp.bonusFor(0, s.perm("host").permanentId)).toBe(0);
  });

  it("does not apply while Gemmon itself is the top card", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: cardId, as: "gemmon", under: ["BT1-001"] }] } });
    await s.ready();

    expect(s.engine.deletionMaxDp.bonusFor(0, s.perm("gemmon").permanentId)).toBe(0);
  });
});
