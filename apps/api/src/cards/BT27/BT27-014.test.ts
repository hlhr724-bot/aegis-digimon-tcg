import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { matchingAlternateDigivolutionRequirement } from "../../engine/cards/cardData.js";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { assertNoLoudGap, settle, setupEngine } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";

const cardId = "BT27-014";
const gemmon = "BT27-006";
const liskmon = "BT27-011";
const rubeusdramon = "ST25-05";
const vanillaRedLevel3 = "BT1-009";
const vanillaRedLevel4 = "BT1-014";
const vanillaRedLevel6 = "ST1-10";

async function runTurnEnd(host: string, sources: string[]) {
  const s = setupEngine(
    {
      0: { battleArea: [{ card: host, as: "host", under: sources }] },
      1: { security: [{ card: vanillaRedLevel3, as: "firstSecurity" }, vanillaRedLevel3] },
    },
    { autoAcceptOptional: true, autoSelectCards: true },
  );
  await s.ready();
  const turn = s.engine.runOneTurn();
  const mainPhase = (s.engine as unknown as { mainPhase: { isOpen: boolean } }).mainPhase;
  await settle(() => mainPhase.isOpen);
  expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
  await turn;
  return s;
}

describe("BT27-014 Reptilimon", () => {
  it("matches the printed card", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      set: "BT27",
      nameEn: "Reptilimon",
      nameJp: "レプティリモン",
      colors: ["Red"],
      kinds: ["Digimon"],
      level: 5,
      playCost: 7,
      dp: 7000,
      evoCosts: [{ color: "Red", level: 4, memoryCost: 3 }],
      forms: ["Ultimate"],
      attributes: ["Vaccine"],
      types: ["Dragon Warrior", "ALYSION"],
      rarity: "R",
    });
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
  });

  it("digivolves from a level 4 card with [Gemmon] in its text through the alternate requirement only", () => {
    expect(matchingAlternateDigivolutionRequirement(cardId, liskmon)).toMatchObject({ level: 4, cost: 3 });
    expect(matchingAlternateDigivolutionRequirement(cardId, vanillaRedLevel4)).toBeUndefined();
  });

  it("gives the chosen Digimon Piercing and +3000 DP for the turn on play", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: vanillaRedLevel4, as: "ally" }],
          hand: [{ card: cardId, as: "reptilimon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds },
    );
    preferInstanceIds.push(s.perm("ally").topCard.instanceId);
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("reptilimon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("ally").currentDP === 4000 + 3000 && s.state.pendingDecision === undefined);

    expect(observe(s.engine).hasPierce(s.perm("ally"))).toBe(true);
    expect(s.state.memory).toBe(3);
    assertNoLoudGap(s);
  });

  it("digivolves onto a fresh Gemmon stack, reaches 12000 DP and attacks with Rush the same turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: liskmon, as: "base", under: [gemmon], enteredThisTurn: true }],
          hand: [{ card: cardId, as: "reptilimon" }],
        },
        1: { security: [vanillaRedLevel3, vanillaRedLevel3] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("reptilimon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === cardId && s.state.pendingDecision === undefined);

    expect(s.perm("base").currentDP).toBe(7000 + 2000 + 3000);
    const observed = observe(s.engine);
    expect(observed.hasPierce(s.perm("base"))).toBe(true);
    expect(observed.hasKeyword(s.perm("base"), "Rush")).toBe(true);
    expect(observed.hasKeyword(s.perm("base"), "Raid")).toBe(true);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
  });

  it("has no Rush at 11999 DP and cannot attack the turn it enters", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: cardId, as: "fresh", dp: 11_999, enteredThisTurn: true }] } });
    await s.ready();

    expect(observe(s.engine).hasKeyword(s.perm("fresh"), "Rush")).toBe(false);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("fresh").permanentId,
        target: { kind: "player" },
      }),
    ).not.toEqual({ ok: true });
  });

  it("has Rush at 12000 DP on your turn but not on your opponent's turn", async () => {
    const yourTurn = setupEngine({ 0: { battleArea: [{ card: cardId, as: "big", dp: 12_000 }] } });
    await yourTurn.ready();
    expect(observe(yourTurn.engine).hasKeyword(yourTurn.perm("big"), "Rush")).toBe(true);

    const opponentTurn = setupEngine({ 0: { battleArea: [{ card: cardId, as: "big", dp: 12_000 }] } });
    opponentTurn.state.turnSeat = 1;
    await opponentTurn.ready();
    expect(observe(opponentTurn.engine).hasKeyword(opponentTurn.perm("big"), "Rush")).toBe(false);
  });

  it("uses its printed Engage to attack at the end of your turn", async () => {
    const s = await runTurnEnd(cardId, []);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("gives a host with [Gemmon] in its text Engage, which attacks at the end of your turn", async () => {
    const s = await runTurnEnd(rubeusdramon, [cardId]);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("firstSecurity").instanceId);
  });

  it("gives a host without [Gemmon] in its text no Engage", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: vanillaRedLevel6, as: "host", under: [cardId] }] } });
    await s.ready();
    expect(observe(s.engine).hasKeyword(s.perm("host"), "Engage")).toBe(false);

    const ended = await runTurnEnd(vanillaRedLevel6, [cardId]);
    expect(ended.state.players[1]!.security).toHaveLength(2);
  });
});
