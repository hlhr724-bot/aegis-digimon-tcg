import "#api/cards/index";
import { expect, it } from "vitest";
import fixture from "#api/engine/scenarios/king-drasil-omekamon-security-removal-retrigger.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";

const omekamonPrompt = /When your security stack is removed from/;

it("offers the breeding Omekamon play again on the next Engage security check after a decline", async () => {
  const s = setupScenario(fixture);
  await s.ready();
  const mainPhase = (s.engine as unknown as { mainPhase: { isOpen: boolean } }).mainPhase;
  const turn = s.engine.runOneTurn();
  const respond = async (seat: 0 | 1, response: object): Promise<void> => {
    const decision = s.state.pendingDecision!;
    expect(decision.seat).toBe(seat);
    expect(
      s.engine.applyIntent(seat, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: response as never,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.decisionId !== decision.decisionId);
  };
  try {
    await settle(() => mainPhase.isOpen);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });

    await settle(() => s.state.pendingDecision?.kind === "optional");
    await respond(0, { kind: "optional", accept: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    await respond(0, { kind: "selectCards", instanceIds: ["player"] });

    await settle(() => omekamonPrompt.test(s.state.pendingDecision?.payloadJson ?? ""));
    expect(s.state.players[1]!.security).toHaveLength(3);
    await respond(1, { kind: "optional", accept: false });

    await settle(() => omekamonPrompt.test(s.state.pendingDecision?.payloadJson ?? ""));
    expect(s.state.players[1]!.security).toHaveLength(2);
    await respond(1, { kind: "optional", accept: true });

    await settle(() => s.state.pendingDecision === undefined && !observe(s.engine).isAttacking());
    expect(s.state.players[1]!.breeding?.isSuspended).toBe(true);
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.instanceId)).toEqual([
      s.inst("omekamon").instanceId,
    ]);
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await turn;
  }
});
