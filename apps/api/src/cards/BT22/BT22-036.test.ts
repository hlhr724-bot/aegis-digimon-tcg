import { describe, expect, it } from "vitest";
import { EffectTiming, type Seat } from "@aegis/shared";
import { effectsOf } from "../../engine/effects/collect.js";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle, type EngineSetup } from "../../engine/testkit/harness.js";
import "../index.js";
import { compiled } from "./BT22-036.js";

describe("BT22-036 Chaperomon", () => {
  it("has complete executable coverage for every printed clause", () => {
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
  });

  it("keeps the Arisa trash-placement digivolution and Puppet Overclock/leave replacement", () => {
    expect(compiled.digivolutionRequirement).toEqual([{ level: 4, colors: ["Yellow"], cost: 3, isAlternate: false }]);
    const main = compiled.effects.find((entry) => entry.trigger === "Main");
    expect(main).toMatchObject({ isFromHand: true, condition: { kind: "youHave" } });
    expect(main?.actions[0]).toMatchObject({
      kind: "DigivolveViaPlacement",
      placeCost: {
        kind: "placeFromTrash",
        position: "bottom",
        destination: "digivolutionStack",
        hostFilter: { controller: "mine", nameOrTrait: [{ tokens: ["Shoemon"], match: "nameExact" }] },
      },
      into: { filter: { isSelfRef: true }, count: 1, isSelf: true },
      cost: 3,
      ignoreDigivolutionRequirements: true,
    });
    const endTurn = compiled.effects.find((entry) => entry.trigger === "EndOfYourTurn");
    expect(endTurn?.actions[0]).toMatchObject({
      kind: "Attack",
      attackTargetScope: "any",
      withoutSuspending: true,
      optional: true,
      cost: { kind: "deleteOwn" },
    });
    const inherited = compiled.effects.find((entry) => entry.trigger === "AllTurns");
    expect(inherited).toMatchObject({
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "Replacement",
          event: "wouldLeavePlay",
          leaveCause: "otherThanYourEffect",
          sourceFilter: { isSelfRef: true },
          cost: { kind: "deleteOwn" },
        },
      ],
    });
  });

  it("does not expose the hand effect without Arisa Kinosaki", async () => {
    const s = setupEngine({
      0: { battleArea: ["EX7-024"], hand: [{ card: "BT22-036", as: "chaperomon" }], trash: ["BT22-032"] },
    });
    const source = (
      s.engine as unknown as { cardSourceOf(card: object): Parameters<typeof effectsOf>[1] }
    ).cardSourceOf(s.inst("chaperomon"));
    const effect = effectsOf(EffectTiming.OnDeclaration, source).find((entry) =>
      entry.effectKey.startsWith("BT22-036/"),
    );
    if (effect !== undefined)
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.inst("chaperomon").instanceId,
        effectKey: effect.effectKey,
      });
    await settle();
    expect(s.state.players[0]!.hand.some((card) => card.cardId === "BT22-036")).toBe(true);
  });

  it("places ShoeShoemon at the bottom and applies Shoemon's reduction to the fixed cost", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX7-024", as: "shoemon" },
            { card: "EX7-063", as: "arisa" },
          ],
          hand: [{ card: "BT22-036", as: "chaperomon" }],
          trash: [
            { card: "BT22-032", as: "shoeShoemon" },
            { card: "BT22-030", as: "invalid" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    await s.ready();
    const source = (
      s.engine as unknown as { cardSourceOf(card: object): Parameters<typeof effectsOf>[1] }
    ).cardSourceOf(s.inst("chaperomon"));
    const effectKey = effectsOf(EffectTiming.OnDeclaration, source)[0]!.effectKey;
    s.state.memory = 5;

    expect(s.engine.applyIntent(0, { type: "activateEffect", sourceInstanceId: source.instanceId, effectKey })).toEqual(
      { ok: true },
    );
    await settle(() => s.perm("shoemon").topCard?.cardId === "BT22-036");

    expect(s.state.memory).toBe(3);
    expect(s.perm("shoemon").stack.map((card) => card.cardId)).toEqual(["BT22-032", "EX7-024"]);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([s.inst("invalid").instanceId]);
  });

  it("does not use an opponent's Shoemon as the placement host", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX7-063", as: "arisa" }],
          hand: [{ card: "BT22-036", as: "chaperomon" }],
          trash: [{ card: "BT22-032", as: "shoeShoemon" }],
        },
        1: { battleArea: [{ card: "EX7-024", as: "opponentShoemon" }] },
      },
      { autoSelectCards: true },
    );
    await s.ready();
    const source = (
      s.engine as unknown as { cardSourceOf(card: object): Parameters<typeof effectsOf>[1] }
    ).cardSourceOf(s.inst("chaperomon"));
    const effectKey = effectsOf(EffectTiming.OnDeclaration, source).find((effect) =>
      effect.effectKey.startsWith("BT22-036/"),
    )?.effectKey;
    expect(effectKey).toBeDefined();
    s.state.memory = 5;

    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.inst("chaperomon").instanceId,
        effectKey: effectKey!,
      }),
    ).toEqual({ ok: false, reason: "illegal-target" });
    await settle();

    expect(s.perm("opponentShoemon").topCard?.cardId).toBe("EX7-024");
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("shoeShoemon").instanceId)).toBe(true);
  });

  it("uses Overclock by deleting another Puppet and attacks without suspending", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT22-036", as: "chaperomon" },
            { card: "ST19-03", as: "fodder" },
          ],
        },
        1: { security: ["BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    const fodderId = s.perm("fodder").permanentId;
    await s.ready();

    const turn = s.engine.runOneTurn();
    const mainPhase = (s.engine as unknown as { mainPhase: { isOpen: boolean } }).mainPhase;
    await settle(() => mainPhase.isOpen, 500);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await turn;

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === fodderId)).toBe(false);
    expect(s.perm("chaperomon").isSuspended).toBe(false);
    expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(true);
  });

  it("uses inherited protection once against opponent effects but not own effects", async () => {
    for (const effectSeat of [1, 0] as Seat[]) {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT22-032", under: ["BT22-036"], as: "host" },
              { card: "ST19-03", as: "fodder" },
            ],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      await s.ready();
      const hostId = s.perm("host").permanentId;
      const fodderId = s.perm("fodder").permanentId;

      advance(s.engine).verb.enterEffectResolution(effectSeat, ["Digimon"]);
      try {
        expect(await advance(s.engine).verb.deletePermanent([hostId], "byEffect")).toBe(effectSeat === 1 ? 0 : 1);
      } finally {
        advance(s.engine).verb.leaveEffectResolution();
      }

      expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === hostId)).toBe(
        effectSeat === 1,
      );
      expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === fodderId)).toBe(
        effectSeat === 0,
      );
    }
  });
});

describe("BT22-036 Chaperomon — KB Q&A rulings", () => {
  const handEffectKey = (s: EngineSetup): string => {
    const source = (
      s.engine as unknown as { cardSourceOf(card: object): Parameters<typeof effectsOf>[1] }
    ).cardSourceOf(s.inst("chaperomon"));
    const effect = effectsOf(EffectTiming.OnDeclaration, source).find((entry) =>
      entry.effectKey.startsWith("BT22-036/"),
    );
    expect(effect).toBeDefined();
    return effect!.effectKey;
  };

  it("digivolves Shoemon for a cost of 2 when Shoemon's reduction applies to the fixed cost of 3 (Q4882)", async () => {
    const digivolveFromHand = async (shoemonCardId: string) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: shoemonCardId, as: "shoemon" },
              { card: "EX7-063", as: "arisa" },
            ],
            hand: [{ card: "BT22-036", as: "chaperomon" }],
            trash: [{ card: "BT22-032", as: "shoeShoemon" }],
          },
        },
        { autoSelectCards: true },
      );
      await s.ready();
      const effectKey = handEffectKey(s);
      s.state.memory = 6;

      expect(
        s.engine.applyIntent(0, {
          type: "activateEffect",
          sourceInstanceId: s.inst("chaperomon").instanceId,
          effectKey,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("shoemon").topCard?.cardId === "BT22-036");

      expect(s.perm("shoemon").stack.map((card) => card.cardId)).toEqual(["BT22-032", shoemonCardId]);
      return s.state.memory;
    };

    expect(await digivolveFromHand("EX7-024")).toBe(4);
    // BT22-029 Shoemon has no cost reduction, so the fixed cost of 3 is paid in full.
    expect(await digivolveFromHand("BT22-029")).toBe(3);
  });

  it("cannot use the hand effect's placement digivolution through Physical Training's digivolve effect (Q4883)", async () => {
    const setupWithHost = async (host: string) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "P-105", as: "training" },
              { card: host, as: "host" },
              { card: "EX7-063", as: "arisa" },
            ],
            hand: [{ card: "BT22-036", as: "chaperomon" }],
            trash: [{ card: "BT22-032", as: "shoeShoemon" }],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.memory = 10;
      s.state.turnCount = 1;
      await s.ready();
      const abilities = JSON.parse(s.perm("training").activatableEffectsJson) as { effectKey: string }[];
      expect(abilities).toHaveLength(1);
      expect(
        s.engine.applyIntent(0, {
          type: "activateEffect",
          sourceInstanceId: s.inst("training").instanceId,
          effectKey: abilities[0]!.effectKey,
        }),
      ).toEqual({ ok: true });
      const trainingId = s.inst("training").instanceId;
      await settle(() =>
        s.state.players[0]!.battleArea.every((permanent) => permanent.topCard?.instanceId !== trainingId),
      );
      await settle();
      return s;
    };

    const fromShoemon = await setupWithHost("EX7-024");
    expect(fromShoemon.perm("host").topCard?.cardId).toBe("EX7-024");
    expect(fromShoemon.state.memory).toBe(10);
    expect(fromShoemon.state.players[0]!.hand.map((card) => card.cardId)).toContain("BT22-036");
    expect(fromShoemon.state.players[0]!.trash.map((card) => card.instanceId)).toContain(
      fromShoemon.inst("shoeShoemon").instanceId,
    );

    const fromLevelFour = await setupWithHost("BT22-032");
    expect(fromLevelFour.perm("host").topCard?.cardId).toBe("BT22-036");
    expect(fromLevelFour.state.memory).toBe(9);
    expect(fromLevelFour.state.players[0]!.trash.map((card) => card.instanceId)).toContain(
      fromLevelFour.inst("shoeShoemon").instanceId,
    );
  });
});
