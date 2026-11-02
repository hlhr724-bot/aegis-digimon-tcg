import { getCardDefinition, getCompiledCard, Phase, type DecisionResponse } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle, type EngineSetup } from "../../engine/testkit/harness.js";
import "./EX3-023.js";
import "./EX3-026.js";
import "../index.js";

function candidateIds(payloadJson: string): string[] {
  return (JSON.parse(payloadJson) as { candidateInstanceIds?: string[] }).candidateInstanceIds ?? [];
}

function payload(decision: { payloadJson: string }) {
  return JSON.parse(decision.payloadJson) as {
    candidateInstanceIds?: string[];
    visibleInstanceIds?: string[];
    visibleCards?: { instanceId: string; cardId: string }[];
    timing?: string;
    effectText?: string;
    min?: number;
    max?: number;
  };
}

function respond(s: EngineSetup, response: DecisionResponse): void {
  const decision = s.state.pendingDecision!;
  expect(
    s.engine.applyIntent(decision.seat, {
      type: "respondDecision",
      decisionId: decision.decisionId,
      response,
    }),
  ).toEqual({ ok: true });
}

describe("EX3-026 Aegisdramon", () => {
  it("has the official errata identity and digivolves from a blue level 6 for 4", async () => {
    const definition = getCardDefinition("EX3-026")!;
    expect(definition).toMatchObject({
      cardId: "EX3-026",
      nameEn: "Aegisdramon",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 7,
      playCost: 14,
      dp: 14000,
      evoCosts: [{ color: "Blue", level: 6, memoryCost: 4 }],
      forms: ["Mega"],
      attributes: ["Vaccine"],
      types: ["Cyborg"],
      rarity: "SR",
      imageId: "EX3-026-Errata",
    });
    expect(definition.effectText).toContain("[Aqua] or [Sea Animal]");
    expect(definition.effectText).toContain("[Opponent's Turn][Once Per Turn]");
    expect(definition.inheritedEffectText).toBeUndefined();

    expect(getCompiledCard("EX3-026")).toMatchObject({
      coverage: "full",
      residual: [],
      effects: [
        {
          trigger: "WhenDigivolving",
          actions: [
            {
              kind: "PlayWithoutCost",
              from: ["digivolutionCards"],
              payCost: false,
              optional: true,
              target: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  colors: ["Blue"],
                  levels: [3],
                  hostFilter: { controllerDefault: "mine", kind: ["Digimon"], colors: ["Blue"] },
                },
                count: 1,
                orFilters: [
                  { nameOrTrait: [{ tokens: ["Seadramon"], match: "name" }] },
                  { nameOrTrait: [{ tokens: ["Aqua", "Sea Animal"], match: "traitContains" }] },
                ],
              },
            },
          ],
        },
        {
          trigger: "OpponentsTurn",
          frequency: "OncePerTurn",
          actions: [
            {
              kind: "SubTrigger",
              event: "whenPlayed",
              sourceFilter: { controllerDefault: "opponent", kind: ["Digimon"] },
              actions: [
                {
                  kind: "ActivateEffect",
                  effectType: "WhenDigivolving",
                  optional: true,
                  preserveOncePerTurnOnDecline: true,
                },
              ],
            },
          ],
        },
      ],
    });

    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX3-023", as: "base" }],
        hand: [{ card: "EX3-026", as: "aegisdramon" }],
        deck: [{ card: "BT1-009", as: "evolutionDraw" }],
      },
    });
    s.state.memory = 4;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("aegisdramon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "EX3-026");

    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("evolutionDraw").instanceId]);
    expect(s.perm("base").stack.map(({ cardId }) => cardId)).toEqual(["EX3-023"]);
  });

  it("rejects a non-level-6 evolution source and keeps Aegisdramon in hand", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-038", as: "wrongLevel" }],
        hand: [{ card: "EX3-026", as: "aegisdramon" }],
      },
    });
    s.state.memory = 4;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("wrongLevel").permanentId,
        instanceId: s.inst("aegisdramon").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(s.perm("wrongLevel").stack.map(({ cardId }) => cardId)).toEqual([]);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain("EX3-026");
  });

  it("Aqua/Sea Animal family: offers every errata OR branch only from a blue Digimon's sources", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT2-030", as: "baseSeadramon" },
          {
            card: "BT1-033",
            under: [
              { card: "BT1-029", as: "blueLevel3" },
              { card: "BT14-008", as: "redSeaAnimal" },
              { card: "EX3-019", as: "invalidBlueLevel4" },
            ],
            as: "blueHost",
          },
          { card: "BT1-010", under: [{ card: "BT1-030", as: "invalidUnderRed" }], as: "redHost" },
        ],
        hand: [{ card: "EX3-026", as: "aegisdramon" }],
      },
      1: {
        battleArea: [{ card: "BT1-033", under: [{ card: "BT1-029", as: "opponentSource" }] }],
      },
    });
    s.state.memory = 4;
    await s.ready();
    const baseSeadramonId = s.perm("baseSeadramon").topCard.instanceId;
    const opponentSourceId = s.inst("opponentSource").instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("baseSeadramon").permanentId,
        instanceId: s.inst("aegisdramon").instanceId,
      }),
    ).toEqual({ ok: true });

    await settle(() => s.state.pendingDecision?.kind === "optional");
    const optional = s.state.pendingDecision!;
    expect(s.decisions.at(-1)?.req).toMatchObject({ sourceCardId: "EX3-026", kind: "optional" });
    expect(payload(optional)).toMatchObject({
      timing: "WhenDigivolving",
      effectText: expect.stringContaining("[Aqua] or [Sea Animal]"),
    });
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: optional.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });

    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const selection = s.state.pendingDecision!;
    const candidates = candidateIds(selection.payloadJson);
    const eligible = [baseSeadramonId, s.inst("blueLevel3").instanceId, s.inst("redSeaAnimal").instanceId];
    const visible = [...eligible, s.inst("invalidBlueLevel4").instanceId];
    expect(candidates).toEqual(eligible);
    expect(candidates).not.toContain(s.inst("invalidBlueLevel4").instanceId);
    expect(candidates).not.toContain(s.inst("invalidUnderRed").instanceId);
    expect(s.decisions.at(-1)?.req).toMatchObject({ sourceCardId: "EX3-026", kind: "selectCards" });
    expect(payload(selection)).toMatchObject({
      candidateInstanceIds: eligible,
      visibleInstanceIds: visible,
      visibleCards: [
        { instanceId: baseSeadramonId, cardId: "BT2-030" },
        { instanceId: s.inst("blueLevel3").instanceId, cardId: "BT1-029" },
        { instanceId: s.inst("redSeaAnimal").instanceId, cardId: "BT14-008" },
        { instanceId: s.inst("invalidBlueLevel4").instanceId, cardId: "EX3-019" },
      ],
      timing: "WhenDigivolving",
      effectText: expect.stringContaining("without paying its memory cost"),
      min: 0,
      max: 1,
    });
    expect(payload(selection).visibleCards).toHaveLength(4);
    expect(payload(selection).visibleInstanceIds).not.toContain(s.inst("invalidUnderRed").instanceId);
    expect(payload(selection).visibleInstanceIds).not.toContain(opponentSourceId);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: selection.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("redSeaAnimal").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === s.inst("redSeaAnimal").instanceId),
    );

    expect(s.state.memory).toBe(0);
    expect(s.perm("blueHost").stack.map(({ instanceId }) => instanceId)).not.toContain(
      s.inst("redSeaAnimal").instanceId,
    );
  });

  it("opponent-turn family: reactivates only this Digimon's When Digivolving effect once per turn", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          {
            card: "EX3-026",
            under: [
              { card: "BT14-008", as: "firstSeaAnimal" },
              { card: "BT1-029", as: "secondBlueLevel3" },
            ],
            as: "aegisdramon",
          },
          { card: "EX3-023", as: "otherWhenDigivolvingDigimon" },
        ],
      },
      1: {
        hand: [
          { card: "BT1-009", as: "firstOpponentPlay" },
          { card: "BT1-012", as: "secondOpponentPlay" },
        ],
      },
    });
    s.state.turnSeat = 1;
    s.state.memory = 6;
    await s.ready();

    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("firstOpponentPlay").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const reactivate = s.state.pendingDecision!;
    expect(s.decisions.at(-1)!.req).toMatchObject({ sourceCardId: "EX3-026", kind: "optional" });
    expect(payload(reactivate)).toMatchObject({
      timing: "OpponentsTurn",
      effectText: expect.stringContaining("activate 1 of this Digimon's [When Digivolving] effects"),
    });
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: reactivate.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });

    await settle(() => s.state.pendingDecision?.kind === "optional");
    const playOptional = s.state.pendingDecision!;
    expect(s.decisions.at(-1)!.req).toMatchObject({ sourceCardId: "EX3-026", kind: "optional" });
    expect(payload(playOptional)).toMatchObject({
      timing: "WhenDigivolving",
      effectText: expect.stringContaining("without paying its memory cost"),
    });
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: playOptional.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const selection = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: selection.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("firstSeaAnimal").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === s.inst("firstSeaAnimal").instanceId),
    );

    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("secondOpponentPlay").instanceId })).toEqual({
      ok: true,
    });
    await settle();

    expect(
      s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === s.inst("firstSeaAnimal").instanceId),
    ).toBe(true);
    expect(s.perm("aegisdramon").stack.map(({ instanceId }) => instanceId)).toContain(
      s.inst("secondBlueLevel3").instanceId,
    );
    expect(s.decisions.filter(({ req }) => req.sourceCardId === "EX3-026" && req.kind === "optional")).toHaveLength(2);
  });

  it("counts a card whose trait only contains [Aqua] (e.g. [Aquabeast])", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX3-023", as: "base" },
            { card: "BT1-033", under: [{ card: "EX5-060", as: "aquabeast" }], as: "sourceHost" },
          ],
          hand: [{ card: "EX3-026", as: "aegisdramon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("aquabeast").instanceId);
    s.state.memory = 4;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("aegisdramon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === s.inst("aquabeast").instanceId),
    );

    expect(s.perm("sourceHost").stack.map(({ instanceId }) => instanceId)).not.toContain(
      s.inst("aquabeast").instanceId,
    );
  });

  it("allows declining the When Digivolving play without moving a digivolution card", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "EX3-023", as: "base" },
          { card: "BT1-033", under: [{ card: "BT1-029", as: "candidate" }], as: "sourceHost" },
        ],
        hand: [{ card: "EX3-026", as: "aegisdramon" }],
      },
    });
    s.state.memory = 4;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("aegisdramon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const optional = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: optional.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle();

    expect(s.perm("sourceHost").stack.map(({ instanceId }) => instanceId)).toContain(s.inst("candidate").instanceId);
    expect(s.state.players[0]!.battleArea).toHaveLength(2);
  });

  it("does not react to an opponent Digimon being played during Aegisdramon's own turn", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "EX3-026", under: [{ card: "BT1-029" }], as: "aegisdramon" }] },
      1: { hand: [{ card: "BT1-010", as: "opponentPlay" }] },
    });
    s.state.turnSeat = 0;
    await s.ready();

    await advance(s.engine).verb.playInstances([s.inst("opponentPlay").instanceId]);
    await settle();

    expect(s.decisions.filter(({ req }) => req.sourceCardId === "EX3-026")).toHaveLength(0);
    expect(s.perm("aegisdramon").stack).toHaveLength(1);
  });

  it("allows declining the opponent-turn reactivation without consuming a source", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "EX3-026", under: [{ card: "BT1-029" }], as: "aegisdramon" }] },
      1: {
        hand: [
          { card: "BT1-009", as: "firstOpponentPlay" },
          { card: "BT1-012", as: "secondOpponentPlay" },
        ],
      },
    });
    s.state.turnSeat = 1;
    s.state.memory = 6;
    await s.ready();

    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("firstOpponentPlay").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    respond(s, { kind: "optional", accept: false });
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("secondOpponentPlay").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "optional");

    expect(s.perm("aegisdramon").stack).toHaveLength(1);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.decisions.filter(({ req }) => req.sourceCardId === "EX3-026" && req.kind === "optional")).toHaveLength(2);
  });

  it("gives two Aegisdramon independent activations without duplicate subscriptions", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "EX3-026", under: [{ card: "BT1-029" }], as: "firstAegis" },
          { card: "EX3-026", under: [{ card: "BT1-030" }], as: "secondAegis" },
        ],
      },
      1: { hand: [{ card: "BT1-010", as: "opponentPlay" }] },
    });
    s.state.turnSeat = 1;
    s.state.memory = 3;
    await s.ready();
    await advance(s.engine).recompute();
    await advance(s.engine).recompute();

    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("opponentPlay").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    respond(s, { kind: "optional", accept: false });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    respond(s, { kind: "optional", accept: false });
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.decisions.filter(({ req }) => req.sourceCardId === "EX3-026" && req.kind === "optional")).toHaveLength(2);
  });

  it("Q3664 opens one activation for a simultaneous play of multiple opponent Digimon", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "EX3-026", under: [{ card: "BT1-029" }], as: "aegisdramon" }] },
      1: {
        hand: [
          { card: "BT1-010", as: "firstOpponentPlay" },
          { card: "BT1-011", as: "secondOpponentPlay" },
        ],
      },
    });
    s.state.turnSeat = 1;
    await s.ready();

    const play = advance(s.engine).verb.playInstances([
      s.inst("firstOpponentPlay").instanceId,
      s.inst("secondOpponentPlay").instanceId,
    ]);
    await settle(() => s.state.pendingDecision?.kind === "optional");
    respond(s, { kind: "optional", accept: false });
    await play;

    expect(s.decisions.filter(({ req }) => req.sourceCardId === "EX3-026" && req.kind === "optional")).toHaveLength(1);
  });

  it("resets the accepted opponent-turn activation on the next turn", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX3-026", under: [{ card: "BT1-029" }], as: "aegisdramon" }],
        deck: ["BT1-009", "BT1-010", "BT1-011"],
      },
      1: {
        hand: [
          { card: "BT1-010", as: "firstPlay" },
          { card: "BT1-011", as: "blockedSameTurn" },
          { card: "BT1-012", as: "nextTurnPlay" },
        ],
        deck: [
          "BT1-012",
          "BT1-013",
          "BT1-014",
          "BT1-012",
          "BT1-013",
          "BT1-014",
          "BT1-009",
          "BT1-012",
          "BT1-013",
          "BT1-014",
          "BT1-012",
          "BT1-013",
          "BT1-014",
          "BT1-009",
        ],
      },
    });
    s.state.turnSeat = 1;
    const firstTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    s.state.memory = 9;

    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("firstPlay").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    respond(s, { kind: "optional", accept: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    respond(s, { kind: "optional", accept: false });
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("blockedSameTurn").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.decisions.filter(({ req }) => req.sourceCardId === "EX3-026" && req.kind === "optional")).toHaveLength(2);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await firstTurn;

    s.state.turnSeat = 0;
    s.state.memory = 0;
    const ownerTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await ownerTurn;

    s.state.turnSeat = 1;
    s.state.memory = 3;
    const nextOpponentTurn = s.engine.runOneTurn();
    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 1, 20000);
    if (s.state.phase === Phase.Breeding) s.engine.applyIntent(1, { type: "endPhase" });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("nextTurnPlay").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "optional");

    expect(s.decisions.filter(({ req }) => req.sourceCardId === "EX3-026" && req.kind === "optional")).toHaveLength(3);
    respond(s, { kind: "optional", accept: false });
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await nextOpponentTurn;
  });
});
