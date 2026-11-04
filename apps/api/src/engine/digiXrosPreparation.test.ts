import { expect, it } from "vitest";
import { compiled as original } from "../cards/BT1/BT1-010.js";
import { registerIrCard } from "./effects/interpreter.js";
import { setupEngine, settle } from "./testkit/harness.js";
import "../cards/index.js";

async function chooseEffectPlayedCards(s: ReturnType<typeof setupEngine>): Promise<void> {
  await settle(() => s.state.pendingDecision?.kind === "selectCards");
  const decision = s.state.pendingDecision!;
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: decision.decisionId,
      response: { kind: "selectCards", instanceIds: [s.inst("played-a").instanceId, s.inst("played-b").instanceId] },
    }),
  ).toEqual({ ok: true });
}

it.each([false, true])(
  "BT19-087 preserves the optional processing cost during effect DigiXros (accept=%s)",
  async (accept) => {
    // Isolate the effect-play caller; Nene and Shoutmon X4 retain their real compiled modules.
    registerIrCard("BT1-010", {
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "PlayWithoutCost",
              target: { filter: { controller: "mine", cardId: "BT10-009" }, count: 1, from: ["hand"] },
              payCost: false,
            },
          ],
        },
      ],
      coverage: "full",
      residual: [],
    });
    try {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT19-087", as: "nene" }],
            hand: [
              { card: "BT1-010", as: "caller" },
              { card: "BT10-009", as: "played" },
            ],
            trash: [{ card: "BT10-008", as: "material" }],
            deck: ["BT1-009", "BT1-009", "BT1-009"],
          },
        },
        { autoSelectCards: true, autoChooseOption: true },
      );
      s.state.memory = 9;
      await s.ready();
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("caller").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.pendingDecision?.kind === "optional");
      expect(s.state.pendingDecision?.kind).toBe("optional");
      const decision = s.state.pendingDecision!;
      expect(s.decisions.find(({ req }) => req.decisionId === decision.decisionId)?.req.sourceCardId).toBe("BT19-087");
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: decision.decisionId,
          response: { kind: "optional", accept },
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.state.pendingDecision === undefined &&
          s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT10-009"),
      );
      const played = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === "BT10-009");
      expect(played).toBeDefined();
      expect(s.state.pendingDecision).toBeUndefined();
      expect(s.perm("nene").isSuspended).toBe(accept);
      expect(played!.stack.some(({ instanceId }) => instanceId === s.inst("material").instanceId)).toBe(accept);
      expect(s.state.players[0]!.trash.some(({ instanceId }) => instanceId === s.inst("material").instanceId)).toBe(
        !accept,
      );
    } finally {
      registerIrCard("BT1-010", original);
    }
  },
);

it("prepares every pending paid DigiXros play in one replacement batch", async () => {
  registerIrCard("BT1-010", {
    effects: [
      {
        trigger: "OnPlay",
        actions: [
          {
            kind: "PlayWithoutCost",
            target: { filter: { controller: "mine", cardId: "EX10-058" }, count: 2, from: ["hand"] },
            payCost: true,
            costReduction: 9,
          },
        ],
      },
    ],
    coverage: "full",
    residual: [],
  });
  try {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "EX10-064",
              as: "expander",
              under: [
                { card: "EX10-026", as: "under-a" },
                { card: "EX10-027", as: "under-b" },
              ],
            },
            { card: "EX10-063", as: "neutral-tamer" },
          ],
          hand: [
            { card: "BT1-010", as: "caller" },
            { card: "EX10-058", as: "played-a" },
            { card: "EX10-058", as: "played-b" },
          ],
          trash: [
            { card: "EX10-026", as: "trash-a" },
            { card: "EX10-027", as: "trash-b" },
          ],
        },
      },
      { autoAcceptOptional: true, autoChooseOption: true },
    );
    await s.ready();
    s.state.memory = 9;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("caller").instanceId })).toEqual({
      ok: true,
    });
    await chooseEffectPlayedCards(s);
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    let decision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("under-a").instanceId, s.inst("trash-a").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    decision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("under-b").instanceId, s.inst("trash-b").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(
      () => s.state.players[0]!.battleArea.filter(({ topCard }) => topCard.cardId === "EX10-058").length === 2,
    );
    const played = s.state.players[0]!.battleArea.filter(({ topCard }) => topCard.cardId === "EX10-058");
    expect(played).toHaveLength(2);
    expect(played.map(({ topCard }) => topCard.instanceId)).toEqual([
      s.inst("played-a").instanceId,
      s.inst("played-b").instanceId,
    ]);
    expect(played.map(({ stack }) => stack.map(({ instanceId }) => instanceId))).toEqual([
      [s.inst("trash-a").instanceId, s.inst("under-a").instanceId],
      [s.inst("trash-b").instanceId, s.inst("under-b").instanceId],
    ]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.perm("expander").stack).toHaveLength(0);
    expect(s.perm("expander").isSuspended).toBe(true);
    expect(s.state.memory).toBe(6);
    expect(s.state.pendingDecision).toBeUndefined();
  } finally {
    registerIrCard("BT1-010", original);
  }
});

it("applies two EX10-064 quota grants independently across one play batch", async () => {
  registerIrCard("BT1-010", {
    effects: [
      {
        trigger: "OnPlay",
        actions: [
          {
            kind: "PlayWithoutCost",
            target: { filter: { controller: "mine", cardId: "EX10-058" }, count: 2, from: ["hand"] },
            payCost: true,
            costReduction: 9,
          },
        ],
      },
    ],
    coverage: "full",
    residual: [],
  });
  try {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "EX10-064",
              as: "expander-a",
              under: [
                { card: "EX10-026", as: "under-a1" },
                { card: "EX10-027", as: "under-a2" },
              ],
            },
            {
              card: "EX10-064",
              as: "expander-b",
              under: [
                { card: "EX10-026", as: "under-b1" },
                { card: "EX10-027", as: "under-b2" },
              ],
            },
          ],
          hand: [
            { card: "BT1-010", as: "caller" },
            { card: "EX10-058", as: "played-a" },
            { card: "EX10-058", as: "played-b" },
          ],
          trash: [
            { card: "EX10-026", as: "trash-a1" },
            { card: "EX10-027", as: "trash-a2" },
            { card: "EX10-026", as: "trash-b1" },
            { card: "EX10-027", as: "trash-b2" },
          ],
        },
      },
      { autoAcceptOptional: true, autoChooseOption: true },
    );
    await s.ready();
    s.state.memory = 9;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("caller").instanceId })).toEqual({
      ok: true,
    });
    await chooseEffectPlayedCards(s);
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    let decision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("under-a1").instanceId, s.inst("under-a2").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    decision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("trash-a1").instanceId, s.inst("trash-a2").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.pendingDecision === undefined &&
        s.state.players[0]!.battleArea.filter(({ topCard }) => topCard.cardId === "EX10-058").length === 2,
    );
    const played = s.state.players[0]!.battleArea.filter(({ topCard }) => topCard.cardId === "EX10-058");
    expect(played[0]!.stack.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([s.inst("under-a1").instanceId, s.inst("under-a2").instanceId]),
    );
    expect(played[1]!.stack.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([s.inst("trash-a1").instanceId, s.inst("trash-a2").instanceId]),
    );
    expect(s.perm("expander-a").isSuspended).toBe(true);
    expect(s.perm("expander-b").isSuspended).toBe(true);
    expect(s.state.players[0]!.trash).toHaveLength(2);
    expect(s.state.memory).toBe(6);
  } finally {
    registerIrCard("BT1-010", original);
  }
});

it("declining a batch replacement leaves both expansion sources and materials untouched", async () => {
  registerIrCard("BT1-010", {
    effects: [
      {
        trigger: "OnPlay",
        actions: [
          {
            kind: "PlayWithoutCost",
            target: { filter: { controller: "mine", cardId: "EX10-058" }, count: 2, from: ["hand"] },
            payCost: true,
            costReduction: 9,
          },
        ],
      },
    ],
    coverage: "full",
    residual: [],
  });
  try {
    const options = { autoSelectCards: false, autoChooseOption: true };
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "EX10-064",
              as: "expander",
              under: [
                { card: "EX10-026", as: "under-a" },
                { card: "EX10-027", as: "under-b" },
              ],
            },
          ],
          hand: [
            { card: "BT1-010", as: "caller" },
            { card: "EX10-058", as: "played-a" },
            { card: "EX10-058", as: "played-b" },
          ],
          trash: [
            { card: "EX10-026", as: "trash-a" },
            { card: "EX10-027", as: "trash-b" },
          ],
        },
      },
      options,
    );
    await s.ready();
    s.state.memory = 9;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("caller").instanceId })).toEqual({
      ok: true,
    });
    await chooseEffectPlayedCards(s);
    options.autoSelectCards = true;
    await settle(() => s.state.pendingDecision?.kind === "optional");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.pendingDecision === undefined &&
        s.state.players[0]!.battleArea.filter(({ topCard }) => topCard.cardId === "EX10-058").length === 2,
    );
    expect(s.perm("expander").isSuspended).toBe(false);
    expect(s.perm("expander").stack.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("under-a").instanceId,
      s.inst("under-b").instanceId,
    ]);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("trash-a").instanceId,
      s.inst("trash-b").instanceId,
    ]);
    expect(s.state.memory).toBe(2);
    expect(s.state.pendingDecision).toBeUndefined();
  } finally {
    registerIrCard("BT1-010", original);
  }
});
