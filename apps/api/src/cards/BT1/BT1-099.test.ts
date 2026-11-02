import { Phase, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT1-099.js";

async function setupPublicOpponentStack() {
  const s = setupEngine(
    {
      0: {
        battleArea: [{ card: "BT1-028", as: "ownLoaded" }],
        hand: [{ card: "BT1-099", as: "option" }],
        deck: ["BT1-029", "BT1-030", "BT1-031", "BT1-032", "BT1-033"],
      },
      1: {
        battleArea: [{ card: "BT1-021", as: "emptyTarget" }],
        eggDeck: [{ card: "BT1-001", as: "egg" }],
        hand: [
          { card: "BT1-010", as: "lv3" },
          { card: "BT1-014", as: "lv4" },
          { card: "BT1-021", as: "lv5" },
        ],
        deck: ["BT1-029", "BT1-030", "BT1-031", "BT1-032", "BT1-033", "BT1-034", "BT1-035", "BT1-036"],
      },
    },
    { autoSelectCards: false },
  );
  const loop = s.engine.startTurnLoop();

  await advance(s.engine).waitForMainPhase(0);
  advance(s.engine).endMainPhaseIfOpen(0);
  await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 1);
  expect(s.engine.applyIntent(1, { type: "hatchEgg" })).toEqual({ ok: true });
  const breedingPermanentId = s.state.players[1]!.breeding!.permanentId;
  await advance(s.engine).waitForMainPhase(1);
  s.state.memory = 5;

  for (const alias of ["lv3", "lv4", "lv5"] as const) {
    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: breedingPermanentId,
        instanceId: s.inst(alias).instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.breeding?.topCard?.instanceId === s.inst(alias).instanceId);
  }
  expect(s.state.players[1]!.breeding!.stack.map(({ cardId }) => cardId)).toEqual(["BT1-001", "BT1-010", "BT1-014"]);

  advance(s.engine).endMainPhaseIfOpen(1);
  await advance(s.engine).waitForMainPhase(0);
  advance(s.engine).endMainPhaseIfOpen(0);
  await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 1);
  expect(s.engine.applyIntent(1, { type: "moveFromBreeding", permanentId: breedingPermanentId })).toEqual({ ok: true });
  await settle(() => s.state.players[1]!.battleArea.some(({ permanentId }) => permanentId === breedingPermanentId));
  const loadedTarget = s.state.players[1]!.battleArea.find(({ permanentId }) => permanentId === breedingPermanentId)!;

  advance(s.engine).endMainPhaseIfOpen(1);
  await advance(s.engine).waitForMainPhase(0);
  s.state.memory = 3;
  return { s, loop, loadedTarget };
}

describe("BT1-099 Hearts Attack", () => {
  it("matches the catalog and compiles one opposing Digimon target with all-source trash", () => {
    expect(getCardDefinition("BT1-099")).toMatchObject({
      cardId: "BT1-099",
      set: "BT1",
      nameEn: "Hearts Attack",
      colors: ["Blue"],
      kinds: ["Option"],
      playCost: 3,
      dp: 0,
      evoCosts: [],
      effectText: "[Main] Trash all digivolution cards under 1 of your opponent's Digimon.",
      rarity: "C",
      maxCountInDeck: 4,
      imageId: "BT1-099",
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects).toEqual([
      {
        trigger: "Main",
        actions: [
          {
            effectTextPart: "[Main] Trash all digivolution cards under 1 of your opponent's Digimon.",
            kind: "TrashDigivolution",
            target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
            amount: "all",
          },
        ],
      },
    ]);
  });

  it("lets the UI distinguish identical Digimon and trashes every source of the selected one", async () => {
    const { s, loop, loadedTarget } = await setupPublicOpponentStack();
    const loadedSourceIds = [...loadedTarget.stack].map(({ instanceId }) => instanceId);

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("option").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");

    const decision = s.decisions.at(-1)!.req;
    expect(decision.sourceCardId).toBe("BT1-099");
    expect(decision.options?.min).toBe(1);
    expect(decision.options?.max).toBe(1);
    expect(decision.options?.candidateInstanceIds).toEqual([
      s.perm("emptyTarget").permanentId,
      loadedTarget.permanentId,
    ]);
    expect(s.perm("emptyTarget").stack).toHaveLength(0);
    expect(loadedTarget.stack).toHaveLength(3);

    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: {
          kind: "chooseTargets",
          instanceIds: [loadedTarget.permanentId],
        },
      }),
    ).toEqual({ ok: true });
    await settle(() => loadedTarget.stack.length === 0);

    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining(loadedSourceIds),
    );
    expect(s.perm("emptyTarget").stack).toHaveLength(0);
    expect(s.perm("ownLoaded").stack).toHaveLength(0);
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("Q964 legally resolves against an empty stack without touching the other Digimon", async () => {
    const { s, loop, loadedTarget } = await setupPublicOpponentStack();
    const optionInstanceId = s.inst("option").instanceId;
    const loadedSourceIds = [...loadedTarget.stack].map(({ instanceId }) => instanceId);

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: optionInstanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const decision = s.decisions.at(-1)!.req;

    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: {
          kind: "chooseTargets",
          instanceIds: [s.perm("emptyTarget").permanentId],
        },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some(({ instanceId }) => instanceId === optionInstanceId));

    expect(loadedTarget.stack.map(({ instanceId }) => instanceId)).toEqual(loadedSourceIds);
    expect(s.state.players[1]!.trash).toHaveLength(0);
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});
