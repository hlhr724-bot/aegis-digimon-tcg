import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { buildBotView } from "#api/bot/view";
import { createFixtureBotPolicy } from "#api/engine/scenario/botPolicy";
import fixture from "#api/engine/scenarios/practice-inherited-sacrifice-recruit.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";

describe("inherited sacrifice and recruitment practice", () => {
  it("pays inherited prevention with a real deletion that recruits the eventual winning attacker", async () => {
    const s = setupScenario(fixture);
    await s.ready();
    const loop = s.engine.startTurnLoop();
    const player = s.state.players[0]!;
    const policy = createFixtureBotPolicy(fixture.presentation?.opponent)!;
    try {
      await advance(s.engine).waitForMainPhase(1);
      const king = s.perm("kingSukamon");
      const hostId = king.permanentId;
      const sourceIds = king.stack.map((card) => card.instanceId);
      const sacrificeId = s.perm("sacrifice").topCard.instanceId;
      const recruitId = player.deck[0]!.instanceId;
      expect(player.deck[0]!.cardId).toBe("BT3-061");
      expect(s.engine.applyIntent(1, policy.chooseMainAction(buildBotView(s.state, 1)!))).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.seat === 1);
      const targetRequest = s.decisions.findLast(
        ({ req }) => req.decisionId === s.state.pendingDecision?.decisionId,
      )!.req;
      expect(s.engine.applyIntent(1, policy.answerDecision(buildBotView(s.state, 1)!, targetRequest))).toEqual({
        ok: true,
      });
      await settle(() => s.state.pendingDecision?.seat === 0);
      const protection = s.state.pendingDecision!;
      expect(protection.kind).toBe("optional");
      const protectionRequest = s.decisions.findLast(({ req }) => req.decisionId === protection.decisionId)!.req;
      expect(protectionRequest.sourceCardId).toBe("EX13-027");
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: protection.decisionId,
          response: { kind: "optional", accept: true },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      const recruitment = s.state.pendingDecision!;
      expect(player.trash.some((card) => card.instanceId === sacrificeId)).toBe(true);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: recruitment.decisionId,
          response: { kind: "selectCards", instanceIds: [recruitId] },
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          player.battleArea.some((permanent) => permanent.topCard.instanceId === recruitId) && !s.state.pendingDecision,
      );
      expect(player.battleArea.find((permanent) => permanent.permanentId === hostId)).toBe(king);
      expect(king.stack.map((card) => card.instanceId)).toEqual(sourceIds);
      expect(player.trash.map((card) => card.cardId)).toEqual(expect.arrayContaining(["EX13-028", "ST1-02", "ST1-03"]));
      expect(player.battleArea.some((permanent) => permanent.topCard.instanceId === sacrificeId)).toBe(false);
      const recruit = player.battleArea.find((permanent) => permanent.topCard.instanceId === recruitId)!;
      expect(s.state.players[1]!.trash.some((card) => card.cardId === "ST1-16")).toBe(true);
      await advance(s.engine).waitForMainPhase(1);
      const pass = policy.chooseMainAction(buildBotView(s.state, 1)!);
      expect(pass).toEqual({ type: "endPhase" });
      expect(s.engine.applyIntent(1, pass)).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      await attackPlayer({ setup: s, seat: 0, attacker: king });
      expect(s.state.players[1]!.security).toHaveLength(0);
      expect(s.state.gameOver).toBe(false);
      await attackPlayer({ setup: s, seat: 0, attacker: recruit });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
