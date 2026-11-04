import { getCardDefinition, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { settle, setupEngine, type PermanentSpec } from "../../engine/testkit/harness.js";
import "../index.js";

const cardId = "BD02-03";
const vanillaLevel5 = "BT1-038";
const vanillaLevel3 = "BT1-009";

function attackingSetup(attacker: PermanentSpec, opponentBattleArea: PermanentSpec[]) {
  const s = setupEngine(
    {
      0: { battleArea: [attacker] },
      1: { battleArea: opponentBattleArea, security: [vanillaLevel3, vanillaLevel3, vanillaLevel3] },
    },
    { autoSelectCards: true },
  );
  const combat = (s.engine as unknown as { combat: { isAttacking: boolean } }).combat;
  const attackPlayer = async () => {
    const host = s.perm("host");
    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: host.permanentId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settle(() => s.state.phase === Phase.Main && !combat.isAttacking, 5000);
  };
  return { s, attackPlayer };
}

describe("BD02-03 Tenkomon", () => {
  it("matches the printed card", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      set: "BD02",
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
      inheritedEffectText:
        "[When Attacking][Once Per Turn] Trash the bottom digivolution card of 1 of your opponent's Digimon.",
    });
    expect(getCardDefinition(cardId)!.effectText).toBeUndefined();
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
  });

  it("trashes the bottom digivolution card of an opposing Digimon when its host attacks", async () => {
    const { s, attackPlayer } = attackingSetup({ card: vanillaLevel5, as: "host", under: [cardId] }, [
      { card: vanillaLevel5, as: "target", under: ["BT1-003", "BT1-028"] },
    ]);

    await attackPlayer();

    expect(s.perm("target").stack.map((card) => card.cardId)).toEqual(["BT1-028"]);
    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toContain("BT1-003");
  });

  it("does nothing while Tenkomon itself is the top card", async () => {
    const { s, attackPlayer } = attackingSetup({ card: cardId, as: "host", under: ["BT1-028"] }, [
      { card: vanillaLevel5, as: "target", under: ["BT1-003", "BT1-028"] },
    ]);

    await attackPlayer();

    expect(s.perm("target").stack).toHaveLength(2);
  });

  it("trashes only once per turn", async () => {
    const { s, attackPlayer } = attackingSetup({ card: vanillaLevel5, as: "host", under: [cardId] }, [
      { card: vanillaLevel5, as: "target", under: ["BT1-003", "BT1-028", "BT1-027"] },
    ]);

    await attackPlayer();
    expect(s.perm("target").stack).toHaveLength(2);

    s.perm("host").isSuspended = false;
    await attackPlayer();
    expect(s.perm("target").stack).toHaveLength(2);
  });
});
