import { getCardDefinition, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { assertNoLoudGap, settle, setupEngine } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";

const cardId = "ST26-01";
const renamon = "ST26-02";
const vanillaIceSnowLevel4 = "BT11-026";
const vanillaBlueLevel3 = "BT1-027";
const vanillaBlueLevel5 = "BT1-038";
const vanillaDigiEgg = "BT1-003";

async function attackStrongerDefender(host: string, defenderSources: string[]) {
  const s = setupEngine(
    {
      0: { battleArea: [{ card: host, as: "host", under: [cardId] }] },
      1: { battleArea: [{ card: vanillaBlueLevel5, as: "defender", under: defenderSources, suspended: true }] },
    },
    { autoSelectCards: true },
  );
  await s.ready();
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("host").permanentId,
      target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.phase === Phase.Main && !observe(s.engine).isAttacking(), 5000);
  return s;
}

const hostSurvived = (s: ReturnType<typeof setupEngine>) => s.state.players[0]!.battleArea.length === 1;

describe("ST26-01 Viximon", () => {
  it("matches the printed card", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      set: "ST26",
      nameEn: "Viximon",
      nameJp: "ポコモン",
      colors: ["Blue"],
      kinds: ["DigiEgg"],
      level: 2,
      forms: ["In-Training"],
      types: ["Lesser", "ALYSION"],
      rarity: "C",
      inheritedEffectText:
        "[Your Turn] While your opponent has no Digimon with digivolution cards, this [Ice-Snow] trait Digimon can't be deleted in battle.",
    });
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
  });

  it("keeps an Ice-Snow host alive after losing a battle while no opposing Digimon has digivolution cards", async () => {
    const s = await attackStrongerDefender(vanillaIceSnowLevel4, []);
    expect(hostSurvived(s)).toBe(true);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    assertNoLoudGap(s);
  });

  it("protects a Renamon host through its [Rule] Ice-Snow trait", async () => {
    const s = await attackStrongerDefender(renamon, []);
    expect(hostSurvived(s)).toBe(true);
  });

  it("gives no protection once an opposing Digimon has a digivolution card", async () => {
    const s = await attackStrongerDefender(vanillaIceSnowLevel4, [vanillaDigiEgg]);
    expect(hostSurvived(s)).toBe(false);
  });

  it("gives no protection to a host without the Ice-Snow trait", async () => {
    const s = await attackStrongerDefender(vanillaBlueLevel3, []);
    expect(hostSurvived(s)).toBe(false);
  });

  it("gives no protection during the opponent's turn", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: vanillaIceSnowLevel4, as: "host", under: [cardId] }] } });
    s.state.turnSeat = 1;
    await s.ready();
    expect(observe(s.engine).isRestricted(s.perm("host"), "beDeletedInBattle")).toBe(false);
  });
});
