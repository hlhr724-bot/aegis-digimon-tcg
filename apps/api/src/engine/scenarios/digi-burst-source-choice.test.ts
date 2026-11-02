import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-digi-burst.fixture";
import { advance } from "#api/engine/testkit/advance";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";

it("lets the owner choose nonadjacent digivolution cards for Digi-Burst", async () => {
  const s = setupScenario(fixture, { autoAcceptOptional: true });
  await s.ready();
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    const hercules = s.perm("hercules");
    const sources = [...hercules.stack];
    const effect = observe(s.engine)
      .activatableEffects(hercules)
      .find((entry) => entry.description?.includes("Digi-Burst"))!;
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: hercules.topCard.instanceId,
        effectKey: effect.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision !== undefined);
    const request = s.decisions.at(-1)!.req;
    expect(request.kind).toBe("selectCards");
    expect(request.seat).toBe(0);
    expect(request.options?.candidateInstanceIds).toEqual(sources.map((card) => card.instanceId));
    expect(request.options).toMatchObject({ min: 2, max: 2 });
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: request.decisionId,
        response: { kind: "selectCards", instanceIds: [sources[0]!.instanceId, sources[2]!.instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => hercules.stack.length === 1);
    expect(hercules.stack.map((card) => card.instanceId)).toEqual([sources[1]!.instanceId]);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([sources[0]!.instanceId, sources[2]!.instanceId]),
    );
  } finally {
    await finishTurnLoop({ setup: s, loop });
  }
});

it("cancels Digi-Burst before paying sources without suspending its target", async () => {
  const s = setupScenario(fixture, { autoAcceptOptional: true });
  await s.ready();
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    const host = s.perm("hercules");
    const sources = host.stack.map((card) => card.instanceId);
    const effect = observe(s.engine)
      .activatableEffects(host)
      .find((entry) => entry.description?.includes("Digi-Burst"))!;
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: host.topCard.instanceId,
        effectKey: effect.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision !== undefined);
    const request = s.decisions.at(-1)!.req;
    expect(request.options).toMatchObject({ min: 2, max: 2, declinesCost: true });
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: request.decisionId,
        response: { kind: "selectCards", instanceIds: [sources[0]!] },
      }),
    ).toMatchObject({ ok: false });
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: request.decisionId,
        response: { kind: "selectCards", instanceIds: [] },
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.pendingDecision && s.engine.mainVerbContinuationsInFlight === 0);
    expect(host.stack.map((card) => card.instanceId)).toEqual(sources);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.perm("monochromon").isSuspended).toBe(false);
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: host.topCard.instanceId,
        effectKey: effect.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision !== undefined);
    expect(s.decisions.at(-1)!.req.decisionId).not.toBe(request.decisionId);
  } finally {
    await finishTurnLoop({ setup: s, loop });
  }
});

it("does not consume an insufficient Digi-Burst payment", async () => {
  const s = setupScenario(
    {
      ...fixture,
      board: {
        ...fixture.board,
        0: { ...fixture.board[0], battleArea: [{ card: "ST4-13", as: "hercules", under: ["ST4-05"] }] },
      },
    },
    { autoAcceptOptional: true },
  );
  await s.ready();
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    const host = s.perm("hercules");
    const sources = host.stack.map((card) => card.instanceId);
    const effect = observe(s.engine)
      .activatableEffects(host)
      .find((entry) => entry.description?.includes("Digi-Burst"))!;
    s.engine.applyIntent(0, {
      type: "activateEffect",
      sourceInstanceId: host.topCard.instanceId,
      effectKey: effect.effectKey,
    });
    await settle(() => !s.state.pendingDecision && s.engine.mainVerbContinuationsInFlight === 0);
    expect(host.stack.map((card) => card.instanceId)).toEqual(sources);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.perm("monochromon").isSuspended).toBe(false);
  } finally {
    await finishTurnLoop({ setup: s, loop });
  }
});
