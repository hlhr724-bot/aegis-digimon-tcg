// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, ServerEvent } from "@aegis/shared";
import { useMatchCues, type MatchCueAnchors } from "./useMatchCues";
import { singleServerBatch, type ServerBatch } from "../net/serverBatches";
import { recordSnapshot, type StateSnapshot } from "../net/presentedState";

vi.mock("../design/sound", () => ({ playSound: vi.fn<(kind: string) => void>() }));

const VIEWER = 0;
const DRAIN_BUDGET_MS = 60_000;
const TICK_MS = 160;
const ATTACKER = { permanentId: "perm-attacker", instanceId: "s0-attacker", cardId: "AD1-002" };
const SECURITY_OPTION = { instanceId: "s1-security-option", cardId: "BT11-105" };
const SECURITY_EFFECT = {
  seat: 1,
  sourceCardId: SECURITY_OPTION.cardId,
  sourceInstanceId: SECURITY_OPTION.instanceId,
  effectKey: "BT11-105/security",
  description: "[Security] You may reveal the top 3 cards of your deck. Play 1 [Vemmon] among them. Trash the rest.",
  timing: "Security",
} as const;

function board(stateVersion: number, turnSeat: 0 | 1, turnCount: number, phase: string): GameState {
  return {
    stateVersion,
    turnSeat,
    turnCount,
    phase,
    memory: 3,
    players: [
      {
        seat: 0,
        battleArea: [
          {
            permanentId: ATTACKER.permanentId,
            topCard: { instanceId: ATTACKER.instanceId, cardId: ATTACKER.cardId },
            stack: [],
            currentDP: 12000,
          },
        ],
        trash: [],
        hand: [],
        security: [],
      },
      { seat: 1, battleArea: [], trash: [], hand: [], security: [] },
    ],
  } as unknown as GameState;
}

const anchors: MatchCueAnchors = {
  board: { current: null },
  permanentCenter: (permanentId) => (permanentId === ATTACKER.permanentId ? { x: 120, y: 80 } : undefined),
  yourDeck: { current: null },
  oppDeck: { current: null },
  yourHandDock: { current: null },
  oppHandStrip: { current: null },
  yourSecurity: { current: null },
  oppSecurity: { current: null },
};

function revealed(cardId: string): ServerEvent {
  return { kind: "cardRevealed", seat: 1, cardId, artId: cardId, sourceCardId: SECURITY_OPTION.cardId } as ServerEvent;
}

const END_OF_TURN_ATTACK: readonly (readonly ServerEvent[])[] = [
  [
    {
      kind: "attackDeclared",
      seat: 0,
      attackerPermanentId: ATTACKER.permanentId,
      attackerCardId: ATTACKER.cardId,
      attackerArtId: ATTACKER.cardId,
      target: { kind: "player" },
    },
  ],
  [
    {
      kind: "securityRevealed",
      seat: 1,
      revealedCardId: SECURITY_OPTION.cardId,
      artId: SECURITY_OPTION.cardId,
      attackerPermanentId: ATTACKER.permanentId,
      attackerArtId: ATTACKER.cardId,
      attackerDP: 12000,
      securityCountBefore: 1,
      hasSecurityEffect: true,
      isDigimon: false,
    },
  ],
  [{ ...SECURITY_EFFECT, kind: "effectTriggered", duringSecurityCheck: true }],
  [revealed("BT18-071"), revealed("BT11-061"), revealed("BT4-109")],
  [
    {
      kind: "cardsMoved",
      instanceIds: ["s1-rest-a", "s1-rest-b"],
      from: "deck",
      fromSeat: 1,
      to: "trash",
      cardIds: ["BT18-071", "BT4-109"],
      artIds: ["BT18-071", "BT4-109"],
      seat: 1,
    },
  ],
  [{ ...SECURITY_EFFECT, kind: "effectResolved" }],
  [
    {
      kind: "securityChecked",
      seat: 1,
      revealedCardId: SECURITY_OPTION.cardId,
      artId: SECURITY_OPTION.cardId,
      attackerArtId: ATTACKER.cardId,
      resolution: "effect",
    },
  ],
  [{ kind: "attackEnded", seat: 0, attackerPermanentId: ATTACKER.permanentId }],
  [{ kind: "turnEnded", endingSeat: 0, nextSeat: 1, turnCount: 3 }],
  [{ kind: "phaseChanged", phase: "Active", turnSeat: 1, turnCount: 3 }],
  [{ kind: "phaseChanged", phase: "Draw", turnSeat: 1, turnCount: 4 }],
  [{ kind: "phaseChanged", phase: "Breeding", turnSeat: 1, turnCount: 4 }],
] as readonly (readonly ServerEvent[])[];

function boardAfter(events: readonly ServerEvent[], stateVersion: number, previous: GameState): GameState {
  const phase = events.filter((event) => event.kind === "phaseChanged").at(-1);
  if (phase?.kind === "phaseChanged") return board(stateVersion, phase.turnSeat, phase.turnCount, phase.phase);
  return board(stateVersion, previous.turnSeat, previous.turnCount, previous.phase);
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

interface CueProps {
  batches: readonly ServerBatch[];
  state: GameState;
  snapshots: readonly StateSnapshot[];
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const OPPONENT_MAIN_EFFECT = {
  seat: 1,
  sourceCardId: "BT11-061",
  sourceInstanceId: "s1-vemmon",
  sourcePermanentId: "perm-vemmon",
  effectKey: "BT11-061/main",
  description: "[Main] By suspending this Digimon, reveal the top 3 cards of your deck.",
  timing: "Main",
} as const;

const OPPONENT_TURN: readonly (readonly ServerEvent[])[] = [
  [{ kind: "phaseChanged", phase: "Main", turnSeat: 1, turnCount: 4 }],
  [{ ...OPPONENT_MAIN_EFFECT, kind: "effectTriggered" }],
  [{ ...OPPONENT_MAIN_EFFECT, kind: "effectResolved" }],
] as readonly (readonly ServerEvent[])[];

async function presentUntilSettled(chain: readonly (readonly ServerEvent[])[]) {
  let version = 0;
  let state = board(1, 0, 3, "Main");
  let snapshots = recordSnapshot([], state);
  let batches: readonly ServerBatch[] = [];
  const view = renderHook(
    ({ batches: fed, state: live, snapshots: taken }: CueProps) =>
      useMatchCues({
        narrationLimit: 3,
        batches: fed,
        state: live,
        snapshots: taken,
        viewerSeat: VIEWER,
        mulliganOpen: false,
        decisionPending: false,
        anchors,
        onActionRejected: vi.fn<(reason: string) => void>(),
      }),
    { initialProps: { batches, state, snapshots } as CueProps },
  );
  await advance(0);
  for (const events of chain) {
    version += 1;
    state = boardAfter(events, version + 1, state);
    snapshots = recordSnapshot(snapshots, state);
    batches = [...batches, singleServerBatch(events, version)];
    view.rerender({ batches, state, snapshots });
    await advance(16);
  }
  for (let elapsed = 0; elapsed < DRAIN_BUDGET_MS; elapsed += TICK_MS) {
    const cues = view.result.current;
    if (!cues.presenting && !cues.phaseTransitionPending && cues.presentedStateVersion === undefined) break;
    await advance(TICK_MS);
  }
  return {
    presenting: view.result.current.presenting,
    phaseTransitionPending: view.result.current.phaseTransitionPending,
    presentedStateVersion: view.result.current.presentedStateVersion,
    displayedTurn: view.result.current.displayedTurn,
  };
}

const CAUGHT_UP = {
  presenting: false,
  phaseTransitionPending: false,
  presentedStateVersion: undefined,
  displayedTurn: { seat: 1, count: 4 },
};

describe("a security effect reveal during an end-of-turn attack", () => {
  it("lets the next turn's ribbons finish instead of freezing the turn change", async () => {
    expect(await presentUntilSettled(END_OF_TURN_ATTACK)).toEqual(CAUGHT_UP);
  });

  it("reaches the next turn when its first effect arrives before the check is read out", async () => {
    expect(await presentUntilSettled([...END_OF_TURN_ATTACK, ...OPPONENT_TURN])).toEqual(CAUGHT_UP);
  });
});
