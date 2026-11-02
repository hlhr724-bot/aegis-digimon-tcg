import { describe, expect, it } from "vitest";
import {
  assemblyRequirementFor,
  compiledEffects,
  EffectDuration,
  EffectTiming,
  digivolutionRequirementsFor,
  getCardDefinition,
} from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { registeredCompiledCards } from "../../engine/effects/interpreter/compiledCards.js";
import { compiled } from "./EX12-064.js";
import "#api/cards/BT20/BT20-037";

describe("EX12-064 Megadramon", () => {
  it("maps the catalog, evolution, delete fallback, trait watcher, and inherited cost", () => {
    expect(digivolutionRequirementsFor("EX12-064")).toEqual([
      { level: 4, traits: ["Machine", "ME"], cost: 3, isAlternate: true },
    ]);
    expect(assemblyRequirementFor("EX12-064")).toEqual([
      { reduceCost: 2, materials: [{ count: 1, traits: ["Machine", "Cyborg", "ME"], levelMax: 4 }] },
    ]);

    for (const trigger of ["OnPlay", "WhenDigivolving"] as const) {
      expect(compiled.effects.find((effect) => effect.trigger === trigger)).toMatchObject({
        actions: [
          {
            kind: "Delete",
            target: {
              filter: {
                controller: "opponent",
                kind: ["Digimon"],
                levelComparison: { op: "lte", value: 4 },
              },
              count: 1,
            },
          },
          {
            kind: "DeDigivolve",
            amount: 1,
            condition: { kind: "ifThisEffectDidNotDelete" },
          },
        ],
      });
    }

    expect(compiled.effects.find((effect) => effect.trigger === "AllTurns")).toMatchObject({
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenPlayed",
          sourceFilter: {
            controller: "mine",
            kind: ["Digimon"],
            nameOrTrait: [{ tokens: ["Machine", "Cyborg", "ME"], match: "trait" }],
          },
          actions: [{ kind: "ReactivateEffect", fromTrigger: "WhenDigivolving", count: 1, optional: true }],
        },
      ],
    });

    expect(compiled.effects.find((effect) => effect.isInherited)).toMatchObject({
      trigger: "EndOfAttack",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "Delete",
          target: { filter: { superlative: "lowestPlayCost" }, count: 1 },
          cost: { kind: "unsuspend", target: { filter: { isSelfRef: true }, isSelf: true } },
          optional: true,
          abortOnDecline: true,
        },
      ],
    });
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(registeredCompiledCards.get("EX12-064")).toEqual(compiled);
    expect(compiledEffects["EX12-064"]).toEqual(compiled);
  });

  it("deletes exactly one opposing level-4-or-lower Digimon", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX12-064", as: "source" }] },
        1: {
          battleArea: [
            { card: "BT1-009", as: "low" },
            { card: "EX12-059", as: "high", under: ["BT1-009"] },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("source"));
    await settle(() => s.state.players[1]!.battleArea.length === 1);

    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard?.cardId)).toEqual(["EX12-059"]);
    expect(s.perm("high").topCard.cardId).toBe("EX12-059");
    expect(s.perm("high").stack).toHaveLength(1);
  });

  it("de-digivolves when no level-4-or-lower target exists", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX12-064", as: "source" }] },
        1: { battleArea: [{ card: "EX12-059", as: "opponent", under: ["BT1-009"] }] },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("source"));
    await settle(() => s.perm("opponent").stack.length === 0);

    expect(s.perm("opponent").topCard?.cardId).toBe("BT1-009");
    expect(s.perm("opponent").stack).toHaveLength(0);
  });

  it("reactivates the When Digivolving effect for an actually played matching Digimon and only once", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-064", as: "source" }],
          hand: [
            { card: "BT1-068", as: "firstMatch" },
            { card: "BT1-042", as: "secondMatch" },
          ],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "first" },
            { card: "BT1-010", as: "second" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();
    s.state.memory = 20;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("firstMatch").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 1);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("secondMatch").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 3);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });

  it("Q6864 fires the All Turns watcher for its own play and reactivates When Digivolving", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "EX12-064", as: "source" }] },
        1: {
          battleArea: [
            { card: "BT1-009", as: "low" },
            { card: "EX12-059", as: "high", under: ["BT1-009"] },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("source").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 1 && s.perm("high").stack.length === 0);

    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard?.cardId)).toEqual(["BT1-009"]);
    expect(s.perm("high").stack).toHaveLength(0);
  });

  it("reactivates When Digivolving after Assembly while Valdur Arm disables On Play", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT20-035", as: "base", under: ["BT20-036"] }],
          hand: [{ card: "BT20-037", as: "valdur" }],
          deck: ["BT1-010", "BT1-010"],
        },
        1: {
          battleArea: [{ card: "BT1-010", as: "target" }],
          hand: [{ card: "EX12-064", as: "megadramon" }],
          trash: [{ card: "EX12-054", as: "material" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("valdur").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT20-037");
    await settle();
    s.state.turnSeat = 1;
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(1, {
        type: "playCard",
        instanceId: s.inst("megadramon").instanceId,
        assembly: { materialInstanceIds: [s.inst("material").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT20-035");
    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["BT20-036"]);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(["BT20-037"]);
    expect(
      s.state.players[1]!.battleArea.find((permanent) => permanent.topCard.cardId === "EX12-064")!.stack.map(
        (card) => card.cardId,
      ),
    ).toEqual(["EX12-054"]);
    expect(s.state.memory).toBe(5);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("Q6862 must delete an available level 4 or lower Digimon instead of taking the De-Digivolve branch", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-054", as: "base" }],
          hand: [{ card: "EX12-064", as: "evolution" }],
          deck: ["BT1-010"],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "low" },
            { card: "EX12-059", as: "stacked", under: ["BT1-009", "BT1-010"] },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 4;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("evolution").instanceId);

    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard?.cardId)).toEqual(["EX12-059"]);
    expect(s.perm("stacked").stack.map(({ cardId }) => cardId)).toEqual(["BT1-009", "BT1-010"]);
    expect(s.state.memory).toBe(0);
  });

  it("Q6863 falls through to De-Digivolve when the chosen level 4 target cannot be deleted", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX12-064", as: "source" }] },
        1: {
          battleArea: [
            { card: "BT1-009", as: "immune" },
            { card: "EX12-059", as: "stacked", under: ["BT1-010"] },
          ],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoOrderTriggers: true,
        preferInstanceIds: preferred,
      },
    );
    preferred.push(s.perm("stacked").topCard.instanceId);
    await s.ready();
    advance(s.engine).ledgers.continuous.addRestriction(
      s.perm("immune").permanentId,
      "beAffected",
      EffectDuration.Permanent,
      { fromSourceKind: ["Digimon"] },
    );

    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("source"));
    await settle(() => s.perm("stacked").stack.length === 0);

    expect(s.state.players[1]!.battleArea).toHaveLength(2);
    expect(s.perm("immune").topCard?.cardId).toBe("BT1-009");
    expect(s.perm("stacked").topCard?.cardId).toBe("BT1-010");
    expect(s.perm("stacked").stack).toHaveLength(0);
  });

  it("allows declining the optional trait watcher", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-064", as: "source" }],
          hand: [{ card: "BT1-068", as: "match" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "opponent" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("match").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 2);

    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });

  it("unsuspends the inherited host and deletes the own Digimon with the lowest play cost", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX12-059", as: "host", suspended: true, under: ["EX12-064"] },
            { card: "BT1-009", as: "low" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.OnEndAttack, s.perm("host"));
    await settle(() => !s.perm("host").isSuspended && s.state.players[0]!.battleArea.length === 1);

    expect(s.perm("host").isSuspended).toBe(false);
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard?.cardId)).toEqual(["EX12-059"]);
  });

  it("may decline the inherited unsuspend cost and does nothing when the host is already active", async () => {
    const declined = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX12-059", as: "host", suspended: true, under: ["EX12-064"] },
            { card: "BT1-009", as: "low" },
          ],
        },
      },
      { autoAcceptOptional: false, autoSelectCards: true },
    );
    const resolution = advance(declined.engine).fire(EffectTiming.OnEndAttack, declined.perm("host"));
    await settle(() => declined.state.pendingDecision?.kind === "optional");
    expect(
      declined.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: declined.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await resolution;
    expect(declined.perm("host").isSuspended).toBe(true);
    expect(declined.state.players[0]!.battleArea).toHaveLength(2);

    const active = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX12-059", as: "host", under: ["EX12-064"] },
            { card: "BT1-009", as: "low" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await advance(active.engine).fire(EffectTiming.OnEndAttack, active.perm("host"));
    await settle();
    expect(active.state.players[0]!.battleArea).toHaveLength(2);
  });

  it("assembles with an eligible level 4 material and rejects an over-level one", async () => {
    const s = setupEngine({
      0: { hand: [{ card: "EX12-064", as: "target" }], trash: [{ card: "EX12-054", as: "material" }] },
    });
    s.state.memory = 5;
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("target").instanceId,
        assembly: { materialInstanceIds: [s.inst("material").instanceId] },
      } as never),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === "EX12-064"));
    const played = s.state.players[0]!.battleArea.find(({ topCard }) => topCard?.cardId === "EX12-064")!;
    expect(played.stack.map(({ cardId }) => cardId)).toEqual(["EX12-054"]);
    expect(s.state.memory).toBe(0);

    const invalid = setupEngine({
      0: { hand: [{ card: "EX12-064", as: "target" }], trash: [{ card: "EX12-059", as: "material" }] },
    });
    invalid.state.memory = 7;
    expect(
      invalid.engine.applyIntent(0, {
        type: "playCard",
        instanceId: invalid.inst("target").instanceId,
        assembly: { materialInstanceIds: [invalid.inst("material").instanceId] },
      } as never),
    ).toEqual({ ok: false, reason: "invalid-material" });
  });

  it("uses both normal colors and both alternate traits, rejects a nonmatch, and matches the catalog", async () => {
    expect(getCardDefinition("EX12-064")).toMatchObject({
      nameEn: "Megadramon",
      colors: ["Purple", "Black"],
      kinds: ["Digimon"],
      playCost: 7,
      dp: 7000,
      level: 5,
      forms: ["Ultimate"],
      attributes: ["Virus"],
      types: ["Cyborg", "ME"],
      evoCosts: [
        { color: "Purple", level: 4, memoryCost: 4 },
        { color: "Black", level: 4, memoryCost: 4 },
      ],
    });
    for (const [baseCardId, useAlternateCost, cost] of [
      ["EX12-062", false, 4],
      ["BT10-061", false, 4],
      ["BT10-021", true, 3],
      ["EX12-010", true, 3],
    ] as const) {
      const s = setupEngine({
        0: { battleArea: [{ card: baseCardId, as: "base" }], hand: [{ card: "EX12-064", as: "target" }] },
      });
      s.state.memory = 4;
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("target").instanceId,
          useAlternateCost,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("base").topCard.cardId === "EX12-064");
      expect(s.state.memory).toBe(4 - cost);
    }
    const invalid = setupEngine({
      0: { battleArea: [{ card: "BT1-014", as: "base" }], hand: [{ card: "EX12-064", as: "target" }] },
    });
    expect(
      invalid.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: invalid.perm("base").permanentId,
        instanceId: invalid.inst("target").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
  });
});
