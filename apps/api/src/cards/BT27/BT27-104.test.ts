import { describe, expect, it } from "vitest";
import { EffectTiming, getCardDefinition } from "@aegis/shared";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, setupEngine, settle } from "#api/engine/testkit/harness";
import { compiled } from "./BT27-104.js";
import "#api/cards/index";

type Session = ReturnType<typeof setupEngine>;

const cardId = "BT27-104";
const redLevel5 = "BT1-020";
const jesmon = "BT13-017";
const warGreymon = "BT1-025";
const royalKnightsOfThePurge = "BT13-110";
const seikenMeppa = "BT10-110";

function handIds(s: Session) {
  return s.state.players[0]!.hand.map(({ instanceId }) => instanceId);
}

function stackIds(s: Session, alias: string) {
  return s.perm(alias).stack.map(({ instanceId }) => instanceId);
}

async function endTurn(s: Session) {
  await advance(s.engine).fireForPermanent(EffectTiming.OnEndTurn, s.perm("tamer"));
  await settle(() => s.state.pendingDecision === undefined);
}

describe("BT27-104 King Drasil", () => {
  it("matches the catalog and compiles every printed clause", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      nameEn: "King Drasil",
      colors: ["White"],
      kinds: ["Tamer"],
      playCost: 4,
      types: ["TS"],
      rarity: "SEC",
    });
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(compiled.effects.map((effect) => [effect.trigger, effect.frequency, effect.isSecurity])).toEqual([
      ["StartOfYourMainPhase", undefined, undefined],
      ["EndOfYourTurn", undefined, undefined],
      ["Security", undefined, true],
    ]);
  });

  it("start of main places any hand card face up under this Tamer to draw 1 and gain 1 memory", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "tamer" }],
          hand: [{ card: redLevel5, as: "cost" }],
          deck: [{ card: "BT1-009", as: "drawn" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const costId = s.inst("cost").instanceId;

    await advance(s.engine).fireForPermanent(EffectTiming.OnStartMainPhase, s.perm("tamer"));
    await settle();

    expect(s.perm("tamer").stack.map(({ instanceId, faceUp }) => [instanceId, faceUp])).toEqual([[costId, true]]);
    expect(handIds(s)).toEqual([s.inst("drawn").instanceId]);
    expect(s.state.memory).toBe(1);
    assertNoLoudGap(s);
  });

  it("declining the start-of-main placement keeps the hand and grants nothing", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "tamer" }],
          hand: [{ card: redLevel5, as: "cost" }],
          deck: ["BT1-009"],
        },
      },
      { autoDeclineOptional: true },
    );
    await s.ready();

    await advance(s.engine).fireForPermanent(EffectTiming.OnStartMainPhase, s.perm("tamer"));
    await settle();

    expect(s.perm("tamer").stack).toHaveLength(0);
    expect(handIds(s)).toEqual([s.inst("cost").instanceId]);
    expect(s.state.memory).toBe(0);
  });

  it("end of turn suspends this Tamer and digivolves into a [Royal Knight] card under it for 2 less", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: cardId,
              as: "tamer",
              under: [
                { card: warGreymon, as: "notKnight" },
                { card: jesmon, as: "jesmon" },
              ],
            },
            { card: redLevel5, as: "base" },
          ],
          hand: [{ card: jesmon, as: "handJesmon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, preferInstanceIds: preferred },
    );
    await s.ready();
    s.state.memory = 3;
    const jesmonId = s.inst("jesmon").instanceId;
    preferred.push(s.perm("base").topCard.instanceId, jesmonId);

    await endTurn(s);

    expect(s.perm("tamer").isSuspended).toBe(true);
    expect(s.perm("base").topCard.instanceId).toBe(jesmonId);
    expect(stackIds(s, "tamer")).toEqual([s.inst("notKnight").instanceId]);
    expect(handIds(s)).toEqual([s.inst("handJesmon").instanceId]);
    expect(s.state.memory).toBe(2);
    assertNoLoudGap(s);
  });

  it("end of turn does not digivolve into a [Royal Knight] card that is only in the hand", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "tamer", under: [{ card: warGreymon, as: "notKnight" }] },
            { card: redLevel5, as: "base" },
          ],
          hand: [{ card: jesmon, as: "handJesmon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    s.state.memory = 3;

    await endTurn(s);

    expect(s.perm("base").topCard.cardId).toBe(redLevel5);
    expect(handIds(s)).toEqual([s.inst("handJesmon").instanceId]);
    expect(s.state.memory).toBe(3);
  });

  it.each([
    ["under this Tamer", "under"],
    ["in the hand", "hand"],
  ] as const)("end of turn uses a cost 5+ [Royal Knight] Option %s for 3 less", async (_label, zone) => {
    const purge = { card: royalKnightsOfThePurge, as: "purge" };
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "tamer", under: zone === "under" ? [purge] : [] }],
          hand: zone === "hand" ? [purge] : [],
          deck: [{ card: "BT1-009", as: "drawn" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferOptionIndex: 1 },
    );
    await s.ready();
    s.state.memory = 4;
    const purgeId = s.inst("purge").instanceId;

    await endTurn(s);

    expect(s.perm("tamer").isSuspended).toBe(true);
    expect(stackIds(s, "tamer")).not.toContain(purgeId);
    expect(handIds(s)).toEqual([s.inst("drawn").instanceId]);
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.instanceId)).toContain(purgeId);
    expect(s.state.memory).toBe(1);
    assertNoLoudGap(s);
  });

  it("end of turn cannot use a [Royal Knight] Option with a use cost below 5", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "tamer", under: [{ card: seikenMeppa, as: "meppa" }] }],
          hand: [{ card: seikenMeppa, as: "handMeppa" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferOptionIndex: 1 },
    );
    await s.ready();
    s.state.memory = 4;

    await endTurn(s);

    expect(stackIds(s, "tamer")).toEqual([s.inst("meppa").instanceId]);
    expect(handIds(s)).toEqual([s.inst("handMeppa").instanceId]);
    expect(s.state.memory).toBe(4);
  });

  it("declining the suspension cost activates neither effect", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "tamer", under: [{ card: jesmon, as: "jesmon" }] },
            { card: redLevel5, as: "base" },
          ],
        },
      },
      { autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 3;

    await endTurn(s);

    expect(s.perm("tamer").isSuspended).toBe(false);
    expect(s.perm("base").topCard.cardId).toBe(redLevel5);
    expect(s.state.memory).toBe(3);
  });
});
