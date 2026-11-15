import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { matchingAlternateDigivolutionRequirement } from "#api/engine/cards/cardData";
import { runtimeCompiledCard } from "#api/engine/effects/interpreter";
import { playByAssembly } from "#api/engine/testkit/assembly";
import { assertNoLoudGap, settle, setupEngine } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import "#api/cards/index";
import { compiled } from "./BT27-018.js";

const cardId = "BT27-018";
const gemmon = "BT27-006";
const liskmon = "BT27-011";
const reptilimon = "BT27-014";
const blueAlysionLevel4 = "ST26-03";
const vanillaRedLevel3 = "BT1-009";
const vanillaRedLevel4 = "BT1-014";
const vanillaRedLevel5 = "BT1-020";
const vanillaRedLevel6 = "ST1-10";

type Setup = ReturnType<typeof setupEngine>;
type Options = Parameters<typeof setupEngine>[1];

const opponentBoard = [
  { card: vanillaRedLevel6, as: "high", dp: 9000 },
  { card: vanillaRedLevel4, as: "low", dp: 3000 },
  { card: vanillaRedLevel5, as: "middle", dp: 6000 },
];
const opponentSecurity = [vanillaRedLevel3, vanillaRedLevel3, vanillaRedLevel3];

const opponentDigimonDp = (s: Setup) => s.state.players[1]!.battleArea.map(({ currentDP }) => currentDP);
const deletionPrompts = (s: Setup) => s.decisions.filter(({ req }) => req.kind === "chooseTargets");

async function digivolveIntoRubeusdramon(options: Options, baseSources: string[] = []) {
  const s = setupEngine(
    {
      0: {
        battleArea: [{ card: reptilimon, as: "base", under: baseSources }],
        hand: [{ card: cardId, as: "rubeusdramon" }],
      },
      1: { battleArea: opponentBoard, security: opponentSecurity },
    },
    options,
  );
  s.state.memory = 5;
  await s.ready();
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("base").permanentId,
      instanceId: s.inst("rubeusdramon").instanceId,
    }),
  ).toEqual({ ok: true });
  await settle(() => s.perm("base").topCard.cardId === cardId && s.state.pendingDecision === undefined);
  return s;
}

async function attackWithRubeusdramon(s: Setup) {
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("rubeusdramon").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.events.some(({ kind }) => kind === "attackEnded") && s.state.pendingDecision === undefined);
}

describe("BT27-018 Rubeusdramon", () => {
  it("matches the printed card", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      set: "BT27",
      nameEn: "Rubeusdramon",
      nameJp: "ルビウスドラモン",
      colors: ["Red"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 12,
      dp: 12000,
      evoCosts: [{ color: "Red", level: 5, memoryCost: 3 }],
      forms: ["Mega"],
      attributes: ["Vaccine"],
      types: ["Dragon Warrior", "ALYSION"],
      rarity: "SR",
      effectText:
        "[Digivolve] Lv.5 w/[Gemmon] in text: Cost 3\n＜Rush＞ ＜Progress＞\n[When Digivolving] [When Attacking] [Once Per Turn] For every 8000 DP this Digimon has, you may activate the effect below:\n・Delete 1 of your opponent's lowest DP Digimon.\n[All Turns] [Once Per Turn] When any of your opponent's Digimon are deleted, trash their top security card.\n[Assembly -5] Lv.5 × Lv.4 × Lv.3, all Red w/[Gemmon] in text",
    });
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects.map((effect) => [effect.trigger, effect.frequency, effect.sharedUseKey])).toEqual([
      ["Static", undefined, undefined],
      ["WhenDigivolving", "OncePerTurn", "BT27-018/delete-lowest-dp"],
      ["WhenAttacking", "OncePerTurn", "BT27-018/delete-lowest-dp"],
      ["AllTurns", "OncePerTurn", undefined],
    ]);
  });

  it("digivolves from a level 5 card with [Gemmon] in its text through the alternate requirement only", () => {
    expect(matchingAlternateDigivolutionRequirement(cardId, reptilimon)).toMatchObject({ level: 5, cost: 3 });
    expect(matchingAlternateDigivolutionRequirement(cardId, liskmon)).toBeUndefined();
    expect(matchingAlternateDigivolutionRequirement(cardId, vanillaRedLevel5)).toBeUndefined();
  });

  it("has Rush and Progress", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: cardId, as: "rubeusdramon" }] } });
    await s.ready();
    expect(observe(s.engine).hasKeyword(s.perm("rubeusdramon"), "Rush")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("rubeusdramon"), "Progress")).toBe(true);
  });

  it("deletes the lowest DP Digimon once at 12000 DP when digivolving, then trashes the top security card", async () => {
    const s = await digivolveIntoRubeusdramon({ autoAcceptOptional: true, autoSelectCards: true });

    expect(s.perm("base").currentDP).toBe(12000);
    expect(opponentDigimonDp(s)).toEqual([9000, 6000]);
    expect(s.state.players[1]!.security).toHaveLength(2);
    expect(s.state.players[1]!.trash).toHaveLength(2);
    expect(s.state.memory).toBe(2);
    assertNoLoudGap(s);
  });

  it("deletes the two lowest DP Digimon at 16000 DP and trashes security only once that turn", async () => {
    const s = await digivolveIntoRubeusdramon({ autoAcceptOptional: true, autoSelectCards: true }, [gemmon, gemmon]);

    expect(s.perm("base").currentDP).toBe(16000);
    expect(deletionPrompts(s)).toHaveLength(2);
    expect(s.decisions.filter(({ req }) => req.kind === "chooseOption")).toHaveLength(0);
    expect(opponentDigimonDp(s)).toEqual([9000]);
    expect(s.state.players[1]!.security).toHaveLength(2);
    expect(s.state.players[1]!.trash).toHaveLength(3);
  });

  it("keeps a single activation at 15999 DP", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: cardId, as: "rubeusdramon", dp: 15999 }] },
        1: { battleArea: opponentBoard, security: opponentSecurity },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await attackWithRubeusdramon(s);

    expect(opponentDigimonDp(s)).toEqual([9000, 6000]);
  });

  it("deletes nothing when the player declines every activation", async () => {
    const s = await digivolveIntoRubeusdramon({ autoDeclineOptional: true, autoSelectCards: true }, [gemmon, gemmon]);

    expect(deletionPrompts(s)).toHaveLength(2);
    expect(opponentDigimonDp(s)).toEqual([9000, 3000, 6000]);
    expect(s.state.players[1]!.security).toHaveLength(3);
  });

  it("lets the player pick among Digimon tied for the lowest DP", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: { battleArea: [{ card: cardId, as: "rubeusdramon" }] },
        1: {
          battleArea: [
            { card: vanillaRedLevel4, as: "tiedFirst", dp: 3000 },
            { card: vanillaRedLevel5, as: "tiedSecond", dp: 3000 },
            { card: vanillaRedLevel6, as: "high", dp: 9000 },
          ],
          security: opponentSecurity,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds },
    );
    preferInstanceIds.push(s.perm("tiedSecond").topCard.instanceId);
    await s.ready();
    await attackWithRubeusdramon(s);

    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([
      s.perm("tiedFirst").permanentId,
      s.perm("high").permanentId,
    ]);
  });

  it("shares its once per turn use between digivolving and attacking", async () => {
    const s = await digivolveIntoRubeusdramon({ autoAcceptOptional: true, autoSelectCards: true });
    expect(opponentDigimonDp(s)).toEqual([9000, 6000]);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "attackEnded") && s.state.pendingDecision === undefined);

    expect(deletionPrompts(s)).toHaveLength(1);
    expect(opponentDigimonDp(s)).toEqual([9000, 6000]);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("trashes the top security card when an opponent's Digimon is deleted in battle, not when yours is", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "rubeusdramon" },
            { card: vanillaRedLevel3, as: "ally" },
          ],
        },
        1: {
          battleArea: [{ card: vanillaRedLevel6, as: "blocker", dp: 9000, suspended: true }],
          security: opponentSecurity,
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("ally").permanentId,
        target: { kind: "permanent", permanentId: s.perm("blocker").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "attackEnded") && s.state.pendingDecision === undefined);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.state.players[1]!.security).toHaveLength(3);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("rubeusdramon").permanentId,
        target: { kind: "permanent", permanentId: s.perm("blocker").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0 && s.state.pendingDecision === undefined);
    expect(s.state.players[1]!.security).toHaveLength(2);
  });

  it("plays by Assembly for 7 with red level 5, 4 and 3 cards that have [Gemmon] in their text", async () => {
    const { s, result } = await playByAssembly(cardId, [reptilimon, liskmon, gemmon], 7);

    expect(result).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 1 && s.state.pendingDecision === undefined);
    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.battleArea[0]!.stack.map(({ cardId: id }) => id)).toEqual([gemmon, liskmon, reptilimon]);
  });

  it.each([
    ["a red level 4 without [Gemmon] in its text", [reptilimon, vanillaRedLevel4, gemmon]],
    ["a blue [ALYSION] level 4", [reptilimon, blueAlysionLevel4, gemmon]],
    ["two level 5 cards", [reptilimon, reptilimon, gemmon]],
  ])("rejects Assembly with %s", async (_label, materials) => {
    const { result } = await playByAssembly(cardId, materials, 12);

    expect(result).toMatchObject({ ok: false });
  });
});
