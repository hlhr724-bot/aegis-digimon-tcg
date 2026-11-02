import { describe, expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/fragment-retrashed-sources-trigger-again.fixture";
import "#api/cards/index";

const SOURCE_TRASH_REACTIONS = ["EX8-005", "EX11-038"];

describe("digivolution cards trashed twice inside one effect window", () => {
  it("trigger their trash reactions again when ＜Fragment＞ trashes them after they returned", async () => {
    const s = setupScenario(fixture, {
      autoAcceptOptional: true,
      autoSelectCards: true,
      preferTriggerKeys: ["subtrigger"],
    });
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("remover").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.turnSeat === 1 || s.state.pendingDecision?.seat === 0);

      const triggered = s.events
        .filter((event) => event.kind === "effectTriggered" && event.seat === 1)
        .map((event) => event.sourceCardId)
        .filter((cardId) => SOURCE_TRASH_REACTIONS.includes(cardId));
      expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["EX11-044"]);
      expect(triggered.sort()).toEqual([...SOURCE_TRASH_REACTIONS, ...SOURCE_TRASH_REACTIONS].sort());
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
