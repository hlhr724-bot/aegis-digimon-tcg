import fixture from "./opponent-on-deletion-before-effect-attack-security.fixture.js";
import { fixturePermanentId, fixtureInstanceId } from "../scenario/references.js";
import type { ScenarioFixture } from "../scenario/types.js";
import { Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import "../../cards/index.js";
import { layScenarioFixture } from "../scenario/fixture.js";
import { BLUE_DECK, RED_DECK } from "../testDecks.js";
import { advance } from "../testkit/advance.js";
import { observe } from "../testkit/observe.js";
import { setupEngine, settle } from "../testkit/harness.js";

const WARGROWLMON = fixturePermanentId("own-ad1-gallantmon-wargrowlmon");
const GALLANTMON = fixtureInstanceId("ad1-gallantmon-hand-card");

function withOpponentSecurity(count: number): ScenarioFixture {
  const opponent = fixture.board["1"]!;
  const security = opponent.security;
  if (!Array.isArray(security)) throw new Error("The fixture must list the opponent's security cards");
  return {
    ...fixture,
    board: { ...fixture.board, "1": { ...opponent, security: security.slice(0, count) } },
  };
}

async function attackAfterDeletingOmekamon(board: ScenarioFixture) {
  const s = setupEngine(
    { 0: {}, 1: {} },
    {
      autoAcceptOptional: true,
      autoChooseOption: true,
      autoSelectCards: true,
      preferTriggerKeys: ["ir-7-0"],
    },
  );
  layScenarioFixture(s.state, board, [BLUE_DECK, RED_DECK], true);
  const loop = s.engine.startTurnLoop();
  await settle(() => s.state.phase === Phase.Breeding);
  expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
  await advance(s.engine).waitForMainPhase(0);

  const eventsBefore = s.events.length;
  expect(s.engine.applyIntent(0, { type: "digivolve", permanentId: WARGROWLMON, instanceId: GALLANTMON })).toEqual({
    ok: true,
  });
  await settle(
    () =>
      s.events.slice(eventsBefore).some((event) => event.kind === "attackEnded") &&
      !observe(s.engine).isAttacking() &&
      s.state.pendingDecision === undefined,
    5000,
  );

  const events = s.events.slice(eventsBefore);
  const securityRevealed = events.findIndex((event) => event.kind === "securityRevealed");
  const onDeletionTriggered = events.findIndex(
    (event) => event.kind === "effectTriggered" && event.effectKey === "EX11-053/ir-11-0",
  );
  const omnimonPlayed = events.some((event) => event.kind === "cardPlayed" && event.cardId === "BT20-102");

  expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
  await loop;
  return { securityRevealed, onDeletionTriggered, omnimonPlayed };
}

describe("opponent [On Deletion] during an effect attack", () => {
  it("does not activate at the security check after failing its condition before Counter Timing", async () => {
    const { securityRevealed, onDeletionTriggered, omnimonPlayed } = await attackAfterDeletingOmekamon(fixture);

    expect(securityRevealed).toBeGreaterThan(-1);
    expect(onDeletionTriggered).toBe(-1);
    expect(omnimonPlayed).toBe(false);
  });

  it("activates before the security check when its condition holds before Counter Timing", async () => {
    const { securityRevealed, onDeletionTriggered, omnimonPlayed } = await attackAfterDeletingOmekamon(
      withOpponentSecurity(1),
    );

    expect(onDeletionTriggered).toBeGreaterThan(-1);
    expect(securityRevealed === -1 || onDeletionTriggered < securityRevealed).toBe(true);
    expect(omnimonPlayed).toBe(true);
  });
});
