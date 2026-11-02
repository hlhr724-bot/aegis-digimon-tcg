import fixtureRuinModeOnPlay from "./ruin-mode-on-play.fixture.js";
import { fixtureInstanceId } from "../scenario/references.js";
import { Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import "../../cards/index.js";
import { layScenarioFixture } from "../scenario/fixture.js";
import { BLUE_DECK, RED_DECK } from "../testDecks.js";
import { advance } from "../testkit/advance.js";
import { setupEngine, settle } from "../testkit/harness.js";

const RUIN_MODE_CARD = fixtureInstanceId("opponent-card-ruin-mode-card");
const MONODRAMON_CARD = fixtureInstanceId("opponent-card-monodramon-card");
const DELETE_OPTION = fixtureInstanceId("delete-option-card");
const KUWAGAMON = fixtureInstanceId("kuwagamon-card");
const LILLYMON = fixtureInstanceId("lillymon-card");

describe("playable Ruin Mode lingering DP scenario", () => {
  it("deletes a 4000-DP play before its On Play (Q3523) but lets an 8000-DP play resolve its On Play", async () => {
    let lillymonDPAtResolution: number | undefined;
    const s = setupEngine(
      { 0: {}, 1: {} },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        onEvent(event) {
          if (event.kind === "effectResolved" && event.sourceCardId === "BT14-049") {
            lillymonDPAtResolution = s.state.players[0]!.battleArea.find(
              (permanent) => permanent.topCard.instanceId === LILLYMON,
            )?.currentDP;
          }
        },
      },
    );
    layScenarioFixture(s.state, fixtureRuinModeOnPlay, [BLUE_DECK, RED_DECK], true);
    const human = s.state.players[0]!;
    const opponent = s.state.players[1]!;
    const triggered = (cardId: string) =>
      s.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === cardId);
    const loop = s.engine.startTurnLoop();
    try {
      await settle(() => s.state.phase === Phase.Breeding);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);

      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: DELETE_OPTION })).toEqual({ ok: true });
      await settle(
        () =>
          opponent.trash.some((card) => card.instanceId === RUIN_MODE_CARD) &&
          s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "EX4-074") &&
          s.state.pendingDecision === undefined,
      );
      expect(opponent.battleArea.map((permanent) => permanent.topCard.instanceId)).toEqual([MONODRAMON_CARD]);

      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: KUWAGAMON })).toEqual({ ok: true });
      await settle(
        () => human.trash.some((card) => card.instanceId === KUWAGAMON) && s.state.pendingDecision === undefined,
      );
      expect(triggered("BT1-070")).toBe(false);
      expect(opponent.battleArea[0]?.isSuspended).toBe(false);
      expect(s.state.memory).toBe(2);

      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: LILLYMON })).toEqual({ ok: true });
      await settle(() =>
        s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT14-049"),
      );
      expect(lillymonDPAtResolution).toBe(3000);
      expect(opponent.battleArea).toHaveLength(0);
      expect(opponent.deck.at(-1)?.instanceId).toBe(MONODRAMON_CARD);
    } finally {
      s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
      // Lillymon spends the last memory, so the loop may wait in the opponent's breeding phase.
      s.engine.expireMatchTimer(s.state.turnSeat);
      await loop;
    }
  });
});
