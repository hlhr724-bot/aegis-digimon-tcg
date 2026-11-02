import { describe, expect, it } from "vitest";
import { EffectTiming, getCardDefinition, type CardInstance } from "@aegis/shared";
import { effectsOf } from "#api/engine/effects/collect";
import type { CardSource } from "#api/engine/effects/CardSource";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, setupEngine, settle } from "#api/engine/testkit/harness";
import { compiled } from "./BT27-093.js";
import "#api/cards/index";

const cardId = "BT27-093";

function activateMain(s: ReturnType<typeof setupEngine>) {
  const source = (s.engine as unknown as { cardSourceOf(instance: CardInstance): CardSource }).cardSourceOf(
    s.inst("tamer"),
  );
  const effectKey = effectsOf(EffectTiming.OnDeclaration, source).find((effect) =>
    effect.effectKey.startsWith(`${cardId}/`),
  )!.effectKey;
  return s.engine.applyIntent(0, { type: "activateEffect", sourceInstanceId: s.inst("tamer").instanceId, effectKey });
}

describe("BT27-093 Miki Kurosaki & Megumi Shirakawa", () => {
  it("matches the catalog and compiles the start-of-main placement, paid digivolve, and Security play", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      nameEn: "Miki Kurosaki & Megumi Shirakawa",
      colors: ["Black", "Yellow"],
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
    ["a Chessmon-named card", "BT27-036", true],
    ["a card with Chessmon only in its text", "BT27-004", true],
    ["a DATA SQUAD card without Chessmon in its text", "BT27-074", false],
  ] as const)(
    "start of main places %s face down under the Tamer to draw and gain memory: %s",
    async (_label, card, paid) => {
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
    },
  );

  it("declining the start-of-main placement keeps the hand and grants nothing", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "tamer" }],
          hand: [{ card: "BT27-036", as: "cost" }],
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

  it("[Main] suspends the Tamer, trashes 2 bottom face-down cards across Tamers, and digivolves into a Chessmon for 2 less", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: cardId,
              as: "tamer",
              under: [
                { card: "BT1-010", as: "tamerBottom", faceUp: false },
                { card: "BT1-011", as: "tamerTop", faceUp: false },
              ],
            },
            { card: "BT26-091", as: "other", under: [{ card: "BT1-012", as: "otherBottom", faceUp: false }] },
            { card: "BT2-052", as: "host" },
          ],
          hand: [
            { card: "BT2-058", as: "nonMatching" },
            { card: "BT27-061", as: "chessmon" },
          ],
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    s.state.memory = 3;
    preferred.push(
      s.perm("host").permanentId,
      s.inst("tamerBottom").instanceId,
      s.inst("otherBottom").instanceId,
      s.inst("nonMatching").instanceId,
      s.inst("chessmon").instanceId,
    );

    expect(activateMain(s)).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === "BT27-061");
    await settle();

    expect(s.perm("tamer").isSuspended).toBe(true);
    expect(s.perm("tamer").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("tamerTop").instanceId]);
    expect(s.perm("other").stack).toHaveLength(0);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId).sort()).toEqual(
      [s.inst("tamerBottom").instanceId, s.inst("otherBottom").instanceId].sort(),
    );
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("nonMatching").instanceId);
    expect(s.state.memory).toBe(2);
    assertNoLoudGap(s);
  });

  it("[Main] pays its cost and digivolves nothing without a Chessmon-named Digimon card in hand", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: cardId,
              as: "tamer",
              under: [
                { card: "BT1-010", faceUp: false },
                { card: "BT1-011", faceUp: false },
              ],
            },
            { card: "BT2-052", as: "host" },
          ],
          hand: [{ card: "BT2-058", as: "nonMatching" }],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    await s.ready();
    s.state.memory = 3;

    expect(activateMain(s)).toEqual({ ok: true });
    await settle(() => s.perm("tamer").stack.length === 0);
    await settle();

    expect(s.perm("tamer").isSuspended).toBe(true);
    expect(s.state.players[0]!.trash).toHaveLength(2);
    expect(s.perm("host").topCard.cardId).toBe("BT2-052");
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("nonMatching").instanceId]);
    expect(s.state.memory).toBe(3);
  });

  it.each([
    ["the Tamer is already suspended", true, 2],
    ["only 1 face-down card is under the Tamers", false, 1],
  ] as const)("[Main] cannot be activated when %s", async (_label, suspended, faceDownCount) => {
    const s = setupEngine({
      0: {
        battleArea: [
          {
            card: cardId,
            as: "tamer",
            suspended,
            under: Array.from({ length: faceDownCount }, () => ({ card: "BT1-010", faceUp: false })),
          },
          { card: "BT2-052", as: "host" },
        ],
        hand: [{ card: "BT27-061", as: "chessmon" }],
      },
    });
    await s.ready();
    s.state.memory = 3;

    expect(activateMain(s)).toEqual(expect.objectContaining({ ok: false }));
    expect(s.perm("tamer").stack).toHaveLength(faceDownCount);
    expect(s.perm("host").topCard.cardId).toBe("BT2-052");
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

  it("highlights the face-down placement while it is paid and the digivolve clause while it resolves", async () => {
    const start = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "tamer" }],
          hand: ["BT27-036", "BT27-004"],
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await start.ready();
    await advance(start.engine).fireForPermanent(EffectTiming.OnStartMainPhase, start.perm("tamer"));
    await settle();
    expect(start.decisions.find(({ req }) => req.kind === "selectCards")?.req.options?.effectTextEmphasis).toBe(
      "By placing 1 card with [Chessmon] in its text from your hand face down under this Tamer",
    );

    const main = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: cardId,
              as: "tamer",
              under: [
                { card: "BT1-010", faceUp: false },
                { card: "BT1-011", faceUp: false },
              ],
            },
            { card: "BT2-052", as: "blackHost" },
            { card: "BT27-036", as: "pawnHost" },
          ],
          hand: ["BT27-061", "BT27-039"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await main.ready();
    main.state.memory = 5;
    expect(activateMain(main)).toEqual({ ok: true });
    await settle(() => main.perm("tamer").stack.length === 0);
    await settle();
    expect(
      main.decisions.find(({ req }) => req.kind === "chooseTargets" && req.sourceCardId === cardId)?.req.options
        ?.effectTextEmphasis,
    ).toBe(
      "1 of your Digimon may digivolve into a Digimon card with [Chessmon] in its name in the hand with the cost reduced by 2.",
    );
  });
});
