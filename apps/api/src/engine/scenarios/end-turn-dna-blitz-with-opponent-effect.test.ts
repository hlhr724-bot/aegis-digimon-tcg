import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle, assertNoLoudGap } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/end-turn-dna-blitz-with-opponent-effect.fixture";
import "#api/cards/index";

it("keeps end-turn DNA Blitz active while the opponent's pending end-turn effect resolves", async () => {
  const s = setupScenario(fixture, { autoOrderTriggers: true, autoSelectCards: true });
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("turnEndingTamer").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    expect(s.decisions.at(-1)!.req.sourceCardId).toBe("EX3-008");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.pendingDecision?.kind === "optional" &&
        JSON.parse(s.state.pendingDecision.payloadJson).promptKey === "activateBlitz",
    );
    expect(s.state.turnSeat).toBe(0);
    expect(s.state.memory).toBe(-1);
    const dragon = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === "EX3-063")!;
    expect(dragon).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.engine.hasAcceptedBlitzAttack(dragon.permanentId));
    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: dragon.permanentId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settle(
      () => s.state.turnSeat === 1 && s.state.phase === Phase.Breeding && s.state.pendingDecision === undefined,
    );
    expect(s.state.players[1]!.security).toHaveLength(0);
    expect(s.state.turnSeat).toBe(1);
    expect(s.state.phase).toBe(Phase.Breeding);
    expect(s.events.filter((event) => event.kind === "attackDeclared")).toHaveLength(1);
    expect(
      s.events.filter((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT4-047"),
    ).toHaveLength(1);
    expect(s.events.filter((event) => event.kind === "securityChecked")).toHaveLength(2);
    const attackEndIndex = s.events.findIndex((event) => event.kind === "attackEnded");
    const turnEndIndex = s.events.findIndex((event) => event.kind === "turnEnded");
    expect(attackEndIndex).toBeGreaterThanOrEqual(0);
    expect(turnEndIndex).toBeGreaterThan(attackEndIndex);
    assertNoLoudGap(s);
  } finally {
    if (s.state.phase === Phase.Breeding) {
      s.engine.applyIntent(s.state.turnSeat, { type: "endPhase" });
      await advance(s.engine).waitForMainPhase(s.state.turnSeat);
    }
    s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
    await loop;
  }
});
