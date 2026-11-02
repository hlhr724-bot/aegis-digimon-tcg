import { describe, expect, it } from "vitest";
import { EffectTiming, getCardDefinition, type CardInstance } from "@aegis/shared";
import { effectsOf } from "#api/engine/effects/collect";
import type { CardSource } from "#api/engine/effects/CardSource";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, setupEngine, settle } from "#api/engine/testkit/harness";
import { compiled } from "./BT27-095.js";
import "#api/cards/index";

const cardId = "BT27-095";

function activateMain(s: ReturnType<typeof setupEngine>) {
  const source = (s.engine as unknown as { cardSourceOf(instance: CardInstance): CardSource }).cardSourceOf(
    s.inst("homer"),
  );
  const effectKey = effectsOf(EffectTiming.OnDeclaration, source).find((effect) =>
    effect.effectKey.startsWith(`${cardId}/`),
  )!.effectKey;
  return s.engine.applyIntent(0, { type: "activateEffect", sourceInstanceId: s.inst("homer").instanceId, effectKey });
}

describe("BT27-095 Homer Yushima", () => {
  it("matches the catalog and compiles the start-of-main placement, paid digivolve, and Security play", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      nameEn: "Homer Yushima",
      colors: ["Black", "Blue"],
      kinds: ["Tamer"],
      playCost: 4,
      types: ["DATA SQUAD"],
    });
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(compiled.effects.map((effect) => effect.trigger)).toEqual(["StartOfYourMainPhase", "Main", "Security"]);
    expect(compiled.effects[1]?.actions[0]).toMatchObject({
      kind: "CostGatedBlock",
      cost: { kind: "compound", costs: [{ kind: "suspend" }, { kind: "trashBottomFaceDownUnderTamer", count: 2 }] },
    });
  });

  it.each([
    ["a Cyborg", "BT1-024", true],
    ["an Aquatic", "BT2-024", true],
    ["a rule-granted Aquatic", "BT27-020", true],
    ["a non-matching", "BT1-020", false],
  ] as const)(
    "start of main places %s card face down under Homer to draw and gain memory: %s",
    async (_label, card, paid) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: cardId, as: "homer" }],
            hand: [{ card, as: "cost" }],
            deck: [{ card: "BT1-009", as: "drawn" }],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      await s.ready();

      await advance(s.engine).fireForPermanent(EffectTiming.OnStartMainPhase, s.perm("homer"));
      await settle();

      expect(s.perm("homer").stack.map(({ instanceId, faceUp }) => [instanceId, faceUp])).toEqual(
        paid ? [[s.inst("cost").instanceId, false]] : [],
      );
      expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([
        paid ? s.inst("drawn").instanceId : s.inst("cost").instanceId,
      ]);
      expect(s.state.memory).toBe(paid ? 1 : 0);
    },
  );

  it("declining the start-of-main placement keeps the hand and grants nothing", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "homer" }],
          hand: [{ card: "BT1-024", as: "cost" }],
          deck: ["BT1-009"],
        },
      },
      { autoDeclineOptional: true },
    );
    await s.ready();

    await advance(s.engine).fireForPermanent(EffectTiming.OnStartMainPhase, s.perm("homer"));
    await settle();

    expect(s.perm("homer").stack).toHaveLength(0);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("cost").instanceId]);
    expect(s.state.memory).toBe(0);
  });

  it("[Main] suspends Homer, trashes 2 face-down cards across Tamers, and digivolves into a Cyborg for 2 less", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "homer", under: [{ card: "BT1-010", as: "homerCard", faceUp: false }] },
            { card: "BT26-091", as: "other", under: [{ card: "BT1-011", as: "otherCard", faceUp: false }] },
            { card: "BT1-019", as: "host" },
          ],
          hand: [
            { card: "BT1-020", as: "nonMatching" },
            { card: "BT1-024", as: "cyborg" },
          ],
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    s.state.memory = 3;
    preferred.push(s.perm("host").permanentId, s.inst("nonMatching").instanceId, s.inst("cyborg").instanceId);

    expect(activateMain(s)).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === "BT1-024");
    await settle();

    expect(s.perm("homer").isSuspended).toBe(true);
    expect(s.perm("homer").stack).toHaveLength(0);
    expect(s.perm("other").stack).toHaveLength(0);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId).sort()).toEqual(
      [s.inst("homerCard").instanceId, s.inst("otherCard").instanceId].sort(),
    );
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("nonMatching").instanceId);
    expect(s.state.memory).toBe(2);
    assertNoLoudGap(s);
  });

  it.each([
    ["Homer is already suspended", true, 2],
    ["only 1 face-down card is under the Tamers", false, 1],
  ] as const)("[Main] cannot be activated when %s", async (_label, suspended, faceDownCount) => {
    const s = setupEngine({
      0: {
        battleArea: [
          {
            card: cardId,
            as: "homer",
            suspended,
            under: Array.from({ length: faceDownCount }, () => ({ card: "BT1-010", faceUp: false })),
          },
          { card: "BT1-019", as: "host" },
        ],
        hand: [{ card: "BT1-024", as: "cyborg" }],
      },
    });
    await s.ready();
    s.state.memory = 3;

    expect(activateMain(s)).toEqual(expect.objectContaining({ ok: false }));
    expect(s.perm("homer").stack).toHaveLength(faceDownCount);
    expect(s.perm("host").topCard.cardId).toBe("BT1-019");
  });

  it("plays itself from Security without paying the cost", async () => {
    const s = setupEngine(
      { 0: { security: [{ card: cardId, as: "homer" }] }, 1: { battleArea: [{ card: "BT1-009", as: "attacker" }] } },
      { autoAcceptOptional: true },
    );
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("homer"));
    await settle();

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual([cardId]);
  });

  it("highlights the face-down placement while it is paid and the digivolve clause while it resolves", async () => {
    const start = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "homer" }],
          hand: ["BT2-024", "BT1-024"],
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await start.ready();
    await advance(start.engine).fireForPermanent(EffectTiming.OnStartMainPhase, start.perm("homer"));
    await settle();
    expect(start.decisions.find(({ req }) => req.kind === "selectCards")?.req.options?.effectTextEmphasis).toBe(
      "By placing 1 [Cyborg] or [Aquatic] trait card from your hand face down under this Tamer",
    );

    const main = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: cardId,
              as: "homer",
              under: [
                { card: "BT1-010", faceUp: false },
                { card: "BT1-011", faceUp: false },
              ],
            },
            { card: "BT1-019", as: "redHost" },
            { card: "ST24-03", as: "blueHost" },
          ],
          hand: ["BT1-024", "BT25-027"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await main.ready();
    main.state.memory = 5;
    expect(activateMain(main)).toEqual({ ok: true });
    await settle(() => main.perm("homer").stack.length === 0);
    await settle();
    expect(
      main.decisions.find(({ req }) => req.kind === "chooseTargets" && req.sourceCardId === cardId)?.req.options
        ?.effectTextEmphasis,
    ).toBe(
      "1 of your Digimon may digivolve into a [Cyborg] or [Aquatic] trait Digimon card in the hand with the cost reduced by 2.",
    );
  });
});
