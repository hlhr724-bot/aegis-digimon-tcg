import { describe, expect, it } from "vitest";
import "#api/cards/index";
import type { Permanent } from "@aegis/shared/schema/Permanent";
import { buildBotView } from "#api/bot/view";
import { createFixtureBotPolicy } from "#api/engine/scenario/botPolicy";
import fixture from "#api/engine/scenarios/practice-inherited-unsuspend-engage.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";

type FinishParams = { setup: ReturnType<typeof setupScenario>; host: Permanent; attackTurn: number };

async function finishSameTurnWin({ setup: s, host, attackTurn }: FinishParams): Promise<void> {
  await settle(() => s.state.pendingDecision?.kind === "optional");
  expect(host.isSuspended).toBe(false);
  expect(s.state.memory).toBe(-3);
  const engage = s.state.pendingDecision!;
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: engage.decisionId,
      response: { kind: "optional", accept: true },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.pendingDecision?.kind === "selectCards");
  const target = s.state.pendingDecision!;
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: target.decisionId,
      response: { kind: "selectCards", instanceIds: ["player"] },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.gameOver);
  expect(s.state.turnCount).toBe(attackTurn);
}

async function finishNextTurnWin({ setup: s, host, attackTurn }: FinishParams): Promise<void> {
  await advance(s.engine).waitForMainPhase(1);
  expect(s.state.gameOver).toBe(false);
  expect(host.isSuspended).toBe(false);
  expect(s.events.filter((event) => event.kind === "attackDeclared")).toHaveLength(1);
  const policy = createFixtureBotPolicy(fixture.presentation?.opponent)!;
  const pass = policy.chooseMainAction(buildBotView(s.state, 1)!);
  expect(pass).toEqual({ type: "endPhase" });
  expect(s.engine.applyIntent(1, pass)).toEqual({ ok: true });
  await advance(s.engine).waitForMainPhase(0);
  await attackPlayer({ setup: s, seat: 0, attacker: host });
  expect(s.state.turnCount).toBeGreaterThan(attackTurn);
}

describe("inherited unsuspend before Engage practice", () => {
  it.each([
    {
      name: "resolves inherited unsuspend before Engage to win on the same turn",
      unsuspendFirst: true,
      finish: finishSameTurnWin,
    },
    {
      name: "resolves Engage too early and must wait for the next turn to win",
      unsuspendFirst: false,
      finish: finishNextTurnWin,
    },
  ])("$name", async ({ unsuspendFirst, finish }) => {
    const s = setupScenario(fixture, { autoOrderTriggers: false });
    await s.ready();
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const host = s.perm("chaosdramon");
      expect(host.stack.map((card) => card.cardId)).toEqual(["EX9-018", "BT2-064"]);
      await attackPlayer({ setup: s, seat: 0, attacker: host });
      expect(s.state.players[1]!.security).toHaveLength(0);
      expect(host.isSuspended).toBe(true);
      expect(s.state.gameOver).toBe(false);
      const attackTurn = s.state.turnCount;
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
      const order = s.state.pendingDecision!;
      const request = s.decisions.findLast(({ req }) => req.decisionId === order.decisionId)!.req;
      const sourceIndex = request.options!.triggerCardIds!.indexOf("EX9-018");
      const engageIndex = request.options!.triggerCardIds!.indexOf("EX12-060");
      expect(sourceIndex).toBeGreaterThanOrEqual(0);
      expect(engageIndex).toBeGreaterThanOrEqual(0);
      const keys = request.options!.triggerKeys!;
      const orderedKeys = unsuspendFirst
        ? [keys[sourceIndex]!, keys[engageIndex]!]
        : [keys[engageIndex]!, keys[sourceIndex]!];
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: order.decisionId,
          response: { kind: "orderTriggers", order: orderedKeys },
        }),
      ).toEqual({ ok: true });
      await finish({ setup: s, host, attackTurn });
      expect(s.events.filter((event) => event.kind === "attackDeclared")).toHaveLength(2);
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
