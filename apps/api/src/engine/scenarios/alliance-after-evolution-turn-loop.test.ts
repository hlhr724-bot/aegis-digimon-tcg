import fixtureAllianceAfterEvolution from "./alliance-after-evolution.fixture.js";
import { Phase } from "@aegis/shared";
import { expect, it } from "vitest";
import "../../cards/index.js";
import { layScenarioFixture } from "../scenario/fixture.js";
import { BLUE_DECK, RED_DECK } from "../testDecks.js";
import { advance } from "../testkit/advance.js";
import { setupEngine, settle } from "../testkit/harness.js";

it("arena: gained Alliance survives Mococomon evolution and expires at turn end", async () => {
  const preferred: string[] = [];
  const options = {
    autoAcceptOptional: true,
    autoSelectCards: true,
    autoChooseOption: true,
    autoOrderTriggers: false,
    declineDigiXros: true,
    preferInstanceIds: preferred,
    preferTriggerKeys: ["EX12-002"],
  };
  const s = setupEngine({ 0: {}, 1: {} }, options);
  layScenarioFixture(s.state, fixtureAllianceAfterEvolution, [BLUE_DECK, RED_DECK], true);
  const player = s.state.players[0]!;
  const host = player.battleArea[0]!;
  const evolution = player.hand.find((card) => card.cardId === "EX12-034")!;
  const sanzomon = player.hand.find((card) => card.cardId === "EX12-045")!;
  const cho = player.hand.find((card) => card.cardId === "EX12-056")!;
  preferred.push(host.topCard.instanceId, evolution.instanceId, cho.instanceId);
  const loop = s.engine.startTurnLoop();
  try {
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        instanceId: sanzomon.instanceId,
        permanentId: host.permanentId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    const request = s.decisions.at(-1)!.req;
    const keys = request.options!.triggerKeys!;
    const choKey = keys[request.options!.triggerCardIds!.indexOf("EX12-056")]!;
    options.autoOrderTriggers = true;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: request.decisionId,
        response: {
          kind: "orderTriggers",
          order: [choKey, ...keys.filter((key) => key !== choKey)],
          optionalAnswers: Object.fromEntries(keys.filter((key) => key !== choKey).map((key) => [key, true])),
        },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "alliancePrompt"));
    expect(host.topCard.cardId).toBe("EX12-045");
    expect(host.keywords).toContain("Alliance");
    const ally = player.battleArea.find((permanent) => permanent.topCard.instanceId === cho.instanceId)!;
    expect(s.engine.applyIntent(0, { type: "respondAlliance", allyPermanentId: ally.permanentId })).toEqual({
      ok: true,
    });
    await advance(s.engine).finishAttack();
    await settle(() => s.events.some((event) => event.kind === "attackEnded") && s.state.pendingDecision === undefined);
    expect(host.topCard.cardId).toBe("EX12-034");
    expect(host.keywords).toContain("Alliance");
    expect(ally.isSuspended).toBe(true);
    expect(s.state.players[1]!.security).toHaveLength(3);
    expect(s.events.filter((event) => event.kind === "securityChecked")).toHaveLength(2);
    expect(s.events.find((event) => event.kind === "securityChecked")).toMatchObject({ battle: { attackerDP: 19000 } });
    expect(s.state.memory).toBe(1);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await settle(() => s.state.turnSeat === 1 && s.state.phase === Phase.Breeding);
    expect(host.keywords).not.toContain("Alliance");
    expect(host.currentDP).toBe(12000);
    expect(host.securityAttack).toBe(1);
  } finally {
    if (s.state.phase === Phase.Breeding) {
      const seat = s.state.turnSeat;
      s.engine.applyIntent(seat, { type: "endPhase" });
      await advance(s.engine).waitForMainPhase(seat);
    }
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
