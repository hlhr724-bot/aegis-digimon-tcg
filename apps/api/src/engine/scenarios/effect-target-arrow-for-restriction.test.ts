import fixtureEffectTargetArrowForRestriction from "./effect-target-arrow-for-restriction.fixture.js";
import { fixtureInstanceId, fixturePermanentId } from "../scenario/references.js";
import { Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import "../../cards/index.js";
import { layScenarioFixture } from "../scenario/fixture.js";
import { BLUE_DECK, RED_DECK } from "../testDecks.js";
import { advance } from "../testkit/advance.js";
import { setupEngine, settle } from "../testkit/harness.js";
import { observe } from "../testkit/observe.js";

describe("effect target arrow for a restriction", () => {
  it("links each resolving effect to the permanents it affects exactly once", async () => {
    const s = setupEngine(
      { 0: {}, 1: {} },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoChooseOption: true,
        declineDigiXros: true,
        preferInstanceIds: [fixtureInstanceId("own-card-effect-target-veedramon-card")],
      },
    );
    layScenarioFixture(s.state, fixtureEffectTargetArrowForRestriction, [BLUE_DECK, RED_DECK], true);
    const aeroVeedramonId = fixturePermanentId("own-effect-target-aeroveedramon");
    const veedramonId = fixturePermanentId("own-effect-target-veedramon");
    const opponentDigimonId = fixturePermanentId("opponent-effect-target-digimon");
    const loop = s.engine.startTurnLoop();
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: fixtureInstanceId("effect-target-tamer-card") }),
    ).toEqual({ ok: true });
    await settle(
      () => observe(s.engine).isRestricted(opponentDigimonId, "suspend") && s.state.pendingDecision === undefined,
    );

    const rina = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === "BT11-112")!;
    const targetEvents = s.events.filter((event) => event.kind === "effectTargetsSelected");
    expect(targetEvents).toEqual([
      {
        kind: "effectTargetsSelected",
        seat: 0,
        sourcePermanentId: rina.permanentId,
        targetPermanentIds: [veedramonId],
      },
      {
        kind: "effectTargetsSelected",
        seat: 0,
        sourcePermanentId: aeroVeedramonId,
        targetPermanentIds: [opponentDigimonId],
      },
    ]);
    const rinaOnPlayIndex = s.events.findIndex(
      (event) => event.kind === "effectTriggered" && event.timing === "OnPlay" && event.sourceCardId === "BT11-112",
    );
    const rinaTargetIndex = s.events.findIndex(
      (event) => event.kind === "effectTargetsSelected" && event.sourcePermanentId === rina.permanentId,
    );
    expect(rinaTargetIndex).toBeGreaterThan(rinaOnPlayIndex);

    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});
