import { observe } from "#api/engine/testkit/observe";
import { Phase } from "@aegis/shared/schema/enums";
import { advance } from "#api/engine/testkit/advance";
import { expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/EX12/EX12-052";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/optional-dp-and-battle.fixture";

it("can decline Diarbbitmon's DP and battle effect after declaring an attack", async () => {
  const s = setupScenario(fixture, { autoSelectCards: true });
  const loop = s.engine.startTurnLoop();
  try {
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.state.pendingDecision?.kind).toBe("optional");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.perm("attacker").currentDP).toBe(12000);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.state.players[1]!.security).toHaveLength(0);
    expect(s.state.pendingDecision).toBeUndefined();
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});

it("can decline the evolution buff while still gaining immunity", async () => {
  const s = setupEngine(
    {
      0: {
        battleArea: [{ card: "BT1-075", as: "base" }],
        hand: [{ card: "EX12-052", as: "evolution" }],
      },
      1: { battleArea: [{ card: "BT1-009", as: "opponent" }] },
    },
    { autoSelectCards: true, declinePrompts: ["effect"] },
  );
  s.state.memory = 5;
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("base").permanentId,
      instanceId: s.inst("evolution").instanceId,
    }),
  ).toEqual({ ok: true });
  await settle();
  expect(s.perm("base").topCard.cardId).toBe("EX12-052");
  expect(s.perm("base").currentDP).toBe(12000);
  expect(observe(s.engine).hasRestriction(s.perm("base"), "beAffected", "Digimon")).toBe(true);
  expect(s.state.players[1]!.battleArea).toHaveLength(1);
  expect(s.state.memory).toBe(1);
  expect(s.state.pendingDecision).toBeUndefined();
});

it("can pass the Counter window without gaining DP or starting a battle", async () => {
  const s = setupEngine(
    {
      0: { battleArea: [{ card: "BT1-010", as: "attacker", dp: 5000 }] },
      1: {
        battleArea: [{ card: "EX12-052", as: "counter" }],
        security: ["BT1-009"],
      },
    },
    { autoSelectCards: true },
  );
  await s.ready();
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("attacker").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.events.some((event) => event.kind === "counterWindowOpened"));
  const window = s.events.find((event) => event.kind === "counterWindowOpened");
  expect(
    window?.kind === "counterWindowOpened" &&
      window.eligibleCounters.some((entry) => entry.instanceId === s.perm("counter").topCard.instanceId),
  ).toBe(true);
  expect(s.engine.applyIntent(1, { type: "respondCounter" })).toEqual({ ok: true });
  await settle(() => !observe(s.engine).isAttacking() && !s.state.pendingDecision);
  expect(s.perm("counter").currentDP).toBe(12000);
  expect(s.state.players[0]!.battleArea).toHaveLength(1);
  expect(s.state.players[1]!.security).toHaveLength(0);
  expect(s.state.pendingDecision).toBeUndefined();
});
