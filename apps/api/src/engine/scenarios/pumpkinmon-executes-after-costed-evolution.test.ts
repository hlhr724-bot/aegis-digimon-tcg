import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/pumpkinmon-executes-after-costed-evolution.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";
import { settle } from "#api/engine/testkit/harness";

it("pays Pumpkinmon's discard after crossing memory and executes before its keyword grants expire", async () => {
  const preferred: string[] = [];
  const s = setupScenario(fixture, {
    autoAcceptOptional: true,
    autoSelectCards: true,
    autoChooseOption: true,
    preferInstanceIds: preferred,
  });
  preferred.push(s.inst("payment").instanceId);
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("garurumon").permanentId,
        instanceId: s.inst("pumpkinmon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("payment").instanceId);
    expect(s.state.players[1]!.security).toHaveLength(2);
    expect(s.events.filter((event) => event.kind === "attackDeclared")).toHaveLength(1);
    expect(s.state.players[0]!.security.map((card) => card.instanceId)).toContain(s.inst("pumpkinmon").instanceId);
    expect(s.state.pendingDecision).toBeUndefined();
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});

it("declines Pumpkinmon's discard without granting an end-of-turn attack", async () => {
  const s = setupScenario(fixture);
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("garurumon").permanentId,
        instanceId: s.inst("pumpkinmon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "selectCards", instanceIds: [] },
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("payment").instanceId);
    expect(s.state.players[1]!.security).toHaveLength(3);
    expect(s.events.filter((event) => event.kind === "attackDeclared")).toHaveLength(0);
    expect(s.state.pendingDecision).toBeUndefined();
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});

it.each(["BT23-069", "BT26-075"])("keeps intrinsic self-granted Execute registered exactly once: %s", async (card) => {
  const s = setupScenario(
    {
      ...fixture,
      memory: 3,
      board: {
        ...fixture.board,
        0: { battleArea: [{ card, as: "intrinsic" }], deck: Array<string>(8).fill("BT1-009"), security: 3 },
      },
    },
    { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
  );
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    expect(
      observe(s.engine)
        .customEffectGrants(s.perm("intrinsic"))
        .filter(({ token }) => token === "Execute"),
    ).toHaveLength(0);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.state.players[1]!.security).toHaveLength(2);
    expect(s.events.filter((event) => event.kind === "attackDeclared")).toHaveLength(1);
    expect(s.state.pendingDecision).toBeUndefined();
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
