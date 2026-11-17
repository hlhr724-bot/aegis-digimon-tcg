import { getCardDefinition, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "#api/engine/effects/interpreter";
import { assertNoLoudGap, settle, setupEngine } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import "#api/cards/index";

const cardId = "BT27-022";
const alysionLevel4 = "ST26-03";
const alysionBlueTamer = "ST26-06";
const blueTamer = "BT1-086";
const redTamer = "BT1-085";
const redAlysionTamer = "BD01-10";
const vanillaIceSnowLevel4 = "BT11-026";
const vanillaBlueLevel3 = "BT1-027";
const vanillaBlueLevel5 = "BT1-038";
const weakBlueLevel3 = "BT1-028";
const bottomSource = "BT1-003";

type Setup = ReturnType<typeof setupEngine>;

async function playRenamon(deck: string[]) {
  const s = setupEngine({ 0: { hand: [{ card: cardId, as: "renamon" }], deck } }, { autoSelectCards: true });
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

const handIds = (s: Setup) => s.state.players[0]!.hand.map((card) => card.cardId).sort();
const deckIds = (s: Setup) => s.state.players[0]!.deck.map((card) => card.cardId);

describe("BT27-022 Renamon", () => {
  it("matches the printed card", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      set: "BT27",
      nameEn: "Renamon",
      nameJp: "レナモン",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 3,
      playCost: 3,
      dp: 2000,
      evoCosts: [{ color: "Blue", level: 2, memoryCost: 0 }],
      forms: ["Rookie"],
      attributes: ["Data"],
      types: ["Beastkin", "ALYSION"],
      rarity: "U",
      effectText:
        "[On Play] Reveal the top 3 cards of your deck. Add 1 [Ice-Snow] or [ALYSION] trait card and 1 blue Tamer card among them to the hand. Return the rest to the bottom of the deck.\n[Rule] Trait: Has [Ice-Snow] Type.",
      inheritedEffectText:
        "[When Attacking] If this Digimon has the [Ice-Snow] trait, you may change the attack target to 1 of your opponent's unsuspended Digimon with the fewest digivolution cards.",
    });
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
  });

  it("has the Ice-Snow trait through its [Rule]", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: cardId, as: "renamon" }] } });
    await s.ready();
    expect(observe(s.engine).hasEffectiveTrait(s.perm("renamon"), "Ice-Snow")).toBe(true);
  });

  it("adds 1 ALYSION card and 1 blue Tamer card, then returns the rest to the bottom of the deck", async () => {
    const s = await playRenamon([alysionLevel4, blueTamer, vanillaBlueLevel3, vanillaBlueLevel5]);
    expect(handIds(s)).toEqual([blueTamer, alysionLevel4].sort());
    expect(deckIds(s)).toEqual([vanillaBlueLevel5, vanillaBlueLevel3]);
    expect(s.state.memory).toBe(0);
    assertNoLoudGap(s);
  });

  it("adds a card with the printed Ice-Snow trait and no ALYSION trait", async () => {
    const s = await playRenamon([vanillaIceSnowLevel4, vanillaBlueLevel3, vanillaBlueLevel3]);
    expect(handIds(s)).toEqual([vanillaIceSnowLevel4]);
    expect(deckIds(s)).toEqual([vanillaBlueLevel3, vanillaBlueLevel3]);
  });

  it("adds an ALYSION blue Tamer as the trait card together with another blue Tamer", async () => {
    const s = await playRenamon([alysionBlueTamer, blueTamer, vanillaBlueLevel3]);
    expect(handIds(s)).toEqual([blueTamer, alysionBlueTamer].sort());
    expect(deckIds(s)).toEqual([vanillaBlueLevel3]);
  });

  it("adds only 1 trait card when two are revealed", async () => {
    const s = await playRenamon([alysionLevel4, vanillaIceSnowLevel4, vanillaBlueLevel3]);
    expect(s.state.players[0]!.hand).toHaveLength(1);
    expect(s.state.players[0]!.deck).toHaveLength(2);
  });

  it("takes a red ALYSION Tamer only as the trait card and never a red Tamer without the trait", async () => {
    const s = await playRenamon([redAlysionTamer, redTamer, vanillaBlueLevel3]);
    expect(handIds(s)).toEqual([redAlysionTamer]);
    expect(deckIds(s).sort()).toEqual([redTamer, vanillaBlueLevel3].sort());
  });

  it("adds nothing when no revealed card matches", async () => {
    const s = await playRenamon([vanillaBlueLevel3, redTamer, vanillaBlueLevel5]);
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.deck).toHaveLength(3);
  });

  it("lets an Ice-Snow host redirect to the unsuspended Digimon with the fewest digivolution cards", async () => {
    const s = await attackPlayerWith(vanillaIceSnowLevel4);
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.permanentId)).toEqual([
      s.perm("suspendedBare").permanentId,
      s.perm("stacked").permanentId,
    ]);
    expect(s.state.players[1]!.security).toHaveLength(3);
    assertNoLoudGap(s);
  });

  it("gives no redirect to a host without the Ice-Snow trait", async () => {
    const s = await attackPlayerWith(vanillaBlueLevel3);
    expect(s.state.players[1]!.battleArea).toHaveLength(3);
    expect(s.state.players[1]!.security).toHaveLength(2);
  });
});
