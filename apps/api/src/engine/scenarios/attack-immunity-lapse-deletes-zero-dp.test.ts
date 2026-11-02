import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";
import fixture from "#api/engine/scenarios/attack-immunity-lapse-deletes-zero-dp.fixture";
import "#api/cards/BT27/BT27-103";
import "#api/cards/EX13/EX13-037";

const record = JSON.parse(
  readFileSync(new URL("./attack-immunity-lapse-deletes-zero-dp.replay.json", import.meta.url), "utf8"),
) as ReplayRecord;

describe("DP reductions held by attack immunity", () => {
  it("deletes the attacker by rule as soon as its attack ends", async () => {
    const s = setupScenario(fixture, { autoDeclineOptional: true, autoSelectCards: true });
    const ouryukenId = s.perm("ouryuken").permanentId;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(
        s.engine.applyIntent(0, { type: "attack", attackerPermanentId: ouryukenId, target: { kind: "player" } }),
      ).toEqual({ ok: true });
      await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
      expect(s.engine.applyIntent(1, { type: "declineBlock" })).toEqual({ ok: true });
      await settle(() => s.events.some((event) => event.kind === "attackEnded") && !s.state.pendingDecision);

      const reductions = s.events.filter(
        (event) => event.kind === "dpModifierApplied" && event.permanentId === ouryukenId && event.delta === -12000,
      );
      const attackEnded = s.events.findIndex((event) => event.kind === "attackEnded");
      const deletion = s.events.findIndex(
        (event) =>
          event.kind === "cardsMoved" &&
          (event.deletedPermanents ?? []).some(({ permanentId }) => permanentId === ouryukenId),
      );

      expect(reductions).toHaveLength(2);
      expect(deletion).toBeGreaterThan(attackEnded);
      expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).not.toContain(ouryukenId);
      expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("BT27-103");
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });

  it.each([{ preventLeaving: false }, { preventLeaving: true }])(
    "removes the reported Alphamon: Ouryuken before it can attack again when leave prevention is $preventLeaving",
    async ({ preventLeaving }) => {
      const run = await runReplay(record, { untilInput: 64 });
      const prompt = run.state.pendingDecision;

      expect(run.divergences).toEqual([]);
      expect(prompt).toMatchObject({ seat: 1, kind: "optional", promptText: "Prevent leaving the battle area?" });
      expect(
        await run.applyIntent(1, {
          type: "respondDecision",
          decisionId: prompt!.decisionId,
          response: { kind: "optional", accept: preventLeaving },
        }),
      ).toEqual({ ok: true });

      expect(run.state.pendingDecision).toBeUndefined();
      expect(run.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).not.toContain("perm-2");
      expect(run.state.players[1]!.trash.map(({ cardId }) => cardId)).toContain("BT27-103");
      expect(
        await run.applyIntent(1, { type: "attack", attackerPermanentId: "perm-2", target: { kind: "player" } }),
      ).toMatchObject({ ok: false });
    },
  );
});
