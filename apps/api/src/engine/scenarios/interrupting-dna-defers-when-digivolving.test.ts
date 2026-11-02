import "#api/cards/index";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const record = JSON.parse(
  readFileSync(new URL("./interrupting-dna-defers-when-digivolving.replay.json", import.meta.url), "utf8"),
) as ReplayRecord;

const outerEffectKey = "AD1-025/ir-7-0";
const deferredEffectKey = "EX13-045/ir-7-0";

function eventIndex(events: readonly ServerEvent[], kind: ServerEvent["kind"], effectKey: string): number {
  return events.findIndex((event) => event.kind === kind && "effectKey" in event && event.effectKey === effectKey);
}

describe("Interrupting DNA digivolution during a removal effect", () => {
  it("finishes the removal effect before the new Digimon's [When Digivolving] activates", async () => {
    const events: ServerEvent[] = [];
    const replay = await runReplay(record, { untilInput: 43, onBatch: (_state, batch) => events.push(...batch) });
    try {
      expect(replay.divergences).toEqual([]);
      const materials = replay.state.pendingDecision!;
      expect(materials).toMatchObject({ seat: 1, kind: "chooseTargets" });
      expect(
        await replay.applyIntent(1, {
          type: "respondDecision",
          decisionId: materials.decisionId,
          response: {
            kind: "chooseTargets",
            instanceIds: (JSON.parse(materials.payloadJson) as { candidateInstanceIds: string[] }).candidateInstanceIds,
          },
        }),
      ).toEqual({ ok: true });
      expect(eventIndex(events, "effectTriggered", outerEffectKey)).toBeGreaterThanOrEqual(0);
      events.length = 0;

      const delayPrompt = replay.state.pendingDecision!;
      expect(delayPrompt).toMatchObject({ seat: 0, kind: "optional" });
      expect(
        await replay.applyIntent(0, {
          type: "respondDecision",
          decisionId: delayPrompt.decisionId,
          response: { kind: "optional", accept: true },
        }),
      ).toEqual({ ok: true });

      const dnaPrompt = replay.state.pendingDecision!;
      expect(dnaPrompt).toMatchObject({ seat: 0, kind: "optional" });
      expect(
        await replay.applyIntent(0, {
          type: "respondDecision",
          decisionId: dnaPrompt.decisionId,
          response: { kind: "optional", accept: true },
        }),
      ).toEqual({ ok: true });

      const examon = replay.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === "EX13-045")!;
      expect(examon.stack.map((card) => card.instanceId)).toEqual(expect.arrayContaining(["s0-28", "s0-3"]));
      expect(events).toContainEqual(
        expect.objectContaining({ kind: "cardPlayed", cardId: "EX13-045", mechanic: "dna", seat: 0 }),
      );
      expect(events).toContainEqual(
        expect.objectContaining({ kind: "effectTargetsSelected", seat: 1, targetPermanentIds: [examon.permanentId] }),
      );
      expect(events).toContainEqual(expect.objectContaining({ kind: "evadePrompt", permanentId: examon.permanentId }));
      expect(eventIndex(events, "effectTriggered", deferredEffectKey)).toBe(-1);
      expect(eventIndex(events, "effectResolved", outerEffectKey)).toBe(-1);

      expect(
        await replay.applyIntent(0, { type: "respondEvade", permanentId: examon.permanentId, accept: true }),
      ).toEqual({ ok: true });
      const ordering = replay.state.pendingDecision!;
      expect(ordering).toMatchObject({ seat: 0, kind: "orderTriggers" });
      const { triggerKeys } = JSON.parse(ordering.payloadJson) as { triggerKeys: string[] };
      const deferredKey = triggerKeys.find((key) => key.endsWith(deferredEffectKey));
      expect(deferredKey).toBeDefined();
      expect(
        await replay.applyIntent(0, {
          type: "respondDecision",
          decisionId: ordering.decisionId,
          response: { kind: "orderTriggers", order: [deferredKey!] },
        }),
      ).toEqual({ ok: true });

      const outerResolved = eventIndex(events, "effectResolved", outerEffectKey);
      const deferredTriggered = eventIndex(events, "effectTriggered", deferredEffectKey);
      expect(outerResolved).toBeGreaterThanOrEqual(0);
      expect(deferredTriggered).toBeGreaterThan(outerResolved);
      expect(replay.state.players[0]!.battleArea.map((permanent) => permanent.permanentId)).toContain(
        examon.permanentId,
      );
    } finally {
      await replay.applyIntent(0, { type: "surrender" });
    }
  });
});
