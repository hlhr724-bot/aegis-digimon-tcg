import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import type { DecisionResponse } from "@aegis/shared/protocol/intents";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

import { Phase, type Seat } from "@aegis/shared/schema/enums";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/locked-attack-target-skips-redirection.fixture";

type ReplayResponseParams = { seat: Seat; response: DecisionResponse };

const replayFixture = new URL("./locked-attack-target-skips-redirection.replay.json", import.meta.url);
const record = JSON.parse(readFileSync(replayFixture, "utf8")) as ReplayRecord;

describe("locked attack target skips redirection", () => {
  it("keeps the inherited once-per-turn redirect available for a later unlocked attack", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true });
    const loop = s.engine.startTurnLoop();
    try {
      await settle(() => s.state.phase === Phase.Breeding);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("lockedAttacker").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => !observe(s.engine).isAttacking() && !s.state.pendingDecision);
      expect(s.state.players[1]!.security).toHaveLength(2);
      expect(s.events).toContainEqual(expect.objectContaining({ kind: "effectHadNoEffect", sourceCardId: "BT25-039" }));
      expect(s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT25-039")).toBe(
        false,
      );
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("unlockedAttacker").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => !observe(s.engine).isAttacking() && !s.state.pendingDecision);
      expect(s.state.players[1]!.security).toHaveLength(2);
      expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("unlockedAttacker").instanceId)).toBe(
        true,
      );
      expect(s.events).toContainEqual(expect.objectContaining({ kind: "attackDeclared", redirected: true }));
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
  it.each([
    { payer: "BT11-092", defender: "BT2-064" },
    { payer: "BT26-092", defender: "BT25-055" },
  ])(
    "permits $payer's printed processing cost without asking for a blocked redirect target",
    async ({ payer, defender }) => {
      const position = structuredClone(fixture);
      position.presentation = undefined;
      position.board[1]!.battleArea = [
        { card: payer, as: "payer" },
        { card: defender, as: "redirector", suspended: true, dp: 16000 },
        { card: defender, as: "secondRedirector", suspended: true, dp: 16000 },
      ];
      const s = setupScenario(position, { autoAcceptOptional: true, autoSelectCards: true });
      const loop = s.engine.startTurnLoop();
      try {
        await settle(() => s.state.phase === Phase.Breeding);
        expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
        await advance(s.engine).waitForMainPhase(0);
        s.decisions.length = 0;
        expect(
          s.engine.applyIntent(0, {
            type: "attack",
            attackerPermanentId: s.perm("lockedAttacker").permanentId,
            target: { kind: "player" },
          }),
        ).toEqual({ ok: true });
        await settle(() => !observe(s.engine).isAttacking() && !s.state.pendingDecision);
        expect(s.state.players[1]!.security).toHaveLength(2);
        expect(s.decisions.some(({ req }) => req.sourceCardId === payer && req.kind === "chooseTargets")).toBe(false);
        expect(s.events.some((event) => event.kind === "attackDeclared" && event.redirected === true)).toBe(false);
        const payerOnBoard = s.state.players[1]!.battleArea.find((permanent) => permanent.topCard.cardId === payer);
        expect(payerOnBoard?.isSuspended).toBe(payer === "BT11-092" ? true : undefined);
        expect(s.state.players[1]!.deck.at(-1)?.cardId === payer).toBe(payer === "BT26-092");
      } finally {
        s.engine.applyIntent(0, { type: "surrender" });
        await loop;
      }
    },
  );
  it("explains that inherited redirects have no effect after DNA Paildramon evolves during its attack", async () => {
    const events: ServerEvent[] = [];
    const replay = await runReplay(record, {
      untilInput: 122,
      onBatch: (_state, batch) => events.push(...batch),
    });
    try {
      expect(replay.divergences).toEqual([]);
      expect(replay.state.turnCount).toBe(8);
      expect(replay.state.players[0]!.security).toHaveLength(3);
      const attacker = replay.state.players[1]!.battleArea.find((permanent) => permanent.topCard.cardId === "AD1-024");
      expect(attacker?.stack.some((card) => card.cardId === "AD1-011")).toBe(true);
      events.length = 0;
      async function respond({ seat, response }: ReplayResponseParams) {
        return replay.applyIntent(seat, {
          type: "respondDecision",
          decisionId: replay.state.pendingDecision!.decisionId,
          response,
        });
      }
      expect(await respond({ seat: 1, response: { kind: "chooseTargets", instanceIds: ["perm-10"] } })).toEqual({
        ok: true,
      });
      expect(replay.state.pendingDecision?.kind).toBe("chooseTargets");
      expect(await respond({ seat: 0, response: { kind: "chooseTargets", instanceIds: ["perm-14"] } })).toEqual({
        ok: true,
      });
      expect(await respond({ seat: 1, response: { kind: "orderTriggers", order: [], orderIndexes: [1, 0] } })).toEqual({
        ok: true,
      });
      expect(await respond({ seat: 1, response: { kind: "optional", accept: false } })).toEqual({ ok: true });
      expect(await respond({ seat: 1, response: { kind: "optional", accept: false } })).toEqual({ ok: true });
      expect(replay.state.pendingDecision).toBeUndefined();
      expect(observe(replay.engine).isAttacking()).toBe(false);
      for (const sourceCardId of ["BT25-039", "BT25-055"]) {
        expect(events).toContainEqual(expect.objectContaining({ kind: "effectHadNoEffect", sourceCardId }));
        expect(events.some((event) => event.kind === "effectResolved" && event.sourceCardId === sourceCardId)).toBe(
          false,
        );
      }
      expect(events.some((event) => event.kind === "attackDeclared" && event.redirected === true)).toBe(false);
      expect(events.some((event) => event.kind === "battleCompared")).toBe(false);
      expect(events.filter((event) => event.kind === "securityChecked")).toHaveLength(2);
      expect(replay.state.players[0]!.security).toHaveLength(1);
    } finally {
      await replay.applyIntent(1, { type: "surrender" });
    }
  });
});
