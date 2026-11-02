import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/ordered-owen-rush-attack.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";

it.each([true, false])("ordered Owen respects MetalSeadramon's suspension restriction: %s", async (restricted) => {
  const s = setupScenario(
    {
      ...fixture,
      board: {
        ...fixture.board,
        1: {
          ...fixture.board[1],
          battleArea: [
            { card: restricted ? "EX8-026" : "BT1-010", as: "restriction" },
            { card: "BT1-010", as: "opponent" },
          ],
        },
      },
    },
    { autoSelectCards: true, autoOrderTriggers: false, autoDeclineOptional: true },
  );
  await s.ready();
  const turn = s.engine.runOneTurn();
  await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
  const startDecision = s.state.pendingDecision!;
  const startRequest = s.decisions.find(({ req }) => req.decisionId === startDecision.decisionId)!.req;
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: startDecision.decisionId,
      response: { kind: "orderTriggers", order: startRequest.options!.triggerKeys! },
    }),
  ).toEqual({ ok: true });
  await advance(s.engine).waitForMainPhase(0);
  await settle(() => s.state.pendingDecision === undefined);
  s.state.memory = 6;
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("wargreymon").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
  const decision = s.state.pendingDecision!;
  const request = s.decisions.find(({ req }) => req.decisionId === decision.decisionId)!.req;
  const keys = request.options!.triggerKeys!;
  expect(keys).toHaveLength(2);
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: decision.decisionId,
      response: {
        kind: "orderTriggers",
        order: keys,
        optionalAnswers: { [keys[0]!]: true, [keys[1]!]: false },
      },
    }),
  ).toEqual({ ok: true });
  await turn;

  expect(s.events.some((event) => event.kind === "attackDeclared" && event.attackerCardId === "BT21-026")).toBe(
    !restricted,
  );
  expect(s.state.players[1]!.security).toHaveLength(restricted ? 3 : 2);
  expect(s.perm("first-owen").isSuspended).toBe(true);
  expect(s.perm("second-owen").isSuspended).toBe(false);
  expect(s.state.pendingDecision).toBeUndefined();
});
