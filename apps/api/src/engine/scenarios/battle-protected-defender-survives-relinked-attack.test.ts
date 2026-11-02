import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { Phase } from "@aegis/shared/schema/enums";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/battle-protected-defender-survives-relinked-attack.fixture";
import "#api/cards/AD1/AD1-011";
import "#api/cards/BT12/BT12-022";
import "#api/cards/BT25/BT25-060";
import "#api/cards/BT26/BT26-010";

const record = JSON.parse(
  readFileSync(new URL("./battle-protected-defender-survives-relinked-attack.replay.json", import.meta.url), "utf8"),
) as ReplayRecord;

function battleEvents(events: readonly ServerEvent[], attackerPermanentId: string) {
  return {
    compared: events.filter(
      (event) => event.kind === "battleCompared" && event.attackerPermanentId === attackerPermanentId,
    ),
    resolved: events.filter(
      (event) => event.kind === "combatResolved" && event.attackerPermanentId === attackerPermanentId,
    ),
    ended: events.filter((event) => event.kind === "attackEnded" && event.attackerPermanentId === attackerPermanentId),
  };
}

describe("Battle-protected defender survives a relinked attack", () => {
  it("battles Paildramon after Rebootmon links and unsuspends, and Paildramon survives the loss", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: [] });
    const loop = s.engine.startTurnLoop();
    try {
      const defender = s.perm("protectedDefender");
      await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 1 && !s.state.pendingDecision);
      expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(1);
      expect(
        s.engine.applyIntent(1, {
          type: "digivolve",
          permanentId: defender.permanentId,
          instanceId: s.inst("paildramonCard").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => defender.topCard.cardId === "AD1-011" && !s.state.pendingDecision);
      expect(
        s.engine.applyIntent(1, {
          type: "attack",
          attackerPermanentId: defender.permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          battleEvents(s.events, defender.permanentId).ended.length === 1 &&
          !s.state.pendingDecision &&
          !s.state.combatWindow,
      );
      expect(defender.isSuspended).toBe(true);
      expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
      await settle(() => s.state.turnSeat === 0 && s.state.phase === Phase.Breeding && !s.state.pendingDecision);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);

      const rebootmon = s.perm("rebootmon");
      const eventsBefore = s.events.length;
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: rebootmon.permanentId,
          target: { kind: "permanent", permanentId: defender.permanentId },
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          battleEvents(s.events.slice(eventsBefore), rebootmon.permanentId).ended.length === 1 &&
          !s.state.pendingDecision &&
          !s.state.combatWindow,
      );

      const attack = battleEvents(s.events.slice(eventsBefore), rebootmon.permanentId);
      expect(rebootmon.linked.map((card) => card.instanceId)).toEqual([s.inst("appmonLink").instanceId]);
      expect(rebootmon.isSuspended).toBe(false);
      expect(attack.compared).toEqual([
        expect.objectContaining({ defenderPermanentId: defender.permanentId, loserPermanentIds: [] }),
      ]);
      expect(attack.resolved).toEqual([expect.objectContaining({ deletedPermanentIds: [] })]);
      expect(s.state.players[1]!.battleArea.map((permanent) => permanent.permanentId)).toEqual([defender.permanentId]);
      expect(defender.topCard.cardId).toBe("AD1-011");
      expect(s.state.players[1]!.security).toHaveLength(5);
    } finally {
      s.engine.applyIntent(s.state.turnSeat as 0 | 1, { type: "surrender" });
      await loop;
    }
  });

  it("resolves the recorded Rebootmon attack as a battle Paildramon survives", async () => {
    const events: ServerEvent[] = [];
    const replay = await runReplay(record, { untilInput: 62, onBatch: (_state, batch) => events.push(...batch) });
    try {
      expect(replay.divergences).toEqual([]);
      const recordedAttack = events.findLastIndex(
        (event) =>
          event.kind === "attackDeclared" &&
          event.attackerCardId === "BT25-060" &&
          event.target.kind === "permanent" &&
          event.targetCardId === "AD1-011",
      );
      expect(recordedAttack).toBeGreaterThan(-1);
      const declared = events[recordedAttack] as Extract<ServerEvent, { kind: "attackDeclared" }>;
      const target = declared.target as { kind: "permanent"; permanentId: string };
      const attack = battleEvents(events.slice(recordedAttack), declared.attackerPermanentId);
      expect(attack.compared[0]).toMatchObject({ defenderPermanentId: target.permanentId, loserPermanentIds: [] });
      expect(attack.resolved[0]).toMatchObject({ deletedPermanentIds: [] });
      expect(attack.ended).toHaveLength(1);
      const [rebootmon] = replay.state.players[0]!.battleArea.filter(
        (permanent) => permanent.permanentId === declared.attackerPermanentId,
      );
      expect(rebootmon?.isSuspended).toBe(false);
      expect(
        replay.state.players[1]!.battleArea.find((permanent) => permanent.permanentId === target.permanentId)?.topCard
          .cardId,
      ).toBe("AD1-011");
    } finally {
      await replay.applyIntent(replay.state.turnSeat as 0 | 1, { type: "surrender" });
    }
  });
});
