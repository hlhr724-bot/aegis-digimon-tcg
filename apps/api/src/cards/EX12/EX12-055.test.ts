import { describe, expect, it } from "vitest";
import {
  compiledEffects,
  dnaDigivolutionRequirementsFor,
  digivolutionRequirementsFor,
  EffectTiming,
  getCardDefinition,
} from "@aegis/shared";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { advance } from "../../engine/testkit/advance.js";
import { registeredCompiledCards } from "../../engine/effects/interpreter/compiledCards.js";
import { compiled } from "./EX12-055.js";
import "../index.js";
import { expectOnlyOneCounterPerAttack } from "./counterOnce.testSupport.js";

describe("EX12-055 Andromon", () => {
  it("maps every printed clause, evolution route, DNA route, and Counter legality", () => {
    const card = getCardDefinition("EX12-055");
    expect(card?.effectText).toContain("Reveal the top 3 cards");
    expect(card?.effectText).toContain("level 6 or lower [ME] trait Digimon card");
    expect(digivolutionRequirementsFor("EX12-055")).toEqual([
      { level: 4, traits: ["Machine", "ME"], cost: 3, isAlternate: true },
    ]);
    expect(dnaDigivolutionRequirementsFor("EX12-055")).toEqual([
      {
        cost: 0,
        materials: [
          { color: "Black", level: 4 },
          { color: "Red", level: 4 },
        ],
      },
      {
        cost: 0,
        materials: [
          { color: "Black", level: 4 },
          { color: "Yellow", level: 4 },
        ],
      },
      {
        cost: 0,
        materials: [
          { color: "Purple", level: 4 },
          { color: "Red", level: 4 },
        ],
      },
      {
        cost: 0,
        materials: [
          { color: "Purple", level: 4 },
          { color: "Yellow", level: 4 },
        ],
      },
    ]);

    for (const trigger of ["OnPlay", "WhenDigivolving"]) {
      expect(compiled.effects.find((effect) => effect.trigger === trigger)).toMatchObject({
        actions: [
          {
            kind: "RevealAdd",
            revealCount: 3,
            rest: "trash",
            add: [
              {
                count: 1,
                to: "play",
                optional: true,
                filter: {
                  playCostLte: 5,
                  nameOrTrait: [{ match: "trait", tokens: ["Machine", "Cyborg", "ME"] }],
                },
              },
            ],
          },
        ],
      });
    }

    const counter = compiled.effects.find((effect) => effect.trigger === "Counter")!;
    expect(counter).toMatchObject({
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "Digivolve",
          payCost: false,
          from: ["hand"],
          optional: true,
          target: { filter: { controller: "mine", excludeSelf: true, kind: ["Digimon"] }, count: 1 },
          into: {
            controllerDefault: "mine",
            kind: ["Digimon"],
            levelComparison: { op: "lte", value: 6 },
            nameOrTrait: [{ match: "trait", tokens: ["ME"] }],
          },
        },
      ],
    });
    expect(counter.actions[0]).not.toHaveProperty("ignoreRequirements");

    expect(compiled.effects.find((effect) => effect.isInherited)).toMatchObject({
      trigger: "OpponentsTurn",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenOpponentAttacks",
          actions: [{ kind: "RedirectAttack", optional: true, target: { filter: { isSelfRef: true } } }],
        },
      ],
    });
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(registeredCompiledCards.get("EX12-055")).toEqual(compiled);
    expect(compiledEffects["EX12-055"]).toEqual(compiled);
  });

  it("does not use Giant Meat when its evolution effect can only play revealed cards", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT3-066", as: "base" }],
          hand: [{ card: "EX12-055", as: "andromon" }],
          deck: ["BT1-009", { card: "EX12-073", as: "giant-meat" }, "BT1-010", "BT1-011"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("andromon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.trash.some((card) => card.cardId === "EX12-073") && s.state.pendingDecision === undefined,
    );
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["EX12-055"]);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["EX12-073", "BT1-010", "BT1-011"]),
    );
    expect(
      s.events.some(
        (event) =>
          event.kind === "cardsMoved" &&
          event.optionUsed === true &&
          event.instanceIds.includes(s.inst("giant-meat").instanceId),
      ),
    ).toBe(false);
  });

  it("plays only a matching Machine/Cyborg/ME card with play cost 5 or less and trashes the rest", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX12-055", as: "andromon" }],
          deck: ["BT3-066", "BT14-062", "BT14-015"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("andromon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT3-066"));
    await settle(() => false, 80);

    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard?.cardId)).toEqual(
      expect.arrayContaining(["EX12-055", "BT3-066"]),
    );
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["BT14-062", "BT14-015"]),
    );
    expect(s.state.memory).toBe(3);
  });

  it("trashes all revealed cards and plays nothing when no card matches the optional branch", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX12-055", as: "andromon" }],
          deck: ["BT14-062", "BT14-015", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("andromon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.deck.length === 0 && s.state.players[0]!.trash.length === 3);

    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard?.cardId)).toEqual(["EX12-055"]);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["BT14-062", "BT14-015", "BT1-009"]),
    );
  });

  it("executes the same reveal/play/trash body when digivolving", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-055", as: "andromon" }],
          deck: ["BT3-066", "BT14-062", "BT14-015"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );

    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("andromon"));
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT3-066"));

    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toEqual(
      expect.arrayContaining(["BT14-062", "BT14-015"]),
    );
  });

  it("DNA digivolves through a printed Black Lv.4 plus Red Lv.4 route at cost 0", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT13-066", as: "blackMaterial" },
            { card: "BT1-014", as: "redMaterial" },
          ],
          hand: [{ card: "EX12-055", as: "andromon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;

    expect(
      s.engine.applyIntent(0, {
        type: "dnaDigivolve",
        materialPermanentIds: [s.perm("blackMaterial").permanentId, s.perm("redMaterial").permanentId],
        instanceId: s.inst("andromon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "EX12-055"));

    const andromon = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard?.cardId === "EX12-055")!;
    expect(andromon.stack.map((card) => card.cardId)).toEqual(expect.arrayContaining(["BT13-066", "BT1-014"]));
    expect(s.state.memory).toBe(0);
  });

  it("accepts every printed DNA color pairing and rejects two materials from the first color group", async () => {
    for (const [first, second] of [
      ["EX12-054", "BT1-014"],
      ["EX12-054", "BT12-038"],
      ["BT10-074", "BT1-014"],
      ["BT10-074", "BT12-038"],
    ] as const) {
      const s = setupEngine({
        0: {
          battleArea: [
            { card: first, as: "first" },
            { card: second, as: "second" },
          ],
          hand: [{ card: "EX12-055", as: "target" }],
        },
      });
      expect(
        s.engine.applyIntent(0, {
          type: "dnaDigivolve",
          materialPermanentIds: [s.perm("first").permanentId, s.perm("second").permanentId],
          instanceId: s.inst("target").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "EX12-055"));
    }

    const invalid = setupEngine({
      0: {
        battleArea: [
          { card: "EX12-054", as: "black" },
          { card: "BT10-074", as: "purple" },
        ],
        hand: [{ card: "EX12-055", as: "target" }],
      },
    });
    expect(
      invalid.engine.applyIntent(0, {
        type: "dnaDigivolve",
        materialPermanentIds: [invalid.perm("black").permanentId, invalid.perm("purple").permanentId],
        instanceId: invalid.inst("target").instanceId,
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
  });

  it("uses the Counter window to digivolve one other Digimon from hand without paying memory", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-009", as: "attacker" }] },
        1: {
          battleArea: [
            { card: "EX12-055", as: "counterCard" },
            { card: "EX12-064", as: "other" },
          ],
          hand: [{ card: "EX12-059", as: "target" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const attacker = s.perm("attacker");
    const counterCard = s.perm("counterCard");

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "counterWindowOpened"));

    const opened = s.events.find((event) => event.kind === "counterWindowOpened");
    if (opened?.kind !== "counterWindowOpened") throw new Error("counter window did not open");
    const eligible = opened.eligibleCounters.find((entry) => entry.instanceId === counterCard.topCard!.instanceId);
    expect(eligible).toBeDefined();
    expect(
      s.engine.applyIntent(1, {
        type: "respondCounter",
        sourceInstanceId: eligible!.instanceId,
        effectKey: eligible!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("other").topCard?.cardId === "EX12-059");

    expect(s.perm("other").topCard?.cardId).toBe("EX12-059");
    expect(s.state.memory).toBe(0);
  });

  it("redirects one opposing attack to its inherited host and consumes the once-per-turn use", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-009", as: "firstAttacker" },
            { card: "BT1-010", as: "secondAttacker" },
          ],
        },
        1: {
          battleArea: [{ card: "BT1-069", as: "host", under: ["EX12-055"] }],
          security: ["BT1-009", "BT1-012"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("firstAttacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT1-009"));
    expect(s.state.players[1]!.security).toHaveLength(2);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("secondAttacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 1);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("uses both normal colors and the Machine/ME alternate, rejecting a nonmatching level 4", async () => {
    for (const [baseCardId, useAlternateCost, expectedCost] of [
      ["EX12-054", false, 4],
      ["BT12-038", false, 4],
      ["EX12-054", true, 3],
    ] as const) {
      const s = setupEngine({
        0: { battleArea: [{ card: baseCardId, as: "base" }], hand: [{ card: "EX12-055", as: "target" }] },
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
      await settle(() => s.perm("base").topCard.cardId === "EX12-055");
      expect(s.state.memory).toBe(4 - expectedCost);
    }

    const invalid = setupEngine({
      0: { battleArea: [{ card: "BT1-017", as: "base" }], hand: [{ card: "EX12-055", as: "target" }] },
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

  it("matches the complete catalog identity", () => {
    expect(getCardDefinition("EX12-055")).toMatchObject({
      nameEn: "Andromon",
      colors: ["Black", "Yellow"],
      kinds: ["Digimon"],
      playCost: 7,
      dp: 7000,
      level: 5,
      forms: ["Ultimate"],
      attributes: ["Vaccine"],
      types: ["Cyborg", "ME"],
      evoCosts: [
        { color: "Black", level: 4, memoryCost: 4 },
        { color: "Yellow", level: 4, memoryCost: 4 },
      ],
    });
  });
});

describe("EX12-055 Andromon — KB Q&A rulings", () => {
  it("lets only one [Counter] effect activate during one attack (Q6850)", async () => {
    await expectOnlyOneCounterPerAttack({ card: "EX12-055" }, { card: "EX12-052" });
  });
});
