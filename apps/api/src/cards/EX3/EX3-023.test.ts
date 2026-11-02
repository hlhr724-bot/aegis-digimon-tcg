import { getCardDefinition, getCompiledCard } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "./EX3-023.js";

describe("EX3-023 Plesiomon", () => {
  it("has the official errata identity and corrected inherited text", () => {
    const definition = getCardDefinition("EX3-023")!;
    expect(definition).toMatchObject({
      cardId: "EX3-023",
      nameEn: "Plesiomon",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 11,
      dp: 11000,
      evoCosts: [{ color: "Blue", level: 5, memoryCost: 3 }],
      forms: ["Mega"],
      attributes: ["Data"],
      types: ["Plesiosaur"],
      rarity: "U",
      imageId: "EX3-023-Errata",
    });
    expect(definition.effectText).toContain("[Aqua] or [Sea Animal]");
    expect(definition.inheritedEffectText).toContain("you may return");
    expect(definition.inheritedEffectText).not.toContain("you may you may");
  });

  it("publishes the errata source-play filters, bottom placement, and once-per-turn bounce", () => {
    expect(getCompiledCard("EX3-023")).toMatchObject({
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
                  orFilters: [
                    {
                      levelComparison: { op: "lte", value: 4 },
                      traitContains: ["Aqua", "Sea Animal"],
                      hostFilter: { controllerDefault: "mine", kind: ["Digimon"], colors: ["Blue"] },
                    },
                  ],
                },
                count: 1,
              },
            },
            {
              kind: "PlaceUnder",
              position: "bottom",
              optional: true,
              underFilter: { isSelfRef: true },
            },
          ],
        },
        {
          trigger: "AllTurns",
          isInherited: true,
          frequency: "OncePerTurn",
          actions: [
            {
              kind: "SubTrigger",
              event: "whenPlayed",
              sourceFilter: { controllerDefault: "mine", kind: ["Digimon"], fromDigivolution: true },
              actions: [
                {
                  kind: "Return",
                  to: "deckBottom",
                  optional: true,
                  target: {
                    filter: { controller: "opponent", kind: ["Digimon"], levelEqTriggerSource: true },
                    count: 1,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("Plesiosaur family: supports both errata play branches and places a chosen blue hand card at its own bottom", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT10-022", as: "plesiosaurBase" },
          {
            card: "BT1-033",
            under: [
              { card: "BT1-029", as: "blueLevel3" },
              { card: "BT14-008", as: "redSeaAnimalLevel3" },
              { card: "EX3-019", as: "invalidBlueLevel4" },
              { card: "BT2-029", as: "invalidAquaticLevel5" },
            ],
            as: "blueSourceHost",
          },
          { card: "BT1-010", under: [{ card: "BT1-030", as: "invalidBlueUnderRed" }], as: "redHost" },
        ],
        hand: [
          { card: "EX3-023", as: "plesiomon" },
          { card: "BT1-030", as: "firstBlueToPlace" },
          { card: "BT1-031", as: "secondBlueToPlace" },
          { card: "BT1-009", as: "invalidRedToPlace" },
        ],
        deck: ["BT1-030"],
      },
    });
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("plesiosaurBase").permanentId,
        instanceId: s.inst("plesiomon").instanceId,
      }),
    ).toEqual({ ok: true });

    await settle(() => s.state.pendingDecision?.kind === "optional");
    const playOptional = s.state.pendingDecision!;
    expect(s.decisions.at(-1)!.req.sourceCardId).toBe("EX3-023");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: playOptional.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });

    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const playChoice = s.state.pendingDecision!;
    const playPayload = JSON.parse(playChoice.payloadJson) as {
      candidateInstanceIds: string[];
      visibleInstanceIds: string[];
    };
    expect(playPayload.candidateInstanceIds).toEqual(
      expect.arrayContaining([s.inst("blueLevel3").instanceId, s.inst("redSeaAnimalLevel3").instanceId]),
    );
    expect(playPayload.candidateInstanceIds).not.toContain(s.inst("invalidBlueLevel4").instanceId);
    expect(playPayload.candidateInstanceIds).not.toContain(s.inst("invalidAquaticLevel5").instanceId);
    expect(playPayload.candidateInstanceIds).not.toContain(s.inst("invalidBlueUnderRed").instanceId);
    expect(playPayload.candidateInstanceIds.sort()).toEqual(
      [s.inst("blueLevel3").instanceId, s.inst("redSeaAnimalLevel3").instanceId].sort(),
    );
    expect(playPayload.visibleInstanceIds).toHaveLength(5);
    expect(playPayload.visibleInstanceIds).toEqual(
      expect.arrayContaining(
        ["blueLevel3", "redSeaAnimalLevel3", "invalidBlueLevel4", "invalidAquaticLevel5"].map(
          (alias) => s.inst(alias).instanceId,
        ),
      ),
    );
    expect(playPayload.visibleInstanceIds).not.toContain(s.inst("invalidBlueUnderRed").instanceId);
    expect(s.decisions.at(-1)!.req).toMatchObject({
      sourceCardId: "EX3-023",
      options: { min: 0, max: 1, timing: "WhenDigivolving", effectText: expect.stringContaining("play 1 blue") },
    });
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: playChoice.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("redSeaAnimalLevel3").instanceId] },
      }),
    ).toEqual({ ok: true });

    await settle(() => s.state.pendingDecision?.kind === "optional");
    const placeOptional = s.state.pendingDecision!;
    expect(s.decisions.at(-1)!.req.sourceCardId).toBe("EX3-023");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: placeOptional.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });

    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const placeChoice = s.state.pendingDecision!;
    const placePayload = JSON.parse(placeChoice.payloadJson) as { candidateInstanceIds: string[] };
    expect(placePayload.candidateInstanceIds).toEqual(
      expect.arrayContaining([s.inst("firstBlueToPlace").instanceId, s.inst("secondBlueToPlace").instanceId]),
    );
    expect(placePayload.candidateInstanceIds).not.toContain(s.inst("invalidRedToPlace").instanceId);
    expect(placePayload.candidateInstanceIds).toHaveLength(3);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: placeChoice.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("firstBlueToPlace").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("plesiosaurBase").stack[0]?.instanceId === s.inst("firstBlueToPlace").instanceId);

    expect(s.state.memory).toBe(0);
    expect(s.perm("plesiosaurBase").stack.map(({ cardId }) => cardId)).toContain("BT10-022");
    expect(
      s.state.players[0]!.battleArea.some(
        ({ topCard }) => topCard.instanceId === s.inst("redSeaAnimalLevel3").instanceId,
      ),
    ).toBe(true);
    expect(s.perm("plesiosaurBase").stack[0]!.instanceId).toBe(s.inst("firstBlueToPlace").instanceId);
    expect(s.perm("blueSourceHost").stack.map(({ instanceId }) => instanceId)).not.toContain(
      s.inst("redSeaAnimalLevel3").instanceId,
    );
  });

  it("rejects an invalid level-5 evolution source and keeps Plesiomon in hand", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-075", as: "wrongColor" }],
        hand: [{ card: "EX3-023", as: "plesiomon" }],
      },
    });
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("wrongColor").permanentId,
        instanceId: s.inst("plesiomon").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(s.perm("wrongColor").stack.map(({ cardId }) => cardId)).toEqual([]);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain("EX3-023");
  });

  it("the two optional clauses are independent: declining the play still allows placement under Plesiomon", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT10-022", as: "base" },
            { card: "BT1-033", under: [{ card: "BT1-029", as: "playable" }], as: "sourceHost" },
          ],
          hand: [
            { card: "EX3-023", as: "plesiomon" },
            { card: "BT1-030", as: "toPlace" },
          ],
          deck: ["BT1-031"],
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("toPlace").instanceId);
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("plesiomon").instanceId,
      }),
    ).toEqual({ ok: true });

    await settle(() => s.state.pendingDecision?.kind === "optional");
    const playOptional = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: playOptional.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const placeOptional = s.state.pendingDecision!;
    expect(placeOptional.decisionId).not.toBe(playOptional.decisionId);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: placeOptional.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").stack[0]?.instanceId === s.inst("toPlace").instanceId);

    expect(s.perm("sourceHost").stack.map(({ instanceId }) => instanceId)).toContain(s.inst("playable").instanceId);
    expect(s.perm("base").stack[0]!.instanceId).toBe(s.inst("toPlace").instanceId);
  });

  it("still offers PlaceUnder when the play clause has no candidates", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT10-022", as: "base" }],
        hand: [
          { card: "EX3-023", as: "plesiomon" },
          { card: "BT1-030", as: "toPlace" },
        ],
        deck: ["BT1-031"],
      },
    });
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("plesiomon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");

    const placeOptional = s.state.pendingDecision!;
    expect(s.decisions).toHaveLength(1);
    expect(s.decisions[0]!.req).toMatchObject({
      sourceCardId: "EX3-023",
      kind: "optional",
      options: { timing: "WhenDigivolving", effectText: expect.stringContaining("place 1 blue Digimon") },
    });
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: placeOptional.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const choice = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: choice.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("toPlace").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").stack[0]?.instanceId === s.inst("toPlace").instanceId);

    expect(s.perm("base").stack[0]!.instanceId).toBe(s.inst("toPlace").instanceId);
  });

  it("Q2109 does not retroactively activate a Plesiomon inherited effect placed after the source play", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT10-022", as: "base" },
            { card: "BT1-033", under: [{ card: "EX3-017", as: "playedLevel4" }], as: "sourceHost" },
          ],
          hand: [
            { card: "EX3-023", as: "topPlesiomon" },
            { card: "EX3-023", as: "lateInherited" },
          ],
          deck: ["BT1-030"],
        },
        1: { battleArea: [{ card: "BT1-033", as: "sameLevelOpponent" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("playedLevel4").instanceId, s.inst("lateInherited").instanceId);
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("topPlesiomon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.perm("base").stack.some(({ instanceId }) => instanceId === s.inst("lateInherited").instanceId),
    );

    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toContain(
      s.perm("sameLevelOpponent").permanentId,
    );
    expect(
      s.decisions.filter(({ req }) => req.sourceCardId === "EX3-023" && req.options?.timing === "AllTurns"),
    ).toHaveLength(0);
  });

  it("inherited watcher returns only the exact played level to deck bottom and ignores hand plays", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-033", under: ["EX3-023"], as: "watcherHost" },
            { card: "BT1-033", under: [{ card: "BT14-008", as: "fromSource" }], as: "sourceHost" },
          ],
          hand: [{ card: "BT1-029", as: "fromHand" }],
        },
        1: {
          battleArea: [
            { card: "BT1-031", as: "firstLevel3" },
            { card: "BT1-030", as: "secondLevel3" },
            { card: "BT1-033", as: "level4" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("firstLevel3").permanentId);
    await s.ready();
    const firstLevel3Id = s.perm("firstLevel3").permanentId;
    const secondLevel3Id = s.perm("secondLevel3").permanentId;

    await advance(s.engine).verb.playInstances([s.inst("fromHand").instanceId]);
    expect(s.state.players[1]!.battleArea).toHaveLength(3);
    expect(s.decisions.filter(({ req }) => req.sourceCardId === "EX3-023")).toHaveLength(0);

    await advance(s.engine).verb.playInstances([s.inst("fromSource").instanceId]);
    await settle(() => s.state.players[1]!.deck.some(({ cardId }) => cardId === "BT1-031"));

    const returnDecision = s.decisions.find(
      ({ req }) => req.sourceCardId === "EX3-023" && req.kind === "chooseTargets",
    )!.req;
    expect(returnDecision).toMatchObject({
      seat: 0,
      sourceCardId: "EX3-023",
      options: {
        min: 0,
        max: 1,
        effectText: expect.stringContaining("same level"),
        candidateInstanceIds: expect.arrayContaining([firstLevel3Id, secondLevel3Id]),
      },
    });
    expect(returnDecision.options!.candidateInstanceIds).toHaveLength(2);
    expect(returnDecision.options!.visibleInstanceIds?.sort()).toEqual([firstLevel3Id, secondLevel3Id].sort());

    expect(s.state.players[1]!.deck.at(-1)?.cardId).toBe("BT1-031");
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toContain(
      s.perm("secondLevel3").permanentId,
    );
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toContain(
      s.perm("level4").permanentId,
    );
  });

  it("two inherited copies each trigger once, then both are exhausted for another source play that turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-033", under: ["EX3-023", "EX3-023"], as: "watcherHost" },
            {
              card: "BT1-033",
              under: [
                { card: "BT14-008", as: "firstPlay" },
                { card: "BT15-068", as: "secondPlay" },
              ],
              as: "sourceHost",
            },
          ],
        },
        1: {
          battleArea: [
            { card: "BT1-029", as: "opponent1" },
            { card: "BT1-030", as: "opponent2" },
            { card: "BT1-031", as: "opponent3" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();

    await advance(s.engine).verb.playInstances([s.inst("firstPlay").instanceId]);
    await settle(() => s.state.players[1]!.battleArea.length === 1);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);

    await advance(s.engine).verb.playInstances([s.inst("secondPlay").instanceId]);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });

  it("resets the inherited once-per-turn watcher on the next turn", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-033", under: ["EX3-023"], as: "watcherHost" },
            {
              card: "BT1-033",
              under: [
                { card: "BT14-008", as: "firstPlay" },
                { card: "BT1-029", as: "secondPlay" },
                { card: "BT1-031", as: "thirdPlay" },
              ],
              as: "sourceHost",
            },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011"],
        },
        1: {
          battleArea: [
            { card: "BT1-029", as: "firstTarget" },
            { card: "BT1-030", as: "secondTarget" },
          ],
          deck: ["BT1-012", "BT1-013", "BT1-014"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("firstTarget").permanentId, s.perm("secondTarget").permanentId);
    await s.ready();

    await advance(s.engine).verb.playInstances([s.inst("firstPlay").instanceId]);
    await settle(() => s.state.players[1]!.battleArea.length === 1);
    await advance(s.engine).verb.playInstances([s.inst("thirdPlay").instanceId]);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);

    const firstTurn = s.state.turnCount;
    await advance(s.engine).runTurn(0);
    expect(s.state.turnCount).toBeGreaterThan(firstTurn);
    await advance(s.engine).verb.playInstances([s.inst("secondPlay").instanceId]);
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  });

  it("plays a level 4 source whose [Aquatic] trait comes only from its [Rule] text (GitHub #5181 sweep)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT10-022", as: "base" },
            { card: "BT1-033", under: [{ card: "EX12-026", as: "shellmon" }], as: "sourceHost" },
          ],
          hand: [{ card: "EX3-023", as: "plesiomon" }],
          deck: ["BT1-031"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();
    const shellmonId = s.inst("shellmon").instanceId;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("plesiomon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === shellmonId));

    expect(s.perm("sourceHost").stack.map(({ instanceId }) => instanceId)).not.toContain(shellmonId);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === shellmonId)).toBe(true);
  });
});
