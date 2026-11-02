import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

import { Phase } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/linking-returns-low-dp-digimon.fixture";

const record = JSON.parse(
  readFileSync(new URL("./linking-returns-low-dp-digimon.replay.json", import.meta.url), "utf8"),
) as ReplayRecord;

describe("Linking returns low-DP Digimon", () => {
  it("offers Mikemon as the mandatory bottom-deck target when DoGatchmon links to Timemon", async () => {
    const replay = await runReplay(record, { untilInput: 22 });
    try {
      expect(replay.divergences).toEqual([]);
      expect(
        await replay.applyIntent(0, {
          type: "linkCard",
          instanceId: "s0-33",
          targetPermanentId: "perm-1",
        }),
      ).toEqual({ ok: true });
      expect(replay.state.pendingDecision?.kind).toBe("orderTriggers");
      const payload = JSON.parse(replay.state.pendingDecision!.payloadJson) as {
        triggerKeys: string[];
        triggerCardIds: string[];
      };
      expect(payload.triggerCardIds).toContain("ST22-12");
      const linkKey = payload.triggerKeys[payload.triggerCardIds.indexOf("ST22-12")]!;
      expect(
        await replay.applyIntent(0, {
          type: "respondDecision",
          decisionId: replay.state.pendingDecision!.decisionId,
          response: {
            kind: "orderTriggers",
            order: [linkKey, ...payload.triggerKeys.filter((key) => key !== linkKey)],
            optionalAnswers: Object.fromEntries(
              payload.triggerKeys.filter((key) => key.includes("P-217")).map((key) => [key, false]),
            ),
          },
        }),
      ).toEqual({ ok: true });
      expect(replay.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === "perm-5")).toBe(false);
      expect(replay.state.players[1]!.deck.at(-1)?.cardId).toBe("BT13-051");
      expect(replay.state.pendingDecision).toBeUndefined();
    } finally {
      await replay.applyIntent(0, { type: "surrender" });
    }
  });
});

describe("DoGatchmon link target boundaries", () => {
  it("returns exactly the 5000 DP target and keeps a 6000 DP Digimon in play", async () => {
    const s = setupScenario(fixture);
    const loop = s.engine.startTurnLoop();
    try {
      await settle(() => s.state.phase === Phase.Breeding);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await settle(() => s.state.phase === Phase.Main && !s.state.pendingDecision);
      expect(
        s.engine.applyIntent(0, {
          type: "linkCard",
          instanceId: s.inst("linkCard").instanceId,
          targetPermanentId: s.perm("host").permanentId,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
      expect(s.state.pendingDecision!.payloadJson).toContain(s.perm("eligible").permanentId);
      expect(s.state.pendingDecision!.payloadJson).not.toContain(s.perm("ineligible").permanentId);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: s.state.pendingDecision!.decisionId,
          response: { kind: "chooseTargets", instanceIds: [s.perm("eligible").permanentId] },
        }),
      ).toEqual({ ok: true });
      await settle(() => !s.state.pendingDecision);
      expect(s.state.players[1]!.deck.at(-1)?.instanceId).toBe(s.inst("eligible").instanceId);
      expect(s.state.players[1]!.battleArea.map((p) => p.permanentId)).toEqual([
        s.perm("ineligible").permanentId,
        s.perm("otherEligible").permanentId,
      ]);
      expect(s.state.memory).toBe(3);
      expect(s.perm("host").linked.map((card) => card.instanceId)).toEqual([s.inst("linkCard").instanceId]);
    } finally {
      s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
      await loop;
    }
  });
});
