import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "#api/engine/effects/interpreter";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/P/P-190";
import "#api/cards/EX10/EX10-073";
import "#api/cards/BT21/BT21-009";

describe("P-190 Tweetmon", () => {
  it("encodes Appmon evolution and Link requirements", () => {
    const card = runtimeCompiledCard("P-190")!;
    expect(card.digivolutionRequirement).toEqual([{ level: 2, traits: ["Appmon"], cost: 0, isAlternate: true }]);
    expect(card.linkRequirement).toEqual([{ cost: 1, traits: ["Appmon"] }]);
  });

  it("encodes the printed linked-only Draw 1 timing", () => {
    const card = runtimeCompiledCard("P-190")!;
    expect(card.effects.find((effect) => effect.trigger === "WhenLinking")).toMatchObject({
      isLinked: true,
      actions: [{ kind: "Draw", controller: "mine", amount: 1 }],
    });
  });

  it("draws on play", () => {
    expect(runtimeCompiledCard("P-190")!.effects.find((effect) => effect.trigger === "OnPlay")).toMatchObject({
      actions: [{ kind: "Draw", controller: "mine", amount: 1 }],
    });
  });
});
describe("P-190 engine behavior", () => {
  it("draws the top card when played", async () => {
    const s = setupEngine({
      0: { hand: [{ card: "P-190", as: "demiveemon" }], deck: [{ card: "BT1-009", as: "drawn" }] },
    });
    s.state.memory = 20;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("demiveemon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawn").instanceId));
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawn").instanceId)).toBe(true);
  });

  it("does not draw when a different card is linked to this host", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "P-190", as: "host" }],
        hand: [{ card: "BT21-009", as: "linked" }],
        deck: [{ card: "BT1-009", as: "drawn" }],
      },
    });
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "linkCard",
        instanceId: s.inst("linked").instanceId,
        targetPermanentId: s.perm("host").permanentId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").linked.some((card) => card.cardId === "BT21-009"));
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawn").instanceId)).toBe(false);
  });

  it("draws when P-190 itself is linked from hand to an Appmon host", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT21-009", as: "appmonHost" }],
          hand: [{ card: "P-190", as: "tweetmon" }],
          deck: [{ card: "BT1-009", as: "drawn" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "linkCard",
        instanceId: s.inst("tweetmon").instanceId,
        targetPermanentId: s.perm("appmonHost").permanentId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("appmonHost").linked.some((card) => card.cardId === "P-190"));
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawn").instanceId));
    expect(s.perm("appmonHost").linked.some((card) => card.instanceId === s.inst("tweetmon").instanceId)).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawn").instanceId)).toBe(true);
    expect(s.state.memory).toBe(9);
  });

  it("rejects linking P-190 to a non-Appmon host", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-009", as: "nonAppmonHost" }], hand: [{ card: "P-190", as: "tweetmon" }] },
    });
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "linkCard",
        instanceId: s.inst("tweetmon").instanceId,
        targetPermanentId: s.perm("nonAppmonHost").permanentId,
      }),
    ).toEqual({ ok: false, reason: "link-requirement-unmet" });
    expect(s.state.memory).toBe(10);
  });
});

it("does not repeat Tweetmon's draw when another card links beside it", async () => {
  const s = setupEngine({
    0: {
      battleArea: [{ card: "EX10-073", as: "host", linked: [{ card: "P-190", as: "tweetmon" }] }],
      hand: [{ card: "BT21-009", as: "newLink" }],
      deck: [{ card: "BT1-009", as: "drawn" }],
    },
  });
  s.state.memory = 5;
  await s.ready();
  expect(
    s.engine.applyIntent(0, {
      type: "linkCard",
      instanceId: s.inst("newLink").instanceId,
      targetPermanentId: s.perm("host").permanentId,
    }),
  ).toEqual({ ok: true });
  await settle(() => s.perm("host").linked.length === 2 && !s.state.pendingDecision);
  expect(s.state.players[0]!.hand).toHaveLength(0);
  expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([s.inst("drawn").instanceId]);
});
