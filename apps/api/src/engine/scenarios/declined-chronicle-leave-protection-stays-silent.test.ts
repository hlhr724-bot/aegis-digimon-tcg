import { readFileSync } from "node:fs";
import type { ServerEvent } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";
import { advance } from "#api/engine/testkit/advance";
import { settle, setupEngine, type EngineSetup } from "#api/engine/testkit/harness";

const GRADEMON = "EX13-057";
const ALPHAMON = "EX13-060";
const CHRONICLE_DORUMON = "BT20-048";
const HISYARYUMON = "BT27-013";
const PREVENT_PROMPT = "Prevent leaving the battle area?";
const PROTECTION_CLAUSE = "When any of your [Chronicle] trait Digimon would leave the battle area";
const DECLINE_INPUT = 106;

type ProtectionEventKind = "effectTriggered" | "effectResolved";

function isProtectionEvent(event: ServerEvent, kind: ProtectionEventKind): boolean {
  return (
    event.kind === kind && event.sourceCardId === GRADEMON && (event.description ?? "").includes(PROTECTION_CLAUSE)
  );
}

function countProtectionEvents(events: readonly ServerEvent[], kind: ProtectionEventKind): number {
  return events.filter((event) => isProtectionEvent(event, kind)).length;
}

function setupProtectedAllies(): EngineSetup {
  return setupEngine(
    {
      0: {
        battleArea: [
          { card: ALPHAMON, as: "alphamon", under: [{ card: GRADEMON, as: "grademon" }] },
          { card: CHRONICLE_DORUMON, as: "firstAlly", dp: 9000 },
          { card: CHRONICLE_DORUMON, as: "secondAlly", dp: 9000 },
        ],
        security: [
          { card: "BT1-011", as: "paidSecurity" },
          { card: "BT1-012", as: "keptSecurity" },
        ],
        deck: ["BT1-013"],
      },
      1: { deck: ["BT1-013"], security: ["BT1-014"] },
    },
    { autoOrderTriggers: true },
  );
}

async function answerPrevention(s: EngineSetup, accept: boolean): Promise<void> {
  await settle(() => s.state.pendingDecision !== undefined);
  const pending = s.state.pendingDecision!;
  expect(pending.kind).toBe("optional");
  expect(pending.seat).toBe(0);
  expect(pending.promptText).toBe(PREVENT_PROMPT);
  expect(countProtectionEvents(s.events, "effectTriggered")).toBe(0);
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: pending.decisionId,
      response: { kind: "optional", accept },
    }),
  ).toEqual({ ok: true });
}

describe("declined Chronicle leave protection stays silent", () => {
  it("lets the reported Alphamon controller decline Grademon's inherited protection without announcing it", async () => {
    const record: ReplayRecord = JSON.parse(
      readFileSync(new URL("./declined-chronicle-leave-protection-stays-silent.replay.json", import.meta.url), "utf8"),
    );
    const events: ServerEvent[] = [];
    const run = await runReplay(record, {
      untilInput: DECLINE_INPUT,
      onBatch: (_state, batch) => events.push(...batch),
    });
    try {
      expect(run.divergences).toEqual([]);
      const pending = run.pendingRequest!;
      expect(pending.kind).toBe("optional");
      expect(pending.seat).toBe(1);
      expect(pending.sourceCardId).toBe(GRADEMON);
      expect(pending.promptText).toBe(PREVENT_PROMPT);
      const owner = run.state.players[1]!;
      const alphamon = owner.battleArea.find((permanent) => permanent.topCard.cardId === ALPHAMON)!;
      expect(alphamon.stack.map((card) => card.cardId)).toContain(GRADEMON);
      const hisyaryumon = owner.battleArea.find((permanent) => permanent.topCard.cardId === HISYARYUMON)!;
      expect(pending.options?.affectedPermanentIds).toEqual([hisyaryumon.permanentId]);
      const securityBefore = owner.security.map((card) => card.instanceId);
      const hisyaryumonInstanceId = hisyaryumon.topCard.instanceId;
      const turnCountBefore = run.state.turnCount;
      expect(run.state.turnSeat).toBe(1);
      expect(countProtectionEvents(events, "effectTriggered")).toBe(0);

      expect(
        await run.applyIntent(1, {
          type: "respondDecision",
          decisionId: pending.decisionId,
          response: { kind: "optional", accept: false },
        }),
      ).toEqual({ ok: true });
      await settle(() => run.state.turnSeat === 0);

      expect(owner.battleArea.some((permanent) => permanent.topCard.cardId === HISYARYUMON)).toBe(false);
      expect(owner.trash.map((card) => card.instanceId)).toContain(hisyaryumonInstanceId);
      expect(owner.security.map((card) => card.instanceId)).toEqual(securityBefore);
      expect(owner.battleArea.some((permanent) => permanent.permanentId === alphamon.permanentId)).toBe(true);
      expect(countProtectionEvents(events, "effectTriggered")).toBe(0);
      expect(countProtectionEvents(events, "effectResolved")).toBe(0);
      expect(run.state.turnSeat).toBe(0);
      expect(run.state.turnCount).toBe(turnCountBefore + 1);
    } finally {
      if (!run.state.gameOver) {
        run.engine.applyIntent(run.state.turnSeat as 0 | 1, { type: "surrender" });
      }
    }
  });

  it("keeps the Once Per Turn use after a decline and announces only the accepted protection", async () => {
    const s = setupProtectedAllies();
    await s.ready();
    const firstAllyId = s.perm("firstAlly").permanentId;
    const secondAllyId = s.perm("secondAlly").permanentId;

    const firstDeletion = advance(s.engine).verb.deletePermanent([firstAllyId], "byEffect");
    await answerPrevention(s, false);
    expect(await firstDeletion).toBe(1);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("firstAlly").instanceId);
    expect(s.state.players[0]!.security.map((card) => card.instanceId)).toEqual([
      s.inst("paidSecurity").instanceId,
      s.inst("keptSecurity").instanceId,
    ]);
    expect(countProtectionEvents(s.events, "effectTriggered")).toBe(0);
    expect(countProtectionEvents(s.events, "effectResolved")).toBe(0);

    const secondDeletion = advance(s.engine).verb.deletePermanent([secondAllyId], "byEffect");
    await answerPrevention(s, true);
    expect(await secondDeletion).toBe(0);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === secondAllyId)).toBe(true);
    expect(s.state.players[0]!.security.map((card) => card.instanceId)).toEqual([s.inst("keptSecurity").instanceId]);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("paidSecurity").instanceId);
    expect(countProtectionEvents(s.events, "effectTriggered")).toBe(1);
    expect(countProtectionEvents(s.events, "effectResolved")).toBe(1);

    expect(await advance(s.engine).verb.deletePermanent([secondAllyId], "byEffect")).toBe(1);
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual([ALPHAMON]);
    expect(s.state.players[0]!.security.map((card) => card.instanceId)).toEqual([s.inst("keptSecurity").instanceId]);
  });
});
