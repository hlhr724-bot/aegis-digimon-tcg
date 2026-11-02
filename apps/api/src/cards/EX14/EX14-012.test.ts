import { afterEach, describe, expect, it } from "vitest";
import { CardColor, EffectTiming } from "@aegis/shared/schema/enums";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { syntheticDefinitions } from "#api/engine/testkit/syntheticDefinitions";
import "#api/cards/index";

afterEach(() => {
  syntheticDefinitions.delete("TEST-TERMINAL-BASE");
});

describe("VictoryGreymon", () => {
  it("boosts before paying the bottom face-down Tamer card and shares its turn limit", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX14-012", as: "source" },
            { card: "BT1-085", as: "tamer", under: [{ card: "BT1-009", faceUp: false, as: "cost" }] },
          ],
        },
        1: { battleArea: [{ card: "BT1-084", as: "target" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("source"));
    expect(s.perm("source").currentDP).toBe(15000);
    expect(s.state.players[0]!.trash.map((c) => c.instanceId)).toContain(s.inst("cost").instanceId);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    await advance(s.engine).fireForPermanent(EffectTiming.OnUseAttack, s.perm("source"), {
      attackerPermanentId: s.perm("source").permanentId,
    });
    expect(s.perm("source").currentDP).toBe(15000);
  });
  it("keeps the boost but does not delete when no face-down payment exists", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX14-012", as: "source" }] },
        1: { battleArea: [{ card: "BT1-009", as: "target" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("source"));
    expect(s.perm("source").currentDP).toBe(15000);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });
  it("uses Dramon Breaker and respects its total DP budget", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-009" }], hand: [{ card: "EX14-012", as: "option" }] },
        1: { battleArea: [{ card: "BT1-009" }, { card: "BT1-009" }, { card: "BT1-084" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((c) => c.cardId === "EX14-012"));
    expect(s.state.players[1]!.trash.map((c) => c.cardId)).toEqual(["BT1-009", "BT1-009"]);
    expect(s.state.memory).toBe(3);
  });
});

describe("VictoryGreymon evolution and reuse", () => {
  it("digivolves from red level five and applies its boost to the real evolved stack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-020", as: "base", under: ["BT1-009"] }],
          hand: [{ card: "EX14-012", as: "evolution" }],
          deck: ["BT1-009"],
        },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").currentDP === 15000);
    expect(s.perm("base").stack.map((c) => c.cardId)).toEqual(["BT1-009", "BT1-020"]);
    expect(s.state.memory).toBe(0);
  });
  it("uses the exact deleted card at no memory cost and does not consume another copy", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX14-012", as: "source" }, { card: "BT1-009" }],
          trash: [{ card: "EX14-012", as: "other" }],
        },
        1: { battleArea: [{ card: "BT1-009" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    s.state.memory = 3;
    await advance(s.engine).verb.deletePermanent([s.perm("source").permanentId]);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((c) => c.instanceId)).toContain(s.inst("other").instanceId);
    expect(s.state.memory).toBe(3);
  });
});

describe("VictoryGreymon printed boundaries", () => {
  it.each([15000, 15001])("compares deletion against the boosted source at %i DP", async (dp) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX14-012", as: "source" },
            { card: "BT1-085", under: [{ card: "BT1-009", faceUp: false }] },
          ],
        },
        1: { battleArea: [{ card: "BT1-009", as: "target", dp }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("source"));
    expect(s.state.players[1]!.battleArea).toHaveLength(dp === 15000 ? 0 : 1);
  });
  it("boosts another ally without raising this Digimon's deletion threshold", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX14-012", as: "source" },
            { card: "BT1-009", as: "ally" },
            { card: "BT1-085", under: [{ card: "BT1-009", faceUp: false }] },
          ],
        },
        1: { battleArea: [{ card: "BT1-009", dp: 12001 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds },
    );
    preferInstanceIds.push(s.perm("ally").topCard.instanceId);
    await s.ready();
    await advance(s.engine).fireForPermanent(EffectTiming.OnUseAttack, s.perm("source"), {
      attackerPermanentId: s.perm("source").permanentId,
    });
    expect(s.perm("source").currentDP).toBe(12000);
    expect(s.perm("ally").currentDP).toBe(6000);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });
  it.each([true, false])("does not pay a face-up card or a refused face-down cost (%s)", async (faceUp) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX14-012", as: "source" },
            { card: "BT1-085", as: "tamer", under: [{ card: "BT1-009", faceUp }] },
          ],
        },
        1: { battleArea: [{ card: "BT1-009" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fireForPermanent(EffectTiming.OnUseAttack, s.perm("source"), {
      attackerPermanentId: s.perm("source").permanentId,
    });
    expect(s.perm("source").currentDP).toBe(15000);
    expect(s.perm("tamer").stack).toHaveLength(1);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });
  it.each([
    { accept: true, remaining: 0 },
    { accept: false, remaining: 1 },
  ])(
    "offers the face-down cost without an opposing target and honors accept=$accept",
    async ({ accept, remaining }) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "EX14-012", as: "source" },
              { card: "BT1-085", as: "tamer", under: [{ card: "BT1-009", as: "faceDown", faceUp: false }] },
            ],
          },
          1: { battleArea: [] },
        },
        accept ? { autoAcceptOptional: true, autoSelectCards: true } : { autoDeclineOptional: true },
      );
      await s.ready();
      await advance(s.engine).fireForPermanent(EffectTiming.OnUseAttack, s.perm("source"), {
        attackerPermanentId: s.perm("source").permanentId,
      });
      expect(s.perm("tamer").stack).toHaveLength(remaining);
      expect(s.state.players[0]!.trash.some(({ instanceId }) => instanceId === s.inst("faceDown").instanceId)).toBe(
        accept,
      );
      expect(s.state.players[1]!.battleArea).toHaveLength(0);
      expect(s.state.pendingDecision).toBeUndefined();
    },
  );
  it("uses the revealed security copy for free", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-009" }],
          security: [{ card: "EX14-012", as: "security", faceUp: true }],
          trash: [{ card: "EX14-012", as: "other" }],
        },
        1: { battleArea: [{ card: "BT1-009" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    s.state.memory = 3;
    await advance(s.engine).fireForInstance(EffectTiming.Security, s.inst("security"));
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.security).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((c) => c.instanceId)).toEqual(
      expect.arrayContaining([s.inst("other").instanceId, s.inst("security").instanceId]),
    );
    expect(s.state.memory).toBe(3);
  });
  it("allows refusing deletion reuse", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX14-012", as: "source" }, { card: "BT1-009" }] },
        1: { battleArea: [{ card: "BT1-009" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("source").permanentId]);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.state.players[0]!.trash.some((c) => c.cardId === "EX14-012")).toBe(true);
  });
  it("cannot reuse a deleted copy without a red or TERMINAL permanent", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "EX14-012", as: "source" }] }, 1: { battleArea: [{ card: "BT1-009" }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("source").permanentId]);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });
  it("Arts Digivolves the used copy without an additional cost", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-020", as: "base" }],
          hand: [{ card: "EX14-012", as: "option" }],
          deck: ["BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-009" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").currentDP === 15000);
    expect(s.perm("base").topCard.instanceId).toBe(s.inst("option").instanceId);
    expect(s.perm("base").stack.map((c) => c.cardId)).toEqual(["BT1-020"]);
    expect(s.state.memory).toBe(3);
  });
  it("rejects digivolution from an unmatched level four", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-015", as: "base" }], hand: [{ card: "EX14-012", as: "evolution" }] },
    });
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }).ok,
    ).toBe(false);
    expect(s.state.memory).toBe(10);
  });
});

describe("VictoryGreymon costs and turn duration", () => {
  it("trashes the bottom face-down Tamer card and preserves the other sources", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX14-012", as: "source" },
            {
              card: "BT1-085",
              as: "tamer",
              under: [
                { card: "BT1-009", as: "faceup", faceUp: true },
                { card: "BT1-009", as: "bottom", faceUp: false },
                { card: "BT1-009", as: "upper", faceUp: false },
              ],
            },
          ],
        },
        1: { battleArea: [{ card: "BT1-009" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("source"));
    expect(s.perm("tamer").stack.map((c) => c.instanceId)).toEqual([
      s.inst("faceup").instanceId,
      s.inst("upper").instanceId,
    ]);
    expect(s.state.players[0]!.trash.map((c) => c.instanceId)).toContain(s.inst("bottom").instanceId);
  });
  it.each([15000, 15001])("enforces Dramon Breaker's exact total DP ceiling (%i)", async (dp) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-009" }], hand: [{ card: "EX14-012", as: "option" }] },
        1: { battleArea: [{ card: "BT1-009", dp }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }).ok,
    ).toBe(true);
    await settle(() => s.state.players[0]!.trash.some((c) => c.cardId === "EX14-012"));
    expect(s.state.players[1]!.battleArea).toHaveLength(dp === 15000 ? 0 : 1);
  });
  it("resets its shared limit next turn and expires both boosts at opponent turn end", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX14-012", as: "source" }], deck: ["BT1-009", "BT1-009"] },
        1: { deck: ["BT1-009", "BT1-009"] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("source"));
    expect(s.perm("source").currentDP).toBe(15000);
    await advance(s.engine).runTurn(0);
    expect(s.perm("source").currentDP).toBe(15000);
    s.state.turnSeat = 1;
    s.state.memory = -s.state.memory;
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("source"));
    expect(s.perm("source").currentDP).toBe(18000);
    advance(s.engine).endMainPhaseIfOpen(1);
    await turn;
    expect(s.perm("source").currentDP).toBe(12000);
  });
});

describe("VictoryGreymon checked-card lifecycle", () => {
  it.each([true, false])("resolves the actually checked copy through a real attack (use: %s)", async (use) => {
    const preferInstanceIds: string[] = [];
    const declinePrompts = ["Arts Digivolve"];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-009", as: "attacker", dp: 1000 },
            { card: "BT1-009", as: "target", dp: 15000 },
          ],
        },
        1: {
          battleArea: [{ card: "BT1-009" }],
          security: [
            { card: "EX14-012", as: "checked" },
            { card: "EX14-012", as: "remaining" },
          ],
          trash: [{ card: "EX14-012", as: "other" }],
        },
      },
      {
        autoSelectCards: true,
        autoAcceptOptional: use,
        autoDeclineOptional: !use,
        declinePrompts,
        preferInstanceIds,
      },
    );
    preferInstanceIds.push(s.perm("target").topCard.instanceId);
    await s.ready();
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).finishAttack();
    await settle(() => s.events.some((event) => event.kind === "securityChecked"));
    expect(s.state.players[1]!.security.map((card) => card.instanceId)).toEqual([s.inst("remaining").instanceId]);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toEqual([
      s.inst("other").instanceId,
      s.inst("checked").instanceId,
    ]);
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.instanceId)).toEqual([
      s.inst(use ? "attacker" : "target").instanceId,
    ]);
    expect(s.events.filter((event) => event.kind === "securityChecked")).toEqual([
      expect.objectContaining({ resolution: use ? "effect" : "battle" }),
    ]);
    expect(s.state.memory).toBe(3);
    const reuseDecision = s.decisions.find(({ req }) => req.sourceCardId === "EX14-012" && req.kind === "optional");
    expect(reuseDecision?.req.options?.effectTextEmphasis).toBe("You may use this card without paying the cost.");
    const deleteDecision = s.decisions.find(
      ({ req }) => req.kind === "chooseTargets" && req.options?.maxTotalDP === 15000,
    );
    expect(deleteDecision?.req.options?.effectTextEmphasis).toBe(
      use ? "Delete up to 15000 DP total worth of your opponent's Digimon." : undefined,
    );
    expect(s.state.pendingDecision).toBeUndefined();
  });
});

describe("VictoryGreymon decision stage emphasis", () => {
  it.each([EffectTiming.WhenDigivolving, EffectTiming.OnUseAttack])(
    "highlights the boost and paid deletion stages at timing %s",
    async (timing) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "EX14-012", as: "source" },
              { card: "BT1-009" },
              { card: "BT1-085", under: [{ card: "BT1-009", faceUp: false }] },
              { card: "BT1-085", under: [{ card: "BT1-010", faceUp: false }] },
            ],
          },
          1: { battleArea: [{ card: "BT1-009" }, { card: "BT1-010" }] },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      await s.ready();
      await advance(s.engine).fireForPermanent(timing, s.perm("source"), {
        attackerPermanentId: s.perm("source").permanentId,
      });
      const boost = "1 of your Digimon gets +3000 DP until the end of your opponent's turn.";
      const deletion =
        "Then, by trashing the bottom face-down card from under any of your Tamers, delete 1 of your opponent's Digimon with as much DP as this Digimon or less.";
      const deletionCost = "by trashing the bottom face-down card from under any of your Tamers";
      const decisions = s.decisions.filter(({ req }) => req.sourceCardId === "EX14-012");
      expect(
        decisions.some(({ req }) => req.kind === "chooseTargets" && req.options?.effectTextEmphasis === boost),
      ).toBe(true);
      expect(
        decisions.some(({ req }) => req.kind === "selectCards" && req.options?.effectTextEmphasis === deletionCost),
      ).toBe(true);
      expect(
        decisions.some(({ req }) => req.kind === "chooseTargets" && req.options?.effectTextEmphasis === deletion),
      ).toBe(true);
      expect(s.state.players[1]!.battleArea).toHaveLength(1);
    },
  );
});

describe("Dramon Breaker aggregate target selection", () => {
  it.each([
    { selected: ["first", "second", "third"], deleted: 3 },
    { selected: ["first", "second", "third", "extra"], deleted: 0 },
    { selected: [], deleted: 0 },
  ])(
    "resolves the complete selection $selected without choosing a subset for the player",
    async ({ selected, deleted }) => {
      const s = setupEngine(
        {
          0: { battleArea: ["BT1-009"], hand: [{ card: "EX14-012", as: "option" }] },
          1: {
            battleArea: [
              { card: "BT1-009", as: "first", dp: 6000 },
              { card: "BT1-009", as: "second", dp: 6000 },
              { card: "BT1-009", as: "third", dp: 3000 },
              { card: "BT1-009", as: "extra", dp: 1000 },
            ],
          },
        },
        { autoAcceptOptional: true, declinePrompts: ["Arts Digivolve"] },
      );
      await s.ready();
      s.state.memory = 10;
      expect(
        s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
      const request = s.decisions.find(({ req }) => req.kind === "chooseTargets")!.req;
      expect(request.options).toMatchObject({ min: 0, max: 4, maxTotalDP: 15000 });
      expect(request.options?.candidateInstanceIds).toEqual(
        expect.arrayContaining(["first", "second", "third", "extra"].map((alias) => s.perm(alias).permanentId)),
      );
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: request.decisionId,
          response: { kind: "chooseTargets", instanceIds: selected.map((alias) => s.perm(alias).permanentId) },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[0]!.trash.some(({ cardId }) => cardId === "EX14-012"));
      expect(s.state.players[1]!.battleArea).toHaveLength(4 - deleted);
      expect(s.state.players[1]!.trash).toHaveLength(deleted);
      expect(s.decisions.filter(({ req }) => req.kind === "chooseTargets")).toHaveLength(1);
      expect(s.state.memory).toBe(3);
      expect(s.state.pendingDecision).toBeUndefined();
    },
  );
});

describe("VictoryGreymon Arts Digivolve paid deletion", () => {
  it.each([
    { otherDp: 16000, decisions: 1 },
    { otherDp: 12000, decisions: 2 },
  ])(
    "uses the evolved Digimon's 15000 DP after trashing a 3000 DP Tamer source with another target at $otherDp DP",
    async ({ otherDp, decisions }) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT1-020", as: "base", under: ["BT1-009"] },
              {
                card: "BT1-085",
                as: "tamer",
                under: [
                  { card: "BT1-009", as: "payment", faceUp: false },
                  { card: "BT1-010", as: "remainingPayment", faceUp: false },
                ],
              },
            ],
            hand: [{ card: "EX14-012", as: "option" }],
            deck: ["BT1-009", "BT1-009"],
          },
          1: {
            battleArea: [
              { card: "BT1-009", as: "equalDp", dp: 15000 },
              { card: "BT1-010", as: "aboveDp", dp: otherDp },
              { card: "BT1-009", as: "mainSmall", dp: 3000 },
              { card: "BT1-010", as: "mainFirst", dp: 6000 },
              { card: "BT1-009", as: "mainSecond", dp: 6000 },
            ],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      await s.ready();
      s.state.memory = 10;
      expect(
        s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.state.players[1]!.battleArea.length === 1 &&
          s.state.players[0]!.trash.some(({ instanceId }) => instanceId === s.inst("payment").instanceId),
      );
      expect(s.perm("base").topCard.instanceId).toBe(s.inst("option").instanceId);
      expect(s.perm("base").currentDP).toBe(15000);
      expect(s.perm("tamer").stack.map(({ instanceId }) => instanceId)).toEqual([
        s.inst("remainingPayment").instanceId,
      ]);
      expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.instanceId)).toEqual([
        s.inst("aboveDp").instanceId,
      ]);
      expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual(
        expect.arrayContaining(
          ["mainSmall", "mainFirst", "mainSecond", "equalDp"].map((alias) => s.inst(alias).instanceId),
        ),
      );
      expect(s.decisions.filter(({ req }) => req.kind === "chooseTargets")).toHaveLength(decisions);
      expect(s.decisions.find(({ req }) => req.kind === "chooseTargets")?.req.options?.maxTotalDP).toBe(15000);
      expect(s.state.memory).toBe(3);
      expect(s.state.pendingDecision).toBeUndefined();
    },
  );
});

describe("VictoryGreymon alternative requirements", () => {
  it.each([
    { traits: ["TERMINAL"], level: 5, evolves: true, uses: true },
    { traits: ["Dragonkin", "TERMINAL"], level: 5, evolves: true, uses: true },
    { traits: ["TERMINAL"], level: 4, evolves: false, uses: true },
    { traits: ["TERMINAL X"], level: 5, evolves: false, uses: false },
    { traits: ["TWIN"], level: 5, evolves: false, uses: false },
  ])("checks a blue level $level base with $traits", async ({ traits, level, evolves, uses }) => {
    syntheticDefinitions.set("TEST-TERMINAL-BASE", {
      ...getCardDefinition("BT1-009")!,
      cardId: "TEST-TERMINAL-BASE",
      colors: [CardColor.Blue],
      level,
      types: traits,
    });
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "TEST-TERMINAL-BASE", as: "base", under: ["BT1-009"] }],
          hand: [
            { card: "EX14-012", as: "evolution" },
            { card: "EX14-012", as: "option" },
          ],
          deck: ["BT1-009"],
        },
        1: { battleArea: ["BT1-009"] },
      },
      { autoSelectCards: true, autoDeclineOptional: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("option").instanceId,
        useAs: "option",
      }).ok,
    ).toBe(uses);
    if (uses) {
      await settle(() =>
        s.state.players[0]!.trash.some(({ instanceId }) => instanceId === s.inst("option").instanceId),
      );
    }
    expect(s.state.memory).toBe(uses ? 3 : 10);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }).ok,
    ).toBe(evolves);
    if (evolves) {
      await settle(() => s.perm("base").currentDP === 15000);
    }
    expect(s.perm("base").stack.map(({ cardId }) => cardId)).toEqual(
      evolves ? ["BT1-009", "TEST-TERMINAL-BASE"] : ["BT1-009"],
    );
    expect(s.perm("base").topCard.instanceId).toBe(s.inst(evolves ? "evolution" : "base").instanceId);
    expect(s.state.memory).toBe(10 - Number(uses) * 7 - Number(evolves) * 3);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});

describe("VictoryGreymon end-of-turn attack", () => {
  it.each([true, false])("offers Engage and applies two security checks when accepted (%s)", async (accept) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX14-012", as: "source" }], deck: ["BT1-009", "BT1-009"] },
        1: { security: ["BT1-009", "BT1-009", "BT1-009"] },
      },
      { autoSelectCards: true, autoAcceptOptional: accept, autoDeclineOptional: !accept },
    );
    await s.ready();
    await advance(s.engine).runTurn(0);
    expect(s.state.players[1]!.security).toHaveLength(accept ? 1 : 3);
    expect(s.perm("source").isSuspended).toBe(accept);
    expect(s.perm("source").currentDP).toBe(accept ? 15000 : 12000);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});
