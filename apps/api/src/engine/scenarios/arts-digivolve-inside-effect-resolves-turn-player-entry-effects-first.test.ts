import "#api/cards/index";
import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/arts-digivolve-inside-effect-resolves-turn-player-entry-effects-first.fixture";

function eventIndex(events: readonly ServerEvent[], kind: ServerEvent["kind"], sourceCardId: string): number {
  return events.findIndex(
    (event) => event.kind === kind && "sourceCardId" in event && event.sourceCardId === sourceCardId,
  );
}

describe("Arts Digivolve used by a resolving effect", () => {
  it("resolves the turn player's [When Digivolving] before the opponent's [On Deletion] from the rule-check deletion", async () => {
    const s = setupScenario(fixture, {
      autoAcceptOptional: true,
      autoSelectCards: true,
      autoChooseOption: true,
      autoOrderTriggers: true,
    });
    const meramonId = s.perm("meramon").permanentId;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("murasamemon").instanceId })).toEqual({
        ok: true,
      });
      await settle(
        () => eventIndex(s.events, "effectResolved", "ST16-07") >= 0 && s.state.pendingDecision === undefined,
      );

      const outerResolved = eventIndex(s.events, "effectResolved", "ST23-04");
      const entryTriggered = s.events.findIndex(
        (event) =>
          event.kind === "effectTriggered" &&
          event.sourceCardId === "BT25-043" &&
          event.description?.startsWith("[When Digivolving]") === true,
      );
      const deletionTriggered = eventIndex(s.events, "effectTriggered", "ST16-07");

      expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).not.toContain(meramonId);
      expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toContain("ST16-07");
      expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toContain("BT25-043");
      expect(outerResolved).toBeGreaterThanOrEqual(0);
      expect(entryTriggered).toBeGreaterThan(outerResolved);
      expect(deletionTriggered).toBeGreaterThan(entryTriggered);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
