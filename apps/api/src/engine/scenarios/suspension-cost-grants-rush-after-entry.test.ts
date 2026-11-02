import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/suspension-cost-grants-rush-after-entry.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";
import { settle } from "#api/engine/testkit/harness";

it.each([false, true])("grants Rush after Airdramon pays a suspension cost for digivolve=%s", async (digivolve) => {
  const preferred: string[] = [];
  const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred });
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    preferred.push(s.inst("symbare").instanceId);
    const intent = digivolve
      ? {
          type: "digivolve" as const,
          instanceId: s.inst("symbare").instanceId,
          permanentId: s.perm("base").permanentId,
        }
      : { type: "playCard" as const, instanceId: s.inst("symbare").instanceId };
    expect(s.engine.applyIntent(0, intent)).toEqual({ ok: true });
    await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && s.state.pendingDecision === undefined);
    const entered = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === "LM-011")!;
    expect(entered).toBeDefined();
    expect(s.perm("airdramon").isSuspended).toBe(true);
    expect(s.state.memory).toBe(digivolve ? 8 : 5);
    expect(observe(s.engine).hasKeyword(entered, "Rush")).toBe(true);
    const rushChoice = s.decisions.find(
      (decision) => decision.req.sourceCardId === "LM-009" && decision.req.kind === "chooseTargets",
    )!;
    expect(rushChoice.req.options?.candidateInstanceIds).toContain(entered.permanentId);
    expect(rushChoice.req.options?.candidateInstanceIds).not.toContain(s.perm("unrelated").permanentId);
    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: entered.permanentId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "attackEnded") && s.state.pendingDecision === undefined);
    expect(s.state.players[1]!.security).toHaveLength(2);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(observe(s.engine).hasKeyword(entered, "Rush")).toBe(false);
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});

it("does not suspend Airdramon or grant Rush when its reduction is declined", async () => {
  const s = setupScenario(fixture, { autoDeclineOptional: true, autoSelectCards: true });
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("symbare").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && s.state.pendingDecision === undefined);
    const entered = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === "LM-011")!;
    expect(entered).toBeDefined();
    expect(s.perm("airdramon").isSuspended).toBe(false);
    expect(s.state.memory).toBe(3);
    expect(observe(s.engine).hasKeyword(entered, "Rush")).toBe(false);
    expect(
      s.decisions.some((decision) => decision.req.sourceCardId === "LM-009" && decision.req.kind === "chooseTargets"),
    ).toBe(false);
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
