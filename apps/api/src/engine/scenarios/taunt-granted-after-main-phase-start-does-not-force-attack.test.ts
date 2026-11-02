import "#api/cards/index";
import { describe, expect, it } from "vitest";
import type { Seat } from "@aegis/shared";
import type { DecisionRequest } from "@aegis/shared";
import type { DecisionResponse } from "@aegis/shared/protocol/intents";
import { Phase } from "@aegis/shared/schema/enums";
import { advance } from "#api/engine/testkit/advance";
import { settle, settleAcrossTimers } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/taunt-granted-after-main-phase-start-does-not-force-attack.fixture";

type Setup = ReturnType<typeof setupScenario>;

async function respond(s: Setup, seat: Seat, answer: (request: DecisionRequest) => DecisionResponse): Promise<void> {
  await settle(() => s.state.pendingDecision?.seat === seat);
  const request = s.decisions.at(-1)!.req;
  expect(
    s.engine.applyIntent(seat, {
      type: "respondDecision",
      decisionId: request.decisionId,
      response: answer(request),
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.pendingDecision?.decisionId !== request.decisionId);
}

describe("Taunt granted after the main phase starts", () => {
  it("does not force an attack when the taunt is granted after the main phase has started", async () => {
    const s = setupScenario(fixture);
    const attackerId = s.perm("tauntedAttacker").permanentId;
    const bystanderId = s.perm("laterTauntedBystander").permanentId;
    const loop = s.engine.startTurnLoop();
    try {
      await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 1);
      expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(1);
      expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("openingTaunter").instanceId })).toEqual({
        ok: true,
      });
      await respond(s, 1, () => ({ kind: "chooseTargets", instanceIds: [attackerId] }));
      await settle(() => s.state.pendingDecision === undefined && s.state.phase === Phase.Main);
      expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });

      await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await respond(s, 0, (request) => {
        expect(request.sourceCardId).toBe("ST1-07");
        return { kind: "selectCards", instanceIds: ["player"] };
      });
      await settle(() => s.state.combatWindow?.kind === "block");
      expect(
        s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: s.perm("blockingCraniamon").permanentId }),
      ).toEqual({ ok: true });
      await respond(s, 1, (request) => {
        expect(request).toMatchObject({ kind: "optional", sourceCardId: "EX13-056" });
        return { kind: "optional", accept: true };
      });
      await respond(s, 1, (request) => {
        expect(request.sourceCardId).toBe("BT25-054");
        return { kind: "chooseTargets", instanceIds: [bystanderId] };
      });
      await settleAcrossTimers(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);

      expect(advance(s.engine).ledgers.subTriggers.subscriptionsFor("startOfYourMainPhase", bystanderId)).toHaveLength(
        1,
      );
      expect(s.state.turnSeat).toBe(0);
      expect(s.state.phase).toBe(Phase.Main);
      expect(s.state.pendingDecision?.promptText).toBeUndefined();
      expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.instanceId)).toContain(
        s.inst("blockPlayedTaunter").instanceId,
      );
      expect(s.state.players[0]!.battleArea.find(({ permanentId }) => permanentId === bystanderId)?.isSuspended).toBe(
        false,
      );
      expect(
        s.events.filter((event) => event.kind === "attackDeclared").map((event) => event.attackerPermanentId),
      ).toEqual([attackerId]);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
