import { describe, expect, it } from "vitest";
import type { DecisionResponse } from "@aegis/shared";
import fixture from "#api/engine/scenarios/turn-player-retaliation-before-blocker-battle-win.fixture";
import { fixturePermanentId } from "#api/engine/scenario/references";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle, settleAcrossTimers } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import "#api/cards/index";

const triggeredEffects = (s: ReturnType<typeof setupScenario>) =>
  s.events.flatMap((event) =>
    event.kind === "effectTriggered" ? [`${event.seat}:${event.sourceCardId}:${event.timing}`] : [],
  );

const acceptEveryDecision = async (s: ReturnType<typeof setupScenario>) => {
  for (;;) {
    await settleAcrossTimers(
      () =>
        s.state.pendingDecision !== undefined ||
        (!observe(s.engine).isAttacking() && s.state.pendingDecision === undefined),
    );
    const pending = s.state.pendingDecision;
    if (pending === undefined) return;
    const request = s.decisions.find(({ req }) => req.decisionId === pending.decisionId)?.req;
    if (request === undefined) {
      await new Promise((resolve) => setImmediate(resolve));
      continue;
    }
    const candidates = request.options?.candidateInstanceIds ?? [];
    const response: DecisionResponse =
      request.kind === "orderTriggers"
        ? { kind: "orderTriggers", order: [request.options!.triggerKeys![0]!] }
        : request.kind === "optional"
          ? { kind: "optional", accept: request.options?.timing !== "WhenAttacking" }
          : ({
              kind: request.kind,
              instanceIds: request.options?.timing === "WhenAttacking" ? [] : candidates.slice(0, 1),
            } as DecisionResponse);
    expect(
      s.engine.applyIntent(request.seat, { type: "respondDecision", decisionId: request.decisionId, response }),
    ).toEqual({
      ok: true,
    });
  }
};

describe("Turn player's Retaliation before a blocker's battle-win effect", () => {
  it("deletes the blocking EX13-076 before its battle-win effect can activate", async () => {
    const s = setupScenario(fixture, { autoOrderTriggers: false });
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: fixturePermanentId("deadlyaxemon"),
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.combatWindow?.kind === "block");
      expect(
        s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: fixturePermanentId("paladin") }),
      ).toEqual({
        ok: true,
      });
      await acceptEveryDecision(s);

      expect(triggeredEffects(s)).toEqual(["0:BT19-059:OnDestroyedAnyone"]);
      expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([
        fixturePermanentId("returnable"),
      ]);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });

  it("still activates the turn player's EX13-076 battle-win effect before the loser's Retaliation", async () => {
    const board = structuredClone(fixture);
    board.board[0] = {
      ...board.board[1],
      battleArea: [
        { card: "EX13-076", as: "paladin", top: { card: "EX13-076", as: "paladin-card" } },
        { card: "BT1-009", as: "returnable", top: { card: "BT1-009", as: "returnable-card" } },
      ],
    };
    board.board[1] = {
      ...fixture.board[0],
      battleArea: [
        {
          card: "BT19-059",
          as: "deadlyaxemon",
          suspended: true,
          top: { card: "BT19-059", as: "deadlyaxemon-card" },
        },
      ],
    };
    const s = setupScenario(board, { autoOrderTriggers: false });
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: fixturePermanentId("paladin"),
          target: { kind: "permanent", permanentId: fixturePermanentId("deadlyaxemon") },
        }),
      ).toEqual({ ok: true });
      await acceptEveryDecision(s);

      expect(triggeredEffects(s).filter((entry) => !entry.endsWith(":WhenAttacking"))).toEqual([
        "0:EX13-076:whenBattleWon",
        "1:BT19-059:OnDestroyedAnyone",
      ]);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
