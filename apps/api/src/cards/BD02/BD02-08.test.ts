import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { advance } from "../../engine/testkit/advance.js";
import { drainMicrotasks, settle, setupEngine, type EngineSetup } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";

const cardId = "BD02-08";
const blueAlysion = "BD02-03";
const otherBlueAlysion = "BD02-04";
const redAlysion = "BD01-03";
const blueWithoutAlysion = "BT1-037";

async function memoryAtMainPhaseWith(digimon: readonly string[]) {
  const s = setupEngine({
    0: {
      battleArea: [{ card: cardId, as: "valner" }, ...digimon.map((card, index) => ({ card, as: `digimon${index}` }))],
      deck: ["BT1-009", "BT1-009"],
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

function mainEffectKey(s: EngineSetup) {
  const entries = JSON.parse(s.perm("valner").activatableEffectsJson || "[]") as { effectKey: string }[];
  expect(entries).toHaveLength(1);
  return entries[0]!.effectKey;
}

function activateMain(s: EngineSetup) {
  return s.engine.applyIntent(0, {
    type: "activateEffect",
    sourceInstanceId: s.perm("valner").topCard!.instanceId,
    effectKey: mainEffectKey(s),
  });
}

async function boardWithValner(options: { preferred?: string; decline?: boolean } = {}) {
  const preferInstanceIds: string[] = [];
  const s = setupEngine(
    {
      0: {
        battleArea: [
          { card: cardId, as: "valner" },
          { card: blueAlysion, as: "blueAlysion" },
          { card: otherBlueAlysion, as: "otherBlueAlysion" },
          { card: redAlysion, as: "redAlysion" },
          { card: blueWithoutAlysion, as: "blueWithoutAlysion" },
        ],
      },
      1: { battleArea: [{ card: blueAlysion, as: "opponentAlysion" }] },
    },
    options.decline
      ? { autoSelectCards: true, autoDeclineOptional: true, preferInstanceIds }
      : { autoSelectCards: true, autoAcceptOptional: true, preferInstanceIds },
  );
  if (options.preferred) preferInstanceIds.push(s.perm(options.preferred).topCard!.instanceId);
  await s.ready();
  return s;
}

function piercingHolders(s: EngineSetup) {
  return ["blueAlysion", "otherBlueAlysion", "redAlysion", "blueWithoutAlysion", "opponentAlysion"].filter((alias) =>
    observe(s.engine).hasPierce(s.perm(alias)),
  );
}

describe("BD02-08 Valner Dragnogh", () => {
  it("matches the printed card", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      set: "BD02",
      nameEn: "Valner Dragnogh",
      nameJp: "ヴァルナー・ドラグノフ",
      colors: ["Blue"],
      kinds: ["Tamer"],
      playCost: 3,
      dp: 0,
      evoCosts: [],
      types: ["ALYSION"],
      rarity: "U",
      effectText:
        "[Start of Your Main Phase] If you have a blue Digimon with the [ALYSION] trait, gain 1 memory.\n[Main] By suspending this Tamer, 1 of your blue Digimon with the [ALYSION] trait gains ＜Piercing＞ for the turn. (When this Digimon deletes your opponent's Digimon in battle while attacking, it checks security before the attack ends.)",
      securityEffectText: "[Security] Play this card without paying the cost.",
    });
    expect(getCardDefinition(cardId)!.inheritedEffectText).toBeUndefined();
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
  });

  it("gains 1 memory at the start of the main phase with a blue ALYSION Digimon", async () => {
    expect(await memoryAtMainPhaseWith([blueAlysion])).toBe(4);
  });

  it("gains no memory with only a red ALYSION Digimon or a blue non-ALYSION Digimon", async () => {
    expect(await memoryAtMainPhaseWith([redAlysion, blueWithoutAlysion])).toBe(3);
  });

  it("offers only your blue ALYSION Digimon and grants the chosen one Piercing by suspending itself", async () => {
    const s = await boardWithValner({ preferred: "otherBlueAlysion" });

    expect(activateMain(s)).toEqual({ ok: true });
    await settle(() => s.perm("valner").isSuspended && piercingHolders(s).length === 1);

    const targeting = s.decisions.find(
      (decision) => decision.req.kind === "chooseTargets" || decision.req.kind === "selectCards",
    );
    const candidates = targeting?.req.options?.candidateInstanceIds ?? [];
    const offered = ["blueAlysion", "otherBlueAlysion", "redAlysion", "blueWithoutAlysion", "opponentAlysion"].filter(
      (alias) =>
        candidates.includes(s.perm(alias).permanentId) || candidates.includes(s.perm(alias).topCard!.instanceId),
    );
    expect(offered).toEqual(["blueAlysion", "otherBlueAlysion"]);
    expect(piercingHolders(s)).toEqual(["otherBlueAlysion"]);
  });

  it("keeps Piercing only for the turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "valner" },
            { card: blueAlysion, as: "blueAlysion" },
          ],
          deck: ["BT1-009", "BT1-009"],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    await s.ready();
    const ownTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    await drainMicrotasks(20);

    expect(activateMain(s)).toEqual({ ok: true });
    await settle(() => observe(s.engine).hasPierce(s.perm("blueAlysion")));
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await ownTurn;

    expect(observe(s.engine).hasPierce(s.perm("blueAlysion"))).toBe(false);
  });

  it("stays active and grants nothing when the suspend cost is declined", async () => {
    const s = await boardWithValner({ decline: true });

    expect(activateMain(s)).toEqual({ ok: true });
    await drainMicrotasks(40);

    expect(s.perm("valner").isSuspended).toBe(false);
    expect(piercingHolders(s)).toEqual([]);
  });

  it("cannot be activated while suspended", async () => {
    const s = await boardWithValner();
    const effectKey = mainEffectKey(s);
    s.perm("valner").isSuspended = true;

    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("valner").topCard!.instanceId,
        effectKey,
      }).ok,
    ).toBe(false);
    await drainMicrotasks(20);
    expect(piercingHolders(s)).toEqual([]);
  });

  it("lets the Piercing Digimon check security after deleting a Digimon in battle", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "valner" },
            { card: otherBlueAlysion, as: "attacker" },
          ],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "blocker", suspended: true }],
          security: ["BT1-009", "BT1-009"],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: true, preferInstanceIds },
    );
    preferInstanceIds.push(s.perm("attacker").topCard!.instanceId);
    await s.ready();

    expect(activateMain(s)).toEqual({ ok: true });
    await settle(() => observe(s.engine).hasPierce(s.perm("attacker")));
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("blocker").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 1, 5000);

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  });

  it("plays itself without paying the cost when revealed as a security card", async () => {
    const s = setupEngine(
      {
        0: { security: [{ card: cardId, as: "valner" }] },
        1: { battleArea: [{ card: "BT1-009", as: "attacker" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    const memoryBeforeAttack = s.state.memory;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === cardId));

    expect(s.state.players[0]!.security).toHaveLength(0);
    expect(s.state.memory).toBe(memoryBeforeAttack);
  });
});
