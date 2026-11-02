import { describe, expect, it } from "vitest";
import { assemblyRequirementFor, digivolutionRequirementsFor, getCardDefinition } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT26-079.js";
import "../index.js";

describe("BT26-079 compiled behavior", () => {
  it("proves evolution, Assembly, Trash Main, keywords, Decode, and the repeatable delete cost", () => {
    expect(getCardDefinition("BT26-079")).toMatchObject({
      nameEn: "ZombiePlutomon",
      colors: ["Purple"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 12,
      dp: 12000,
      types: ["Undead", "Titan", "TS"],
    });
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(compiled.effects.find((effect) => effect.trigger === "AllTurns")?.actions[0]).toMatchObject({
      kind: "SubTrigger",
      actions: [
        { kind: "Trash", target: { untilHandSize: 4 } },
        { kind: "Trash", target: { untilHandSize: 4 }, chooser: "opponent" },
      ],
    });
    expect(compiled.digivolutionRequirement).toEqual([
      { namesExact: ["Plutomon"], cost: 1, isAlternate: true },
      { level: 5, traits: ["TS"], cost: 3, isAlternate: true },
    ]);
    expect(compiled.assemblyRequirement).toEqual([
      { reduceCost: 2, materials: [{ namesExact: ["Plutomon"], count: 1 }] },
    ]);
    expect(digivolutionRequirementsFor("BT26-079")).toEqual(compiled.digivolutionRequirement);
    expect(assemblyRequirementFor("BT26-079")).toEqual(compiled.assemblyRequirement);
    expect(compiled.keywords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ keyword: "SecurityAttack", amount: 1 }),
        expect.objectContaining({ keyword: "Decode" }),
        expect.objectContaining({ keyword: "Retaliation" }),
      ]),
    );
    expect(compiled.effects.find((effect) => effect.trigger === "Main")).toMatchObject({
      isFromTrash: true,
      actions: [
        {
          kind: "PlayWithoutCost",
          from: ["trash"],
          reduceCostBy: 4,
          condition: { kind: "handAtMost", value: 5 },
          assembly: {
            target: {
              filter: { zone: "trash", nameOrTrait: [{ tokens: ["Plutomon"], match: "nameExact" }] },
              count: 1,
            },
            reduceCostBy: 2,
          },
        },
      ],
    });
    for (const trigger of ["OnPlay", "WhenDigivolving", "WhenAttacking"]) {
      expect(compiled.effects.find((effect) => effect.trigger === trigger)?.frequency).toBeUndefined();
      expect(compiled.effects.find((effect) => effect.trigger === trigger)?.sharedUseKey).toBeUndefined();
      expect(compiled.effects.find((effect) => effect.trigger === trigger)).toMatchObject({
        actions: [
          {
            kind: "CostGatedBlock",
            cost: { kind: "trash" },
            optional: true,
            abortOnDecline: true,
            actions: [{ kind: "Delete", target: { filter: { levelComparison: { op: "lte", value: 6 } } } }],
          },
        ],
      });
    }
    expect(compiled.effects.find((effect) => effect.trigger === "Static")?.actions[0]).toMatchObject({
      kind: "Replacement",
      event: "wouldLeavePlay",
      mode: "instead",
      actions: [{ kind: "PlayWithoutCost", fromOwnDigivolutionStack: true, payCost: false, playedByDecode: true }],
    });
  });

  it("pays and deletes again when attacking after its digivolution effect in the same turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT26-059", as: "plutomon" }],
          hand: [{ card: "BT26-079", as: "zombie" }, "BT1-009", "BT1-009", "BT1-009"],
          deck: ["BT1-009", "BT1-009"],
        },
        1: {
          battleArea: [
            { card: "BT1-010", as: "firstTarget" },
            { card: "BT1-010", as: "secondTarget" },
          ],
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("plutomon").permanentId,
        instanceId: s.inst("zombie").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("plutomon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.filter((card) => card.cardId === "BT1-009")).toHaveLength(2);
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("pays the deletion cost on each attack after a public unsuspend in the same turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT26-079", as: "zombie" },
            { card: "BT1-084", as: "royalKnight" },
          ],
          hand: ["BT1-009", "BT1-009", { card: "BT10-110", as: "unsuspend" }],
        },
        1: {
          battleArea: [
            { card: "BT1-010", as: "firstTarget" },
            { card: "BT1-010", as: "secondTarget" },
          ],
          security: Array<string>(5).fill("BT1-009"),
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("zombie").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("unsuspend").instanceId })).toEqual({
      ok: true,
    });
    await settle();
    expect(s.perm("zombie").isSuspended).toBe(false);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("zombie").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.filter((card) => card.cardId === "BT1-009")).toHaveLength(2);
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.memory).toBe(7);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("digivolves from Plutomon for 1 and from an off-color level-5 TS Digimon for 3", async () => {
    const fromPlutomon = setupEngine({
      0: {
        battleArea: [{ card: "BT26-059", as: "plutomon" }],
        hand: [{ card: "BT26-079", as: "zombie" }],
        deck: ["BT1-009"],
      },
    });
    fromPlutomon.state.memory = 1;
    await fromPlutomon.ready();
    expect(
      fromPlutomon.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: fromPlutomon.perm("plutomon").permanentId,
        instanceId: fromPlutomon.inst("zombie").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => fromPlutomon.perm("plutomon").topCard.cardId === "BT26-079");
    expect(fromPlutomon.state.memory).toBe(0);

    const fromTs = setupEngine({
      0: {
        battleArea: [{ card: "BT26-015", as: "redTs" }],
        hand: [{ card: "BT26-079", as: "zombie" }],
        deck: ["BT1-009"],
      },
    });
    fromTs.state.memory = 3;
    await fromTs.ready();
    expect(
      fromTs.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: fromTs.perm("redTs").permanentId,
        instanceId: fromTs.inst("zombie").instanceId,
        alternateRequirementIndex: 1,
      }),
    ).toEqual({ ok: true });
    await settle(() => fromTs.perm("redTs").topCard.cardId === "BT26-079");
    expect(fromTs.state.memory).toBe(0);
  });

  it("does not treat ZombiePlutomon as the exact [Plutomon] evolution base", () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT26-079", as: "nearName" }],
        hand: [{ card: "BT26-079", as: "zombie" }],
      },
    });
    s.state.memory = 1;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("nearName").permanentId,
        instanceId: s.inst("zombie").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
  });

  it("declares Assembly during its Trash Main play and stacks the Plutomon for cost 6 (Q7110)", async () => {
    const s = setupEngine(
      {
        0: {
          trash: [
            { card: "BT26-079", as: "zombiePlutomon" },
            { card: "BT26-059", as: "plutomon" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: ["plutomon"] },
    );
    s.state.memory = 6;
    await s.ready();

    const effect = JSON.parse(s.inst("zombiePlutomon").activatableEffectsJson || "[]") as {
      effectKey: string;
    }[];
    expect(effect).toHaveLength(1);
    const activation = s.engine.applyIntent(0, {
      type: "activateEffect",
      sourceInstanceId: s.inst("zombiePlutomon").instanceId,
      effectKey: effect[0]!.effectKey,
    });
    expect(activation).toEqual({ ok: true });
    await settle();

    const played = s.state.players[0]!.battleArea.find(({ topCard }) => topCard?.cardId === "BT26-079");
    expect(played?.stack.map(({ cardId }) => cardId)).toEqual(["BT26-059"]);
    expect(s.state.memory).toBe(0);
  });

  it("rejects ZombiePlutomon as the exact [Plutomon] Assembly material", () => {
    const s = setupEngine({
      0: {
        hand: [{ card: "BT26-079", as: "zombie" }],
        trash: [{ card: "BT26-079", as: "nearName" }],
      },
    });
    s.state.memory = 10;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("zombie").instanceId,
        assembly: { materialInstanceIds: [s.inst("nearName").instanceId] },
      } as never),
    ).toEqual(expect.objectContaining({ ok: false }));
  });

  it("Q7109 keeps Trash Main unavailable outside trash and with more than 5 cards in hand", async () => {
    const onBoard = setupEngine({ 0: { battleArea: [{ card: "BT26-079", as: "zombie" }] } });
    onBoard.state.memory = 12;
    await onBoard.ready();
    expect(JSON.parse(onBoard.inst("zombie").activatableEffectsJson || "[]")).toEqual([]);
    expect(
      onBoard.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: onBoard.inst("zombie").instanceId,
        effectKey: "BT26-079/bogus",
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(onBoard.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toContain("BT26-079");
    expect(onBoard.state.memory).toBe(12);

    const sixCards = setupEngine({
      0: {
        trash: [{ card: "BT26-079", as: "zombie" }],
        hand: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014"],
      },
    });
    sixCards.state.memory = 12;
    await sixCards.ready();
    expect(JSON.parse(sixCards.inst("zombie").activatableEffectsJson || "[]")).toEqual([]);
    expect(
      sixCards.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: sixCards.inst("zombie").instanceId,
        effectKey: "BT26-079/bogus",
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(sixCards.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("BT26-079");
    expect(sixCards.state.memory).toBe(12);
  });

  it("uses the supported dynamic hand-trim action", () => {
    expect(compiled.residual).toEqual([]);
    expect(compiled.effects.find((effect) => effect.trigger === "AllTurns")?.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "SubTrigger",
          event: "whenPlayed",
          sourceFilter: { controller: "opponent", kind: ["Digimon"] },
        }),
        expect.objectContaining({
          kind: "SubTrigger",
          event: "whenAnyDigivolves",
          sourceFilter: { controller: "opponent", kind: ["Digimon"] },
        }),
      ]),
    );
  });

  it("publicly trashes a hand card to delete an opponent's level 6 or lower Digimon", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT26-079", as: "zombiePlutomon" }], hand: [{ card: "BT1-009", as: "cost" }] },
        1: { battleArea: [{ card: "BT26-074", as: "victim" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("zombiePlutomon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle();

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("BT1-009");
  });

  it("does not trash or delete when the activation cost is declined", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT26-079", as: "zombiePlutomon" }], hand: [{ card: "BT1-009" }] },
        1: { battleArea: [{ card: "BT26-074", as: "victim" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("zombiePlutomon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle();

    expect(s.state.players[0]!.hand).toHaveLength(1);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });

  it("pays one hand card to delete through its public attack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT26-079", as: "zombie" }],
          hand: [
            { card: "BT1-009", as: "firstCost" },
            { card: "BT1-010", as: "secondCost" },
          ],
          deck: ["BT1-011", "BT1-012", "BT1-013", "BT1-014", "BT1-009"],
        },
        1: {
          battleArea: [
            { card: "BT26-074", as: "firstVictim" },
            { card: "BT26-074", as: "secondVictim" },
          ],
          security: ["BT1-009", "BT1-010", "BT1-011"],
          deck: ["BT1-011", "BT1-012", "BT1-013"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    const secondAttack = s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("zombie").permanentId,
      target: { kind: "player" },
    });
    expect(secondAttack).toEqual({ ok: true });
    await settle();
    expect(s.state.players[0]!.hand).toHaveLength(1);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("re-enters the hand-trash deletion through a public attack on the following turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT26-079", as: "zombie" }],
          hand: [
            { card: "BT1-009", as: "firstCost" },
            { card: "BT1-010", as: "secondCost" },
          ],
          deck: [
            "BT1-011",
            "BT1-012",
            "BT1-013",
            "BT1-014",
            "BT1-015",
            "BT1-016",
            "BT1-017",
            "BT1-018",
            "BT1-019",
            "BT1-020",
          ],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "firstVictim" },
            { card: "BT1-010", as: "secondVictim" },
          ],
          security: ["BT1-011", "BT1-012"],
          deck: [
            "BT1-013",
            "BT1-014",
            "BT1-015",
            "BT1-016",
            "BT1-017",
            "BT1-018",
            "BT1-019",
            "BT1-020",
            "BT1-021",
            "BT1-022",
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const loop = s.engine.startTurnLoop();
    const firstVictimId = s.perm("firstVictim").permanentId;
    const secondVictimId = s.perm("secondVictim").permanentId;
    await advance(s.engine).waitForMainPhase(0);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("zombie").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.players[1]!.battleArea.some(({ permanentId }) => permanentId === firstVictimId));
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("firstCost").instanceId);

    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await advance(s.engine).waitForMainPhase(0);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("zombie").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.players[1]!.battleArea.some(({ permanentId }) => permanentId === secondVictimId));

    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("secondCost").instanceId);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    await loop;
  });

  it("Q7111 lets each player choose their own cards while trimming both hands to 4", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT26-079", as: "zombie" }],
          hand: [
            { card: "BT1-009", as: "mineA" },
            { card: "BT1-010", as: "mineB" },
            "BT1-011",
            "BT1-012",
            "BT1-013",
            "BT1-014",
          ],
        },
        1: {
          hand: [
            { card: "BT1-009", as: "opponentPlayed" },
            { card: "BT1-009", as: "theirsA" },
            { card: "BT1-010", as: "theirsB" },
            "BT1-010",
            "BT1-011",
            "BT1-012",
            "BT1-013",
          ],
          security: ["BT1-014", "BT1-009"],
          deck: ["BT1-010", "BT1-011", "BT1-012"],
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(
      s.inst("mineA").instanceId,
      s.inst("mineB").instanceId,
      s.inst("theirsA").instanceId,
      s.inst("theirsB").instanceId,
    );
    await s.ready();

    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("opponentPlayed").instanceId })).toEqual({
      ok: true,
    });
    await settle();

    expect(s.state.players[0]!.hand).toHaveLength(4);
    expect(s.state.players[1]!.hand).toHaveLength(4);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([s.inst("mineA").instanceId, s.inst("mineB").instanceId]),
    );
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([s.inst("theirsA").instanceId, s.inst("theirsB").instanceId]),
    );
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("keeps hand trimming once per turn when a later opposing play draws above four cards", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT26-079", as: "zombie" }], hand: Array<string>(6).fill("BT1-009") },
        1: {
          hand: [
            { card: "BT1-009", as: "firstPlay" },
            ...Array<string>(5).fill("BT1-009"),
            { card: "BT1-041", as: "drawTwo" },
          ],
          deck: Array<string>(5).fill("BT1-009"),
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, autoOrderTriggers: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("firstPlay").instanceId })).toEqual({
      ok: true,
    });
    await settle();
    expect(s.state.players[0]!.hand).toHaveLength(4);
    expect(s.state.players[1]!.hand).toHaveLength(4);
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("drawTwo").instanceId })).toEqual({
      ok: true,
    });
    await settle();
    expect(s.state.players[0]!.hand).toHaveLength(4);
    expect(s.state.players[1]!.hand).toHaveLength(5);
    expect(s.state.players[1]!.deck).toHaveLength(3);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("trims both hands through a public opponent play", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT26-079", as: "zombie" }],
          hand: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013"],
        },
        1: {
          hand: [{ card: "BT1-009", as: "opponent" }, "BT1-014", "BT1-009", "BT1-010", "BT1-011", "BT1-012"],
          security: ["BT1-013", "BT1-014"],
          deck: ["BT1-009", "BT1-010", "BT1-011"],
        },
      },
      { autoSelectCards: true },
    );
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("opponent").instanceId })).toEqual({
      ok: true,
    });
    await settle();
    expect(s.state.players[0]!.hand).toHaveLength(4);
    expect(s.state.players[1]!.hand).toHaveLength(4);

    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it.each([false, true])(
    "Discord 1555883726292914187: removes the pending watcher after De-Digivolve (effect evolution: %s)",
    async (byEffect) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT22-044", as: "base", under: ["BT22-004", "BT22-044"] }],
            hand: [{ card: "BT22-056", as: "evolution" }, "BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013"],
            deck: ["BT1-014", "BT1-015"],
          },
          1: {
            battleArea: [{ card: "BT26-079", as: "zombie", under: ["BT26-059"] }],
            hand: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014"],
          },
        },
        { autoSelectCards: true, autoAcceptOptional: true },
      );
      s.state.memory = 10;
      await s.ready();
      const inherited = s.perm("base").stack.find(({ cardId }) => cardId === "BT22-044")!;
      const effects = JSON.parse(s.perm("base").activatableEffectsJson || "[]") as { effectKey: string }[];
      expect(
        s.engine.applyIntent(
          0,
          byEffect
            ? {
                type: "activateEffect",
                sourceInstanceId: inherited.instanceId,
                effectKey: effects[0]!.effectKey,
              }
            : {
                type: "digivolve",
                permanentId: s.perm("base").permanentId,
                instanceId: s.inst("evolution").instanceId,
              },
        ),
      ).toEqual({ ok: true });
      await settle();
      expect(s.perm("zombie").topCard.cardId).toBe("BT26-059");
      expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toContain("BT26-079");
      expect(s.state.players[0]!.hand).toHaveLength(byEffect ? 7 : 6);
      expect(s.state.players[1]!.hand).toHaveLength(6);
      expect(s.state.pendingDecision).toBeUndefined();
    },
  );

  it("uses Decode to play Plutomon from its stack instead of leaving by an effect", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT26-079", as: "zombie", under: [{ card: "BT26-059", as: "plutomon" }] }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(await advance(s.engine).verb.deletePermanent([s.perm("zombie").permanentId], "byEffect")).toBe(1);
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT26-059"));

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toContain("BT26-059");
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("BT26-079");
  });

  it("may decline Decode and trash the stack normally", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT26-079", as: "zombie", under: [{ card: "BT26-059", as: "plutomon" }] }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(await advance(s.engine).verb.deletePermanent([s.perm("zombie").permanentId], "byEffect")).toBe(1);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toEqual(
      expect.arrayContaining(["BT26-079", "BT26-059"]),
    );
  });

  it("does not Decode a battle deletion and deletes the attacker with Retaliation", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-082", as: "attacker", dp: 13000 }] },
      1: {
        battleArea: [
          {
            card: "BT26-079",
            as: "zombie",
            suspended: true,
            under: [{ card: "BT26-059", as: "plutomon" }],
          },
        ],
      },
    });
    const attackerId = s.perm("attacker").permanentId;
    const zombieId = s.perm("zombie").permanentId;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: attackerId,
        target: { kind: "permanent", permanentId: zombieId },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        !s.state.players[0]!.battleArea.some(({ permanentId }) => permanentId === attackerId) &&
        !s.state.players[1]!.battleArea.some(({ permanentId }) => permanentId === zombieId),
    );

    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).not.toContain("BT26-059");
    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toEqual(
      expect.arrayContaining(["BT26-079", "BT26-059"]),
    );
  });

  it("performs 2 security checks with Security A. +1", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT26-079", as: "zombie" }] },
      1: { security: ["BT1-009", "BT1-010"], deck: ["BT1-011", "BT1-012"] },
    });
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("zombie").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);
    expect(s.state.players[1]!.security).toHaveLength(0);
  });
});
