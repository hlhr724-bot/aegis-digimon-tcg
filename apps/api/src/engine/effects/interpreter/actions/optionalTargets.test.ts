import { describe, expect, it } from "vitest";
import { EffectDuration, type Action, type Target } from "@aegis/shared";
import { setupEngine } from "../../../testkit/harness.js";
import { internalsOf } from "../../../testkit/internals.js";
import { runAction } from "./runAction.js";
import "../../../../cards/index.js";

describe("optional target preflight", () => {
  it("does not award recovery from an earlier evolution when optional DNA has no legal destination", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "ST1-03", as: "source" }], deck: ["ST1-03"] },
    });
    await s.ready();
    const engine = internalsOf(s.engine);
    const ctx = engine.buildEffectContext(engine.cardSourceOf(s.perm("source").topCard), {});
    ctx.lastDigivolveResult = true;
    await runAction(ctx, {
      kind: "DnaDigivolve",
      materials: { filter: { controller: "mine", kind: ["Digimon"] }, count: 2 },
      into: { controller: "mine", zone: "hand", kind: ["Digimon"] },
      payCost: false,
      optional: true,
    });
    await runAction(ctx, {
      kind: "SecurityManipulation",
      op: "addTop",
      controller: "mine",
      source: "deck",
      amount: 1,
      condition: { kind: "ifThisEffectDigivolved" },
    });
    expect(s.state.players[0]!.security).toHaveLength(0);
    expect(s.state.players[0]!.deck).toHaveLength(1);
    expect(s.decisions).toHaveLength(0);
  });

  it.each([false, true])(
    "preserves an unpaid optional processing cost without refunding an earlier activation (chosen: %s)",
    async (chosen) => {
      const s = setupEngine({ 0: { battleArea: [{ card: "BT23-024", as: "source" }], deck: ["ST1-03"] } });
      await s.ready();
      const engine = internalsOf(s.engine);
      const ctx = engine.buildEffectContext(engine.cardSourceOf(s.perm("source").topCard), {});
      ctx.oncePerTurnActivationChosen = false;
      const handBefore = s.state.players[0]!.hand.length;
      // Fixed test input selects whether a mandatory action preceded the failed cost.
      /* oxlint-disable vitest/no-conditional-expect */
      if (chosen) {
        await runAction(ctx, { kind: "Draw", controller: "mine", amount: 1 });
        expect(s.state.players[0]!.hand).toHaveLength(handBefore + 1);
        expect(ctx.lastEffectActed).toBe(true);
      }
      /* oxlint-enable vitest/no-conditional-expect */
      await runAction(ctx, {
        kind: "ArmSuspendRestriction",
        cost: { kind: "unsuspend", target: { filter: { isSelfRef: true }, count: 1, isSelf: true } },
        optional: true,
        abortOnDecline: true,
      });
      expect(ctx.oncePerTurnActivationDeclined === true).toBe(!chosen);
      expect(ctx.oncePerTurnActivationChosen).toBe(chosen);
      expect(s.perm("source").isSuspended).toBe(false);
      expect(s.decisions).toHaveLength(0);
    },
  );

  it("declines an optional field target through zero picks without changing the board", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "ST1-03", as: "source" }] }, 1: { battleArea: [{ card: "ST1-03", as: "target" }] } },
      { autoDeclineOptional: true },
    );
    await s.ready();
    const engine = internalsOf(s.engine);
    const ctx = engine.buildEffectContext(engine.cardSourceOf(s.perm("source").topCard), {});
    await runAction(ctx, {
      kind: "Suspend",
      optional: true,
      target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
    });
    expect(s.decisions.map(({ req }) => req.kind)).toEqual(["chooseTargets"]);
    expect(ctx.oncePerTurnActivationDeclined).toBe(true);
    expect(ctx.oncePerTurnActivationChosen).not.toBe(true);
    expect(s.perm("target").isSuspended).toBe(false);
    expect(ctx.selectingOptionalTarget).toBeUndefined();
  });

  it.each([false, true])("asks optional Delete only through field selection (accept: %s)", async (accept) => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "ST1-03", as: "source" }] }, 1: { battleArea: [{ card: "ST1-03", as: "target" }] } },
      accept ? { autoAcceptOptional: true, autoSelectCards: true } : { autoDeclineOptional: true },
    );
    await s.ready();
    const engine = internalsOf(s.engine);
    const ctx = engine.buildEffectContext(engine.cardSourceOf(s.perm("source").topCard), {});
    await runAction(ctx, {
      kind: "Delete",
      optional: true,
      target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
    });
    expect(s.decisions.map(({ req }) => req.kind)).toEqual(["chooseTargets"]);
    expect(s.decisions[0]?.req.options).toMatchObject({ min: 0, max: 1, purpose: "optionalTarget" });
    expect(s.state.players[1]!.battleArea).toHaveLength(accept ? 0 : 1);
    expect(ctx.oncePerTurnActivationChosen === true).toBe(accept);
    expect(ctx.oncePerTurnActivationDeclined === true).toBe(!accept);
    expect(ctx.lastDeleteCount).toBe(accept ? 1 : 0);
  });

  it.each(["hand", "trash", "ownStack"] as const)(
    "asks optional play from %s only through a declinable card selection",
    async (from) => {
      for (const accept of [false, true]) {
        const s = setupEngine(
          {
            0: {
              battleArea: [
                {
                  card: "ST1-07",
                  as: "source",
                  ...(from === "ownStack" ? { under: [{ card: "ST1-03", as: "candidate" }] } : {}),
                },
              ],
              ...(from === "hand" ? { hand: [{ card: "ST1-03", as: "candidate" }] } : {}),
              ...(from === "trash" ? { trash: [{ card: "ST1-03", as: "candidate" }] } : {}),
            },
          },
          accept ? { autoAcceptOptional: true, autoSelectCards: true } : { autoDeclineOptional: true },
        );
        await s.ready();
        const engine = internalsOf(s.engine);
        const ctx = engine.buildEffectContext(engine.cardSourceOf(s.perm("source").topCard), {});
        await runAction(ctx, {
          kind: "PlayWithoutCost",
          payCost: false,
          optional: true,
          target: { filter: { controller: "mine", kind: ["Digimon"], level: "3" }, count: 1, upTo: true },
          ...(from === "ownStack" ? { fromOwnDigivolutionStack: true } : { from: [from] }),
        });
        expect(s.decisions.map(({ req }) => req.kind)).toEqual(["selectCards"]);
        expect(s.decisions[0]?.req.options).toMatchObject({ min: 0, max: 1, purpose: "optionalTarget" });
        expect(
          s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("candidate").instanceId),
        ).toBe(accept);
        expect(ctx.oncePerTurnActivationChosen === true).toBe(accept);
        expect(ctx.oncePerTurnActivationDeclined === true).toBe(!accept);
      }
    },
  );

  it.each(["Suspend", "Unsuspend", "Return"] as const)(
    "preserves the optional %s use when no target is available",
    async (kind) => {
      const s = setupEngine({ 0: { battleArea: [{ card: "ST1-03", as: "source" }] } });
      await s.ready();
      const engine = internalsOf(s.engine);
      const ctx = engine.buildEffectContext(engine.cardSourceOf(s.perm("source").topCard), {});
      const target: Target = { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 };
      const action: Action =
        kind === "Return" ? { kind, optional: true, target, to: "hand" } : { kind, optional: true, target };
      await runAction(ctx, action);
      expect(s.decisions).toHaveLength(0);
      expect(ctx.oncePerTurnActivationDeclined).toBe(true);
      expect(ctx.oncePerTurnActivationChosen).not.toBe(true);
      expect(ctx.selectingOptionalTarget).toBeUndefined();
    },
  );

  it("clears an unanswered Unsuspend receipt without undoing an earlier chosen activation", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "ST1-03", as: "source" }] } });
    await s.ready();
    const engine = internalsOf(s.engine);
    const ctx = engine.buildEffectContext(engine.cardSourceOf(s.perm("source").topCard), {});
    ctx.lastEffectActed = true;
    ctx.oncePerTurnActivationChosen = true;
    await runAction(ctx, {
      kind: "Unsuspend",
      optional: true,
      target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
    });
    expect(s.decisions).toHaveLength(0);
    expect(ctx.lastEffectActed).toBe(false);
    expect(ctx.oncePerTurnActivationChosen).toBe(true);
    expect(ctx.oncePerTurnActivationDeclined).not.toBe(true);
  });

  it.each(["alternative cost", "previous target", "bound target", "loose return"] as const)(
    "keeps separate optional consent for a %s",
    async (shape) => {
      const s = setupEngine(
        {
          0: { battleArea: [{ card: "ST1-03", as: "source" }], trash: [{ card: "ST1-07", as: "loose" }] },
          1: { battleArea: [{ card: "ST1-03", as: "target" }] },
        },
        { autoDeclineOptional: true, autoSelectCards: true },
      );
      s.state.memory = 5;
      await s.ready();
      const engine = internalsOf(s.engine);
      const ctx = engine.buildEffectContext(engine.cardSourceOf(s.perm("source").topCard), {});
      ctx.lastResolvedPermanentIds = [s.perm("target").permanentId];
      ctx.selections = new Map([["victim", s.perm("target").permanentId]]);
      const target: Target = { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 };
      const action: Action =
        shape === "loose return"
          ? {
              kind: "Return",
              optional: true,
              from: ["trash"],
              to: "hand",
              target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
            }
          : {
              kind: "Suspend",
              optional: true,
              target:
                shape === "previous target"
                  ? { ...target, sameTarget: true }
                  : shape === "bound target"
                    ? { ...target, filter: { ...target.filter, boundRef: "victim" } }
                    : target,
              ...(shape === "alternative cost" ? { costOptions: [{ kind: "payMemory", memory: 1 }] } : {}),
            };
      await runAction(ctx, action);
      expect(s.decisions.map(({ req }) => req.kind)).toEqual(["optional"]);
      expect(s.state.memory).toBe(5);
      expect(s.perm("target").isSuspended).toBe(false);
      expect(s.state.players[0]!.trash).toHaveLength(1);
      expect(ctx.oncePerTurnActivationDeclined).toBe(true);
    },
  );
  it("preserves an optional play activation when no loose card is legal", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "ST1-03", as: "source" }],
        hand: [{ card: "BT1-009", as: "wrongCard" }],
      },
    });
    await s.ready();
    const engine = internalsOf(s.engine);
    const ctx = engine.buildEffectContext(engine.cardSourceOf(s.perm("source").topCard), {});

    await runAction(ctx, {
      kind: "PlayWithoutCost",
      target: {
        filter: { controller: "mine", nameOrTrait: [{ tokens: ["No Such Card"], match: "nameExact" }] },
        count: 1,
      },
      from: ["hand", "trash"],
      payCost: false,
      optional: true,
      preserveOncePerTurnOnDecline: true,
    });

    expect(s.decisions).toHaveLength(0);
    expect(ctx).toMatchObject({ lastEffectActed: false, oncePerTurnActivationDeclined: true });
  });

  it("preserves an optional play activation when no own-stack card is legal", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "ST1-03", as: "source", under: ["BT1-009"] }],
      },
    });
    await s.ready();
    const engine = internalsOf(s.engine);
    const ctx = engine.buildEffectContext(engine.cardSourceOf(s.perm("source").topCard), {});

    await runAction(ctx, {
      kind: "PlayWithoutCost",
      target: {
        filter: { nameOrTrait: [{ tokens: ["No Such Card"], match: "nameExact" }] },
        count: 1,
      },
      fromOwnDigivolutionStack: true,
      payCost: false,
      optional: true,
      preserveOncePerTurnOnDecline: true,
    });

    expect(s.decisions).toHaveLength(0);
    expect(ctx).toMatchObject({ lastEffectActed: false, oncePerTurnActivationDeclined: true });
  });

  it("asks optional Unsuspend through one declinable target selection", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "ST1-03", as: "source" },
            { card: "ST1-03", as: "first", suspended: true },
            { card: "ST1-03", as: "second", suspended: true },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const engine = internalsOf(s.engine);
    const ctx = engine.buildEffectContext(engine.cardSourceOf(s.perm("source").topCard), {});
    await runAction(ctx, {
      kind: "Unsuspend",
      optional: true,
      target: { filter: { controller: "mine", kind: ["Digimon"], suspended: true }, count: 1 },
    });
    expect(s.decisions.map(({ req }) => req.kind)).toEqual(["chooseTargets"]);
    expect(s.decisions[0]?.req.options).toMatchObject({ min: 0, purpose: "optionalTarget" });
    expect([s.perm("first"), s.perm("second")].filter((p) => !p.isSuspended)).toHaveLength(1);
  });

  it("replaces a successful deletion receipt when the next optional Delete has no target", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "ST1-03", as: "source" }] }, 1: { battleArea: [{ card: "ST1-03", as: "victim" }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const engine = internalsOf(s.engine);
    const ctx = engine.buildEffectContext(engine.cardSourceOf(s.perm("source").topCard), {});
    const target: Target = { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 };
    await runAction(ctx, { kind: "Delete", target });
    expect(ctx.lastDeleteCount).toBe(1);
    const deletedIds = [...(ctx.deletedThisEffectIds ?? [])];
    const decisions = s.decisions.length;
    await runAction(ctx, { kind: "Delete", target, optional: true, trackCount: "latestDeletion" });
    expect(s.decisions).toHaveLength(decisions);
    expect(ctx).toMatchObject({
      lastDeleteCount: 0,
      lastDeleteTargetSelected: false,
      lastDeletedByThisEffectIds: [],
      lastDeletedPermanentSnapshots: [],
      lastEffectActed: false,
    });
    expect(ctx.namedCounts?.get("latestDeletion")).toBe(0);
    expect(ctx.deletedThisEffectIds).toEqual(deletedIds);
    const memory = s.state.memory;
    await runAction(ctx, { kind: "GainMemory", amount: 1, condition: { kind: "ifThisEffectDidNotDelete" } });
    expect(s.state.memory).toBe(memory + 1);
  });

  it("keeps an immune sole Delete target selectable, then leaves it unchanged", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "ST1-03", as: "source" }] }, 1: { battleArea: [{ card: "ST1-03", as: "immune" }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const immune = s.perm("immune");
    internalsOf(s.engine).continuous.addRestriction(immune.permanentId, "beAffected", EffectDuration.Permanent);
    await s.engine.recomputeContinuousEffects();
    const engine = internalsOf(s.engine);
    const ctx = engine.buildEffectContext(engine.cardSourceOf(s.perm("source").topCard), {});
    await runAction(ctx, {
      kind: "Delete",
      optional: true,
      target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
    });
    expect(s.decisions.map(({ req }) => req.kind)).toEqual(["chooseTargets"]);
    expect(s.decisions[0]?.req.options).toMatchObject({ min: 0, purpose: "optionalTarget" });
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });

  it("keeps an immune sole Unsuspend target selectable, then leaves it suspended", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "ST1-03", as: "source" }] },
        1: { battleArea: [{ card: "ST1-03", as: "immune", suspended: true }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const immune = s.perm("immune");
    internalsOf(s.engine).continuous.addRestriction(immune.permanentId, "beAffected", EffectDuration.Permanent);
    await s.engine.recomputeContinuousEffects();
    const engine = internalsOf(s.engine);
    const ctx = engine.buildEffectContext(engine.cardSourceOf(s.perm("source").topCard), {});
    await runAction(ctx, {
      kind: "Unsuspend",
      optional: true,
      target: { filter: { controller: "opponent", kind: ["Digimon"], suspended: true }, count: 1 },
    });
    expect(s.decisions.map(({ req }) => req.kind)).toEqual(["chooseTargets"]);
    expect(ctx.oncePerTurnActivationChosen).toBe(true);
    expect(immune.isSuspended).toBe(true);
  });
  it("keeps an already activated self digivolution's confirmation and use when its payload is declined", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "P-194", as: "source" }], hand: ["BT24-014"] } },
      { autoDeclineOptional: true },
    );
    await s.ready();
    const engine = internalsOf(s.engine);
    const ctx = engine.buildEffectContext(engine.cardSourceOf(s.perm("source").topCard), {});
    ctx.oncePerTurnActivationChosen = true;
    await runAction(ctx, {
      kind: "Digivolve",
      target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
      into: { cardId: "BT24-014" },
      from: ["hand"],
      payCost: true,
      optional: true,
      preserveOncePerTurnOnDecline: true,
    });
    expect(s.decisions.map(({ req }) => req.kind)).toEqual(["optional"]);
    expect(ctx.oncePerTurnActivationChosen).toBe(true);
    expect(ctx.oncePerTurnActivationDeclined).not.toBe(true);
    expect(s.perm("source").topCard.cardId).toBe("P-194");
  });
});
