import fixtureBt20DragonGeneSkipPlay from "./bt20-dragon-gene-skip-play.fixture.js";
import { fixtureInstanceId } from "../scenario/references.js";
import { Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import "../../cards/index.js";
import { layScenarioFixture } from "../scenario/fixture.js";
import { BLUE_DECK, RED_DECK } from "../testDecks.js";
import { advance } from "../testkit/advance.js";
import { setupEngine, settle } from "../testkit/harness.js";

describe("BT20 Unleash the Dragon Gene skip-play arena scenario", () => {
  it("places the Option without playing after the accepted pick is answered with no card", async () => {
    const s = setupEngine({ 0: {}, 1: {} }, { autoAcceptOptional: true });
    layScenarioFixture(s.state, fixtureBt20DragonGeneSkipPlay, [RED_DECK, BLUE_DECK], true);
    const loop = s.engine.startTurnLoop();
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 10;

    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: fixtureInstanceId("dragon-gene-option-card") }),
    ).toEqual({ ok: true });
    await settle(() => s.decisions.some(({ req }) => req.kind === "selectCards" && req.sourceCardId === "BT20-093"));
    const pick = s.decisions.find(({ req }) => req.kind === "selectCards" && req.sourceCardId === "BT20-093")!.req;
    expect(pick.options?.candidateInstanceIds).toEqual(
      expect.arrayContaining([
        fixtureInstanceId("dragon-gene-coredramon-card"),
        fixtureInstanceId("dragon-gene-examon-card"),
      ]),
    );
    expect(pick.options?.min).toBe(0);

    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: pick.decisionId,
        response: { kind: "selectCards", instanceIds: [] },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some(
          ({ topCard }) => topCard.instanceId === fixtureInstanceId("dragon-gene-option-card"),
        ) && s.state.pendingDecision === undefined,
    );

    const hand = s.state.players[0]!.hand.map(({ instanceId }) => instanceId);
    const memory = s.state.memory;
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
    expect(hand).toEqual(
      expect.arrayContaining([
        fixtureInstanceId("dragon-gene-coredramon-card"),
        fixtureInstanceId("dragon-gene-examon-card"),
      ]),
    );
    expect(memory).toBe(10 - 2);
  });
});
