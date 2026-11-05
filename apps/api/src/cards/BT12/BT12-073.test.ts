import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { digivolutionRequirementsFor, EffectTiming } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import "./BT12-073.js";

describe("BT12-073 Impmon (X Antibody)", () => {
  it("digivolves for 0 from Impmon and resolves the paid recovery trigger", async () => {
    expect(digivolutionRequirementsFor("BT12-073")).toContainEqual({
      namesExact: ["Impmon"],
      cost: 0,
      isAlternate: true,
    });
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT2-068", as: "impmon" }],
          hand: [
            { card: "BT12-073", as: "impX" },
            { card: "BT1-109", as: "option" },
          ],
          trash: [{ card: "BT10-082", as: "demonLord" }],
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("impmon").permanentId,
        instanceId: s.inst("impX").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("demonLord").instanceId),
    );
    expect(s.state.memory).toBe(0);
    expect(s.perm("impmon").stack.map(({ cardId }) => cardId)).toEqual(["BT2-068"]);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("option").instanceId);
  });

  it("rejects the alternate evolution from a same-level non-Impmon", () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT15-070", as: "demidevimon" }], hand: [{ card: "BT12-073", as: "impX" }] },
    });
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("demidevimon").permanentId,
        instanceId: s.inst("impX").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
  });

  it("trashes an Option from hand to recover an eligible Digimon from trash", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT12-073", as: "imp" },
            { card: "BT1-109", as: "option" },
          ],
          trash: [{ card: "BT10-010", as: "wizard" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("imp").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.hand.some(({ cardId }) => cardId === "BT10-010"));
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain("BT10-010");
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("BT1-109");
  });

  it.each([
    ["BT15-070", "Evil"],
    ["BT10-010", "Wizard"],
    ["BT10-082", "Demon Lord"],
  ])("accepts the %s %s trait branch", async (card, _trait) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT12-073", as: "impX" }],
          hand: [{ card: "BT1-109", as: "option" }],
          trash: [{ card, as: "target" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const targetId = s.inst("target").instanceId;
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("impX"));
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(targetId);
  });

  it("may decline without paying the Option cost or moving the target", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT12-073", as: "impX" }],
          hand: [{ card: "BT1-109", as: "option" }],
          trash: [{ card: "BT10-010", as: "target" }],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    const optionId = s.inst("option").instanceId;
    const targetId = s.inst("target").instanceId;
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("impX"));
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([optionId]);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual([targetId]);
  });

  it.each([EffectTiming.OnPlay, EffectTiming.WhenDigivolving])(
    "%s may trash the Option cost when there is no eligible Digimon to return",
    async (timing) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT12-073", as: "impX" }],
            hand: [{ card: "BT1-109", as: "option" }],
            trash: [{ card: "BT1-009", as: "plain" }],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      const optionId = s.inst("option").instanceId;
      const plainId = s.inst("plain").instanceId;
      await advance(s.engine).fire(timing, s.perm("impX"));
      expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).not.toContain(optionId);
      expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual([plainId, optionId]);
    },
  );

  it("trashes two deck cards from its inherited attack effect", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-009", as: "host", under: ["BT12-073"] }],
        deck: ["BT1-010", "BT1-011", "BT1-012"],
      },
    });
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("host"));
    expect(s.state.players[0]!.deck).toHaveLength(1);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toEqual(["BT1-010", "BT1-011"]);
  });

  it("trashes the inherited two cards at most once per turn", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-009", as: "host", under: ["BT12-073"] }],
        deck: ["BT1-010", "BT1-011", "BT1-012", "BT1-013"],
      },
    });
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("host"));
    await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("host"));
    expect(s.state.players[0]!.deck).toHaveLength(2);
  });
});

it("can refuse recovery after paying the Option discard", async () => {
  const s = setupEngine({
    0: {
      hand: [
        { card: "BT12-073", as: "imp" },
        { card: "BT1-109", as: "payment" },
      ],
      trash: [{ card: "BT10-010", as: "wizard" }],
    },
  });
  s.state.memory = 10;
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("imp").instanceId })).toEqual({ ok: true });
  await settle(() => s.state.pendingDecision !== undefined);
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: s.state.pendingDecision!.decisionId,
      response: { kind: "selectCards", instanceIds: [s.inst("payment").instanceId] },
    }),
  ).toEqual({ ok: true });
  await settle(
    () =>
      s.decisions.length === 2 ||
      s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("wizard").instanceId),
  );
  expect(s.decisions.at(-1)!.req.kind).toBe("optional");
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: s.state.pendingDecision!.decisionId,
      response: { kind: "optional", accept: false },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.pendingDecision === undefined);
  expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual(
    expect.arrayContaining([s.inst("payment").instanceId, s.inst("wizard").instanceId]),
  );
  expect(s.state.players[0]!.hand).toHaveLength(0);
  expect(s.state.memory).toBe(6);
});
