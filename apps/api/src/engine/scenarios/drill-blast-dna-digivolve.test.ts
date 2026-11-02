import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-blast-dna-digivolve.fixture";
import { advance } from "#api/engine/testkit/advance";
import { attackPlayer } from "#api/engine/testkit/attackPlayer";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { createFixtureBotPolicy } from "#api/engine/scenario/botPolicy";
import { buildBotView } from "#api/bot/view";

describe("blast-dna-digivolve drill", () => {
  it("combines a field Digimon and hand material during Counter, removes the attacker, and wins", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true });
    await s.ready();
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(1);
      const policy = createFixtureBotPolicy(fixture.presentation?.opponent)!;
      expect(s.engine.applyIntent(1, policy.chooseMainAction(buildBotView(s.state, 1)!))).toEqual({ ok: true });
      await settle(() => s.events.some((event) => event.kind === "counterWindowOpened"));
      const opened = s.events.find((event) => event.kind === "counterWindowOpened");
      if (opened?.kind !== "counterWindowOpened") {
        throw new Error("Missing counter window");
      }
      const counter = opened.eligibleCounters.find((entry) => entry.instanceId === s.inst("counter").instanceId)!;
      const memory = s.state.memory;
      expect(
        s.engine.applyIntent(0, {
          type: "respondCounter",
          sourceInstanceId: counter.instanceId,
          effectKey: counter.effectKey,
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "EX6-011") &&
          s.state.players[1]!.battleArea.length === 0 &&
          s.state.pendingDecision === undefined &&
          s.state.combatWindow === undefined,
      );
      const ragna = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === "EX6-011")!;
      expect(ragna.stack.map((card) => card.cardId)).toEqual(expect.arrayContaining(["BT3-016", "BT3-072"]));
      expect(s.state.memory).toBe(memory);
      expect(s.state.players[1]!.security).toHaveLength(0);
      expect(s.state.gameOver).toBe(false);
      expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      await attackPlayer({ setup: s, seat: 0, attacker: ragna });
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
