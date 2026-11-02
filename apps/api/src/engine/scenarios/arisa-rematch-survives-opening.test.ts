import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import fixture from "#api/engine/scenarios/arisa-rematch-story-adaptation.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import "#api/cards/index";

it("lets the promoted opening Digimon survive the Arisa rematch turn transition", async () => {
  const s = setupScenario(fixture, { autoDeclineOptional: true, autoSelectCards: true });
  const openingId = s.state.players[0]!.breeding!.permanentId;
  const loop = s.engine.startTurnLoop();
  try {
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: openingId })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await settle(() => s.state.turnCount > 2 && s.state.phase === Phase.Breeding);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === openingId)).toBe(true);
  } finally {
    if (s.state.phase === Phase.Breeding) {
      s.engine.applyIntent(s.state.turnSeat, { type: "endPhase" });
      await advance(s.engine).waitForMainPhase(s.state.turnSeat);
    }
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
