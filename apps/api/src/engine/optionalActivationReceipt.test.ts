import { describe, expect, it } from "vitest";
import { EffectTiming, Zone, type CompiledCard } from "@aegis/shared";
import "../cards/index.js";
import { registerIrCard, runtimeCompiledCard } from "./effects/interpreter.js";
import { advance } from "./testkit/advance.js";
import { setupEngine, settle } from "./testkit/harness.js";

const CARD_ID = "BT1-009";

const modifySelfDP = (amount: number, optional = false) => ({
  kind: "ModifyDP" as const,
  target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
  amount,
  duration: "forTheTurn" as const,
  optional,
});

async function withCompiledCard(compiled: CompiledCard, run: () => Promise<void>): Promise<void> {
  const original = runtimeCompiledCard(CARD_ID);
  if (original === undefined) throw new Error(`${CARD_ID} must be registered by cards/index.js`);
  registerIrCard(CARD_ID, compiled);
  try {
    await run();
  } finally {
    registerIrCard(CARD_ID, original);
  }
}

function oncePerTurnOnPlay(effect: Omit<CompiledCard["effects"][number], "trigger">): CompiledCard {
  return { effects: [{ ...effect, trigger: "OnPlay", frequency: "OncePerTurn" }], coverage: "full", residual: [] };
}

function optionalActionRequests(s: ReturnType<typeof setupEngine>): string[] {
  return s.decisions.filter(({ req }) => req.kind === "optional").map(({ req }) => req.promptText ?? "");
}

describe("once-per-turn activation receipt boundaries", () => {
  it("does not activate an incomplete fixed-count hand payment", async () => {
    const cost = {
      kind: "trash" as const,
      target: {
        filter: { cardId: "BT1-009", controller: "mine" as const, zone: "hand" as const },
        from: ["hand" as const],
        count: 2,
      },
    };
    await withCompiledCard(
      oncePerTurnOnPlay({
        actions: [
          { kind: "CostGatedBlock", optional: true, abortOnDecline: true, cost, actions: [modifySelfDP(1000)] },
        ],
      }),
      async () => {
        const s = setupEngine({
          0: {
            battleArea: [{ card: CARD_ID, as: "source" }],
            hand: [
              { card: CARD_ID, as: "first" },
              { card: CARD_ID, as: "second" },
            ],
          },
        });
        const fire = advance(s.engine);
        const respond = async (instanceIds: string[]) => {
          await settle(() => s.state.pendingDecision?.kind === "selectCards");
          const prompt = s.decisions.at(-1)!.req;
          expect(prompt.options).toMatchObject({ min: 0, max: 2, purpose: "cost" });
          expect(
            s.engine.applyIntent(0, {
              type: "respondDecision",
              decisionId: prompt.decisionId,
              response: { kind: "selectCards", instanceIds },
            }),
          ).toEqual({ ok: true });
        };

        const incomplete = fire.fire(EffectTiming.OnPlay, s.perm("source"));
        await respond([s.inst("first").instanceId]);
        await incomplete;
        expect(s.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === CARD_ID)).toBe(
          false,
        );
        expect(s.state.players[0]!.hand).toHaveLength(2);
        expect(s.state.players[0]!.trash).toHaveLength(0);
        expect(s.perm("source").currentDP).toBe(3000);

        const complete = fire.fire(EffectTiming.OnPlay, s.perm("source"));
        await respond([s.inst("first").instanceId, s.inst("second").instanceId]);
        await complete;
        expect(s.state.players[0]!.hand).toHaveLength(0);
        expect(s.state.players[0]!.trash).toHaveLength(2);
        expect(s.perm("source").currentDP).toBe(4000);
        const triggerIndex = s.events.findIndex(
          (event) => event.kind === "effectTriggered" && event.sourceCardId === CARD_ID,
        );
        const paymentIndex = s.events.findIndex((event) => event.kind === "cardsMoved" && event.to === "trash");
        expect(triggerIndex).toBeGreaterThan(-1);
        expect(paymentIndex).toBeGreaterThan(triggerIndex);
        expect(
          s.events.filter((event) => event.kind === "effectTriggered" && event.sourceCardId === CARD_ID),
        ).toHaveLength(1);
      },
    );
  });

  it("does not activate or partially pay an incomplete fixed-count deletion cost", async () => {
    await withCompiledCard(
      oncePerTurnOnPlay({
        actions: [
          {
            kind: "CostGatedBlock",
            optional: true,
            abortOnDecline: true,
            cost: {
              kind: "deleteOwn",
              declineViaSelection: true,
              target: { filter: { controller: "mine", cardId: "BT1-010" }, count: 2 },
            },
            actions: [modifySelfDP(1000)],
          },
        ],
      }),
      async () => {
        const s = setupEngine({
          0: {
            battleArea: [
              { card: CARD_ID, as: "source" },
              { card: "BT1-010", as: "first" },
              { card: "BT1-010", as: "second" },
            ],
          },
        });
        const fire = advance(s.engine);
        const respond = async (instanceIds: string[]) => {
          await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
          const prompt = s.decisions.at(-1)!.req;
          expect(prompt.options).toMatchObject({ min: 0, max: 2, purpose: "cost" });
          expect(
            s.engine.applyIntent(0, {
              type: "respondDecision",
              decisionId: prompt.decisionId,
              response: { kind: "chooseTargets", instanceIds },
            }),
          ).toEqual({ ok: true });
        };
        const firstId = s.perm("first").permanentId;
        const secondId = s.perm("second").permanentId;
        const incomplete = fire.fire(EffectTiming.OnPlay, s.perm("source"));
        await respond([firstId]);
        await incomplete;
        expect(s.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === CARD_ID)).toBe(
          false,
        );
        expect(s.state.players[0]!.battleArea).toHaveLength(3);
        expect(s.state.players[0]!.trash).toHaveLength(0);
        expect(s.perm("source").currentDP).toBe(3000);

        const complete = fire.fire(EffectTiming.OnPlay, s.perm("source"));
        await respond([firstId, secondId]);
        await complete;
        expect(s.state.players[0]!.battleArea).toHaveLength(1);
        expect(s.state.players[0]!.trash).toHaveLength(2);
        expect(s.perm("source").currentDP).toBe(4000);
        const triggerIndex = s.events.findIndex(
          (event) => event.kind === "effectTriggered" && event.sourceCardId === CARD_ID,
        );
        const paymentIndex = s.events.findIndex(
          (event) => event.kind === "cardsMoved" && event.deletedPermanents !== undefined,
        );
        expect(triggerIndex).toBeGreaterThan(-1);
        expect(paymentIndex).toBeGreaterThan(triggerIndex);
      },
    );
  });

  it("preserves the once-per-turn opportunity when an optional play has no candidate", async () => {
    await withCompiledCard(
      oncePerTurnOnPlay({
        actions: [
          {
            kind: "PlayWithoutCost",
            target: { filter: { cardId: "BT1-010", controller: "mine", zone: "trash" }, count: 1 },
            from: ["trash"],
            payCost: false,
            optional: true,
          },
        ],
      }),
      async () => {
        const s = setupEngine({ 0: { battleArea: [{ card: CARD_ID, as: "source" }] } }, { autoAcceptOptional: true });
        const fire = advance(s.engine);

        await fire.fire(EffectTiming.OnPlay, s.perm("source"));
        s.give(0, Zone.Trash, { card: "BT1-010", as: "candidate" });
        await fire.fire(EffectTiming.OnPlay, s.perm("source"));

        expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === "BT1-010")).toBe(true);
      },
    );
  });

  it("preserves the once-per-turn opportunity when an optional CostGatedBlock cost is declined", async () => {
    await withCompiledCard(
      oncePerTurnOnPlay({
        actions: [
          {
            kind: "CostGatedBlock",
            optional: true,
            abortOnDecline: true,
            cost: {
              kind: "trash",
              target: { filter: { cardId: "BT1-009", controller: "mine", zone: "hand" }, from: ["hand"], count: 1 },
            },
            actions: [modifySelfDP(1000)],
          },
        ],
      }),
      async () => {
        const s = setupEngine(
          {
            0: {
              battleArea: [{ card: CARD_ID, as: "source" }],
              hand: [{ card: "BT1-009", as: "payment" }],
            },
          },
          { autoDeclineOptional: true },
        );
        const fire = advance(s.engine);

        await fire.fire(EffectTiming.OnPlay, s.perm("source"));
        await fire.fire(EffectTiming.OnPlay, s.perm("source"));

        expect(s.decisions.filter(({ req }) => req.kind === "selectCards")).toHaveLength(2);
        expect(s.events.filter((event) => event.kind === "effectTriggered" || event.kind === "effectResolved")).toEqual(
          [],
        );
        expect(s.perm("source").currentDP).toBe(3000);
        expect(s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("payment").instanceId)).toBe(
          true,
        );
      },
    );
  });

  it("keeps a CostGatedBlock chosen when its paid cost is followed by a declined optional body", async () => {
    await withCompiledCard(
      oncePerTurnOnPlay({
        actions: [
          {
            kind: "CostGatedBlock",
            optional: true,
            abortOnDecline: true,
            cost: {
              kind: "trash",
              target: { filter: { cardId: "BT1-009", controller: "mine", zone: "hand" }, from: ["hand"], count: 1 },
            },
            actions: [modifySelfDP(1000, true)],
          },
        ],
      }),
      async () => {
        const s = setupEngine(
          {
            0: {
              battleArea: [{ card: CARD_ID, as: "source" }],
              hand: [
                { card: "BT1-009", as: "payment" },
                { card: "BT1-009", as: "secondPayment" },
              ],
            },
          },
          { autoSelectCards: true, declinePrompts: ["Modify DP"] },
        );
        const fire = advance(s.engine);

        await fire.fire(EffectTiming.OnPlay, s.perm("source"));
        await fire.fire(EffectTiming.OnPlay, s.perm("source"));

        expect(s.decisions.filter(({ req }) => req.kind === "selectCards")).toHaveLength(1);
        expect(optionalActionRequests(s)).toHaveLength(1);
        expect(s.perm("source").currentDP).toBe(3000);
        expect(s.state.players[0]!.trash.some(({ instanceId }) => instanceId === s.inst("payment").instanceId)).toBe(
          true,
        );
        expect(
          s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("secondPayment").instanceId),
        ).toBe(true);
      },
    );
  });

  it("allows an opted-in PlayWithoutCost activation cost when its payload has no target", async () => {
    await withCompiledCard(
      oncePerTurnOnPlay({
        actions: [
          {
            kind: "PlayWithoutCost",
            target: {
              filter: { cardId: "BT1-010", controller: "mine", zone: "trash" },
              count: 1,
            },
            from: ["trash"],
            payCost: false,
            optional: true,
            allowCostWithoutTarget: true,
            cost: {
              kind: "trash",
              target: { filter: { cardId: "BT1-009", controller: "mine", zone: "hand" }, count: 1 },
            },
          },
        ],
      }),
      async () => {
        const s = setupEngine(
          {
            0: {
              battleArea: [{ card: CARD_ID, as: "source" }],
              hand: [{ card: "BT1-009", as: "payment" }],
            },
          },
          { autoAcceptOptional: true, autoSelectCards: true },
        );

        await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("source"));

        expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("payment").instanceId);
        expect(s.state.players[0]!.battleArea).toHaveLength(1);
      },
    );
  });

  it("allows an opted-in Return activation cost when its payload has no target", async () => {
    await withCompiledCard(
      oncePerTurnOnPlay({
        actions: [
          {
            kind: "Return",
            target: {
              filter: { cardId: "BT1-010", controller: "mine", zone: "trash" },
              count: 1,
            },
            to: "hand",
            optional: true,
            abortOnDecline: true,
            cost: {
              kind: "trash",
              target: { filter: { cardId: "BT1-009", controller: "mine", zone: "hand" }, count: 1 },
              raw: "By trashing 1 card in your hand",
            },
          },
        ],
      }),
      async () => {
        const s = setupEngine(
          {
            0: {
              battleArea: [{ card: CARD_ID, as: "source" }],
              hand: [{ card: "BT1-009", as: "payment" }],
            },
          },
          { autoAcceptOptional: true, autoSelectCards: true },
        );

        await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("source"));

        expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("payment").instanceId);
        expect(s.state.players[0]!.battleArea).toHaveLength(1);
      },
    );
  });

  it("consumes once-per-turn when a declined non-aborting optional cost is followed by mandatory processing", async () => {
    await withCompiledCard(
      oncePerTurnOnPlay({
        actions: [
          {
            kind: "GainMemory",
            amount: 1,
            cost: { kind: "payMemory", memory: 1, optional: true },
          },
        ],
      }),
      async () => {
        const s = setupEngine(
          {
            0: {
              battleArea: [{ card: CARD_ID, as: "source" }],
            },
          },
          { autoDeclineOptional: true },
        );
        const fire = advance(s.engine);

        await fire.fire(EffectTiming.OnPlay, s.perm("source"));
        const afterFirst = s.state.memory;
        await fire.fire(EffectTiming.OnPlay, s.perm("source"));

        expect(s.state.memory).toBe(afterFirst);
        expect(optionalActionRequests(s)).toHaveLength(1);
      },
    );
  });

  it("keeps a mandatory prefix consumed when a later optional action is declined", async () => {
    await withCompiledCard(
      oncePerTurnOnPlay({
        actions: [modifySelfDP(1000), modifySelfDP(1000, true)],
      }),
      async () => {
        const s = setupEngine({ 0: { battleArea: [{ card: CARD_ID, as: "source" }] } }, { autoDeclineOptional: true });
        const fire = advance(s.engine);

        await fire.fire(EffectTiming.OnPlay, s.perm("source"));
        expect(s.perm("source").currentDP).toBe(4000);
        expect(optionalActionRequests(s)).toHaveLength(1);
        await fire.fire(EffectTiming.OnPlay, s.perm("source"));

        expect(s.perm("source").currentDP).toBe(4000);
        expect(optionalActionRequests(s)).toHaveLength(1);
      },
    );
  });

  it("consumes the use after an optional action is accepted even when it changes no state", async () => {
    await withCompiledCard(oncePerTurnOnPlay({ actions: [modifySelfDP(0, true)] }), async () => {
      const s = setupEngine({ 0: { battleArea: [{ card: CARD_ID, as: "source" }] } }, { autoAcceptOptional: true });
      const fire = advance(s.engine);

      await fire.fire(EffectTiming.OnPlay, s.perm("source"));
      await fire.fire(EffectTiming.OnPlay, s.perm("source"));

      expect(s.perm("source").currentDP).toBe(3000);
      expect(optionalActionRequests(s)).toHaveLength(1);
      expect(
        s.events.filter((event) => event.kind === "effectResolved" && event.sourceCardId === CARD_ID),
      ).toHaveLength(1);
    });
  });

  it("keeps an accepted whole-effect optional chosen when its optional body is declined", async () => {
    await withCompiledCard(
      oncePerTurnOnPlay({
        description: "outer optional gate",
        optional: true,
        actions: [modifySelfDP(1000, true)],
      }),
      async () => {
        const s = setupEngine(
          { 0: { battleArea: [{ card: CARD_ID, as: "source" }] } },
          { autoAcceptOptional: true, declinePrompts: ["Modify DP"] },
        );
        const fire = advance(s.engine);

        await fire.fire(EffectTiming.OnPlay, s.perm("source"));
        await fire.fire(EffectTiming.OnPlay, s.perm("source"));

        expect(s.perm("source").currentDP).toBe(3000);
        expect(optionalActionRequests(s)).toHaveLength(2);
        expect(optionalActionRequests(s)[0]).toBe("Use this effect?");
        expect(optionalActionRequests(s)[1]).toContain("Modify DP");
      },
    );
  });

  it("keeps a once-per-turn use consumed after paying the whole-effect cost before declining its body", async () => {
    await withCompiledCard(
      oncePerTurnOnPlay({
        cost: { kind: "suspend", target: { filter: { isSelfRef: true }, count: 1, isSelf: true } },
        actions: [modifySelfDP(1000, true)],
      }),
      async () => {
        const s = setupEngine({ 0: { battleArea: [{ card: CARD_ID, as: "source" }] } }, { autoDeclineOptional: true });
        const fire = advance(s.engine);

        await fire.fire(EffectTiming.OnPlay, s.perm("source"));
        expect(s.perm("source").isSuspended).toBe(true);
        expect(s.perm("source").currentDP).toBe(3000);
        await advance(s.engine).verb.unsuspend([s.perm("source").permanentId]);
        await fire.fire(EffectTiming.OnPlay, s.perm("source"));

        expect(optionalActionRequests(s)).toHaveLength(1);
        expect(s.perm("source").isSuspended).toBe(false);
        expect(s.perm("source").currentDP).toBe(3000);
      },
    );
  });
});
