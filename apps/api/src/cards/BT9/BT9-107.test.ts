import { describe, expect, it } from "vitest";
import { EffectTiming, getCardDefinition } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT9-107.js";
import "./BT9-107.js";
import "./BT9-109.js";
import "../BT17/BT17-016.js";

describe("BT9-107 Metal Impulse", () => {
  it("matches catalog values and repeated bound De-Digivolve, then-delete, and security IR", () => {
    expect(getCardDefinition("BT9-107")).toMatchObject({
      colors: ["Purple", "Black"],
      kinds: ["Option"],
      playCost: 6,
      securityEffectText: "[Security] Activate this card's [Main] effect.",
    });
    expect(compiled).toMatchObject({
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "Main",
          actions: [
            { kind: "Trash", target: { count: 3, upTo: true }, trackCount: "metalImpulseDiscarded" },
            { kind: "SelectBind", target: { bindAs: "metalImpulseTarget" } },
            {
              kind: "DeDigivolve",
              amount: 1,
              target: {
                filter: { controller: "opponent", kind: ["Digimon"] },
                count: 1,
                fromSelectionRef: "metalImpulseTarget",
              },
              scaling: { unit: "namedCount", countSource: "metalImpulseDiscarded" },
              stopAtLevel: 3,
            },
            { kind: "Delete", target: { filter: { levelComparison: { op: "lte", value: 4 } } } },
          ],
        },
        { trigger: "Security", isSecurity: true, actions: [{ kind: "ActivateMain" }] },
      ],
    });
  });

  it("repeats De-Digivolve 1 on one chosen target, stops at level 3, then chooses a deletion", async () => {
    const s = setupEngine({
      0: {
        battleArea: ["BT9-070", "BT10-022"],
        hand: [
          { card: "BT9-107", as: "option" },
          { card: "BT9-071", as: "discard1" },
          { card: "BT9-072", as: "discard2" },
          { card: "BT9-074", as: "kept" },
        ],
      },
      1: {
        battleArea: [
          {
            card: "BT1-020",
            as: "dedigivolveTarget",
            under: [
              { card: "BT1-001", as: "egg" },
              { card: "BT1-009", as: "level3" },
              { card: "BT1-016", as: "level4" },
            ],
          },
          { card: "BT1-019", as: "deleteTarget" },
        ],
      },
    });
    const oldTopId = s.perm("dedigivolveTarget").topCard.instanceId;
    const level4Id = s.inst("level4").instanceId;
    const level3Id = s.inst("level3").instanceId;
    const eggId = s.inst("egg").instanceId;
    const deleteTargetId = s.perm("deleteTarget").topCard.instanceId;
    s.state.memory = 8;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("option").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");

    const discardChoice = s.decisions.at(-1)!.req;
    expect(discardChoice.sourceCardId).toBe("BT9-107");
    expect(discardChoice.options).toMatchObject({ min: 0, max: 3 });
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: discardChoice.decisionId,
        response: {
          kind: "selectCards",
          instanceIds: [s.inst("discard1").instanceId, s.inst("discard2").instanceId],
        },
      }),
    ).toEqual({ ok: true });

    await settle(() => s.decisions.at(-1)?.req.kind === "chooseTargets");
    const dedigivolveChoice = s.decisions.at(-1)!.req;
    expect(new Set(dedigivolveChoice.options?.candidateInstanceIds)).toEqual(
      new Set([s.perm("dedigivolveTarget").permanentId, s.perm("deleteTarget").permanentId]),
    );
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: dedigivolveChoice.decisionId,
        response: {
          kind: "chooseTargets",
          instanceIds: [s.perm("dedigivolveTarget").permanentId],
        },
      }),
    ).toEqual({ ok: true });

    await settle(() => {
      const latest = s.decisions.at(-1)?.req;
      return latest?.kind === "chooseTargets" && latest.decisionId !== dedigivolveChoice.decisionId;
    });

    expect(s.perm("dedigivolveTarget").topCard.instanceId).toBe(level3Id);
    expect(s.perm("dedigivolveTarget").stack.map(({ instanceId }) => instanceId)).toEqual([eggId]);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([oldTopId, level4Id]),
    );
    expect(s.decisions.filter(({ req }) => req.kind === "chooseTargets")).toHaveLength(2);

    const deleteChoice = s.decisions.at(-1)!.req;
    expect(new Set(deleteChoice.options?.candidateInstanceIds)).toEqual(
      new Set([s.perm("dedigivolveTarget").permanentId, s.perm("deleteTarget").permanentId]),
    );
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: deleteChoice.decisionId,
        response: {
          kind: "chooseTargets",
          instanceIds: [s.perm("deleteTarget").permanentId],
        },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.trash.some(({ instanceId }) => instanceId === deleteTargetId));

    expect(
      s.state.players[1]!.battleArea.some(({ permanentId }) => permanentId === s.perm("dedigivolveTarget").permanentId),
    ).toBe(true);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("kept").instanceId]);
    expect(s.state.memory).toBe(2);
  });

  it("skips De-Digivolve when zero cards are discarded but still performs the Then deletion", async () => {
    const s = setupEngine({
      0: {
        battleArea: ["BT9-070", "BT10-022"],
        hand: [
          { card: "BT9-107", as: "option" },
          { card: "BT9-074", as: "kept" },
        ],
      },
      1: {
        battleArea: [
          {
            card: "BT1-020",
            as: "mustNotDedigivolve",
            under: ["BT1-009", "BT1-016"],
          },
          { card: "BT1-019", as: "deleteTarget" },
        ],
      },
    });
    const originalTopId = s.perm("mustNotDedigivolve").topCard.instanceId;
    const deletedId = s.perm("deleteTarget").topCard.instanceId;
    s.state.memory = 8;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("option").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const discardChoice = s.decisions.at(-1)!.req;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: discardChoice.decisionId,
        response: { kind: "selectCards", instanceIds: [] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.trash.some(({ instanceId }) => instanceId === deletedId));

    expect(s.perm("mustNotDedigivolve").topCard.instanceId).toBe(originalTopId);
    expect(s.perm("mustNotDedigivolve").stack).toHaveLength(2);
    expect(s.decisions.filter(({ req }) => req.kind === "chooseTargets")).toHaveLength(0);
    expect(s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("kept").instanceId)).toBe(true);
  });

  it("trashes an exposed X Antibody with the second De-Digivolve 1, then deletes the level 3 under it (Q1916)", async () => {
    const s = setupEngine({
      0: {
        battleArea: ["BT9-070", "BT10-022"],
        hand: [
          { card: "BT9-107", as: "option" },
          { card: "BT9-071", as: "discard1" },
          { card: "BT9-072", as: "discard2" },
        ],
      },
      1: {
        battleArea: [
          {
            card: "BT1-020",
            as: "host",
            under: [
              { card: "BT1-009", as: "level3" },
              { card: "BT9-109", as: "xAntibody" },
            ],
          },
        ],
      },
    });
    const hostPermanentId = s.perm("host").permanentId;
    const hostCardIds = [
      s.perm("host").topCard.instanceId,
      s.inst("xAntibody").instanceId,
      s.inst("level3").instanceId,
    ];
    s.state.memory = 8;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("option").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const discardChoice = s.decisions.at(-1)!.req;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: discardChoice.decisionId,
        response: {
          kind: "selectCards",
          instanceIds: [s.inst("discard1").instanceId, s.inst("discard2").instanceId],
        },
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.players[1]!.battleArea.some(({ permanentId }) => permanentId === hostPermanentId));

    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual(hostCardIds);
    expect(
      s.events.flatMap((event) =>
        event.kind === "cardsMoved" && event.strippedStackTops?.reason === "deDigivolve" ? event.instanceIds : [],
      ),
    ).toEqual(hostCardIds.slice(0, 2));
  });
});

async function resolveSecurityMetalImpulseAgainstGallantmon(opponentMemory: number) {
  const s = setupEngine(
    {
      0: {
        security: [{ card: "BT9-107", as: "impulse" }],
        hand: ["BT9-071", "BT9-072"],
      },
      1: {
        battleArea: [
          {
            card: "BT1-020",
            as: "host",
            under: [
              { card: "BT1-009", as: "level3" },
              { card: "BT17-016", as: "gallantmon" },
            ],
          },
        ],
      },
    },
    { autoSelectCards: true },
  );
  await s.ready();
  s.state.turnSeat = 1;
  s.state.memory = opponentMemory;
  await s.engine.recomputeContinuousEffects();

  await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("impulse"));
  await settle(() => s.state.pendingDecision === undefined && s.state.players[0]!.hand.length === 0);
  return s;
}

describe("BT9-107 Metal Impulse — KB Q&A rulings", () => {
  it("De-Digivolves only the one chosen Digimon for 2 trashed cards, and the Then deletion may pick another (Q1915)", async () => {
    const s = setupEngine({
      0: {
        battleArea: ["BT9-070", "BT10-022"],
        hand: [
          { card: "BT9-107", as: "option" },
          { card: "BT9-071", as: "discard1" },
          { card: "BT9-072", as: "discard2" },
        ],
      },
      1: {
        battleArea: [
          {
            card: "BT1-020",
            as: "chosen",
            under: [
              { card: "BT1-009", as: "chosenBottom" },
              { card: "BT1-016", as: "chosenLevel4" },
              { card: "BT1-020", as: "chosenLevel5" },
            ],
          },
          { card: "BT1-016", as: "other", under: [{ card: "BT1-009", as: "otherSource" }] },
        ],
      },
    });
    const otherTopId = s.perm("other").topCard.instanceId;
    s.state.memory = 8;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.decisions.at(-1)!.req.decisionId,
        response: {
          kind: "selectCards",
          instanceIds: [s.inst("discard1").instanceId, s.inst("discard2").instanceId],
        },
      }),
    ).toEqual({ ok: true });

    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const dedigivolveChoice = s.decisions.at(-1)!.req;
    expect(dedigivolveChoice.options).toMatchObject({ min: 1, max: 1 });
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: dedigivolveChoice.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("chosen").permanentId] },
      }),
    ).toEqual({ ok: true });

    await settle(() => {
      const latest = s.state.pendingDecision;
      return latest?.kind === "chooseTargets" && latest.decisionId !== dedigivolveChoice.decisionId;
    });
    expect(s.perm("chosen").topCard.instanceId).toBe(s.inst("chosenLevel4").instanceId);
    expect(s.perm("chosen").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("chosenBottom").instanceId]);
    expect(s.perm("other").topCard.instanceId).toBe(otherTopId);
    expect(s.perm("other").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("otherSource").instanceId]);

    const deleteChoice = s.decisions.at(-1)!.req;
    expect(new Set(deleteChoice.options?.candidateInstanceIds)).toEqual(
      new Set([s.perm("chosen").permanentId, s.perm("other").permanentId]),
    );
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: deleteChoice.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("other").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.trash.some(({ instanceId }) => instanceId === otherTopId));

    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([
      s.perm("chosen").permanentId,
    ]);
  });

  it("applies De-Digivolve 1 twice, so an immune card exposed by the first is not trashed by the second (Q1916)", async () => {
    const immune = await resolveSecurityMetalImpulseAgainstGallantmon(0);
    expect(immune.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["BT17-016"]);
    expect(immune.perm("host").topCard.instanceId).toBe(immune.inst("gallantmon").instanceId);
    expect(immune.perm("host").stack.map(({ instanceId }) => instanceId)).toEqual([immune.inst("level3").instanceId]);
    expect(immune.state.players[1]!.trash.map(({ cardId }) => cardId)).toEqual(["BT1-020"]);

    const notImmune = await resolveSecurityMetalImpulseAgainstGallantmon(1);
    expect(notImmune.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([notImmune.inst("gallantmon").instanceId]),
    );
  });
});
