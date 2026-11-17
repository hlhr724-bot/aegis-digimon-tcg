import { Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { advance } from "#api/engine/testkit/advance";
import { settle, type EngineSetup } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { setupScenario } from "#api/engine/testkit/scenario";
import type { ScenarioFixture } from "#api/engine/scenario/types";
import { buildKeenanStackTrashFixture } from "#api/engine/scenarios/keenan-execute-ignores-other-tamer-stack-trash.fixture";

async function runWithFalcomonPlayed(fixture: ScenarioFixture, verify: (s: EngineSetup) => Promise<void>) {
  const s = setupScenario(fixture, {
    autoAcceptOptional: true,
    autoSelectCards: true,
    declinePrompts: ["Place 1 card(s) from hand", "Place 1 card(s) under"],
  });
  const loop = s.engine.startTurnLoop();
  try {
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(s.state.memory).toBe(3);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("falcomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        !s.state.pendingDecision &&
        s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("recoveredLalamon").instanceId),
    );
    await verify(s);
  } finally {
    if (!s.state.gameOver) {
      s.engine.applyIntent(s.state.turnSeat as 0 | 1, { type: "surrender" });
    }
    await loop;
  }
}

describe("Tamer stack-trash watchers and another Tamer's face-down cards", () => {
  it.each(["BT26-094", "BT26-091", "ST24-14"])(
    "%s stays silent when an effect trashes a card from under another Tamer",
    async (watcherCardId) => {
      await runWithFalcomonPlayed(buildKeenanStackTrashFixture({ watcherCardId }), async (s) => {
        expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([s.inst("faceDownCard").instanceId]);
        expect(s.perm("otherTamer").stack).toHaveLength(0);
        const reactions = s.decisions.filter(
          ({ req }) => req.sourceCardId === watcherCardId && req.options?.timing !== "StartOfYourMainPhase",
        );
        expect(reactions).toEqual([]);
        expect(s.perm("watcher").isSuspended).toBe(false);
        expect(observe(s.engine).hasKeyword(s.perm("dataSquadDigimon"), "Execute")).toBe(false);
        expect(s.state.memory).toBe(0);
        expect(s.state.turnSeat).toBe(0);
        expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
        await settle(() => s.state.turnSeat === 1);
        expect(s.perm("dataSquadDigimon").isSuspended).toBe(false);
        expect(s.state.players[1]!.security).toHaveLength(3);
      });
    },
  );

  it("BT26-094 grants Execute when an effect trashes a card from under itself", async () => {
    await runWithFalcomonPlayed(buildKeenanStackTrashFixture({ stackOwner: "watcher" }), async (s) => {
      expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([s.inst("faceDownCard").instanceId]);
      expect(s.perm("watcher").stack).toHaveLength(0);
      expect(s.perm("watcher").isSuspended).toBe(true);
      expect(observe(s.engine).hasKeyword(s.perm("dataSquadDigimon"), "Execute")).toBe(true);
      expect(s.state.memory).toBe(0);
      const executeAttackerId = s.perm("dataSquadDigimon").topCard.instanceId;
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await settle(() => s.state.turnSeat === 1);
      expect(s.state.players[1]!.security).toHaveLength(2);
      expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(executeAttackerId);
    });
  });
});
