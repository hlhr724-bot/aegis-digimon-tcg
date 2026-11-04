import { getCardDefinition, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { settle, setupEngine, type PermanentSpec } from "../../engine/testkit/harness.js";
import "../index.js";

const cardId = "BD02-04";
const tenkomon = "BD02-03";
const vanillaLevel6 = "ST2-10";
const vanillaLevel5 = "BT1-038";
const vanillaLevel3 = "BT1-009";

function attackingSetup(attacker: PermanentSpec, opponentBattleArea: PermanentSpec[], options = {}) {
  const s = setupEngine(
    {
      0: { battleArea: [attacker] },
      1: { battleArea: opponentBattleArea, security: [vanillaLevel3, vanillaLevel3, vanillaLevel3] },
    },
    { autoSelectCards: true, ...options },
  );
  const combat = (s.engine as unknown as { combat: { isAttacking: boolean } }).combat;
  const attackPlayer = async () => {
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.phase === Phase.Main && !combat.isAttacking, 5000);
  };
  return { s, attackPlayer };
}

describe("BD02-04 Sekkamon", () => {
  it("matches the printed card", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      set: "BD02",
      nameEn: "Sekkamon",
      nameJp: "セッカモン",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 5,
      playCost: 7,
      dp: 6000,
      evoCosts: [{ color: "Blue", level: 4, memoryCost: 2 }],
      forms: ["Ultimate"],
      attributes: ["Virus"],
      types: ["Beastkin", "ALYSION"],
      rarity: "U",
      inheritedEffectText:
        "[When Attacking][Once Per Turn] If your opponent has no Digimon with digivolution cards, this Digimon unsuspends.",
    });
    expect(getCardDefinition(cardId)!.effectText).toBeUndefined();
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
  });

  it("unsuspends its attacking host when no opposing Digimon has digivolution cards", async () => {
    const { s, attackPlayer } = attackingSetup({ card: vanillaLevel6, as: "host", under: [cardId] }, [
      { card: vanillaLevel5, as: "bare" },
    ]);

    await attackPlayer();

    expect(s.state.players[1]!.security).toHaveLength(2);
    expect(s.perm("host").isSuspended).toBe(false);
  });

  it("stays suspended while an opposing Digimon has a digivolution card", async () => {
    const { s, attackPlayer } = attackingSetup({ card: vanillaLevel6, as: "host", under: [cardId] }, [
      { card: vanillaLevel5, as: "bare" },
      { card: vanillaLevel5, as: "stacked", under: ["BT1-028"] },
    ]);

    await attackPlayer();

    expect(s.perm("host").isSuspended).toBe(true);
  });

  it("unsuspends only once per turn", async () => {
    const { s, attackPlayer } = attackingSetup({ card: vanillaLevel6, as: "host", under: [cardId] }, []);

    await attackPlayer();
    expect(s.perm("host").isSuspended).toBe(false);

    await attackPlayer();
    expect(s.perm("host").isSuspended).toBe(true);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("does nothing while Sekkamon itself is the top card", async () => {
    const { s, attackPlayer } = attackingSetup({ card: cardId, as: "host", under: [tenkomon] }, []);

    await attackPlayer();

    expect(s.perm("host").isSuspended).toBe(true);
  });

  it("unsuspends after Tenkomon's inherited effect trashes the last opposing digivolution card", async () => {
    const { s, attackPlayer } = attackingSetup(
      { card: vanillaLevel6, as: "host", under: [tenkomon, cardId] },
      [{ card: vanillaLevel5, as: "target", under: ["BT1-028"] }],
      { preferTriggerKeys: [tenkomon] },
    );

    await attackPlayer();

    expect(s.perm("target").stack).toHaveLength(0);
    expect(s.perm("host").isSuspended).toBe(false);
  });

  it("digivolves from Tenkomon for 2 memory and keeps Tenkomon's inherited effect", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: tenkomon, as: "base", under: ["BD02-02"] }],
          hand: [{ card: cardId, as: "sekkamon" }],
          deck: [vanillaLevel3],
        },
        1: {
          battleArea: [{ card: vanillaLevel5, as: "target", under: ["BT1-003", "BT1-028"] }],
          security: [vanillaLevel3, vanillaLevel3],
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
        instanceId: s.inst("sekkamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === cardId);

    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["BD02-02", tenkomon]);
    expect(s.state.memory).toBe(3);

    const combat = (s.engine as unknown as { combat: { isAttacking: boolean } }).combat;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.phase === Phase.Main && !combat.isAttacking, 5000);

    expect(s.perm("target").stack.map((card) => card.cardId)).toEqual(["BT1-028"]);
    expect(s.perm("base").isSuspended).toBe(true);
  });
});
