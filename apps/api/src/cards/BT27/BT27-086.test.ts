import { EffectTiming, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "#api/engine/effects/interpreter";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, drainMicrotasks, settle, setupEngine } from "#api/engine/testkit/harness";
import "#api/cards/index";
import { compiled } from "./BT27-086.js";

const cardId = "BT27-086";
const gemmon = "BT27-006";
const liskmon = "BT27-011";
const starterLiskmon = "ST25-03";
const blueAlysionLevel3 = "ST26-02";
const vanillaRedLevel3 = "BT1-009";
const vanillaRedLevel4 = "BT1-014";
const vanillaRedLevel6 = "ST1-10";

type Setup = ReturnType<typeof setupEngine>;
type Options = Parameters<typeof setupEngine>[1];

async function memoryAtMainPhaseWith(digimon: readonly string[]) {
  const s = setupEngine({
    0: {
      battleArea: [{ card: cardId, as: "kanata" }, ...digimon.map((card, index) => ({ card, as: `digimon${index}` }))],
      deck: [vanillaRedLevel3, vanillaRedLevel3],
    },
  });
  s.state.memory = 3;
  await s.ready();
  const turn = s.engine.runOneTurn();
  await advance(s.engine).waitForMainPhase(0);
  await drainMicrotasks(20);
  const memory = s.state.memory;
  advance(s.engine).endMainPhaseIfOpen(0);
  await turn;
  return memory;
}

async function playWithKanata(card: string, allyDp: number, options: Options, kanataSuspended = false) {
  const preferInstanceIds: string[] = [];
  const s = setupEngine(
    {
      0: {
        battleArea: [
          { card: cardId, as: "kanata", suspended: kanataSuspended },
          { card: vanillaRedLevel6, as: "ally", dp: allyDp },
        ],
        hand: [{ card, as: "entering" }],
        deck: [vanillaRedLevel3, vanillaRedLevel3],
      },
    },
    { ...options, autoSelectCards: true, preferInstanceIds },
  );
  preferInstanceIds.push(s.perm("ally").topCard.instanceId);
  s.state.memory = 10;
  await s.ready();
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("entering").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => s.state.players[0]!.battleArea.length === 3 && s.state.pendingDecision === undefined);
  return s;
}

const handSize = (s: Setup) => s.state.players[0]!.hand.length;

describe("BT27-086 Kanata Hondo", () => {
  it("matches the printed card", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      set: "BT27",
      nameEn: "Kanata Hondo",
      nameJp: "本堂カナタ",
      colors: ["Red"],
      kinds: ["Tamer"],
      playCost: 3,
      dp: 0,
      evoCosts: [],
      types: ["ALYSION"],
      rarity: "R",
      effectText:
        "[Start of Your Main Phase] If you have a Digimon with [Gemmon] in its text, gain 1 memory.\n[Your Turn] When your Digimon are played or digivolve, if any of them have the [ALYSION] trait, by suspending this Tamer, 1 of your Digimon gets +3000 DP for the turn. After, if you have a Digimon with 8000 DP or more, ＜Draw 1＞.",
      securityEffectText: "[Security] Play this card without paying the cost.",
    });
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects.find((effect) => effect.trigger === "YourTurn")?.actions).toMatchObject([
      { kind: "SubTrigger", event: "whenPlayed" },
      { kind: "SubTrigger", event: "whenOneOfYoursDigivolves" },
    ]);
  });

  it.each([
    ["a Digimon named Gemmon", [gemmon], 4],
    ["a Digimon with [Gemmon] only in its text", [liskmon], 4],
    ["a blue [ALYSION] Digimon without [Gemmon] in its text", [blueAlysionLevel3], 3],
    ["a red Digimon without [Gemmon] in its text", [vanillaRedLevel4], 3],
  ])("at the start of your main phase with %s leaves 3 memory at %i", async (_label, digimon, expected) => {
    expect(await memoryAtMainPhaseWith(digimon)).toBe(expected);
  });

  it("suspends to give 1 Digimon +3000 DP for the turn, then draws at 8000 DP", async () => {
    const s = await playWithKanata(liskmon, 5000, { autoAcceptOptional: true });

    expect(s.perm("kanata").isSuspended).toBe(true);
    expect(s.perm("ally").currentDP).toBe(8000);
    expect(handSize(s)).toBe(1);
    assertNoLoudGap(s);
  });

  it("does not draw when the best Digimon reaches only 7999 DP", async () => {
    const s = await playWithKanata(liskmon, 4999, { autoAcceptOptional: true });

    expect(s.perm("kanata").isSuspended).toBe(true);
    expect(s.perm("ally").currentDP).toBe(7999);
    expect(handSize(s)).toBe(0);
  });

  it("neither boosts nor draws when the player declines to suspend", async () => {
    const s = await playWithKanata(liskmon, 9000, { autoDeclineOptional: true });

    expect(s.perm("kanata").isSuspended).toBe(false);
    expect(s.perm("ally").currentDP).toBe(9000);
    expect(handSize(s)).toBe(0);
  });

  it("does not trigger while already suspended", async () => {
    const s = await playWithKanata(liskmon, 9000, { autoAcceptOptional: true }, true);

    expect(s.perm("ally").currentDP).toBe(9000);
    expect(handSize(s)).toBe(0);
  });

  it.each([
    ["a blue [ALYSION] Digimon", blueAlysionLevel3, true],
    ["a red Digimon without the [ALYSION] trait", vanillaRedLevel4, false],
  ])("when %s is played, suspends: %s", async (_label, card, suspends) => {
    const s = await playWithKanata(card, 9000, { autoAcceptOptional: true });

    expect(s.perm("kanata").isSuspended).toBe(suspends);
    expect(s.perm("ally").currentDP).toBe(suspends ? 12000 : 9000);
  });

  it("triggers when a Digimon digivolves into an [ALYSION] Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "kanata" },
            { card: vanillaRedLevel3, as: "base" },
          ],
          hand: [{ card: starterLiskmon, as: "liskmon" }],
          deck: [vanillaRedLevel3, vanillaRedLevel3, vanillaRedLevel3],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("liskmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("kanata").isSuspended && s.state.pendingDecision === undefined);

    expect(s.perm("base").currentDP).toBe(5000 + 3000);
    expect(handSize(s)).toBe(2);
  });

  it("does not trigger on the opponent's turn", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: cardId, as: "kanata" }], hand: [{ card: liskmon, as: "entering" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.turnSeat = 1;
    await advance(s.engine).verb.playInstances([s.inst("entering").instanceId]);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.perm("kanata").isSuspended).toBe(false);
  });

  it("plays itself from security without paying the cost", async () => {
    const s = setupEngine({ 0: { security: [{ card: cardId, as: "kanata", faceUp: true }] } });
    await s.ready();
    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("kanata"));
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toContain(cardId);
  });
});
