import { PendingDecision } from "@aegis/shared/schema/GameState";
import { describe, expect, it } from "vitest";
import {
  GameState,
  MATCH_TIMER_DECISION_BONUS_MAX_SECONDS_PER_TURN,
  MATCH_TIMER_DECISION_BONUS_SECONDS,
  MULLIGAN_TIMER_SECONDS,
  MATCH_TIMER_START_SECONDS,
  matchTimerSettings,
} from "@aegis/shared";
import { MatchClock, PRESENTATION_BACKLOG_MAX_MS } from "./MatchClock.js";

function clock(options = { matchTimer: true, timerStartSeconds: 60, timerRefillSeconds: 15 }) {
  const state = new GameState();
  return { state, timer: new MatchClock(state, options, true, 0) };
}

describe("optional match clock", () => {
  it("keeps waiting rooms and disabled clocks untouched", () => {
    const { state, timer } = clock();
    timer.update(90_000, undefined);
    expect(state.timerRemaining0).toBe(60);
    state.matchTimer = false;
    timer.update(90_000, 0);
    expect(timer.update(200_000, 0)).toBeUndefined();
    expect(state.timerActiveSeat).toBe(-1);
  });

  it("charges only the player asked to act, including the defending player's response", () => {
    const { state, timer } = clock();
    timer.update(0, 0);
    timer.update(10_000, 1);
    timer.update(15_000, 0);
    expect(state.timerRemaining0).toBe(50);
    expect(state.timerRemaining1).toBe(55);
    expect(state.timerActiveSeat).toBe(0);
  });

  it("pauses during resolution and resumes without charging the paused interval", () => {
    const { state, timer } = clock();
    timer.update(0, 0);
    timer.update(10_000, undefined);
    timer.update(100_000, 1);
    timer.update(101_000, 1);
    expect(state.timerRemaining0).toBe(50);
    expect(state.timerRemaining1).toBe(59);
  });

  it("holds the deciding seat for exactly the batch's computed animation time, with no client report", () => {
    const { state, timer } = clock();
    timer.update(0, 0);
    timer.presentBatch(0, [8000, 8000]);
    timer.update(7900, 0);
    expect(state.timerActiveSeat).toBe(-1);
    expect(state.timerRemaining0).toBe(60);
    timer.update(8000, 0);
    expect(state.timerActiveSeat).toBe(0);
    timer.update(10_000, 0);
    expect(state.timerRemaining0).toBe(58);
  });

  it("queues back-to-back batches on the seat's timeline", () => {
    const { state, timer } = clock();
    timer.update(0, 0);
    timer.presentBatch(0, [5000, 5000]);
    timer.presentBatch(1000, [5000, 5000]);
    timer.update(9900, 0);
    expect(state.timerRemaining0).toBe(60);
    timer.update(12_000, 0);
    expect(state.timerRemaining0).toBe(58);
  });

  it("starts each seat's clock at the end of its own timeline", () => {
    const { state, timer } = clock();
    timer.update(0, 0);
    timer.presentBatch(0, [3000, 6000]);
    timer.update(4000, 0);
    expect(state.timerRemaining0).toBe(59);
    timer.update(4000, 1);
    timer.update(5000, 1);
    expect(state.timerRemaining1).toBe(60);
    timer.update(9000, 1);
    expect(state.timerRemaining1).toBe(57);
  });

  it("caps a timeline queued far faster than it plays", () => {
    const { state, timer } = clock({ matchTimer: true, timerStartSeconds: 300, timerRefillSeconds: 15 });
    timer.update(0, 0);
    for (let batch = 0; batch < 20; batch += 1) timer.presentBatch(0, [20_000, 20_000]);
    timer.update(PRESENTATION_BACKLOG_MAX_MS + 1000, 0);
    expect(state.timerRemaining0).toBe(299);
  });

  it("never charges the seat that is not asked to act", () => {
    const { state, timer } = clock();
    timer.update(0, 1);
    timer.presentBatch(0, [1000, 1000]);
    timer.update(6000, 1);
    expect(state.timerRemaining0).toBe(60);
    expect(state.timerRemaining1).toBe(55);
  });

  it("ends a reconnecting seat's timeline at the reconnect", () => {
    const { state, timer } = clock();
    timer.update(0, 0);
    timer.presentBatch(0, [8000, 8000]);
    timer.update(2000, 0);
    timer.resetPresentation(0, 2000);
    timer.update(4000, 0);
    expect(state.timerRemaining0).toBe(58);
  });

  it.each([0, 15, 30, 60])(
    "adds 60s to the owner and 30s to the opponent once, ignoring legacy refill %i",
    (refill) => {
      const { state, timer } = clock({ matchTimer: true, timerStartSeconds: 300, timerRefillSeconds: refill });
      state.turnCount = 1;
      timer.update(0, 0);
      timer.update(100_000, 1);
      timer.update(150_000, 1);
      expect(state.timerRemaining0).toBe(200);
      expect(state.timerRemaining1).toBe(250);
      state.turnCount = 2;
      state.turnSeat = 1;
      timer.update(150_000, 1);
      expect(state.timerRemaining0).toBe(230);
      expect(state.timerRemaining1).toBe(300);
      timer.update(170_000, 0);
      expect(state.timerRemaining1).toBe(280);
      timer.update(220_000, 0);
      expect(state.timerRemaining0).toBe(180);
      state.turnCount = 3;
      state.turnSeat = 0;
      timer.update(220_000, 0);
      expect(state.timerRemaining0).toBe(240);
      expect(state.timerRemaining1).toBe(300);
      timer.update(220_000, 0);
      expect(state.timerRemaining0).toBe(240);
      timer.update(230_000, 0);
      expect(state.timerRemaining0).toBe(230);
    },
  );

  it("preserves the opening reserve without granting a bonus after mulligan", () => {
    const { state, timer } = clock();
    timer.update(0, 0);
    timer.update(10_000, undefined);
    expect(state.timerRemaining0).toBe(50);
    state.turnCount = 1;
    state.turnSeat = 0;
    timer.update(10_000, 0);
    expect(state.timerRemaining0).toBe(50);
  });

  it("expires before an answer or turn bonus arriving at the deadline", () => {
    const { state, timer } = clock();
    state.turnCount = 1;
    timer.update(0, 0);
    state.turnCount = 2;
    expect(timer.update(60_000, 1)).toEqual({ seat: 0, clock: "match" });
    expect(state.timerRemaining0).toBe(0);
    expect(state.timerActiveSeat).toBe(-1);
  });

  it("stops charging when the match is over", () => {
    const { state, timer } = clock();
    timer.update(0, 1);
    timer.update(10_000, 1);
    state.gameOver = true;
    expect(timer.update(80_000, 1)).toBeUndefined();
    expect(state.timerRemaining1).toBe(50);
    expect(state.timerActiveSeat).toBe(-1);
  });

  it("ignores public overrides and rejects malformed private timing options", () => {
    expect(matchTimerSettings({ matchTimer: true, timerStartSeconds: 60, timerRefillSeconds: 0 })).toEqual({
      enabled: true,
      startSeconds: MATCH_TIMER_START_SECONDS,
      refillSeconds: 60,
    });
    expect(matchTimerSettings({ matchTimer: true, timerStartSeconds: -1, timerRefillSeconds: Infinity }, true)).toEqual(
      { enabled: true, startSeconds: MATCH_TIMER_START_SECONDS, refillSeconds: 60 },
    );
    expect(matchTimerSettings({ matchTimer: "true" } as never, true).enabled).toBe(false);
  });
});

describe("mulligan window, disconnect freeze and combo time", () => {
  it("charges the mulligan window, not the match clock, and reports its own expiry", () => {
    const { state, timer } = clock();
    timer.update(0, 0, "mulligan");
    timer.update(10_000, 0, "mulligan");
    expect(state.mulliganTimerRemaining0).toBe(MULLIGAN_TIMER_SECONDS - 10);
    expect(state.timerRemaining0).toBe(60);
    expect(state.timerActiveSeat).toBe(0);
    expect(timer.update(MULLIGAN_TIMER_SECONDS * 1000, 1, "mulligan")).toEqual({ seat: 0, clock: "mulligan" });
    expect(state.timerRemaining0).toBe(60);
    timer.update(30_000, 1, "mulligan");
    timer.update(35_000, 1, "mulligan");
    expect(state.mulliganTimerRemaining1).toBe(MULLIGAN_TIMER_SECONDS - 5);
  });

  it("freezes the deciding seat while its opponent is away and resumes without charging the gap", () => {
    const { state, timer } = clock();
    timer.update(0, 0);
    timer.update(5000, 0, "frozen");
    expect(state.timerActiveSeat).toBe(-1);
    expect(timer.update(500_000, 0, "frozen")).toBeUndefined();
    expect(state.timerRemaining0).toBe(55);
    timer.update(505_000, 0);
    expect(state.timerRemaining0).toBe(55);
    timer.update(507_000, 0);
    expect(state.timerRemaining0).toBe(53);
  });

  it("adds combo time per decision up to the per-turn ceiling, never past the starting reserve", () => {
    const { state, timer } = clock();
    state.turnCount = 1;
    timer.update(0, 0);
    timer.update(50_000, 0);
    for (let index = 0; index < 20; index += 1) timer.grantDecisionBonus(0);
    expect(state.timerRemaining0).toBe(10 + MATCH_TIMER_DECISION_BONUS_MAX_SECONDS_PER_TURN);
    state.turnCount = 2;
    timer.grantDecisionBonus(0);
    expect(state.timerRemaining0).toBe(
      10 + MATCH_TIMER_DECISION_BONUS_MAX_SECONDS_PER_TURN + MATCH_TIMER_DECISION_BONUS_SECONDS,
    );
    timer.grantDecisionBonus(1);
    expect(state.timerRemaining1).toBe(60);
  });
});

it("#39 shares a bounded combo allowance between confirmed cards and effect decisions", () => {
  const { state, timer } = clock();
  state.turnCount = 1;
  timer.update(0, 0);
  timer.update(50_000, 0);
  timer.grantCardBonus(0);
  expect(state.timerRemaining0).toBe(10 + MATCH_TIMER_DECISION_BONUS_SECONDS);
  for (let index = 0; index < 20; index++) {
    timer.grantCardBonus(0);
    timer.grantDecisionBonus(0);
  }
  expect(state.timerRemaining0).toBe(10 + MATCH_TIMER_DECISION_BONUS_MAX_SECONDS_PER_TURN);
});

function createPublicInactivityClock() {
  const state = new GameState();
  const timer = new MatchClock(state, { matchTimer: true }, false, 0, true);
  return { state, timer };
}

describe("public unanswered-input budget", () => {
  it("expires one unanswered Main action after ninety seconds while preserving the match bank", () => {
    const { state, timer } = createPublicInactivityClock();
    timer.update(0, 0, "match", "main:0");
    timer.update(60_000, 0, "match", "main:0");
    expect(state.inactivitySeat).toBe(0);
    expect(state.inactivityRemainingSeconds).toBe(30);
    expect(timer.update(90_000, 0, "match", "main:0")).toEqual({ seat: 0, clock: "match" });
    expect(state.timerRemaining0).toBe(210);
  });

  it("excludes animation, frozen intervals and reconnect presentation resets without replenishing inactivity", () => {
    const { state, timer } = createPublicInactivityClock();
    timer.update(0, 0, "match", "decision:one");
    timer.presentBatch(0, [10_000, 10_000]);
    timer.update(30_000, 0, "frozen", "decision:one");
    expect(state.inactivityRemainingSeconds).toBe(70);
    expect(state.inactivitySeat).toBe(0);
    timer.resetPresentation(0, 100_000);
    timer.update(100_000, 0, "match", "decision:one");
    expect(state.inactivityRemainingSeconds).toBe(70);
    expect(timer.update(169_000, 0, "match", "decision:one")).toBeUndefined();
    expect(timer.update(170_000, 0, "match", "decision:one")).toEqual({ seat: 0, clock: "match" });
  });

  it("resets on accepted activity and new decisions, but refuses an answer at the deadline", () => {
    const { state, timer } = createPublicInactivityClock();
    timer.update(0, 0, "match", "main:0");
    timer.update(80_000, 0, "match", "main:0");
    timer.resetInactivity();
    timer.update(80_000, 0, "match", "main:0");
    expect(state.inactivityRemainingSeconds).toBe(90);
    timer.update(160_000, 0, "match", "decision:next");
    expect(state.inactivityRemainingSeconds).toBe(90);
    expect(timer.update(250_000, 1, "match", "decision:late")).toEqual({ seat: 0, clock: "match" });
  });

  it("does not penalize private clocks or charge mulligan time to inactivity", () => {
    const { timer: privateTimer, state: privateState } = clock({
      matchTimer: true,
      timerStartSeconds: 300,
      timerRefillSeconds: 15,
    });
    privateTimer.update(0, 0, "match", "main");
    expect(privateTimer.update(100_000, 0, "match", "main")).toBeUndefined();
    expect(privateState.inactivitySeat).toBe(-1);
    const { state, timer } = createPublicInactivityClock();
    timer.update(0, 0, "mulligan", "mulligan");
    timer.update(20_000, 0, "match", "main");
    expect(state.inactivityRemainingSeconds).toBe(90);
  });
});

it.each([0, 1] as const)(
  "publishes seat%s's first post-mulligan budget throughout presentation and frozen periods",
  (seat) => {
    const { state, timer } = createPublicInactivityClock();
    expect(state.inactivityRemainingSeconds).toBe(90);
    timer.update(0, seat, "mulligan", "mulligan");
    expect(state.inactivitySeat).toBe(-1);
    timer.update(10_000, seat, "match", `first:${seat}`);
    timer.presentBatch(10_000, [10_000, 10_000]);
    timer.update(10_000, seat, "match", `first:${seat}`);
    expect(state.inactivitySeat).toBe(seat);
    expect(state.inactivityRemainingSeconds).toBe(90);
    expect(state.timerActiveSeat).toBe(-1);
    timer.update(19_000, seat, "match", `first:${seat}`);
    expect(state.inactivityRemainingSeconds).toBe(90);
    timer.update(80_000, seat, "frozen", `first:${seat}`);
    expect(state.inactivitySeat).toBe(seat);
    expect(state.inactivityRemainingSeconds).toBe(30);
    expect(state.timerActiveSeat).toBe(-1);
    timer.update(200_000, seat, "frozen", `first:${seat}`);
    expect(state.inactivityRemainingSeconds).toBe(30);
    timer.update(200_000, seat, "match", `first:${seat}`);
    expect(timer.update(229_999, seat, "match", `first:${seat}`)).toBeUndefined();
    expect(timer.update(230_000, seat, "match", `first:${seat}`)).toEqual({ seat, clock: "match" });
    expect(state.inactivityRemainingSeconds).toBe(0);
    expect(state.inactivitySeat).toBe(-1);
    expect(seat === 0 ? state.timerRemaining0 : state.timerRemaining1).toBe(210);
  },
);

it("does not publish an inactivity owner for a frozen mulligan or an excluded clock", () => {
  const { state, timer } = createPublicInactivityClock();
  const decision = new PendingDecision();
  decision.kind = "mulligan";
  decision.seat = 0;
  state.pendingDecision = decision;
  timer.update(0, 0, "frozen", "mulligan");
  timer.update(100_000, 0, "frozen", "mulligan");
  expect(state.inactivitySeat).toBe(-1);
  expect(state.inactivityRemainingSeconds).toBe(90);
  const excluded = clock();
  excluded.timer.update(0, 0);
  expect(excluded.state.inactivitySeat).toBe(-1);
  expect(excluded.state.inactivityRemainingSeconds).toBe(0);
});
