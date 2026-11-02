import { afterEach, describe, expect, it } from "vitest";
import { EffectTiming, getCardDefinition, type CardInstance } from "@aegis/shared";
import { effectsOf } from "#api/engine/effects/collect";
import type { CardSource } from "#api/engine/effects/CardSource";
import { registerIrCard } from "#api/engine/effects/interpreter";
import { unregisterIrCard } from "#api/engine/effects/interpreter/registration/unregisterIrCard";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, setupEngine, settle } from "#api/engine/testkit/harness";
import { syntheticDefinitions } from "#api/engine/testkit/syntheticDefinitions";
import { compiled } from "./BT27-092.js";
import "#api/cards/index";

const cardId = "BT27-092";
const kurataBio = "TEST-BT27-092-KURATA-BIO";
const squadBio = "TEST-BT27-092-SQUAD-BIO";

function defineBio(syntheticId: string, types: string[]) {
  syntheticDefinitions.set(syntheticId, {
    ...getCardDefinition("BT27-079")!,
    cardId: syntheticId,
    nameEn: `Bio ${syntheticId}`,
    types,
    effectText: undefined,
    evoCosts: [],
  });
  registerIrCard(syntheticId, {
    effects: [],
    coverage: "full",
    residual: [],
    digivolutionRequirement: [{ traits: ["Kurata's Army"], cost: 3, isAlternate: true }],
  });
}

function activateMain(s: ReturnType<typeof setupEngine>) {
  const source = (s.engine as unknown as { cardSourceOf(instance: CardInstance): CardSource }).cardSourceOf(
    s.inst("tamer"),
  );
  const effectKey = effectsOf(EffectTiming.OnDeclaration, source).find((effect) =>
    effect.effectKey.startsWith(`${cardId}/`),
  )!.effectKey;
  return s.engine.applyIntent(0, { type: "activateEffect", sourceInstanceId: s.inst("tamer").instanceId, effectKey });
}

const faceDownPair = [
  { card: "BT1-010", as: "bottom", faceUp: false },
  { card: "BT1-011", as: "upper", faceUp: false },
];

describe("BT27-092 Nanami, Kouki, & Ivan", () => {
  afterEach(() => {
    for (const id of syntheticDefinitions.keys()) unregisterIrCard(id);
    syntheticDefinitions.clear();
  });

  it("matches the catalog and compiles every printed clause", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      nameEn: "Nanami, Kouki, & Ivan",
      colors: ["Green", "Black", "Red"],
      kinds: ["Tamer"],
      playCost: 4,
      types: ["Kurata's Army"],
    });
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(compiled.effects.map((effect) => [effect.trigger, effect.frequency, effect.isInherited])).toEqual([
      ["StartOfYourMainPhase", undefined, undefined],
      ["Main", "OncePerTurn", undefined],
      ["EndOfAttack", "OncePerTurn", true],
      ["Security", undefined, undefined],
    ]);
  });

  it.each([
    ["a Kurata's Army card", "BT27-075", true],
    ["a DATA SQUAD card", "BT27-074", false],
  ] as const)("start of main places %s face down to draw 1 and gain 1 memory: %s", async (_label, card, paid) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "tamer" }],
          hand: [{ card, as: "cost" }],
          deck: [{ card: "BT1-009", as: "drawn" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fireForPermanent(EffectTiming.OnStartMainPhase, s.perm("tamer"));
    await settle();

    expect(s.perm("tamer").stack.map(({ instanceId, faceUp }) => [instanceId, faceUp])).toEqual(
      paid ? [[s.inst("cost").instanceId, false]] : [],
    );
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([
      paid ? s.inst("drawn").instanceId : s.inst("cost").instanceId,
    ]);
    expect(s.state.memory).toBe(paid ? 1 : 0);
  });

  it("declining the start-of-main placement keeps the hand and grants nothing", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "tamer" }],
          hand: [{ card: "BT27-075", as: "cost" }],
          deck: ["BT1-009"],
        },
      },
      { autoDeclineOptional: true },
    );
    await s.ready();

    await advance(s.engine).fireForPermanent(EffectTiming.OnStartMainPhase, s.perm("tamer"));
    await settle();

    expect(s.perm("tamer").stack).toHaveLength(0);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("cost").instanceId]);
    expect(s.state.memory).toBe(0);
  });

  it.each(["hand", "trash"] as const)(
    "[Main] trashes 2 bottom face-down cards and digivolves this Tamer into a Kurata's Army Digimon from the %s for 2 less",
    async (zone) => {
      defineBio(kurataBio, ["Kurata's Army"]);
      defineBio(squadBio, ["DATA SQUAD"]);
      const preferred: string[] = [];
      const candidates = [
        { card: squadBio, as: "squad" },
        { card: "BT27-079", as: "gizmon" },
        { card: kurataBio, as: "bio" },
      ];
      const s = setupEngine(
        {
          0: {
            battleArea: [
              {
                card: cardId,
                as: "tamer",
                under: [...faceDownPair, { card: "BT1-012", as: "top", faceUp: false }],
              },
            ],
            [zone]: candidates,
            deck: ["BT1-009", "BT1-009"],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
      );
      await s.ready();
      s.state.memory = 3;
      preferred.push(
        s.inst("bottom").instanceId,
        s.inst("upper").instanceId,
        s.inst("squad").instanceId,
        s.inst("gizmon").instanceId,
        s.inst("bio").instanceId,
      );

      expect(activateMain(s)).toEqual({ ok: true });
      await settle(() => s.perm("tamer").topCard.cardId === kurataBio);
      await settle();

      expect(s.perm("tamer").stack.map(({ cardId: stacked }) => stacked)).toEqual(["BT1-012", cardId]);
      const trash = s.state.players[0]!.trash.map(({ instanceId }) => instanceId);
      expect(trash).toEqual(expect.arrayContaining([s.inst("bottom").instanceId, s.inst("upper").instanceId]));
      expect(trash).not.toContain(s.inst("bio").instanceId);
      expect(s.state.memory).toBe(2);
      assertNoLoudGap(s);
    },
  );

  it("[Main] pays its cost but cannot digivolve into Kurata's Army Digimon without a matching requirement", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "tamer", under: faceDownPair }],
          hand: [{ card: "BT27-079", as: "gizmon" }],
          trash: [{ card: "BT27-076", as: "gizmonAt" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 3;

    expect(activateMain(s)).toEqual({ ok: true });
    await settle(() => s.perm("tamer").stack.length === 0);
    await settle();

    expect(s.perm("tamer").topCard.cardId).toBe(cardId);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("gizmon").instanceId]);
    expect(s.state.players[0]!.trash).toHaveLength(3);
    expect(s.state.memory).toBe(3);
  });

  it("[Main] is once per turn and needs 2 face-down cards under your Tamers", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: cardId,
              as: "tamer",
              under: [...faceDownPair, ...faceDownPair.map(({ card }) => ({ card, faceUp: false }))],
            },
          ],
          hand: [{ card: "BT27-079", as: "gizmon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 3;

    expect(activateMain(s)).toEqual({ ok: true });
    await settle(() => s.perm("tamer").stack.length === 2);
    await settle();

    expect(activateMain(s)).toEqual(expect.objectContaining({ ok: false }));
    expect(s.perm("tamer").stack).toHaveLength(2);

    const short = setupEngine({
      0: { battleArea: [{ card: cardId, as: "tamer", under: [{ card: "BT1-010", faceUp: false }] }] },
    });
    await short.ready();
    expect(activateMain(short)).toEqual(expect.objectContaining({ ok: false }));
    expect(short.perm("tamer").stack).toHaveLength(1);
  });

  describe("inherited [End of Attack]", () => {
    const board = () =>
      setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT1-034", as: "host", under: [cardId] },
              { card: "BT1-009", as: "fodder" },
            ],
          },
          1: {
            battleArea: [
              { card: "BT1-013", as: "atDp" },
              { card: "BT1-019", as: "aboveDp" },
            ],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: [] },
      );

    it("deletes the chosen Digimon and 1 opponent Digimon with DP up to this Digimon's", async () => {
      const preferred: string[] = [];
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT1-034", as: "host", under: [cardId] },
              { card: "BT1-009", as: "fodder" },
            ],
          },
          1: {
            battleArea: [
              { card: "BT1-013", as: "atDp" },
              { card: "BT1-019", as: "aboveDp" },
            ],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
      );
      await s.ready();
      const hostDp = s.perm("host").currentDP;
      expect(s.perm("atDp").currentDP).toBeLessThanOrEqual(hostDp);
      expect(s.perm("aboveDp").currentDP).toBeGreaterThan(hostDp);
      preferred.push(s.perm("fodder").permanentId, s.perm("aboveDp").permanentId, s.perm("atDp").permanentId);

      await advance(s.engine).fire(EffectTiming.OnEndAttack, s.perm("host"));
      await settle();

      const mine = s.state.players[0]!.battleArea.map(({ topCard }) => topCard.instanceId);
      const theirs = s.state.players[1]!.battleArea.map(({ topCard }) => topCard.instanceId);
      expect(mine).toEqual([s.inst("host").instanceId]);
      expect(theirs).toEqual([s.inst("aboveDp").instanceId]);
      expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("atDp").instanceId]);
    });

    it("still deletes the chosen Digimon when every opponent Digimon has more DP than this Digimon", async () => {
      const preferred: string[] = [];
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT1-034", as: "host", under: [cardId] },
              { card: "BT1-009", as: "fodder" },
            ],
          },
          1: { battleArea: [{ card: "BT1-019", as: "aboveDp" }] },
        },
        { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
      );
      await s.ready();
      preferred.push(s.perm("fodder").permanentId);

      await advance(s.engine).fire(EffectTiming.OnEndAttack, s.perm("host"));
      await settle();

      expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.instanceId)).toEqual([
        s.inst("host").instanceId,
      ]);
      expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.instanceId)).toEqual([
        s.inst("aboveDp").instanceId,
      ]);
    });

    it("may choose this Digimon itself and still uses its DP for the opponent's bound", async () => {
      const preferred: string[] = [];
      const s = setupEngine(
        {
          0: { battleArea: [{ card: "BT1-034", as: "host", under: [cardId] }] },
          1: { battleArea: [{ card: "BT1-013", as: "atDp" }] },
        },
        { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
      );
      await s.ready();
      preferred.push(s.perm("host").permanentId);

      await advance(s.engine).fire(EffectTiming.OnEndAttack, s.perm("host"));
      await settle();

      expect(s.state.players[0]!.battleArea).toHaveLength(0);
      expect(s.state.players[1]!.battleArea).toHaveLength(0);
    });

    it("declining the choice deletes nothing", async () => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT1-034", as: "host", under: [cardId] },
              { card: "BT1-009", as: "fodder" },
            ],
          },
          1: { battleArea: [{ card: "BT1-013", as: "atDp" }] },
        },
        { autoDeclineOptional: true },
      );
      await s.ready();

      await advance(s.engine).fire(EffectTiming.OnEndAttack, s.perm("host"));
      await settle();

      expect(s.state.players[0]!.battleArea).toHaveLength(2);
      expect(s.state.players[1]!.battleArea).toHaveLength(1);
    });

    it("resolves only once per turn", async () => {
      const preferred: string[] = [];
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT1-034", as: "host", under: [cardId] },
              { card: "BT1-009", as: "fodder" },
            ],
          },
          1: {
            battleArea: [
              { card: "BT1-013", as: "atDp" },
              { card: "BT1-013", as: "secondAtDp" },
            ],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
      );
      await s.ready();
      preferred.push(s.perm("fodder").permanentId, s.perm("atDp").permanentId);
      const hostId = s.perm("host").permanentId;

      await advance(s.engine).fire(EffectTiming.OnEndAttack, s.perm("host"));
      await settle();
      expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([hostId]);
      expect(s.state.players[1]!.battleArea).toHaveLength(1);

      await advance(s.engine).fire(EffectTiming.OnEndAttack, s.perm("host"));
      await settle();

      expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([hostId]);
      expect(s.state.players[1]!.battleArea).toHaveLength(1);
    });

    it("does not act from the Tamer while it is in the battle area", async () => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: cardId, as: "tamer" },
              { card: "BT1-009", as: "fodder" },
            ],
          },
          1: { battleArea: [{ card: "BT1-013", as: "atDp" }] },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      await s.ready();

      await advance(s.engine).fire(EffectTiming.OnEndAttack, s.perm("fodder"));
      await settle();

      expect(s.state.players[0]!.battleArea).toHaveLength(2);
      expect(s.state.players[1]!.battleArea).toHaveLength(1);
    });
  });

  it("plays itself from Security without paying the cost", async () => {
    const s = setupEngine(
      { 0: { security: [{ card: cardId, as: "tamer" }] }, 1: { battleArea: [{ card: "BT1-009", as: "attacker" }] } },
      { autoAcceptOptional: true },
    );
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("tamer"));
    await settle();

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual([cardId]);
    expect(s.state.memory).toBe(0);
  });
});
