import { describe, expect, it } from "vitest";
import { Phase, type GameState, type Permanent, type PlayerState } from "@aegis/shared";
import { actionGuards } from "./actionGuards";

function viewerWith(canAttackPlayer: boolean): PlayerState {
  const permanent = { canAttackPlayer, attackablePermanentIds: [] } as unknown as Permanent;
  return { battleArea: [permanent], eggDeckCount: 0 } as unknown as PlayerState;
}

function guardsAt(phase: Phase, viewer: PlayerState) {
  const state = { gameOver: false, turnSeat: 0, phase } as unknown as GameState;
  return actionGuards({
    state,
    viewer,
    viewerSeat: 0,
    decisionOpen: false,
    presenting: false,
    phasePresentationPending: false,
  });
}

describe("actionGuards", () => {
  it("blocks board actions outside Main", () => {
    expect(guardsAt(Phase.End, viewerWith(false)).mainActionBlocked).toBe(true);
  });

  it("opens the attack a pending Blitz projects outside Main", () => {
    expect(guardsAt(Phase.End, viewerWith(true)).mainActionBlocked).toBe(false);
  });
});

it("blocks every ordinary game action for an observer on the displayed player's turn", () => {
  const guards = actionGuards({
    spectating: true,
    state: { gameOver: false, turnSeat: 0, phase: Phase.Main } as GameState,
    viewer: viewerWith(true),
    viewerSeat: 0,
    decisionOpen: false,
    presenting: false,
    phasePresentationPending: false,
  });
  expect(guards.isMyTurn).toBe(false);
  expect(guards.mainActionBlocked).toBe(true);
  expect(guards.endPhaseBlocked).toBe(true);
  expect(guards.breedingActionsOpen).toBe(false);
});

it("blocks passing during manual combat without blocking other manual board edits", () => {
  const viewer = viewerWith(false);
  const state = {
    gameOver: false,
    turnSeat: 0,
    phase: Phase.Main,
    gameMode: "manual",
    manual: { combatStage: "counter", undoRequester: -1, resultRequester: -1, restartRequester: -1 },
  } as unknown as GameState;
  const guards = actionGuards({
    state,
    viewer,
    viewerSeat: 0,
    decisionOpen: false,
    presenting: false,
    phasePresentationPending: false,
  });
  expect(guards.endPhaseBlocked).toBe(true);
  expect(guards.turnActionBlocked).toBe(false);
  expect(guards.mainActionBlocked).toBe(false);
});

it("blocks manual board mutations during every pending table agreement", () => {
  for (const key of ["undoRequester", "resultRequester", "restartRequester"]) {
    const state = {
      gameOver: false,
      turnSeat: 0,
      phase: Phase.Main,
      gameMode: "manual",
      manual: { combatStage: "none", undoRequester: -1, resultRequester: -1, restartRequester: -1, [key]: 1 },
    } as unknown as GameState;
    const guards = actionGuards({
      state,
      viewer: viewerWith(false),
      viewerSeat: 0,
      decisionOpen: false,
      presenting: false,
      phasePresentationPending: false,
    });
    expect(guards.turnActionBlocked).toBe(true);
    expect(guards.endPhaseBlocked).toBe(true);
  }
});

it.each([0, 1] as const)("keeps manual breeding choices separate from passing for viewer seat %s", (viewerSeat) => {
  const state = {
    gameOver: false,
    turnSeat: 0,
    phase: Phase.Main,
    gameMode: "manual",
    manual: {
      turnPhase: Phase.Breeding,
      combatStage: "none",
      undoRequester: -1,
      resultRequester: -1,
      restartRequester: -1,
    },
  } as unknown as GameState;
  const guards = actionGuards({
    state,
    viewer: viewerWith(false),
    viewerSeat,
    decisionOpen: false,
    presenting: false,
    phasePresentationPending: false,
  });
  expect(guards.endPhaseBlocked).toBe(viewerSeat !== 0);
  expect(guards.breedingActionsOpen).toBe(viewerSeat === 0);
  expect(guards.turnActionBlocked).toBe(false);
  expect(guards.mainActionBlocked).toBe(false);
  state.manual.turnPhase = Phase.Main;
  expect(
    actionGuards({
      state,
      viewer: viewerWith(false),
      viewerSeat,
      decisionOpen: false,
      presenting: false,
      phasePresentationPending: false,
    }).endPhaseBlocked,
  ).toBe(viewerSeat !== 0);
});
