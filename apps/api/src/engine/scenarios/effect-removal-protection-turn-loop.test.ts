import { fixtureVariant, fixtureInstanceId } from "../scenario/references.js";
import fixtureOverflowFullCost from "./overflow-full-cost.fixture.js";
import fixtureSenbon from "./senbon.fixture.js";
import fixtureIronSlash from "./iron-slash.fixture.js";
import fixtureMinervamon from "./minervamon.fixture.js";
import fixtureOverflow from "./overflow.fixture.js";
import fixtureOverflowBt20060Bt1020 from "./overflow-bt20-060-bt1-020.fixture.js";
import fixtureJunomon from "./junomon.fixture.js";
import fixtureHurricane from "./hurricane.fixture.js";
import fixtureGundramon from "./gundramon.fixture.js";
import { fixturePermanentId } from "../scenario/references.js";
import { Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import "../../cards/index.js";
import { layScenarioFixture, type ScenarioFixture } from "../scenario/fixture.js";
import { BLUE_DECK, RED_DECK } from "../testDecks.js";
import { advance } from "../testkit/advance.js";
import { setupEngine, settle, type EngineSetup } from "../testkit/harness.js";

function checkRie(s: EngineSetup, expectedTop: string, expectedStack: string[]): void {
  const host = s.state.players[1]!.battleArea.find(
    (p) => p.permanentId === fixturePermanentId("opponent-removal-rie"),
  )!;
  expect(host.topCard.cardId).toBe(expectedTop);
  expect([...host.stack].map((c) => c.cardId)).toEqual(expectedStack);
}

function checkOverflow(s: EngineSetup, discounted = true): void {
  const opponent = s.state.players[1]!;
  expect(opponent.deck.at(-1)?.cardId).toBe("BT20-060");
  expect(opponent.battleArea.map((p) => p.topCard.cardId)).toEqual(discounted ? ["BT1-020"] : []);
  expect(s.state.memory).toBe(discounted ? 5 : 0);
  expect(s.events.filter((e) => e.kind === "memoryChanged" && e.reason === "overflow")).toHaveLength(1);
}

function checkProtection(s: EngineSetup, mamemonCount = 0, sourceCount = 0): void {
  const opponent = s.state.players[1]!;
  expect(opponent.battleArea.map((p) => p.topCard.cardId)).toEqual(["BT24-019", "BT24-024", "BT24-028", "BT24-030"]);
  // Neptunemon may immediately unsuspend with its own once-per-turn trigger.
  expect(s.decisions.some(({ req }) => req.sourceCardId === "BT24-030")).toBe(true);
  expect([...opponent.trash].filter((c) => ["BT24-019", "BT24-024", "BT24-028"].includes(c.cardId))).toHaveLength(0);
  expect(
    s.events.filter(
      (e) =>
        e.kind === "cardsMoved" &&
        e.from === "unsuspended" &&
        e.to === "suspended" &&
        e.instanceIds.includes(fixturePermanentId("opponent-removal-target-3")),
    ),
  ).toHaveLength(1);
  expect(s.state.players[0]!.battleArea.filter((p) => p.topCard.cardId === "BT6-063")).toHaveLength(mamemonCount);
  expect(s.state.players[0]!.security).toHaveLength(3);
  expect(s.state.players[0]!.battleArea[0]!.stack).toHaveLength(sourceCount);
}

const scenarios = [
  [fixtureOverflowFullCost, "BT24-030", (s) => checkOverflow(s, false), 0],
  [fixtureSenbon, "BT8-106", (s) => checkProtection(s, 2), 0],
  [fixtureIronSlash, "BT25-100", (s) => checkRie(s, "BT1-009", []), 0],
  [fixtureMinervamon, "BT24-041", (s) => checkRie(s, "BT1-009", []), 0],
  [fixtureOverflow, "BT24-030", checkOverflow, 5],
  [fixtureOverflowBt20060Bt1020, "BT24-030", checkOverflow, 5],
  [fixtureJunomon, "BT26-083", checkProtection, 4],
  [fixtureHurricane, "EX7-071", (s) => checkProtection(s, 0, 1), 4],
  [fixtureGundramon, "LM-067", checkProtection, 10],
] as const satisfies readonly (readonly [ScenarioFixture, string, (s: EngineSetup) => void, number])[];

describe("removal arena scenarios", () => {
  for (const [scenario, card, check, finalMemory] of scenarios) {
    it(`${scenario.name}: public action resolves the reported interaction`, async () => {
      const s = setupEngine(
        { 0: {}, 1: {} },
        {
          autoAcceptOptional: true,
          autoSelectCards: true,
          autoChooseOption: true,
        },
      );
      layScenarioFixture(s.state, scenario, [BLUE_DECK, RED_DECK], true);
      expect(s.state.memory).toBeGreaterThanOrEqual(-10);
      expect(s.state.memory).toBeLessThanOrEqual(10);
      const loop = s.engine.startTurnLoop();
      try {
        await settle(() => s.state.phase === Phase.Breeding);
        expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
        await advance(s.engine).waitForMainPhase(0);
        const intent =
          scenario === fixtureGundramon
            ? {
                type: "attack" as const,
                attackerPermanentId: fixturePermanentId("own-removal-attacker"),
                target: { kind: "player" as const },
              }
            : {
                type: "playCard" as const,
                instanceId: fixtureVariant(
                  {
                    "BT24-030": fixtureInstanceId("removal-hand-BT24-030-card"),
                    "BT8-106": fixtureInstanceId("removal-hand-BT8-106-card"),
                    "BT25-100": fixtureInstanceId("removal-hand-BT25-100-card"),
                    "BT24-041": fixtureInstanceId("removal-hand-BT24-041-card"),
                    "BT26-083": fixtureInstanceId("removal-hand-BT26-083-card"),
                    "EX7-071": fixtureInstanceId("removal-hand-EX7-071-card"),
                  },
                  card,
                ),
              };
        expect(s.engine.applyIntent(0, intent)).toEqual({ ok: true });
        await settle(
          () =>
            s.events.some((e) => e.kind === "effectResolved" && e.sourceCardId === card) &&
            s.state.pendingDecision === undefined &&
            s.engine.mainVerbContinuationsInFlight === 0 &&
            (scenario !== fixtureJunomon || (s.state.turnSeat === 1 && s.state.phase === Phase.Breeding)),
        );
        check(s);
        expect(s.state.memory).toBe(finalMemory);
      } finally {
        expect(s.engine.applyIntent(s.state.turnSeat, { type: "surrender" })).toEqual({ ok: true });
        await loop;
      }
    });
  }
});
