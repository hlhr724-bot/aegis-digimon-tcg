import { Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { effectTextMayAskYesNo } from "#api/engine/decisions/resolverDecisions";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import { breedingMoveWatcherShowsPrintedClause } from "#api/engine/scenarios/breeding-move-watcher-shows-printed-clause.fixture";

const BREEDING_MOVE_CLAUSE =
  "[Opponent's Turn] [Once Per Turn] When an opponent's Digimon moves from the breeding area to the battle area, if [Rosemon]/[X Antibody] is in this Digimon's digivolution cards, you may suspend 1 of their Digimon.";

describe("opponent breeding-move watcher from a box that prints several watcher lines", () => {
  it("announces its printed clause, which reads as optional", async () => {
    const s = setupScenario(breedingMoveWatcherShowsPrintedClause(), { autoSelectCards: true });
    const loop = s.engine.startTurnLoop();
    try {
      await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 1);
      expect(
        s.engine.applyIntent(1, { type: "moveFromBreeding", permanentId: s.perm("breedingMover").permanentId }),
      ).toEqual({ ok: true });
      await settle(() =>
        s.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT15-054"),
      );

      const announcement = s.events.find(
        (event) => event.kind === "effectTriggered" && event.sourceCardId === "BT15-054",
      ) as { description: string };
      expect(announcement.description).toBe(BREEDING_MOVE_CLAUSE);
      expect(effectTextMayAskYesNo(announcement.description)).toBe(true);
    } finally {
      if (!s.state.gameOver) s.engine.applyIntent(s.state.turnSeat as 0 | 1, { type: "surrender" });
      await loop;
    }
  });
});
