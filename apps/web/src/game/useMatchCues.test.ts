import { GameState as ManualGameState } from "@aegis/shared/schema/GameState";
import { PlayerState } from "@aegis/shared/schema/PlayerState";
import { GameMode } from "@aegis/shared/manual/GameMode";
// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CardInstance,
  Permanent,
  Phase,
  type GameState,
  type SequencedServerEvent,
  type ServerEvent,
} from "@aegis/shared";
import { useMatchCues, type MatchCueAnchors } from "./useMatchCues";
import { singleServerBatch, type ServerBatch } from "../net/serverBatches";
import {
  CLASH_OUTCOME_AT_MS,
  CLASH_DOCK_AT_MS,
  CLASH_DOCK_LEAVE_MS,
  CLASH_REVEAL_SHOWN_AT_MS,
  CLASH_TOTAL_MS,
  FIELD_CLASH_IMPACT_AT_MS,
  SECURITY_BRANCH_IN_MS,
  SECURITY_BRANCH_TOTAL_MS,
  SECURITY_BREAK_TOTAL_MS,
  SECURITY_DESTROY_OUTCOME_AT_MS,
  SECURITY_DESTROY_TOTAL_MS,
  SECURITY_DOCK_CLOSE_MS,
  PLAY_LEAD_IN_BUDGET_MS,
  SHOWCASE_TOTAL_MS,
  TIMINGS,
  CARD_BURST_PEAK_MS,
  COMBAT_IMPACT_TOTAL_MS,
  FIELD_CLASH_TOTAL_MS,
} from "./timings";
import { NARRATION_TICK_MS } from "./narration";
import { REJECTION_LIFETIME_MS } from "./notices";
import { SIDE_PANEL_LIFETIME_MS } from "./sidePanels";
import { snapshotGameState, type StateSnapshot } from "../net/presentedState";
import { PRESENTED_BOARD_BUDGET_MS } from "./presentationProgress";
import type { AnimationQueue } from "./animationQueue";
import type { PresentationProbe } from "./presentationProbe";
import { securityClauseHoldMs } from "./match/present/securityRevealScene";
import { attackDeclarationKey } from "./trackingArrow";

/**
 * How long a narration item carrying a notice holds its slot, plus the tick the slot
 * takes to clear: advance by this and the queue has moved on to the next moment.
 */
const NOTICE_ITEM_MS = TIMINGS.noticeLifetime + NARRATION_TICK_MS;

/** A consequence never waits on its clause for longer than this, so neither does a test. */
const CONSEQUENCE_WAIT_LIMIT_MS = 5000;

/**
 * When a check that resolves an effect is finally allowed to speak: the shield break, the
 * reveal/light, and the transfer that parks the revealed card at the side it reads
 * out from. Its notice and the decisions it asks for both land here.
 */
const EFFECT_CHECK_NOTICE_AT_MS = SECURITY_BREAK_TOTAL_MS + CLASH_DOCK_LEAVE_MS;
const EFFECT_CHECK_PRESENTED_AT_MS = EFFECT_CHECK_NOTICE_AT_MS + TIMINGS.securityClauseRead;

/** When a reveal the server has not closed yet has finished putting its card on screen. */
const REVEAL_SHOWN_AT_MS = SECURITY_BREAK_TOTAL_MS + CLASH_OUTCOME_AT_MS;

/**
 * When that card has played out and left the centre of the screen. A check the server is
 * still resolving hands the board over here: its effects read out on a clear board.
 */
const REVEAL_EXIT_AT_MS = SECURITY_BREAK_TOTAL_MS + CLASH_OUTCOME_AT_MS + TIMINGS.securityCardExit;

/** When a card the server says has a [Security] effect leaves the centre for its dock. */
const DOCK_AT_MS = SECURITY_BREAK_TOTAL_MS + CLASH_DOCK_AT_MS;

/** When it has arrived there, which is when what it did may be read out beside it. */
const DOCKED_AT_MS = SECURITY_BREAK_TOTAL_MS + CLASH_DOCK_LEAVE_MS;

/**
 * How long the docked card keeps the centre while its one [Security] clause is read, before
 * the check's prompt opens or the next centre-stage beat (a played card arriving) runs.
 */
const CLAUSE_HOLD_MS = securityClauseHoldMs(1);

const playSound = vi.hoisted(() => vi.fn<(kind: string) => void>());
vi.mock("../design/sound", () => ({ playSound }));

const VIEWER = 0;
const ATTACK: ServerEvent = {
  kind: "attackDeclared",
  seat: 1,
  attackerPermanentId: "perm-1",
  attackerCardId: "BT1-010",
  target: { kind: "player" },
};
const REVEAL: ServerEvent = {
  kind: "securityRevealed",
  seat: 0,
  revealedCardId: "BT1-010",
  attackerPermanentId: "perm-1",
};
const CHECK: ServerEvent = {
  kind: "securityChecked",
  seat: 0,
  revealedCardId: "BT1-010",
  resolution: "battle",
};
const SECOND_CHECK: ServerEvent = { ...CHECK, revealedCardId: "BT1-011" };
const SECOND_REVEAL: ServerEvent = { ...REVEAL, revealedCardId: "BT1-011" };
const EFFECT_CHECK: ServerEvent = { ...CHECK, resolution: "effect" };
/** A reveal whose card the server says carries a [Security] effect it is about to resolve. */
const EFFECT_REVEAL: ServerEvent = { ...REVEAL, hasSecurityEffect: true };
const EFFECT_NOTICE: ServerEvent = {
  kind: "effectTriggered",
  seat: 0,
  sourceCardId: "BT1-010",
  effectKey: "security",
  description: "Draw 1.",
  timing: "Security",
};
const TURN_END: ServerEvent = {
  kind: "turnEnded",
  endingSeat: 1,
  nextSeat: 0,
  turnCount: 4,
};
const COMBAT: ServerEvent = {
  kind: "combatResolved",
  seat: 1,
  attackerPermanentId: "perm-1",
  deletedPermanentIds: ["perm-dead"],
};
const UNSUSPEND_PHASE: ServerEvent = {
  kind: "phaseChanged",
  phase: "Active",
  turnSeat: 0,
  turnCount: 5,
};
const OPP_PLAY: ServerEvent = {
  kind: "cardPlayed",
  seat: 1,
  cardId: "BT1-010",
  permanentId: "perm-9",
};
const SHUFFLE: ServerEvent = { kind: "deckShuffled", seat: 1, deck: "eggDeck" };
const RETURN_TO_DECK: ServerEvent = {
  kind: "cardsMoved",
  instanceIds: ["i-1"],
  from: "hand",
  to: "deckBottom",
};
const YOUR_PLAY: ServerEvent = {
  kind: "cardPlayed",
  seat: 0,
  cardId: "BT1-011",
  permanentId: "perm-8",
};
const OPTION_USE: ServerEvent = {
  kind: "cardPlayed",
  seat: 0,
  cardId: "BT1-090",
};
const OPTION_ROUTED: ServerEvent = {
  kind: "cardsMoved",
  instanceIds: ["option-1"],
  from: "hand",
  to: "trash",
  optionUsed: true,
};

/* BT10-087 Taiki Kudo on the opponent's security stack: its [Security] clause plays it for
   free, and the [On Play] that follows reveals the top four cards of their deck. */
const OPP_EFFECT_REVEAL: ServerEvent = {
  kind: "securityRevealed",
  seat: 1,
  revealedCardId: "BT10-087",
  attackerPermanentId: "perm-1",
  hasSecurityEffect: true,
};
const OPP_SECURITY_NOTICE: ServerEvent = {
  kind: "effectTriggered",
  seat: 1,
  sourceCardId: "BT10-087",
  effectKey: "security",
  description: "Play this card without paying its cost.",
  timing: "Security",
};
const OPP_TAIKI_PLAY: ServerEvent = {
  kind: "cardPlayed",
  seat: 1,
  cardId: "BT10-087",
  permanentId: "perm-taiki",
};
const YOUR_TAIKI_PLAY: ServerEvent = {
  kind: "cardPlayed",
  seat: 0,
  cardId: "BT10-087",
  permanentId: "perm-your-taiki",
};
const OPP_ON_PLAY: ServerEvent = {
  kind: "effectTriggered",
  seat: 1,
  sourceCardId: "BT10-087",
  effectKey: "onPlay",
  description: "Reveal the top 4 cards of your deck.",
  timing: "On Play",
};
const OPP_TAIKI_CHECK: ServerEvent = {
  kind: "securityChecked",
  seat: 1,
  revealedCardId: "BT10-087",
  resolution: "effect",
};
const OPP_NEXT_REVEAL: ServerEvent = {
  kind: "securityRevealed",
  seat: 1,
  revealedCardId: "BT1-011",
  attackerPermanentId: "perm-1",
  isDigimon: true,
};
const OPP_NEXT_CHECK: ServerEvent = {
  kind: "securityChecked",
  seat: 1,
  revealedCardId: "BT1-011",
  resolution: "battle",
};
const TAIKI_REVEALS: readonly ServerEvent[] = ["BT1-001", "BT1-002", "BT1-003", "BT1-004"].map((cardId) => ({
  kind: "cardRevealed",
  seat: 1,
  cardId,
  sourceCardId: "BT10-087",
}));

/** Nothing is laid out in jsdom, so a draw flight measures zero and never launches. */
const anchors: MatchCueAnchors = {
  board: { current: null },
  permanentCenter: (permanentId) => (permanentId === "perm-dead" ? { x: 120, y: 80 } : undefined),
  yourDeck: { current: null },
  oppDeck: { current: null },
  yourHandDock: { current: null },
  oppHandStrip: { current: null },
  yourSecurity: { current: null },
  oppSecurity: { current: null },
};

it("GitHub #5197: reconnects a spectator over a snapshot with both private hands withheld", () => {
  const state = {
    stateVersion: 42,
    phase: Phase.Breeding,
    turnSeat: 0,
    players: [0, 1].map((seat) => ({
      seat,
      battleArea: [],
      trash: [],
      delayZone: [],
      handCount: 5,
      deckCount: 40,
      securityCount: 5,
    })),
  } as unknown as GameState;
  const { result, rerender } = renderHook(() =>
    useMatchCues({
      batches: [],
      state,
      snapshots: [{ stateVersion: 42, state: snapshotGameState(state) }],
      viewerSeat: 0,
      mulliganOpen: false,
      anchors,
      onActionRejected() {},
    }),
  );
  rerender();
  expect(result.current.heldHandArrivals.size).toBe(0);
  expect(result.current.drawFlights).toHaveLength(0);
});

it("flies a face-down card from the deck to its Tamer and clears it after landing", async () => {
  const board = document.createElement("div");
  const deck = document.createElement("div");
  vi.spyOn(board, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 20, 800, 600));
  vi.spyOn(deck, "getBoundingClientRect").mockReturnValue(new DOMRect(610, 420, 100, 140));
  const feed = batchFeed();
  const { result, rerender } = renderHook(
    ({ events }: { events: readonly ServerEvent[] }) =>
      useMatchCues({
        narrationLimit: 1,
        batches: feed(events),
        state: undefined,
        viewerSeat: VIEWER,
        mulliganOpen: false,
        anchors: {
          ...anchors,
          board: { current: board },
          yourDeck: { current: deck },
          permanentCenter: (id) => (id === "tamer" ? { x: 200, y: 300 } : undefined),
        },
        onActionRejected: vi.fn<(reason: string) => void>(),
      }),
    { initialProps: { events: [] as readonly ServerEvent[] } },
  );
  rerender({
    events: [
      {
        kind: "cardsMoved",
        from: "deck",
        to: "battleArea",
        instanceIds: ["hidden"],
        deckToUnder: { seat: 0, permanentId: "tamer", count: 1 },
      },
    ],
  });
  await advance(0);
  expect(result.current.drawFlights).toHaveLength(1);
  expect(result.current.drawFlights[0]).toMatchObject({
    x: 650,
    y: 470,
    dx: -450,
    dy: -170,
  });
  await advance(result.current.drawFlights[0]!.duration);
  expect(result.current.drawFlights).toHaveLength(0);
});
it.each([0, 1] as const)(
  "presents seat %s's Option draw before the next turn ribbons when patches coalesce",
  async (seat) => {
    const board = document.createElement("div");
    const deck = document.createElement("div");
    const hand = document.createElement("div");
    vi.spyOn(board, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600));
    vi.spyOn(deck, "getBoundingClientRect").mockReturnValue(new DOMRect(600, 400, 80, 100));
    vi.spyOn(hand, "getBoundingClientRect").mockReturnValue(new DOMRect(200, 500, 300, 80));
    const state = {
      players: [0, 1].map(() => ({
        hand: [],
        handCount: 5,
        battleArea: [],
        trash: [],
      })),
    } as unknown as GameState;
    const feed = batchFeed();
    const { result, rerender } = renderHook(
      (events: readonly ServerEvent[]) =>
        useMatchCues({
          batches: feed(events),
          phaseEvents: events,
          state,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors: {
            ...anchors,
            board: { current: board },
            yourDeck: { current: deck },
            yourHandDock: { current: hand },
            oppDeck: { current: deck },
            oppHandStrip: { current: hand },
          },
          onActionRejected: vi.fn<(reason: string) => void>(),
        }),
      { initialProps: [] as readonly ServerEvent[] },
    );
    await advance(0);
    // The opponent's hand is concealed and may return to the same count after using an Option.
    state.players[seat]!.handCount = seat === 0 ? 6 : 5;
    rerender([
      {
        kind: "cardsMoved",
        from: "deck",
        to: "hand",
        instanceIds: ["drawn-a", "drawn-b"],
        seat,
      },
      { kind: "phaseChanged", phase: "End", turnSeat: 0, turnCount: 1 },
      { kind: "turnEnded", endingSeat: 0, nextSeat: 1, turnCount: 1 },
      { kind: "phaseChanged", phase: "Active", turnSeat: 1, turnCount: 2 },
      { kind: "phaseChanged", phase: "Draw", turnSeat: 1, turnCount: 2 },
      { kind: "phaseChanged", phase: "Breeding", turnSeat: 1, turnCount: 2 },
    ]);
    await advance(32);
    expect(result.current.drawFlights).toHaveLength(1);
    expect(result.current.phaseBanner).toBeNull();
    // A Draw 2 presents each physical card in order before handing over the turn.
    const firstKey = result.current.drawFlights[0]!.key;
    const flightMs = result.current.drawFlights[0]!.duration;
    await advance(TIMINGS.drawFlightStagger);
    expect(result.current.drawFlights).toHaveLength(1);
    expect(result.current.drawFlights[0]!.key).toBe(firstKey);
    await advance(flightMs + 32);
    expect(result.current.drawFlights).toHaveLength(1);
    expect(result.current.drawFlights[0]!.key).not.toBe(firstKey);
    expect(result.current.phaseBanner).toBeNull();
    await advance(flightMs + 32);
    expect(result.current.drawFlights).toHaveLength(0);
    expect(result.current.phaseBanner).toBeNull();
    expect(result.current.turnTransition?.endingSeat).toBe(0);
    await advance(TIMINGS.turnBanner + TIMINGS.phaseBannerGap + 32);
    expect(result.current.phaseBanner?.phase).toBe("Active");
    await advance(TIMINGS.phaseBanner + TIMINGS.phaseBannerGap + 32);
    expect(result.current.phaseBanner?.phase).toBe("Draw");
    await advance(TIMINGS.phaseBanner + TIMINGS.phaseBannerGap + 32);
    expect(result.current.phaseBanner?.phase).toBe("Breeding");
  },
);

it.each([false, true])(
  "waits for the actual digivolution arrival before its bonus draw (split batch=%s)",
  async (splitBatch) => {
    const board = document.createElement("div");
    const deck = document.createElement("div");
    const hand = document.createElement("div");
    vi.spyOn(board, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600));
    vi.spyOn(deck, "getBoundingClientRect").mockReturnValue(new DOMRect(600, 400, 80, 100));
    vi.spyOn(hand, "getBoundingClientRect").mockReturnValue(new DOMRect(200, 500, 300, 80));
    const feed = batchFeed();
    const { result, rerender } = renderHook(
      (events: readonly ServerEvent[]) =>
        useMatchCues({
          batches: feed(events),
          state: undefined,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors: {
            ...anchors,
            board: { current: board },
            yourDeck: { current: deck },
            yourHandDock: { current: hand },
          },
          onActionRejected: vi.fn<(reason: string) => void>(),
        }),
      { initialProps: [] as readonly ServerEvent[] },
    );
    const events: ServerEvent[] = [
      {
        kind: "digivolved",
        seat: 0,
        permanentId: "effect-evo",
        cardId: "EX12-036",
        mechanic: "normal",
      },
      {
        kind: "cardsMoved",
        from: "deck",
        to: "hand",
        instanceIds: ["bonus"],
        seat: 0,
        drawReason: "digivolution",
      },
    ];
    rerender(splitBatch ? events.slice(0, 1) : events);
    await advance(0);
    expect(result.current.zoneShowcase).toMatchObject({ kind: "digivolve", mine: true });
    expect(result.current.drawFlights).toHaveLength(0);
    if (splitBatch) {
      await advance(100);
      rerender(events);
    }
    await advance(SHOWCASE_TOTAL_MS - (splitBatch ? 100 : 0));
    expect(result.current.permanentBursts.get("effect-evo")?.variant).toBe("evolve");
    expect(result.current.drawFlights).toHaveLength(0);
    await advance(CARD_BURST_PEAK_MS - 1);
    expect(result.current.drawFlights).toHaveLength(0);
    await advance(17);
    expect(result.current.drawFlights).toHaveLength(1);
  },
);

/**
 * Turns the cumulative event log a test writes into the server batches the hook consumes:
 * whatever is new since the previous render is one batch, which is the boundary the server
 * draws around one entry into the engine. A shorter log than before is a replaced log (a
 * new scenario), so the feed starts over.
 */
function batchFeed(): (cumulative: readonly ServerEvent[]) => readonly ServerBatch[] {
  let consumed = 0;
  let version = 0;
  let batches: readonly ServerBatch[] = [];
  return (cumulative: readonly ServerEvent[]) => {
    if (cumulative.length < consumed) {
      consumed = 0;
      version = 0;
      batches = [];
    }
    const fresh = cumulative.slice(consumed);
    consumed = cumulative.length;
    // Each batch closes at its own revision, exactly as the server bumps `stateVersion`
    // once per closed batch — the presentation reports which one it is reading out.
    if (fresh.length > 0) batches = [...batches, singleServerBatch(fresh, (version += 1))];
    return batches;
  };
}

function renderCues(
  initialEvents: readonly ServerEvent[] = [],
  onActionRejected = vi.fn<(reason: string) => void>(),
  rawPhases = false,
  devProbe?: PresentationProbe,
  cueAnchors: MatchCueAnchors = anchors,
) {
  const feed = batchFeed();
  let latestEvents = initialEvents;
  const view = renderHook(
    (batches: readonly ServerBatch[]) =>
      useMatchCues({
        narrationLimit: 3,
        batches,
        phaseEvents: rawPhases ? latestEvents : undefined,
        devProbe,
        state: undefined,
        viewerSeat: VIEWER,
        mulliganOpen: false,
        anchors: cueAnchors,
        onActionRejected,
      }),
    { initialProps: feed(initialEvents) },
  );
  return {
    ...view,
    rerender: (events: readonly ServerEvent[]) => {
      latestEvents = events;
      view.rerender(feed(events));
    },
    onActionRejected,
  };
}

/**
 * A board with two cards already in the opponent's trash, which is what lets the hook
 * name the cards a `cardsMoved` out of security refers to — the event carries instance
 * ids and no seat, and trash is public.
 */
const TRASHED_SECURITY_BOARD = {
  players: [
    { battleArea: [], trash: [], hand: [] },
    {
      battleArea: [],
      trash: [
        { instanceId: "sec-1", cardId: "BT1-010" },
        { instanceId: "sec-2", cardId: "BT1-011" },
      ],
      hand: [],
    },
  ],
} as unknown as GameState;

/** The same board, with a stack still showing the cards the events are about to spend. */
const STACKED_SECURITY_BOARD = {
  players: [
    { battleArea: [], trash: [], hand: [], securityCount: 5 },
    {
      battleArea: [],
      trash: [
        { instanceId: "sec-1", cardId: "BT1-010" },
        { instanceId: "sec-2", cardId: "BT1-011" },
      ],
      hand: [],
      securityCount: 5,
    },
  ],
} as unknown as GameState;

const SECURITY_TRASHED: ServerEvent = {
  kind: "cardsMoved",
  instanceIds: ["sec-1", "sec-2"],
  from: "security",
  to: "trash",
};

/** The same hook over a board, so movements the events name resolve to real cards. */
function renderCuesOverBoard(
  state: GameState,
  snapshots?: readonly StateSnapshot[],
  onPresentationReport?: (report: import("@aegis/shared").PresentationReport) => void,
) {
  const feed = batchFeed();
  const view = renderHook(
    (batches: readonly ServerBatch[]) =>
      useMatchCues({
        narrationLimit: 3,
        batches,
        state,
        snapshots,
        onPresentationReport,
        viewerSeat: VIEWER,
        mulliganOpen: false,
        anchors,
        onActionRejected: vi.fn<(reason: string) => void>(),
      }),
    { initialProps: [] as readonly ServerBatch[] },
  );
  return {
    ...view,
    rerender: (events: readonly ServerEvent[]) => view.rerender(feed(events)),
  };
}

/** The same hook, with the question the server is waiting on as a second input. */
function renderCuesAwaitingAnswer() {
  const feed = batchFeed();
  const view = renderHook(
    ({
      batches,
      decisionPending,
      decisionStateVersion,
      decisionSourceCardId,
    }: {
      batches: readonly ServerBatch[];
      decisionPending: boolean;
      decisionStateVersion?: number;
      decisionSourceCardId?: string;
    }) =>
      useMatchCues({
        narrationLimit: 3,
        batches,
        state: undefined,
        viewerSeat: VIEWER,
        mulliganOpen: false,
        decisionPending,
        decisionStateVersion,
        decisionSourceCardId,
        anchors,
        onActionRejected: vi.fn<(reason: string) => void>(),
      }),
    {
      initialProps: {
        batches: [] as readonly ServerBatch[],
        decisionPending: false,
        decisionStateVersion: undefined as number | undefined,
        decisionSourceCardId: undefined as string | undefined,
      },
    },
  );
  return {
    ...view,
    rerender: ({
      events,
      decisionPending,
      decisionStateVersion,
      decisionSourceCardId,
    }: {
      events: readonly ServerEvent[];
      decisionPending: boolean;
      decisionStateVersion?: number;
      decisionSourceCardId?: string;
    }) =>
      view.rerender({
        batches: feed(events),
        decisionPending,
        decisionStateVersion,
        decisionSourceCardId,
      }),
  };
}

/** How often the hook's prerequisite waits re-check, so a cue can open a poll late. */
const POLL_MS = 16;

/** Lets the queue's promise chain run out under fake timers. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  playSound.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * What the server batch replaced: the boundary used to be "the events that arrived since the
 * last render", so two moments delivered together read as one, and one moment delivered in
 * two renders read as two. Both are now decided by the batch alone.
 */
describe("checked security card disposal", () => {
  it.each([
    [0, "same batch"],
    [1, "same batch"],
    [0, "pending"],
    [1, "pending"],
    [0, "close only"],
    [1, "close only"],
  ] as const)("finishes the readable card before its thin exit, seat %s / %s", async (seat, delivery) => {
    const { result, rerender } = renderCues();
    await advance(0);
    const reveal: ServerEvent = {
      ...REVEAL,
      seat,
      revealedCardId: "BT1-085",
      isDigimon: false,
      hasSecurityEffect: false,
    };
    const check: ServerEvent = { ...CHECK, seat, revealedCardId: "BT1-085", resolution: "trashed" };
    const events = delivery === "same batch" ? [reveal, check] : delivery === "pending" ? [reveal] : [check];
    rerender(events);
    await advance(SECURITY_BREAK_TOTAL_MS + CLASH_OUTCOME_AT_MS - 1);
    expect(result.current.securityClash?.revealed.cardId).toBe("BT1-085");
    expect(result.current.securityClash?.exiting).not.toBe(true);
    await advance(1);
    expect(result.current.securityClash?.exiting).toBe(true);
    await advance(TIMINGS.securityCardExit - 1);
    expect(result.current.securityClash?.exiting).toBe(true);
    await advance(1);
    expect(result.current.securityClash).toBeNull();
    if (delivery === "pending") {
      rerender([...events, check]);
      await advance(0);
      expect(result.current.securityClash).toBeNull();
    }
    expect(result.current.securityRevealPending).toBe(false);
  });

  it("finishes the security battle and its settle before disposal", async () => {
    const { result, rerender } = renderCues();
    await advance(0);
    rerender([ATTACK, { ...REVEAL, isDigimon: true }, CHECK]);
    await advance(SECURITY_BREAK_TOTAL_MS + CLASH_OUTCOME_AT_MS + TIMINGS.clashOutcome - 1);
    expect(result.current.securityClash?.resolution).toBe("battle");
    expect(result.current.securityClash?.exiting).not.toBe(true);
    await advance(1);
    expect(result.current.securityClash?.exiting).toBe(true);
    await advance(TIMINGS.securityCardExit - 1);
    expect(result.current.securityClash).not.toBeNull();
    await advance(1);
    expect(result.current.securityClash).toBeNull();
    expect(result.current.securityRevealPending).toBe(false);
  });

  it("clears a cancelled thin exit and lets the next check start", async () => {
    let queue: AnimationQueue | undefined;
    const { result, rerender } = renderCues([], vi.fn(), false, {
      onQueue: (controls) => {
        queue = controls.queue as AnimationQueue;
      },
    });
    await advance(0);
    const reveal: ServerEvent = { ...REVEAL, isDigimon: false, hasSecurityEffect: false };
    rerender([reveal]);
    await advance(SECURITY_BREAK_TOTAL_MS + CLASH_OUTCOME_AT_MS + 40);
    expect(result.current.securityClash?.exiting).toBe(true);
    act(() => queue!.clear());
    await advance(0);
    expect(result.current.securityClash).toBeNull();
    expect(result.current.securityRevealPending).toBe(false);
    rerender([reveal, SECOND_REVEAL, SECOND_CHECK]);
    await advance(SECURITY_BREAK_TOTAL_MS);
    expect(result.current.securityClash?.revealed.cardId).toBe("BT1-011");
  });
});

describe("match cues grouped by server batch", () => {
  /** The hook fed batches directly, which is what a test about batch boundaries needs. */
  function renderCuesOnBatches() {
    return renderHook(
      (batches: readonly ServerBatch[]) =>
        useMatchCues({
          narrationLimit: 3,
          batches,
          state: undefined,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors,
          onActionRejected: vi.fn<(reason: string) => void>(),
        }),
      { initialProps: [] as readonly ServerBatch[] },
    );
  }

  it("presents two batches delivered in one render as two moments", async () => {
    const { result, rerender } = renderCuesOnBatches();
    await advance(0);

    rerender([singleServerBatch([REVEAL]), singleServerBatch([CHECK])]);
    await advance(0);

    // The reveal's own batch carried no close, so its scene plays with the outcome still
    // unknown — exactly as it does when the two batches arrive in two renders.
    await advance(SECURITY_BREAK_TOTAL_MS);
    expect(result.current.securityClash?.resolution).toBe("pending");
    expect(result.current.securityRevealPending).toBe(true);

    await advance(REVEAL_EXIT_AT_MS + CLASH_TOTAL_MS + SECURITY_BRANCH_TOTAL_MS);
    // The second batch's close is what hands the board back.
    expect(result.current.securityRevealPending).toBe(false);
  });

  it("presents one batch split across two renders once, as one moment", async () => {
    const { result, rerender } = renderCuesOnBatches();
    await advance(0);

    const batch = singleServerBatch([REVEAL, CHECK]);
    rerender([batch]);
    // The same batch again, in a fresh array: already presented, so nothing replays.
    rerender([batch]);

    // One batch carrying the whole check plays ONE scene, and it knows its outcome.
    await advance(SECURITY_BREAK_TOTAL_MS);
    expect(result.current.securityClash?.revealed.cardId).toBe("BT1-010");
    expect(result.current.securityClash?.resolution).toBe("battle");

    await advance(CLASH_TOTAL_MS);
    expect(result.current.securityClash).toBeNull();
    // A second presentation of the same batch would have queued a second scene.
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("match cues", () => {
  it("plays nothing for the history a reconnect replays and settles on the final state", async () => {
    // A reconnect delivers the whole match at once, as the first batch observed.
    const { result } = renderCues([ATTACK, CHECK, TURN_END]);
    await advance(0);

    expect(playSound).not.toHaveBeenCalled();
    expect(result.current.securityClash).toBeNull();
    expect(result.current.turnTransition).toBeNull();
    expect(result.current.attackAnnouncement).toBeNull();
    expect(result.current.sidePanels).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("finishes a visible phase ribbon before presenting a fast bot's next play", async () => {
    const { result, rerender } = renderCues();
    const main: ServerEvent = {
      kind: "phaseChanged",
      phase: "Main",
      turnSeat: 1,
      turnCount: 4,
    };
    rerender([main]);
    await advance(0);
    expect(result.current.phaseBanner?.phase).toBe("Main");
    await advance(100);
    rerender([main, OPP_PLAY]);
    await advance(0);
    expect(result.current.zoneShowcase).toBeNull();
    expect(result.current.phaseBanner?.phase).toBe("Main");
    await advance(TIMINGS.phaseBanner - 100 + TIMINGS.phaseBannerGap + 16);
    expect(result.current.phaseBanner).toBeNull();
    expect(result.current.zoneShowcase).not.toBeNull();
  });

  it.each(["separate", "combined", "raw"])(
    "plays every queued turn ribbon a bot raised before presenting its attack (%s batch)",
    async (delivery) => {
      const { result, rerender } = renderCues([], undefined, delivery === "raw");
      const turnEnd: ServerEvent = {
        kind: "turnEnded",
        endingSeat: 0,
        nextSeat: 1,
        turnCount: 3,
      };
      const phases: ServerEvent[] = [
        turnEnd,
        ...["Active", "Draw", "Breeding", "Main"].map((phase) => ({
          kind: "phaseChanged" as const,
          phase,
          turnSeat: 1 as const,
          turnCount: 4,
        })),
      ];
      rerender(delivery !== "separate" ? [...phases, ATTACK, REVEAL, CHECK] : phases);
      await advance(100);
      if (delivery === "separate") rerender([...phases, ATTACK, REVEAL, CHECK]);
      // The seat change opens, then every phase the burst carried, in order.
      expect(result.current.turnTransition).not.toBeNull();
      expect(result.current.phaseBanner).toBeNull();
      expect(result.current.attackAnnouncement).toBeNull();
      expect(result.current.securityClash).toBeNull();
      await advance(TIMINGS.turnBanner - 100 + TIMINGS.phaseBannerGap + 16);
      for (const phase of ["Active", "Draw", "Breeding", "Main"]) {
        expect(result.current.phaseBanner?.phase).toBe(phase);
        expect(result.current.attackAnnouncement).toBeNull();
        await advance(TIMINGS.phaseBanner + TIMINGS.phaseBannerGap + 16);
      }
      expect(result.current.attackAnnouncement).not.toBeNull();
    },
  );

  it("finishes the turn ribbon before presenting a security check arriving from the bot", async () => {
    const { result, rerender } = renderCues();
    rerender([TURN_END]);
    await advance(100);
    expect(result.current.turnTransition).not.toBeNull();
    rerender([TURN_END, ATTACK, REVEAL, CHECK]);
    await advance(0);
    expect(result.current.securityBreak).toBeNull();
    expect(result.current.securityClash).toBeNull();
    expect(result.current.turnTransition).not.toBeNull();
    await advance(TIMINGS.turnBanner - 100 + TIMINGS.phaseBannerGap + 16);
    expect(result.current.turnTransition).toBeNull();
    expect(result.current.securityBreak).not.toBeNull();
    await advance(SECURITY_BREAK_TOTAL_MS);
    expect(result.current.securityClash).not.toBeNull();
  });

  it("waits for the opponent's card arrival and field burst before ending the turn", async () => {
    const { result, rerender } = renderCues();
    await advance(0);
    rerender([OPP_PLAY, { ...UNSUSPEND_PHASE, phase: "End", turnSeat: 1 }, TURN_END]);
    await advance(0);
    expect(result.current.zoneShowcase).not.toBeNull();
    expect(result.current.phaseBanner).toBeNull();
    expect(result.current.turnTransition).toBeNull();
    await advance(SHOWCASE_TOTAL_MS);
    expect(result.current.permanentBursts.size).toBe(1);
    expect(result.current.phaseBanner).toBeNull();
    await advance(TIMINGS.cardBurst + 16);
    expect(result.current.phaseBanner).toBeNull();
    expect(result.current.turnTransition?.endingSeat).toBe(1);
    await advance(TIMINGS.turnBanner + TIMINGS.phaseBannerGap);
    expect(result.current.turnTransition).toBeNull();
  });

  it("waits for a raw play event's batch before showing the end banner", async () => {
    const raw: ServerEvent[] = [OPP_PLAY, TURN_END];
    const { result, rerender } = renderHook(
      ({ phaseEvents, batches }: { phaseEvents: readonly ServerEvent[]; batches: readonly ServerBatch[] }) =>
        useMatchCues({
          narrationLimit: 3,
          phaseEvents,
          batches,
          state: undefined,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors,
          onActionRejected: vi.fn<(reason: string) => void>(),
        }),
      {
        initialProps: {
          phaseEvents: [] as readonly ServerEvent[],
          batches: [] as readonly ServerBatch[],
        },
      },
    );
    rerender({ phaseEvents: raw, batches: [] });
    await advance(100);
    expect(result.current.turnTransition).toBeNull();
    rerender({ phaseEvents: raw, batches: [singleServerBatch(raw)] });
    await advance(0);
    expect(result.current.zoneShowcase).not.toBeNull();
    expect(result.current.turnTransition).toBeNull();
    await advance(SHOWCASE_TOTAL_MS + TIMINGS.cardBurst + 16);
    expect(result.current.turnTransition).not.toBeNull();
  });

  it("can skip an end banner while the play batch is still open", async () => {
    const raw: ServerEvent[] = [OPP_PLAY, TURN_END];
    const { result, rerender } = renderHook(
      ({ phaseEvents, batches }: { phaseEvents: readonly ServerEvent[]; batches: readonly ServerBatch[] }) =>
        useMatchCues({
          narrationLimit: 3,
          phaseEvents,
          batches,
          state: undefined,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors,
          onActionRejected: vi.fn<(reason: string) => void>(),
        }),
      {
        initialProps: {
          phaseEvents: [] as readonly ServerEvent[],
          batches: [] as readonly ServerBatch[],
        },
      },
    );
    rerender({ phaseEvents: raw, batches: [] });
    await advance(100);
    expect(result.current.turnTransition).toBeNull();
    act(() => result.current.skipAnimations());
    await advance(0);
    expect(result.current.phaseTransitionPending).toBe(false);
    expect(result.current.turnTransition).toBeNull();
  });

  it("releases the end banner when a play batch close is lost", async () => {
    const raw: ServerEvent[] = [OPP_PLAY, TURN_END];
    const { result, rerender } = renderHook(
      ({ phaseEvents, batches }: { phaseEvents: readonly ServerEvent[]; batches: readonly ServerBatch[] }) =>
        useMatchCues({
          narrationLimit: 3,
          phaseEvents,
          batches,
          state: undefined,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors,
          onActionRejected: vi.fn<(reason: string) => void>(),
        }),
      {
        initialProps: {
          phaseEvents: [] as readonly ServerEvent[],
          batches: [] as readonly ServerBatch[],
        },
      },
    );
    rerender({ phaseEvents: raw, batches: [] });
    await advance(100);
    expect(result.current.turnTransition).toBeNull();
    await advance(PRESENTED_BOARD_BUDGET_MS + 16);
    expect(result.current.turnTransition).not.toBeNull();
  });

  it("does not wait for an arrival whose batch already left the tracked window", async () => {
    const evictedPlay: SequencedServerEvent = {
      ...OPP_PLAY,
      seq: 1,
      batch: "batch-old",
      stateVersion: 1,
    };
    const turnEnd: SequencedServerEvent = {
      ...TURN_END,
      seq: 60,
      batch: "batch-new",
      stateVersion: 2,
    };
    const raw: ServerEvent[] = [evictedPlay, turnEnd];
    const { result, rerender } = renderHook(
      ({ phaseEvents, batches }: { phaseEvents: readonly ServerEvent[]; batches: readonly ServerBatch[] }) =>
        useMatchCues({
          narrationLimit: 3,
          phaseEvents,
          batches,
          state: undefined,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors,
          onActionRejected: vi.fn<(reason: string) => void>(),
        }),
      {
        initialProps: {
          phaseEvents: [] as readonly ServerEvent[],
          batches: [] as readonly ServerBatch[],
        },
      },
    );
    rerender({
      phaseEvents: raw,
      batches: [{ id: "batch-new", stateVersion: 2, events: [turnEnd] }],
    });
    await advance(100);
    expect(result.current.turnTransition).not.toBeNull();
  });

  it("announces unrelated phases in order when they arrive in one batch", async () => {
    const { result, rerender } = renderCues();
    await advance(0);
    const phases = ["Active", "Draw", "Breeding", "Main"];
    rerender(
      phases.map((phase) => ({
        kind: "phaseChanged",
        phase,
        turnSeat: 0,
        turnCount: 5,
      })) as ServerEvent[],
    );
    await advance(0);
    for (const phase of phases) {
      expect(result.current.phaseBanner?.phase).toBe(phase);
      await advance(TIMINGS.phaseBanner + TIMINGS.phaseBannerGap);
    }
    expect(result.current.phaseBanner).toBeNull();
  });

  // ST21-01 [On Deletion] returned a card on the opponent's last attack, and the same patch
  // flipped the turn: the card waited behind the whole turn change for the Draw banner.
  it.each(["various", "trash"])(
    "shows a card returned from %s before the turn began through the pre-draw hold",
    async (from) => {
      const returned = { instanceId: "s0-39", cardId: "EX13-077" };
      const before = {
        players: [0, 1].map((seat) => ({
          hand: [],
          handCount: 0,
          deckCount: 40,
          battleArea: [],
          trash: seat === 0 ? [returned] : [],
        })),
      } as unknown as GameState;
      const after = {
        ...before,
        players: before.players.map((player, seat) =>
          seat === 0 ? { ...player, hand: [returned], handCount: 2, deckCount: 39, trash: [] } : player,
        ),
      } as unknown as GameState;
      const feed = batchFeed();
      const { result, rerender } = renderHook(
        ({ state, events }: { state: GameState; events: readonly ServerEvent[] }) =>
          useMatchCues({
            narrationLimit: 3,
            batches: feed(events),
            state,
            viewerSeat: VIEWER,
            mulliganOpen: false,
            anchors,
            onActionRejected: vi.fn<(reason: string) => void>(),
          }),
        { initialProps: { state: before, events: [] as readonly ServerEvent[] } },
      );
      await advance(0);
      rerender({
        state: after,
        events: [
          { kind: "cardsMoved", instanceIds: [returned.instanceId], from, fromSeat: 0, seat: 0, to: "hand" },
          UNSUSPEND_PHASE,
          { ...UNSUSPEND_PHASE, phase: "Draw" },
        ],
      });
      await advance(0);
      const held = result.current.heldDrawState?.state.players[0];
      expect(held?.hand.map((card) => card.instanceId)).toEqual([returned.instanceId]);
      // The turn's own draw is still hidden until its banner.
      expect(held?.handCount).toBe(1);
      expect(held?.deckCount).toBe(40);
    },
  );

  it("holds the pre-draw hand through unsuspend and locks actions through breeding's announcement", async () => {
    const anchor = document.createElement("div");
    vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 100));
    const drawAnchors = {
      ...anchors,
      board: { current: anchor },
      yourDeck: { current: anchor },
      yourHandDock: { current: anchor },
    };
    const before = {
      players: [0, 1].map(() => ({
        hand: [],
        handCount: 5,
        deckCount: 40,
        battleArea: [],
        trash: [],
      })),
    } as unknown as GameState;
    const after = {
      ...before,
      players: before.players.map((player, seat) => (seat === 0 ? { ...player, handCount: 6, deckCount: 39 } : player)),
    } as unknown as GameState;
    const feed = batchFeed();
    const { result, rerender } = renderHook(
      ({ state, events }: { state: GameState; events: readonly ServerEvent[] }) =>
        useMatchCues({
          narrationLimit: 3,
          batches: feed(events),
          state,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors: drawAnchors,
          onActionRejected: vi.fn<(reason: string) => void>(),
        }),
      { initialProps: { state: before, events: [] as readonly ServerEvent[] } },
    );
    await advance(0);
    rerender({
      state: after,
      events: [UNSUSPEND_PHASE, { ...UNSUSPEND_PHASE, phase: "Draw" }, { ...UNSUSPEND_PHASE, phase: "Breeding" }],
    });
    await advance(0);
    expect(result.current.phaseBanner?.phase).toBe("Active");
    expect(result.current.phaseTransitionPending).toBe(true);
    expect(result.current.heldDrawState?.state.players[0]?.handCount).toBe(5);
    expect(result.current.drawFlights).toHaveLength(0);
    await advance(TIMINGS.phaseBanner + TIMINGS.phaseBannerGap);
    expect(result.current.phaseBanner?.phase).toBe("Draw");
    expect(result.current.heldDrawState).toBeUndefined();
    expect(result.current.drawFlights).toHaveLength(1);
    expect(result.current.phaseTransitionPending).toBe(true);
    await advance(TIMINGS.phaseBanner + TIMINGS.phaseBannerGap);
    expect(result.current.phaseBanner?.phase).toBe("Breeding");
    expect(result.current.phaseTransitionPending).toBe(true);
    await advance(TIMINGS.phaseBanner + TIMINGS.phaseBannerGap);
    expect(result.current.phaseTransitionPending).toBe(false);
  });

  it("keeps the turn readout on the turn whose cues are still playing", async () => {
    // The shape that made a viewer see a card reach their hand on the opponent's turn: the
    // server resolves the handover and the opponent's opening phases into the same patch as
    // the effect draw that preceded them, so the live turn flips while the flight is still up.
    const anchor = document.createElement("div");
    vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 100));
    const drawAnchors = {
      ...anchors,
      board: { current: anchor },
      yourDeck: { current: anchor },
      yourHandDock: { current: anchor },
    };
    const before = {
      turnSeat: 0,
      turnCount: 2,
      players: [0, 1].map(() => ({
        hand: [],
        handCount: 5,
        deckCount: 40,
        battleArea: [],
        trash: [],
      })),
    } as unknown as GameState;
    const drawn = {
      ...before,
      players: before.players.map((player, seat) => (seat === 0 ? { ...player, handCount: 6, deckCount: 39 } : player)),
    } as unknown as GameState;
    const handedOver = {
      ...drawn,
      turnSeat: 1,
      turnCount: 3,
    } as unknown as GameState;
    const feed = batchFeed();
    const { result, rerender } = renderHook(
      ({ state, events }: { state: GameState; events: readonly ServerEvent[] }) =>
        useMatchCues({
          narrationLimit: 3,
          batches: feed(events),
          state,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors: drawAnchors,
          onActionRejected: vi.fn<(reason: string) => void>(),
        }),
      { initialProps: { state: before, events: [] as readonly ServerEvent[] } },
    );
    await advance(0);
    expect(result.current.displayedTurn).toEqual({ seat: 0, count: 2 });
    rerender({ state: drawn, events: [] });
    await advance(0);
    expect(result.current.drawFlights).toHaveLength(1);
    rerender({
      state: handedOver,
      events: [
        { kind: "turnEnded", endingSeat: 0, nextSeat: 1, turnCount: 2 },
        { kind: "phaseChanged", phase: "Active", turnSeat: 1, turnCount: 2 },
        { kind: "phaseChanged", phase: "Draw", turnSeat: 1, turnCount: 3 },
      ],
    });
    await advance(0);
    // The live state is already the opponent's turn. The readout is not, because the ribbon
    // that announces it is still waiting for the flight.
    expect(handedOver.turnSeat).toBe(1);
    expect(result.current.drawFlights).toHaveLength(1);
    expect(result.current.displayedTurn).toEqual({ seat: 0, count: 2 });
    await advance(TIMINGS.drawFlight);
    expect(result.current.drawFlights).toHaveLength(0);
    await advance(TIMINGS.turnBanner + TIMINGS.phaseBannerGap);
    expect(result.current.displayedTurn?.seat).toBe(1);
    await advance((TIMINGS.phaseBanner + TIMINGS.phaseBannerGap) * 3);
    expect(result.current.displayedTurn).toEqual({ seat: 1, count: 3 });
    expect(result.current.phaseTransitionPending).toBe(false);
  });

  it("releases the phase lock when the first turn skips drawing", async () => {
    const { result, rerender } = renderCues();
    await advance(0);
    rerender([UNSUSPEND_PHASE, { ...UNSUSPEND_PHASE, phase: "Breeding" }]);
    await advance(0);
    expect(result.current.phaseTransitionPending).toBe(true);
    await advance((TIMINGS.phaseBanner + TIMINGS.phaseBannerGap) * 2);
    expect(result.current.phaseTransitionPending).toBe(false);
    expect(result.current.heldDrawState).toBeUndefined();
    expect(result.current.drawFlights).toHaveLength(0);
  });

  it("holds the opponent's hatch until Breeding finishes and keeps phase text stable between ribbons", async () => {
    const state = {
      phase: Phase.Main,
      players: [0, 1].map(() => ({
        hand: [],
        handCount: 5,
        deckCount: 40,
        eggDeckCount: 4,
        battleArea: [],
        trash: [],
      })),
    } as unknown as GameState;
    const garurumon = new Permanent();
    garurumon.permanentId = "garurumon";
    garurumon.isSuspended = true;
    state.players[1]!.battleArea.push(garurumon);
    const frozen = new Permanent();
    frozen.permanentId = "frozen";
    frozen.isSuspended = true;
    state.players[1]!.battleArea.push(frozen);
    const snapshots: StateSnapshot[] = [];
    const { result, rerender } = renderCuesOverBoard(state, snapshots);
    await advance(0);
    const phases: ServerEvent[] = [
      ...["Active", "Draw", "Breeding", "Main"].map((phase) => ({
        kind: "phaseChanged" as const,
        phase,
        turnSeat: 1 as const,
        turnCount: 2,
      })),
    ];
    const unsuspend: ServerEvent = {
      kind: "cardsMoved",
      instanceIds: ["garurumon"],
      from: "suspended",
      to: "unsuspended",
    };
    const opening = [phases[0]!, unsuspend, ...phases.slice(1, 3)];
    rerender(opening);
    await advance(0);
    // The live schema changes while Unsuspend is still on screen.
    state.players[1]!.eggDeckCount = 3;
    const egg = new Permanent();
    egg.permanentId = "egg";
    egg.topCard = new CardInstance();
    egg.topCard.cardId = "BT24-007";
    state.players[1]!.breeding = egg;
    snapshots.push({ stateVersion: 2, state: snapshotGameState(state) });
    // Main has already evolved that same stack in the live state.
    egg.topCard.cardId = "ST2-03";
    garurumon.isSuspended = true;
    rerender([...opening, { kind: "hatched", seat: 1, cardId: "BT24-007", permanentId: "egg" }, phases[3]!]);
    for (const phase of ["Active", "Draw", "Breeding"]) {
      expect(result.current.phaseBanner?.phase).toBe(phase);
      expect(result.current.heldPhaseState?.players[1]?.battleArea[0]?.isSuspended).toBe(false);
      expect(result.current.heldPhaseState?.players[1]?.battleArea[1]?.isSuspended).toBe(true);
      expect(result.current.heldBreedingState?.seat).toBe(1);
      expect(result.current.heldBreedingState?.player.eggDeckCount).toBe(4);
      await advance(TIMINGS.phaseBanner);
      expect(result.current.phaseBanner).toBeNull();
      expect(result.current.displayedPhase).toBe(phase);
      expect(result.current.heldBreedingState?.player.eggDeckCount).toBe(phase === "Breeding" ? 3 : 4);
      await advance(TIMINGS.phaseBannerGap);
    }
    expect(result.current.heldBreedingState?.player.breeding?.topCard.cardId).toBe("BT24-007");
    await advance(16);
    expect(result.current.permanentBursts.has("egg")).toBe(true);
    await advance(TIMINGS.cardBurst + 32);
    expect(result.current.phaseBanner?.phase).toBe("Main");
    expect(result.current.displayedPhase).toBe("Main");
    expect(result.current.heldPhaseState?.players[1]?.battleArea[0]?.isSuspended).toBe(false);
    await advance(TIMINGS.phaseBanner);
    expect(result.current.heldBreedingState).toBeUndefined();
    expect(result.current.heldPhaseState).toBeUndefined();
  });

  it("never holds the raising area on a revision older than its Breeding phase", async () => {
    const state = {
      phase: Phase.Main,
      players: [0, 1].map(() => ({
        hand: [],
        handCount: 5,
        deckCount: 40,
        eggDeckCount: 4,
        battleArea: [],
        trash: [],
      })),
    } as unknown as GameState;
    const drasil = new Permanent();
    drasil.permanentId = "drasil";
    drasil.topCard = new CardInstance();
    drasil.topCard.cardId = "BT13-007";
    state.players[VIEWER]!.breeding = drasil;
    // The only revision recorded before the turn's batches arrived coalesced: the board as it
    // stood before the match was laid out, with no raising area and an empty egg deck.
    const beforeLayout = {
      players: [0, 1].map(() => ({ hand: [], handCount: 0, deckCount: 0, eggDeckCount: 0, battleArea: [], trash: [] })),
    } as unknown as GameState;
    const snapshots: StateSnapshot[] = [{ stateVersion: 0, state: beforeLayout }];
    const { result, rerender } = renderCuesOverBoard(state, snapshots);
    await advance(0);
    const phases = ["Active", "Draw", "Breeding", "Main"].map(
      (phase, index) =>
        ({ kind: "phaseChanged", phase, turnSeat: VIEWER, turnCount: 1, stateVersion: index }) as ServerEvent,
    );
    for (let index = 1; index <= phases.length; index++) rerender(phases.slice(0, index));
    await advance(0);

    const raisingArea = () => result.current.heldBreedingState?.player ?? state.players[VIEWER]!;
    for (const phase of ["Active", "Draw", "Breeding", "Main"]) {
      await vi.waitFor(() => expect(result.current.phaseBanner?.phase).toBe(phase));
      expect(raisingArea().breeding?.topCard.cardId).toBe("BT13-007");
      expect(raisingArea().eggDeckCount).toBe(4);
      await advance(TIMINGS.phaseBanner);
      expect(raisingArea().breeding?.topCard.cardId).toBe("BT13-007");
      expect(raisingArea().eggDeckCount).toBe(4);
      await advance(TIMINGS.phaseBannerGap);
    }
  });

  it("unsuspends a ＜Reboot＞ holder on the other board during the same unsuspend phase", async () => {
    const state = {
      phase: Phase.Main,
      players: [0, 1].map(() => ({
        hand: [],
        handCount: 5,
        deckCount: 40,
        eggDeckCount: 4,
        battleArea: [],
        trash: [],
      })),
    } as unknown as GameState;
    // Seat 1 takes the turn; seat 0 holds a ＜Reboot＞ Digimon beside a plain suspended one.
    const turnPlayer = new Permanent();
    turnPlayer.permanentId = "turnPlayer";
    turnPlayer.isSuspended = true;
    state.players[1]!.battleArea.push(turnPlayer);
    const reboot = new Permanent();
    reboot.permanentId = "reboot";
    reboot.isSuspended = true;
    state.players[0]!.battleArea.push(reboot);
    const plain = new Permanent();
    plain.permanentId = "plain";
    plain.isSuspended = true;
    state.players[0]!.battleArea.push(plain);
    const { result, rerender } = renderCuesOverBoard(state);
    await advance(0);
    rerender([
      { kind: "phaseChanged", phase: "Active", turnSeat: 1, turnCount: 2 },
      {
        kind: "cardsMoved",
        instanceIds: ["turnPlayer"],
        from: "suspended",
        to: "unsuspended",
      },
      {
        kind: "cardsMoved",
        instanceIds: ["reboot"],
        from: "suspended",
        to: "unsuspended",
      },
      { kind: "phaseChanged", phase: "Draw", turnSeat: 1, turnCount: 2 },
    ]);
    await advance(0);
    expect(result.current.phaseBanner?.phase).toBe("Active");
    expect(result.current.heldPhaseState?.players[1]?.battleArea[0]?.isSuspended).toBe(false);
    expect(result.current.heldPhaseState?.players[0]?.battleArea[0]?.isSuspended).toBe(false);
    expect(result.current.heldPhaseState?.players[0]?.battleArea[1]?.isSuspended).toBe(true);
  });

  it("keeps an end-of-turn unsuspend released when the next Active phase freezes the board", async () => {
    const state = {
      phase: Phase.Main,
      players: [0, 1].map(() => ({
        hand: [],
        handCount: 5,
        deckCount: 40,
        eggDeckCount: 4,
        battleArea: [],
        trash: [],
      })),
    } as unknown as GameState;
    const magnamon = new Permanent();
    magnamon.permanentId = "magnamon";
    magnamon.isSuspended = true;
    state.players[0]!.battleArea.push(magnamon);
    const { result, rerender } = renderCuesOverBoard(state);
    await advance(0);

    rerender([
      {
        kind: "cardsMoved",
        instanceIds: ["magnamon"],
        from: "suspended",
        to: "unsuspended",
      },
      { kind: "turnEnded", endingSeat: 0, nextSeat: 1, turnCount: 1 },
      { kind: "phaseChanged", phase: "Active", turnSeat: 1, turnCount: 1 },
    ]);
    await advance(TIMINGS.turnBanner + TIMINGS.phaseBannerGap);

    expect(result.current.phaseBanner?.phase).toBe("Active");
    expect(result.current.heldPhaseState?.players[0]?.battleArea[0]?.isSuspended).toBe(false);
  });

  it("releases an end-of-turn unsuspend that arrived before turn handoff in an earlier patch", async () => {
    const state = {
      phase: Phase.Main,
      turnSeat: 0,
      turnCount: 9,
      stateVersion: 204,
      players: [0, 1].map(() => ({
        hand: [],
        handCount: 5,
        deckCount: 40,
        eggDeckCount: 4,
        battleArea: [],
        trash: [],
      })),
    } as unknown as GameState;
    // EX13-006 unsuspends its host at the end of the turn. The move and the turn flip reach
    // the client as separate messages, ahead of the state patch that shows the move.
    const alphamon = new Permanent();
    alphamon.permanentId = "alphamon";
    alphamon.isSuspended = true;
    state.players[0]!.battleArea.push(alphamon);
    const snapshots: StateSnapshot[] = [{ stateVersion: 204, state: snapshotGameState(state) }];
    const { result, rerender } = renderHook(
      (batches: readonly ServerBatch[]) =>
        useMatchCues({
          narrationLimit: 3,
          batches,
          state,
          snapshots,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors,
          onActionRejected: vi.fn<(reason: string) => void>(),
        }),
      { initialProps: [] as readonly ServerBatch[] },
    );
    await advance(0);
    const events = [
      { kind: "cardsMoved", instanceIds: ["alphamon"], from: "suspended", to: "unsuspended" },
      { kind: "phaseChanged", phase: "End", turnSeat: 0, turnCount: 9 },
      { kind: "turnEnded", endingSeat: 0, nextSeat: 1, turnCount: 9 },
      { kind: "phaseChanged", phase: "Active", turnSeat: 1, turnCount: 9 },
      { kind: "phaseChanged", phase: "Draw", turnSeat: 1, turnCount: 10 },
    ].map(
      (event, index) =>
        ({ ...event, seq: index + 1, batch: `batch-${index}`, stateVersion: 204 + index }) as SequencedServerEvent,
    );
    const batches = events.map((event, index) => singleServerBatch([event], 205 + index));
    for (let arrived = 1; arrived <= batches.length; arrived += 1) {
      rerender(batches.slice(0, arrived));
      await advance(0);
    }

    expect(result.current.heldPhaseState?.players[0]?.battleArea[0]?.isSuspended).toBe(false);
  });

  it("releases a permanent whose unsuspend move arrives after the ribbon read the timeline", async () => {
    const state = {
      phase: Phase.Main,
      players: [0, 1].map(() => ({
        hand: [],
        handCount: 5,
        deckCount: 40,
        eggDeckCount: 4,
        battleArea: [],
        trash: [],
      })),
    } as unknown as GameState;
    // The engine unsuspends only once the previous turn's pending triggers resolve, so the
    // move can land seconds after the Unsuspend ribbon has already read the timeline.
    const late = new Permanent();
    late.permanentId = "late";
    late.isSuspended = true;
    state.players[1]!.battleArea.push(late);
    const { result, rerender } = renderCuesOverBoard(state);
    await advance(0);
    rerender([{ kind: "phaseChanged", phase: "Active", turnSeat: 1, turnCount: 2 }]);
    await advance(0);
    expect(result.current.phaseBanner?.phase).toBe("Active");
    expect(result.current.heldPhaseState?.players[1]?.battleArea[0]?.isSuspended).toBe(true);

    rerender([
      { kind: "phaseChanged", phase: "Active", turnSeat: 1, turnCount: 2 },
      {
        kind: "cardsMoved",
        instanceIds: ["late"],
        from: "suspended",
        to: "unsuspended",
      },
    ]);
    await advance(0);
    expect(result.current.heldPhaseState?.players[1]?.battleArea[0]?.isSuspended).toBe(false);
    expect(result.current.heldSuspendedIds.has("late")).toBe(false);
  });

  it("releases a suspended breeding permanent along with the battle area", async () => {
    const state = {
      phase: Phase.Main,
      players: [0, 1].map(() => ({
        hand: [],
        handCount: 5,
        deckCount: 40,
        eggDeckCount: 4,
        battleArea: [],
        trash: [],
      })),
    } as unknown as GameState;
    // The server unsuspends the raising area in the same sweep, and reports it as a move
    // like any other; holding only the battle area left the egg rotated a phase longer.
    const egg = new Permanent();
    egg.permanentId = "egg";
    egg.isSuspended = true;
    state.players[1]!.breeding = egg;
    const { result, rerender } = renderCuesOverBoard(state);
    await advance(0);
    rerender([
      { kind: "phaseChanged", phase: "Active", turnSeat: 1, turnCount: 2 },
      {
        kind: "cardsMoved",
        instanceIds: ["egg"],
        from: "suspended",
        to: "unsuspended",
      },
      { kind: "phaseChanged", phase: "Draw", turnSeat: 1, turnCount: 2 },
    ]);
    await advance(0);
    expect(result.current.phaseBanner?.phase).toBe("Active");
    expect(result.current.heldPhaseState?.players[1]?.breeding?.isSuspended).toBe(false);
  });

  it.each(["hatched", "movedFromBreeding"] as const)(
    "waits for separately patched %s before announcing Main",
    async (kind) => {
      const breeding = {
        kind: "phaseChanged",
        phase: "Breeding",
        turnSeat: 1,
        turnCount: 2,
        seq: 1,
        batch: "breeding",
        stateVersion: 0,
      } as ServerEvent;
      const hatch = {
        kind,
        seat: 1,
        cardId: "BT15-006",
        permanentId: "egg",
        seq: 2,
        batch: "hatch",
        stateVersion: 1,
      } as ServerEvent;
      const main = {
        kind: "phaseChanged",
        phase: "Main",
        turnSeat: 1,
        turnCount: 2,
        seq: 3,
        batch: "main",
        stateVersion: 2,
      } as ServerEvent;
      const breedingBatch: ServerBatch = {
        id: "breeding",
        stateVersion: 1,
        events: [breeding as import("@aegis/shared").SequencedServerEvent],
      };
      const hatchBatch: ServerBatch = {
        id: "hatch",
        stateVersion: 2,
        events: [hatch as import("@aegis/shared").SequencedServerEvent],
      };
      const mainBatch: ServerBatch = {
        id: "main",
        stateVersion: 3,
        events: [main as import("@aegis/shared").SequencedServerEvent],
      };
      const { result, rerender } = renderHook(
        ({ batches, events }: { batches: readonly ServerBatch[]; events: readonly ServerEvent[] }) =>
          useMatchCues({
            batches,
            phaseEvents: events,
            viewerSeat: VIEWER,
            state: undefined,
            mulliganOpen: false,
            anchors,
            onActionRejected: vi.fn<(reason: string) => void>(),
          }),
        {
          initialProps: {
            batches: [] as readonly ServerBatch[],
            events: [] as readonly ServerEvent[],
          },
        },
      );
      await advance(0);
      rerender({ batches: [breedingBatch], events: [breeding] });
      await advance(TIMINGS.phaseBanner + TIMINGS.phaseBannerGap);
      // Raw messages arrive before the patch that closes the hatch batch.
      rerender({ batches: [breedingBatch], events: [breeding, hatch, main] });
      await advance(32);
      expect(result.current.phaseBanner).toBeNull();
      rerender({
        batches: [breedingBatch, hatchBatch, mainBatch],
        events: [breeding, hatch, main],
      });
      await advance(32);
      expect(result.current.permanentBursts.has("egg")).toBe(true);
      expect(result.current.phaseBanner).toBeNull();
      await advance(TIMINGS.cardBurst + 32);
      expect(result.current.phaseBanner?.phase).toBe("Main");
    },
  );

  it("holds the incoming seat's turn-start draw when the outgoing seat drew by effect in the same patch", async () => {
    const board = document.createElement("div");
    const deck = document.createElement("div");
    const hand = document.createElement("div");
    vi.spyOn(board, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600));
    vi.spyOn(deck, "getBoundingClientRect").mockReturnValue(new DOMRect(600, 400, 80, 100));
    vi.spyOn(hand, "getBoundingClientRect").mockReturnValue(new DOMRect(200, 500, 300, 80));
    const state = {
      players: [0, 1].map(() => ({
        hand: [],
        handCount: 5,
        deckCount: 40,
        battleArea: [],
        trash: [],
      })),
    } as unknown as GameState;
    const reports: import("@aegis/shared").PresentationReport[] = [];
    const feed = batchFeed();
    const { result, rerender } = renderHook(
      (events: readonly ServerEvent[]) =>
        useMatchCues({
          batches: feed(events),
          phaseEvents: events,
          state,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          onPresentationReport: (report) => reports.push(report),
          anchors: {
            ...anchors,
            board: { current: board },
            yourDeck: { current: deck },
            yourHandDock: { current: hand },
            oppDeck: { current: deck },
            oppHandStrip: { current: hand },
          },
          onActionRejected: vi.fn<(reason: string) => void>(),
        }),
      { initialProps: [] as readonly ServerEvent[] },
    );
    await advance(0);

    // One patch: the viewer's last effect draw, then the whole turn flip to the opponent,
    // whose turn-start draw reaches the client as a hand count and no event at all.
    state.players[VIEWER]!.handCount = 6;
    state.players[1]!.handCount = 6;
    rerender([
      {
        kind: "cardsMoved",
        from: "deck",
        to: "hand",
        instanceIds: ["effect-draw"],
        seat: VIEWER,
      },
      { kind: "phaseChanged", phase: "End", turnSeat: VIEWER, turnCount: 4 },
      { kind: "turnEnded", endingSeat: VIEWER, nextSeat: 1, turnCount: 4 },
      { kind: "phaseChanged", phase: "Active", turnSeat: 1, turnCount: 5 },
      { kind: "phaseChanged", phase: "Draw", turnSeat: 1, turnCount: 5 },
      { kind: "phaseChanged", phase: "Breeding", turnSeat: 1, turnCount: 5 },
    ]);
    await advance(32);

    // The viewer's own draw belongs to the turn that just ran, so it is on screen at once.
    // The opponent is the held seat: its count stays at the figure the turn opened with.
    const turnDrawStarted = () => reports.some((report) => report.track.startsWith("turnDrawFlight-"));
    expect(reports.some((report) => report.track.startsWith("drawFlight-"))).toBe(true);
    expect(result.current.heldDrawState?.seat).toBe(1);
    expect(result.current.heldDrawState?.state.players[1]?.handCount).toBe(5);
    expect(turnDrawStarted()).toBe(false);

    // It stays held through the viewer's own flight and every ribbon that precedes its
    // own: the turn change, then Active.
    const seen: string[] = [];
    while (result.current.phaseBanner?.phase !== "Draw") {
      expect(turnDrawStarted()).toBe(false);
      const shown = result.current.phaseBanner?.phase;
      if (shown && seen.at(-1) !== shown) seen.push(shown);
      await advance(100);
    }
    expect(seen).toEqual(["Active"]);
    expect(result.current.turnTransition).toBeNull();
    expect(result.current.heldDrawState).toBeUndefined();
    expect(turnDrawStarted()).toBe(true);
  });

  it("holds a mutable server hand before its patched batch closes, without replaying phase events", async () => {
    const state = {
      players: [0, 1].map(() => ({
        hand: [],
        handCount: 5,
        deckCount: 40,
        battleArea: [],
        trash: [],
      })),
    } as unknown as GameState;
    const phases: ServerEvent[] = [
      UNSUSPEND_PHASE,
      { ...UNSUSPEND_PHASE, phase: "Draw" },
      { ...UNSUSPEND_PHASE, phase: "Breeding" },
    ];
    const { result, rerender } = renderHook(
      ({ phaseEvents, batches }: { phaseEvents: readonly ServerEvent[]; batches: readonly ServerBatch[] }) =>
        useMatchCues({
          narrationLimit: 3,
          state,
          phaseEvents,
          batches,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors,
          onActionRejected: vi.fn<(reason: string) => void>(),
        }),
      {
        initialProps: {
          phaseEvents: [] as readonly ServerEvent[],
          batches: [] as readonly ServerBatch[],
        },
      },
    );
    await advance(0);
    // Events arrive before Colyseus mutates the existing state object. The close
    // marker is sent after that patch, so these are three independent renders.
    rerender({ phaseEvents: phases, batches: [] });
    state.players[0]!.handCount = 6;
    state.players[0]!.deckCount = 39;
    rerender({ phaseEvents: phases, batches: [] });
    await advance(0);
    expect(result.current.phaseBanner?.phase).toBe("Active");
    expect(result.current.heldDrawState?.state.players[0]?.handCount).toBe(5);
    expect(result.current.heldDrawState?.state.players[0]?.deckCount).toBe(40);
    expect(result.current.phaseTransitionPending).toBe(true);
    rerender({ phaseEvents: phases, batches: [singleServerBatch(phases)] });
    await advance(TIMINGS.phaseBanner + TIMINGS.phaseBannerGap);
    expect(result.current.phaseBanner?.phase).toBe("Draw");
    expect(result.current.heldDrawState).toBeUndefined();
    await advance((TIMINGS.phaseBanner + TIMINGS.phaseBannerGap) * 2);
    expect(result.current.phaseBanner).toBeNull();
    expect(result.current.phaseTransitionPending).toBe(false);
  });

  it("keeps the incoming draw hold while presenting older same-seat effect draws", async () => {
    const state = {
      players: [0, 1].map(() => ({
        hand: [],
        handCount: 5,
        deckCount: 40,
        battleArea: [],
        trash: [],
      })),
    } as unknown as GameState;
    // What an Option that draws sends when the turn ends on its resolution: the draw and
    // the whole next-turn pipeline coalesce into one patch.
    const events: ServerEvent[] = [
      {
        kind: "cardsMoved",
        from: "deck",
        to: "hand",
        instanceIds: ["drawn-a", "drawn-b"],
        seat: 0,
      },
      UNSUSPEND_PHASE,
      { ...UNSUSPEND_PHASE, phase: "Draw" },
    ];
    const { result, rerender } = renderHook(
      ({ phaseEvents, batches }: { phaseEvents: readonly ServerEvent[]; batches: readonly ServerBatch[] }) =>
        useMatchCues({
          narrationLimit: 3,
          state,
          phaseEvents,
          batches,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors,
          onActionRejected: vi.fn<(reason: string) => void>(),
        }),
      {
        initialProps: {
          phaseEvents: [] as readonly ServerEvent[],
          batches: [] as readonly ServerBatch[],
        },
      },
    );
    await advance(0);
    rerender({ phaseEvents: events, batches: [] });
    state.players[0]!.handCount = 7;
    state.players[0]!.deckCount = 38;
    rerender({ phaseEvents: events, batches: [singleServerBatch(events)] });
    await advance(32);
    // Older effect draws join the held hand without releasing the incoming turn's hold.
    expect(result.current.heldDrawState?.seat).toBe(0);
    expect(result.current.heldDrawState?.state.players[0]?.handCount).toBe(7);
    expect(result.current.heldDrawState?.state.players[0]?.deckCount).toBe(38);
  });

  it("does not lock actions or hold a hand when reconnecting to phase history", async () => {
    const { result } = renderCues([
      UNSUSPEND_PHASE,
      { ...UNSUSPEND_PHASE, phase: "Draw" },
      { ...UNSUSPEND_PHASE, phase: "Breeding" },
    ]);
    await advance(0);
    expect(result.current.phaseTransitionPending).toBe(false);
    expect(result.current.heldDrawState).toBeUndefined();
    expect(result.current.phaseBanner).toBeNull();
  });

  /**
   * The whole turn pipeline in one batch — End, turnEnded, Active, Draw, Breeding — which
   * is what the server sends when the seat that just ended had nothing left to resolve.
   * The presentation once collapsed that to the Breeding ribbon alone, so a turn opened on
   * its turn-start draw with nothing saying the seat had changed.
   */
  it("announces the seat change when a whole turn pipeline arrives in one batch", async () => {
    const board = document.createElement("div");
    const deck = document.createElement("div");
    const hand = document.createElement("div");
    vi.spyOn(board, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600));
    vi.spyOn(deck, "getBoundingClientRect").mockReturnValue(new DOMRect(600, 400, 80, 100));
    vi.spyOn(hand, "getBoundingClientRect").mockReturnValue(new DOMRect(200, 500, 300, 80));
    const state = {
      players: [0, 1].map(() => ({
        hand: [],
        handCount: 5,
        battleArea: [],
        trash: [],
      })),
    } as unknown as GameState;
    const reports: import("@aegis/shared").PresentationReport[] = [];
    const feed = batchFeed();
    const { result, rerender } = renderHook(
      (events: readonly ServerEvent[]) =>
        useMatchCues({
          batches: feed(events),
          phaseEvents: events,
          state,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          onPresentationReport: (report) => reports.push(report),
          anchors: {
            ...anchors,
            board: { current: board },
            yourDeck: { current: deck },
            yourHandDock: { current: hand },
            oppDeck: { current: deck },
            oppHandStrip: { current: hand },
          },
          onActionRejected: vi.fn<(reason: string) => void>(),
        }),
      { initialProps: [] as readonly ServerEvent[] },
    );
    await advance(0);

    // The turn-start draw the new seat takes, which is the only other thing on screen.
    state.players[VIEWER]!.handCount = 6;
    rerender([
      { kind: "phaseChanged", phase: "End", turnSeat: 1, turnCount: 4 },
      { kind: "turnEnded", endingSeat: 1, nextSeat: VIEWER, turnCount: 4 },
      { kind: "phaseChanged", phase: "Active", turnSeat: VIEWER, turnCount: 5 },
      { kind: "phaseChanged", phase: "Draw", turnSeat: VIEWER, turnCount: 5 },
      {
        kind: "phaseChanged",
        phase: "Breeding",
        turnSeat: VIEWER,
        turnCount: 5,
      },
    ]);
    await advance(0);

    // Turn handoff is its own ribbon; no fifth phase precedes it.
    expect(result.current.drawFlights).toHaveLength(0);
    expect(result.current.phaseBanner).toBeNull();
    expect(result.current.turnTransition).toEqual({
      endingSeat: 1,
      nextSeat: VIEWER,
      turnCount: 4,
    });
    await advance(TIMINGS.turnBanner - POLL_MS * 4);
    expect(result.current.turnTransition).not.toBeNull();

    // Every phase the burst carried follows it, in order. The turn-start draw is held
    // back until its own Draw ribbon names it.
    await advance(POLL_MS * 4 + TIMINGS.phaseBannerGap + POLL_MS * 2);
    expect(result.current.turnTransition).toBeNull();
    expect(result.current.phaseBanner?.phase).toBe("Active");
    expect(result.current.phaseBanner?.side).toBe("you");
    expect(result.current.drawFlights).toHaveLength(0);
    await advance(TIMINGS.phaseBanner + TIMINGS.phaseBannerGap + POLL_MS * 2);
    expect(result.current.phaseBanner?.phase).toBe("Draw");
    expect(result.current.drawFlights).toHaveLength(1);
    const drawMs = result.current.drawFlights[0]!.duration;
    await advance(drawMs + TIMINGS.drawBurst + POLL_MS);
    expect(result.current.drawFlights).toHaveLength(0);
    await advance(TIMINGS.phaseBanner + TIMINGS.phaseBannerGap + POLL_MS * 2);
    expect(result.current.phaseBanner?.phase).toBe("Breeding");
    expect(result.current.phaseBanner?.side).toBe("you");
    await advance(TIMINGS.phaseBanner + TIMINGS.phaseBannerGap);
    expect(result.current.phaseBanner).toBeNull();
    expect(result.current.presenting).toBe(false);

    const banners = reports.filter((report) => report.track === "phaseBanner" && report.phase === "started");
    expect(banners.map((report) => report.stepId)).toEqual([
      "turn-banner-4",
      "phase-banner-1",
      "phase-banner-2",
      "phase-banner-3",
    ]);
    // The report says which side each once-per-side cue was drawn on, so a log can tell
    // the viewer's turn-start draw from the opponent's.
    expect(banners.map((report) => report.side)).toEqual(["you", "you", "you", "you"]);
    const draws = reports.filter((report) => report.track.startsWith("turnDrawFlight-"));
    expect(draws).not.toHaveLength(0);
    expect(new Set(draws.map((report) => report.side))).toEqual(new Set(["you"]));
  });

  it("serializes real batched turn, unsuspend and draw announcements", async () => {
    const { result, rerender } = renderCues();
    await advance(0);
    rerender([
      TURN_END,
      UNSUSPEND_PHASE,
      { ...UNSUSPEND_PHASE, phase: "Draw" },
      { ...UNSUSPEND_PHASE, phase: "Breeding" },
    ]);
    await advance(0);
    expect(result.current.turnTransition).not.toBeNull();
    expect(result.current.phaseBanner).toBeNull();
    expect(result.current.unsuspendSweep).toBeNull();
    expect(result.current.presenting).toBe(true);
    await advance(TIMINGS.turnBanner + TIMINGS.phaseBannerGap);
    expect(result.current.turnTransition).toBeNull();
    expect(result.current.phaseBanner?.phase).toBe("Active");
    expect(result.current.unsuspendSweep?.seat).toBe(0);
    await advance(TIMINGS.phaseBanner + TIMINGS.phaseBannerGap);
    expect(result.current.phaseBanner?.phase).toBe("Draw");
    expect(result.current.unsuspendSweep).toBeNull();
    await advance(TIMINGS.phaseBanner + TIMINGS.phaseBannerGap);
    expect(result.current.phaseBanner?.phase).toBe("Breeding");
    await advance(TIMINGS.phaseBanner + TIMINGS.phaseBannerGap);
    expect(result.current.phaseBanner).toBeNull();
    expect(result.current.presenting).toBe(false);
  });

  it("drains turn and phase holds when the tab becomes hidden", async () => {
    const { result, rerender } = renderCues();
    await advance(0);
    rerender([
      TURN_END,
      UNSUSPEND_PHASE,
      { ...UNSUSPEND_PHASE, phase: "Draw" },
      { ...UNSUSPEND_PHASE, phase: "Breeding" },
    ]);
    await advance(0);
    expect(result.current.turnTransition).not.toBeNull();
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    try {
      act(() => document.dispatchEvent(new Event("visibilitychange")));
      await advance(0);
      expect(result.current.turnTransition).toBeNull();
      expect(result.current.phaseBanner).toBeNull();
      expect(result.current.phaseTransitionPending).toBe(false);
      expect(result.current.heldDrawState).toBeUndefined();
      expect(result.current.heldSuspendedIds.size).toBe(0);
    } finally {
      hidden.mockRestore();
      act(() => document.dispatchEvent(new Event("visibilitychange")));
    }
    await advance(TIMINGS.phaseBanner * 4);
    expect(result.current.phaseBanner).toBeNull();
    expect(result.current.presenting).toBe(false);
  });

  it("plays a live turn banner for its full time and then clears it", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([TURN_END]);
    await advance(0);
    expect(result.current.turnTransition).toEqual({
      endingSeat: 1,
      nextSeat: 0,
      turnCount: 4,
    });

    await advance(TIMINGS.turnBanner - 1);
    expect(result.current.turnTransition).not.toBeNull();
    await advance(1);
    expect(result.current.turnTransition).toBeNull();
  });

  it("leans the attacker at the shield and holds the clash on its own clock", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([ATTACK, CHECK]);
    await advance(0);
    // The shield arms first, and the reveal waits for its glass to break.
    expect(result.current.securityBreak).toMatchObject({
      seat: 0,
      side: "you",
      phase: "arm",
    });
    expect(result.current.securityClash).toBeNull();

    await advance(TIMINGS.securityArm);
    expect(result.current.securityBreak?.phase).toBe("break");
    expect(result.current.securityHitSeat).toBe(0);

    await advance(SECURITY_BREAK_TOTAL_MS - TIMINGS.securityArm);
    expect(result.current.securityBreak).toBeNull();
    expect(result.current.securityHitSeat).toBeNull();
    expect(result.current.securityClash?.revealed.cardId).toBe("BT1-010");

    await advance(CLASH_TOTAL_MS);
    expect(result.current.securityClash).toBeNull();
  });

  // The point of the split: the card is on screen at the moment of the attack, and
  // everything it causes — its effect, its decisions, its battle — plays after it.
  it("shows the revealed card, then takes it off the screen before the check resolves", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([ATTACK, REVEAL]);
    await advance(SECURITY_BREAK_TOTAL_MS);
    expect(result.current.securityClash?.revealed.cardId).toBe("BT1-010");
    expect(result.current.securityClash?.resolution).toBe("pending");

    // The scene plays to its end and the card leaves on its own, so whatever the check
    // does next — its effects, their prompts — happens on a board it has handed over.
    await advance(CLASH_TOTAL_MS);
    expect(result.current.securityClash).toBeNull();

    // The close no longer brings the card back: the viewer has already watched it resolve.
    rerender([ATTACK, REVEAL, CHECK]);
    await advance(CLASH_TOTAL_MS);
    expect(result.current.securityClash).toBeNull();
  });

  // A reaction the removal arms — "when your opponent's security stack is removed from" —
  // activates between the removal and the battle, so its prompt would otherwise open over a
  // card the check has not finished with. The check keeps the board until it closes.
  it("keeps the board through a check the server has not closed", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([REVEAL]);
    await advance(0);
    expect(result.current.securityRevealPending).toBe(true);

    await advance(REVEAL_EXIT_AT_MS + CLASH_TOTAL_MS + SECURITY_BRANCH_TOTAL_MS);
    expect(result.current.securityRevealPending).toBe(true);
    // The card has left, but the check still owns the board until it closes.
    expect(result.current.securityClash).toBeNull();

    rerender([REVEAL, CHECK]);
    await advance(CLASH_TOTAL_MS + SECURITY_BRANCH_TOTAL_MS);
    expect(result.current.securityRevealPending).toBe(false);
  });

  // The question a check stops to ask cannot wait for a close that only arrives once it is
  // answered, so the question is what gives the board back — never before the reveal.
  it("gives the board back for a question the check stopped to ask", async () => {
    const { result, rerender } = renderCuesAwaitingAnswer();
    await advance(0);

    rerender({ events: [REVEAL], decisionPending: false });
    await advance(0);
    expect(result.current.securityRevealPending).toBe(true);

    rerender({ events: [REVEAL], decisionPending: true });
    await advance(REVEAL_EXIT_AT_MS - 1);
    expect(result.current.securityRevealPending).toBe(true);

    await advance(1);
    expect(result.current.securityRevealPending).toBe(false);
    // The question opens on a clear board: the card it belongs to has already left.
    expect(result.current.securityClash).toBeNull();
  });

  // A card the viewer already watched resolve does not detour to the side afterwards.
  it("skips the branch for a card that held the screen through its own resolution", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([REVEAL]);
    await advance(REVEAL_SHOWN_AT_MS);

    rerender([REVEAL, EFFECT_CHECK]);
    await advance(CLASH_TOTAL_MS);
    expect(result.current.securityBranch).toBeNull();
    expect(result.current.securityClash).toBeNull();
  });

  it("mirrors the break to whichever seat is being checked", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([{ ...CHECK, seat: 1 }]);
    await advance(0);
    expect(result.current.securityBreak).toMatchObject({
      seat: 1,
      side: "opp",
    });
  });

  it("holds a security card that resolves an effect to the side, after the reveal", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([EFFECT_CHECK]);
    await advance(SECURITY_BREAK_TOTAL_MS);
    expect(result.current.securityBranch).toBeNull();

    // The source remains through the handoff, then only the dock owns the card.
    await advance(CLASH_DOCK_AT_MS - 1);
    expect(result.current.securityClash).not.toBeNull();
    expect(result.current.securityBranch).toBeNull();

    await advance(1);
    expect(result.current.securityClash?.departing).toBe(true);
    expect(result.current.securityBranch).toMatchObject({
      cardId: "BT1-010",
      side: "you",
    });
    await advance(SECURITY_BRANCH_IN_MS);
    expect(result.current.securityClash).toBeNull();
    expect(result.current.securityBranch?.state).toBe("docked");
    await advance(TIMINGS.securityClauseRead - 1);
    expect(result.current.securityBranch?.state).toBe("docked");
    await advance(1);
    expect(result.current.securityBranch).toBeNull();
    await advance(SECURITY_DOCK_CLOSE_MS);
    expect(result.current.securityBranch).toBeNull();
  });

  it("parks a used Option with the security-effect dock instead of narrating its final trash move", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([OPTION_USE, OPTION_ROUTED]);
    await advance(0);
    expect(result.current.zoneShowcase?.cardId).toBe("BT1-090");
    expect(result.current.optionBranch).toBeNull();
    await advance(SHOWCASE_TOTAL_MS + SECURITY_BRANCH_IN_MS);
    expect(result.current.optionBranch).toMatchObject({
      cardId: "BT1-090",
      side: "you",
      source: "option",
      state: "docked",
    });

    await advance(TIMINGS.optionDockHold + TIMINGS.securityDockPoll);
    expect(result.current.optionBranch).toBeNull();
    await advance(SECURITY_DOCK_CLOSE_MS);
    expect(result.current.optionBranch).toBeNull();
  });

  it("keeps a routed Option through the card it plays even without an On Play clause", async () => {
    const { result, rerender } = renderCues();
    await advance(0);
    rerender([
      OPTION_USE,
      {
        kind: "effectTriggered",
        seat: 0,
        sourceCardId: "BT1-090",
        effectKey: "main",
        timing: "Main",
        description: "Play a card.",
      },
      OPP_PLAY,
      OPTION_ROUTED,
    ]);
    let elapsed = 0;
    while (result.current.zoneShowcase?.cardId !== "BT1-010" && elapsed < 10000) {
      await advance(16);
      elapsed += 16;
    }
    await advance(16);
    expect(result.current.zoneShowcase?.cardId).toBe("BT1-010");
    expect(result.current.optionBranch?.state).toBe("docked");
    await advance(SHOWCASE_TOTAL_MS - 32);
    expect(result.current.zoneShowcase?.cardId).toBe("BT1-010");
    expect(result.current.optionBranch?.state).toBe("docked");
    await advance(32 + TIMINGS.securityDockPoll);
    expect(result.current.zoneShowcase).toBeNull();
    await advance(TIMINGS.optionDockHold + TIMINGS.effectSourceHold);
    expect(result.current.optionBranch).toBeNull();
  });

  it("keeps a routed Option through its draw flight and releases a later clause", async () => {
    const board = document.createElement("div");
    const deck = document.createElement("div");
    const hand = document.createElement("div");
    vi.spyOn(board, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600));
    vi.spyOn(deck, "getBoundingClientRect").mockReturnValue(new DOMRect(600, 400, 80, 100));
    vi.spyOn(hand, "getBoundingClientRect").mockReturnValue(new DOMRect(200, 500, 300, 80));
    const feed = batchFeed();
    const { result, rerender } = renderHook(
      (events: readonly ServerEvent[]) =>
        useMatchCues({
          narrationLimit: 3,
          batches: feed(events),
          state: undefined,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors: {
            ...anchors,
            board: { current: board },
            yourDeck: { current: deck },
            yourHandDock: { current: hand },
          },
          onActionRejected: vi.fn<(reason: string) => void>(),
        }),
      { initialProps: [] as readonly ServerEvent[] },
    );
    await advance(0);
    const events: ServerEvent[] = [
      OPTION_USE,
      {
        kind: "effectTriggered",
        seat: 0,
        sourceCardId: "BT1-090",
        effectKey: "main",
        timing: "Main",
        description: "Draw 1.",
      },
      { kind: "cardsMoved", seat: 0, from: "deck", to: "hand", instanceIds: ["option-draw"] },
      OPTION_ROUTED,
    ];
    rerender(events);
    let elapsed = 0;
    while (result.current.drawFlights.length === 0 && elapsed < 10000) {
      await advance(16);
      elapsed += 16;
    }
    await advance(16);
    expect(result.current.drawFlights).toHaveLength(1);
    expect(result.current.optionBranch?.state).toBe("docked");
    rerender([...events, { ...EFFECT_NOTICE, timing: "On Play", description: "A later clause." }]);
    await advance(result.current.drawFlights[0]!.duration - 32);
    expect(result.current.drawFlights).toHaveLength(1);
    expect(result.current.optionBranch?.state).toBe("docked");
    await advance(32 + TIMINGS.securityDockPoll);
    expect(result.current.drawFlights).toEqual([]);
    await advance(TIMINGS.optionDockHold + TIMINGS.effectSourceHold);
    expect(result.current.optionBranch).toBeNull();
    await advance(TIMINGS.effectSourceHold);
    expect(
      result.current.notices.some(
        (notice) => notice.body.variant === "effect" && notice.body.description === "A later clause.",
      ),
    ).toBe(true);
  });

  it("keeps the Option source until its returned Digimon reaches the deck", async () => {
    const board = document.createElement("div");
    const deck = document.createElement("div");
    vi.spyOn(board, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600));
    vi.spyOn(deck, "getBoundingClientRect").mockReturnValue(new DOMRect(600, 400, 80, 100));
    const feed = batchFeed();
    const { result, rerender } = renderHook(
      (events: readonly ServerEvent[]) =>
        useMatchCues({
          narrationLimit: 3,
          batches: feed(events),
          state: undefined,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors: { ...anchors, board: { current: board }, oppDeck: { current: deck } },
          onActionRejected: vi.fn<(reason: string) => void>(),
        }),
      { initialProps: [] as readonly ServerEvent[] },
    );
    await advance(0);
    rerender([OPTION_USE]);
    await advance(SHOWCASE_TOTAL_MS + SECURITY_BRANCH_IN_MS + TIMINGS.optionDockHold);
    expect(result.current.optionBranch?.state).toBe("docked");
    rerender([
      OPTION_USE,
      {
        kind: "effectTriggered",
        seat: 0,
        sourceCardId: "BT1-090",
        effectKey: "main",
        timing: "Main",
        description: "Return a Digimon to the deck.",
      },
      {
        kind: "cardsMoved",
        seat: 1,
        from: "battleArea",
        to: "deckBottom",
        instanceIds: ["returned"],
        returnedPermanents: [{ permanentId: "perm-dead", instanceId: "returned", cardId: "BT1-011", seat: 1 }],
      },
      OPTION_ROUTED,
    ]);
    let elapsed = 0;
    while (result.current.drawFlights.length === 0 && elapsed < 10000) {
      await advance(16);
      elapsed += 16;
    }
    const flight = result.current.drawFlights[0]!;
    expect(flight).toMatchObject({ card: { cardId: "BT1-011" }, x: 120, y: 80, dx: 520, dy: 370 });
    await advance(TIMINGS.securityDockPoll);
    expect(result.current.drawFlights).toHaveLength(1);
    expect(result.current.optionBranch?.state).toBe("docked");
    await advance(flight.duration - TIMINGS.securityDockPoll + 16 + TIMINGS.securityDockPoll);
    expect(result.current.drawFlights).toEqual([]);
    expect(result.current.optionBranch).toBeNull();
  });

  // EX12-074 places ITSELF as a security card partway through its [Main] clause and keeps
  // resolving, so its routing marker arrives while the viewer still has the Option's own
  // prompts open. The marker alone would pull the card off the right of the screen with the
  // questions about it still on the board.
  it("keeps a self-relocating Option docked until its own prompts are answered", async () => {
    const { result, rerender } = renderCuesAwaitingAnswer();
    await advance(0);

    rerender({ events: [OPTION_USE, OPTION_ROUTED], decisionPending: true, decisionSourceCardId: "BT1-090" });
    await advance(SHOWCASE_TOTAL_MS + SECURITY_BRANCH_IN_MS);
    expect(result.current.optionBranch?.state).toBe("docked");

    // Past the point the marker alone would have closed it.
    await advance(TIMINGS.optionDockHold + SECURITY_DOCK_CLOSE_MS + TIMINGS.securityDockPoll * 4);
    expect(result.current.optionBranch?.state).toBe("docked");

    rerender({ events: [OPTION_USE, OPTION_ROUTED], decisionPending: false });
    await advance(TIMINGS.securityDockPoll * 2);
    expect(result.current.optionBranch).toBeNull();
    await advance(SECURITY_DOCK_CLOSE_MS);
    expect(result.current.optionBranch).toBeNull();
  });

  it.each(["EX13-028", undefined])(
    "closes a routed Option while another effect or trigger order is asking (%s)",
    async (decisionSourceCardId) => {
      const { result, rerender } = renderCuesAwaitingAnswer();
      await advance(0);
      rerender({ events: [OPTION_USE, OPTION_ROUTED], decisionPending: true, decisionSourceCardId });
      await advance(
        SHOWCASE_TOTAL_MS +
          SECURITY_BRANCH_IN_MS +
          TIMINGS.optionDockHold +
          TIMINGS.securityDockPoll +
          SECURITY_DOCK_CLOSE_MS,
      );
      expect(result.current.optionBranch).toBeNull();
    },
  );

  // The dock's hold is open-ended by design: it ends when the viewer answers the Option's
  // own prompts. A phase ribbon that waited for it would wait for an answer that cannot
  // arrive — every other cue is gated behind the ribbon, so one docked Option used to
  // freeze the whole screen until the hold's 45-second failsafe ceiling.
  it("plays phase ribbons while a used Option is still docked", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    // No routing event: the Option is mid-resolution and its dock stays open.
    rerender([OPTION_USE]);
    await advance(SHOWCASE_TOTAL_MS + SECURITY_BRANCH_IN_MS);
    expect(result.current.optionBranch?.state).toBe("docked");

    rerender([OPTION_USE, { kind: "turnEnded", endingSeat: 0, nextSeat: 1, turnCount: 1 }]);
    await advance(32);
    expect(result.current.phaseBanner).toBeNull();
    expect(result.current.turnTransition?.endingSeat).toBe(0);
    expect(result.current.optionBranch?.state).toBe("docked");
  });

  it("owes the screen a reveal from the check until the scene has played it", async () => {
    const { result, rerender } = renderCues();
    await advance(0);
    expect(result.current.securityRevealPending).toBe(false);

    // Set in the same pass that observes the check, so a decision arriving with it has
    // nowhere to render before the card does.
    rerender([EFFECT_CHECK]);
    await advance(0);
    expect(result.current.securityRevealPending).toBe(true);

    await advance(EFFECT_CHECK_PRESENTED_AT_MS - 1);
    expect(result.current.securityRevealPending).toBe(true);

    await advance(1);
    expect(result.current.securityRevealPending).toBe(false);
  });

  it("keeps the resolved card readable when the player clicks through its dock", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([EFFECT_CHECK]);
    await advance(SECURITY_BREAK_TOTAL_MS + CLASH_OUTCOME_AT_MS);
    // Skipping decoration does not shorten the same source read used by a live dock.
    act(() => result.current.skipAnimations());
    await advance(0);
    expect(result.current.securityClash).toBeNull();
    expect(result.current.securityRevealPending).toBe(true);
    expect(result.current.securityBranch).not.toBeNull();
    await advance(EFFECT_CHECK_PRESENTED_AT_MS - SECURITY_BREAK_TOTAL_MS - CLASH_OUTCOME_AT_MS);
    expect(result.current.securityRevealPending).toBe(false);
  });

  // The reference client docks a card with a [Security] effect in its brainstorm slot and
  // keeps it there for the WHOLE resolution — every target pick, every optional yes/no —
  // closing the slot only once the card is disposed.
  it("docks a card whose [Security] effect the server is still resolving", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([ATTACK, EFFECT_REVEAL]);
    await advance(SECURITY_BREAK_TOTAL_MS);
    expect(result.current.securityClash?.revealed.cardId).toBe("BT1-010");
    expect(result.current.securityBranch).toBeNull();

    // The card is seen centre stage through its reveal light, then it leaves for the
    // dock rather than holding the middle of the board for a resolution of unknown length.
    await advance(CLASH_REVEAL_SHOWN_AT_MS);
    expect(result.current.securityClash?.departing).toBeUndefined();
    expect(result.current.securityBranch).toBeNull();
    await advance(CLASH_DOCK_AT_MS - CLASH_REVEAL_SHOWN_AT_MS);
    expect(result.current.securityClash?.departing).toBe(true);
    expect(result.current.securityBranch).toMatchObject({
      cardId: "BT1-010",
      side: "you",
      state: "docked",
    });
    await advance(SECURITY_BRANCH_IN_MS);
    expect(result.current.securityClash).toBeNull();

    // Open-ended: nothing but the close takes it away.
    await advance(CLASH_TOTAL_MS + SECURITY_BRANCH_TOTAL_MS);
    expect(result.current.securityBranch?.state).toBe("docked");

    // Its close removes the execution card without a second presentation hold.
    rerender([ATTACK, EFFECT_REVEAL, EFFECT_CHECK]);
    await advance(TIMINGS.securityDockPoll);
    expect(result.current.securityBranch).toBeNull();
    await advance(SECURITY_DOCK_CLOSE_MS);
    expect(result.current.securityBranch).toBeNull();
    expect(result.current.securityClash).toBeNull();
  });

  // Reveal, dock, then the prompt: the question is asked beside the card that asked it,
  // and never before the card has arrived at the side and its clause has been read.
  it("opens the check's question only once its card has docked and its clause was read", async () => {
    const { result, rerender } = renderCuesAwaitingAnswer();
    await advance(0);

    rerender({ events: [EFFECT_REVEAL], decisionPending: false });
    await advance(0);
    expect(result.current.securityRevealPending).toBe(true);

    rerender({ events: [EFFECT_REVEAL], decisionPending: true });
    await advance(DOCKED_AT_MS + CLAUSE_HOLD_MS - 1);
    expect(result.current.securityRevealPending).toBe(true);

    await advance(1);
    expect(result.current.securityRevealPending).toBe(false);
    // The prompt opens beside the card, not over an empty board.
    expect(result.current.securityBranch?.state).toBe("docked");
  });

  it("reads out what the docked card did beside it, not after its close", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([EFFECT_REVEAL, EFFECT_NOTICE]);
    await advance(DOCKED_AT_MS - 1);
    expect(result.current.notices).toEqual([]);

    await advance(1);
    expect(result.current.notices).toHaveLength(1);
    expect(result.current.securityBranch?.state).toBe("docked");
  });

  // BT10-087 Taiki Kudo: a [Security] "play this card" whose [On Play] then reveals four
  // cards. What the play caused belongs after the dock and after the card reaches the
  // field, so neither its notice nor its revealed-cards panel may appear before them.
  it("holds an [On Play] notice and its revealed-cards panel until the card has docked and entered the field", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    const opened = [ATTACK, OPP_EFFECT_REVEAL, OPP_SECURITY_NOTICE] as const;
    rerender([...opened]);
    await advance(DOCKED_AT_MS - 1);
    expect(result.current.notices).toEqual([]);
    expect(result.current.sidePanels).toEqual([]);

    // Step 2: the card is parked at the side and its [Security] clause reads out beside it.
    await advance(1);
    expect(result.current.securityBranch?.state).toBe("docked");
    expect(result.current.notices).toHaveLength(1);
    expect(result.current.sidePanels).toEqual([]);

    // Step 3/4 arrive together: the card is played and its [On Play] reveals four cards.
    rerender([...opened, OPP_TAIKI_PLAY, OPP_ON_PLAY, ...TAIKI_REVEALS]);
    await advance(CLAUSE_HOLD_MS);
    // The card is still on its way to the field, so nothing the play caused is on screen.
    expect(result.current.notices).toHaveLength(1);
    expect(result.current.sidePanels).toEqual([]);
    expect(result.current.zoneShowcase?.cardId).toBe("BT10-087");

    await advance(SHOWCASE_TOTAL_MS);
    expect(result.current.zoneShowcase).toBeNull();
    // The arrival releases the effect and its results while Security remains readable.
    expect(result.current.notices).toHaveLength(2);
    // The clause takes the screen first; the cards it turned up follow a beat later.
    await advance(TIMINGS.narrationCardsLag);
    const panel = result.current.sidePanels.at(-1);
    expect(panel?.titleKey).toBe("panel.revealedCards");
    expect(panel?.cards).toHaveLength(4);
  });

  /* An attack checking several cards: the server ships the whole rest of the attack while
     the first card is still animating into its dock, so the later checks' scenes are queued
     on the same centre-stage track before the dock gets to read anything out. The docked
     card's own clause still belongs beside it, not after every check that followed. */
  it("reads a docked card's clause before the checks that arrived while it was animating", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    const opened = [ATTACK, OPP_EFFECT_REVEAL, OPP_SECURITY_NOTICE] as const;
    rerender([...opened]);
    await advance(DOCK_AT_MS);

    // The close of this check and the whole of the next one land in one burst, mid-dock.
    rerender([...opened, OPP_TAIKI_CHECK]);
    rerender([...opened, OPP_TAIKI_CHECK, OPP_NEXT_REVEAL]);
    rerender([...opened, OPP_TAIKI_CHECK, OPP_NEXT_REVEAL, OPP_NEXT_CHECK]);

    await advance(SECURITY_BRANCH_IN_MS);
    expect(result.current.notices).toHaveLength(1);
    expect(result.current.notices[0]?.body).toMatchObject({
      cardId: "BT10-087",
      timing: "Security",
    });
  });

  /* The live order: the server resolves the whole [Security] play in one tick, so the
     reveal, the free play and the four [On Play] reveals all reach the client in a SINGLE
     batch, and `securityChecked` only arrives seconds later when the bot answers its
     decisions. Everything the played card did still has to wait for the card to arrive. */
  it("plays the card-enter cue before the [On Play] presentation when the whole check arrives in one batch", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([ATTACK, OPP_EFFECT_REVEAL, OPP_SECURITY_NOTICE, OPP_TAIKI_PLAY, OPP_ON_PLAY, ...TAIKI_REVEALS]);

    // Step 2: docked, with only the [Security] clause beside it.
    await advance(DOCKED_AT_MS);
    expect(result.current.securityBranch?.state).toBe("docked");
    expect(result.current.notices).toHaveLength(1);
    expect(result.current.sidePanels).toEqual([]);
    // Step 3: once the clause has been read, the played card is on its way to the field and
    // held off the board until then.
    expect(result.current.zoneShowcase).toBeNull();
    await advance(CLAUSE_HOLD_MS);
    expect(result.current.zoneShowcase?.cardId).toBe("BT10-087");
    expect(result.current.pendingPermanentIds.has("perm-taiki")).toBe(true);
    // Nothing the play caused may be on screen while it is still arriving.
    expect(result.current.sidePanels).toEqual([]);

    // Step 4: the card is on the field, so the dock has nothing left to hold and leaves.
    await advance(SHOWCASE_TOTAL_MS);
    expect(result.current.zoneShowcase).toBeNull();
    expect(result.current.pendingPermanentIds.has("perm-taiki")).toBe(false);
    expect(result.current.securityBranch).toBeNull();

    // Step 5: On Play can read without an extra dock fade between it and the arrival.
    await advance(SECURITY_DOCK_CLOSE_MS);
    expect(result.current.securityBranch).toBeNull();
    expect(result.current.notices).toHaveLength(2);
    await advance(TIMINGS.narrationCardsLag);
    expect(result.current.sidePanels.at(-1)?.titleKey).toBe("panel.revealedCards");
    expect(result.current.sidePanels.at(-1)?.cards).toHaveLength(4);
  });

  it.each([
    ["transfer", DOCK_AT_MS + 60],
    ["clause read", DOCKED_AT_MS + 20],
    ["queued closure", DOCKED_AT_MS + CLAUSE_HOLD_MS - 1],
  ] as const)("clears a resolved security dock cancelled during %s", async (_, cancelAt) => {
    let queue: AnimationQueue | undefined;
    const { result, rerender } = renderCues([], vi.fn(), false, {
      onQueue: (controls) => {
        queue = controls.queue as AnimationQueue;
      },
    });
    await advance(0);
    const events = [ATTACK, OPP_EFFECT_REVEAL, OPP_SECURITY_NOTICE, OPP_TAIKI_CHECK];
    rerender(events);
    await advance(cancelAt);
    expect(result.current.securityBranch).not.toBeNull();
    expect(queue).toBeDefined();
    act(() => queue!.clear());
    await advance(0);
    expect(result.current.securityBranch).toBeNull();
    expect(result.current.securityClash).toBeNull();
    expect(result.current.securityRevealPending).toBe(false);
    expect(result.current.heldSecurityEffectState).toBeUndefined();
    rerender([...events, SECOND_REVEAL]);
    await advance(SECURITY_BREAK_TOTAL_MS);
    expect(result.current.securityClash?.revealed.cardId).toBe("BT1-011");
  });

  it.each([true, false])(
    "preserves source and arrival order for a resolved check with reveal=%s",
    async (withReveal) => {
      const { result, rerender } = renderCues();
      await advance(0);
      rerender([
        ATTACK,
        ...(withReveal ? [OPP_EFFECT_REVEAL] : []),
        OPP_SECURITY_NOTICE,
        OPP_TAIKI_PLAY,
        OPP_ON_PLAY,
        ...TAIKI_REVEALS,
        OPP_TAIKI_CHECK,
      ]);
      await advance(DOCKED_AT_MS - 1);
      expect(result.current.notices).toEqual([]);
      expect(result.current.zoneShowcase).toBeNull();
      expect(result.current.pendingPermanentIds.has("perm-taiki")).toBe(true);
      await advance(1);
      expect(result.current.securityBranch?.state).toBe("docked");
      expect(result.current.notices.map((notice) => notice.body)).toEqual([
        expect.objectContaining({ timing: "Security", cardId: "BT10-087" }),
      ]);
      await advance(CLAUSE_HOLD_MS - 1);
      expect(result.current.zoneShowcase).toBeNull();
      await advance(1);
      expect(result.current.zoneShowcase?.cardId).toBe("BT10-087");
      expect(result.current.sidePanels).toEqual([]);
      await advance(SHOWCASE_TOTAL_MS + SECURITY_DOCK_CLOSE_MS + TIMINGS.effectSourceHold);
      expect(result.current.pendingPermanentIds.has("perm-taiki")).toBe(false);
      expect(
        result.current.notices.filter(
          (notice) => notice.body.variant === "effect" && notice.body.timing === "Security",
        ),
      ).toHaveLength(1);
      expect(
        result.current.notices.some((notice) => notice.body.variant === "effect" && notice.body.timing === "On Play"),
      ).toBe(true);
      expect(result.current.sidePanels.at(-1)?.cards).toHaveLength(4);
    },
  );

  it.each(["effect", "battle"] as const)(
    "holds the Digimon battle board only when the known verdict is %s",
    async (resolution) => {
      const state = {
        players: [
          { battleArea: [], trash: [], hand: [], securityCount: 5 },
          {
            battleArea: [{ permanentId: "perm-1", topCard: { cardId: "BT1-010", instanceId: "attacker" } }],
            trash: [],
            hand: [],
            securityCount: 5,
          },
        ],
      } as unknown as GameState;
      const { result, rerender } = renderCuesOverBoard(state);
      await advance(0);
      rerender([ATTACK, { ...EFFECT_REVEAL, isDigimon: true }, { ...EFFECT_CHECK, resolution }]);
      await advance(0);
      expect(result.current.heldBlowState !== undefined).toBe(resolution === "battle");
      await advance(DOCKED_AT_MS);
      expect(result.current.heldBlowState !== undefined).toBe(resolution === "battle");
      await advance(10000);
      expect(result.current.heldBlowState).toBeUndefined();
    },
  );

  it("moves a resolved security card to the right before its played Tamer enters the field", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    // A fast resolution can deliver the reveal, free play, and close together. The Tamer
    // must remain held while its security card is still travelling to the execution slot.
    rerender([ATTACK, OPP_EFFECT_REVEAL, OPP_TAIKI_PLAY, EFFECT_CHECK]);
    await advance(EFFECT_CHECK_NOTICE_AT_MS + CLAUSE_HOLD_MS - 1);
    expect(result.current.securityBranch).not.toBeNull();
    expect(result.current.zoneShowcase).toBeNull();
    expect(result.current.pendingPermanentIds.has("perm-taiki")).toBe(true);

    await advance(1);
    expect(result.current.securityBranch).not.toBeNull();
    expect(result.current.zoneShowcase?.cardId).toBe("BT10-087");
  });

  it("holds the viewer's Security Tamer off the field until its card reaches the right", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([ATTACK, EFFECT_REVEAL, YOUR_TAIKI_PLAY, EFFECT_CHECK]);
    await advance(EFFECT_CHECK_NOTICE_AT_MS + CLAUSE_HOLD_MS - 1);
    // A Security play waits for the source to reach the execution slot, then reveals.
    expect(result.current.pendingPermanentIds.has("perm-your-taiki")).toBe(true);

    await advance(1);
    expect(result.current.securityBranch).not.toBeNull();
    expect(result.current.zoneShowcase?.cardId).toBe(YOUR_TAIKI_PLAY.cardId);
    await advance(SHOWCASE_TOTAL_MS);
    expect(result.current.pendingPermanentIds.has("perm-your-taiki")).toBe(false);
    expect(result.current.permanentBursts.get("perm-your-taiki")).toMatchObject({ variant: "play" });
  });

  /* The exact payloads a live dev-scenario check delivers, captured off the wire. The
     shapes differ from a hand play: `cardPlayed` carries no `from` and no instance id, and
     the movement is a separate `cardsMoved` from security to the battle area. */
  const LIVE_ATTACK: ServerEvent = {
    kind: "attackDeclared",
    seat: 0,
    attackerPermanentId: "dev-perm-0",
    attackerCardId: "ST1-07",
    target: { kind: "player" },
  };
  const LIVE_REVEAL: ServerEvent = {
    kind: "securityRevealed",
    seat: 1,
    revealedCardId: "BT10-087",
    attackerPermanentId: "dev-perm-0",
    hasSecurityEffect: true,
    isDigimon: false,
  };
  const LIVE_PLAY: ServerEvent = {
    kind: "cardPlayed",
    seat: 1,
    cardId: "BT10-087",
    permanentId: "perm-1",
  };
  const LIVE_MOVE: ServerEvent = {
    kind: "cardsMoved",
    instanceIds: ["dev-security-1"],
    from: "security",
    to: "battleArea",
  };
  const LIVE_ON_PLAY: ServerEvent = {
    kind: "effectTriggered",
    seat: 1,
    sourceCardId: "BT10-087",
    effectKey: "BT10-087/ir-6-0",
    description: "[OnPlay] Reveal top 4 and add",
    timing: "OnPlay",
    duringSecurityCheck: true,
  };
  const LIVE_REVEALS: readonly ServerEvent[] = ["BT19-051", "BT10-087", "BT19-038", "BT19-051"].map((cardId) => ({
    kind: "cardRevealed",
    seat: 1,
    cardId,
  }));

  /** The board the live client holds at that moment: the played card is already a permanent. */
  const LIVE_BOARD = {
    players: [
      { battleArea: [], trash: [], hand: [], securityCount: 5 },
      {
        battleArea: [
          {
            permanentId: "perm-1",
            topCard: { instanceId: "dev-security-1", cardId: "BT10-087" },
          },
        ],
        trash: [],
        hand: [],
        securityCount: 5,
      },
    ],
  } as unknown as GameState;

  /** The whole check, asserted the same way whichever shape the server batches it into. */
  async function expectLiveCheckOrder(
    result: { current: ReturnType<typeof useMatchCues> },
    rerenderBatches: () => Promise<void>,
  ) {
    await rerenderBatches();

    // Mid-clash: nothing the check caused is on screen, and the played card is held back.
    expect(result.current.sidePanels).toEqual([]);
    expect(result.current.pendingPermanentIds.has("perm-1")).toBe(true);

    // Step 2: the card docks. This stream carries no [Security]-timing notice of its own,
    // so the dock stands alone; what the card went on to do is still held.
    await advance(DOCKED_AT_MS);
    expect(result.current.securityBranch?.state).toBe("docked");
    expect(result.current.sidePanels).toEqual([]);
    expect(result.current.notices).toEqual([]);

    // Step 3: after the docked card's read, it is seen arriving, exactly as a hand play would.
    await advance(CLAUSE_HOLD_MS);
    expect(result.current.zoneShowcase?.cardId).toBe("BT10-087");
    expect(result.current.pendingPermanentIds.has("perm-1")).toBe(true);
    // The showcase holds the card up, so the "played card" panel must not repeat it.
    expect(result.current.sidePanels.some((panel) => panel.titleKey === "panel.playedCard")).toBe(false);

    // Step 4: it has landed, so the [On Play] result reads out — the panel of cards it
    // turned up first, then the clause that turned them up.
    await advance(SHOWCASE_TOTAL_MS);
    expect(result.current.zoneShowcase).toBeNull();
    expect(result.current.pendingPermanentIds.has("perm-1")).toBe(false);
    expect(result.current.sidePanels.some((panel) => panel.titleKey === "panel.playedCard")).toBe(false);
    await advance(CARD_BURST_PEAK_MS + POLL_MS);
    expect(result.current.effectSources).toHaveLength(1);
    expect(result.current.notices).toHaveLength(0);
    await advance(TIMINGS.effectSourceHold);
    expect(result.current.notices).toHaveLength(1);
    expect(result.current.notices[0]?.body.variant).toBe("effect");

    // The clause takes the screen first; the cards it turned up follow a beat later.
    await advance(TIMINGS.narrationCardsLag);
    const panel = result.current.sidePanels.at(-1);
    expect(panel?.titleKey).toBe("panel.revealedCards");
    expect(panel?.cards).toHaveLength(4);
    await advance(Math.max(TIMINGS.noticeLifetime, SIDE_PANEL_LIFETIME_MS) + NARRATION_TICK_MS);
    expect(result.current.sidePanels).toHaveLength(0);
  }

  it("orders a live [Security] play that arrives as one batch", async () => {
    const { result, rerender } = renderCuesOverBoard(LIVE_BOARD);
    await advance(0);

    await expectLiveCheckOrder(result, async () => {
      rerender([LIVE_ATTACK]);
      await advance(20);
      rerender([LIVE_ATTACK, LIVE_REVEAL, LIVE_PLAY, LIVE_MOVE, LIVE_ON_PLAY, ...LIVE_REVEALS]);
      await advance(20);
    });

    // The [Security] clause played the card onto the field, so the dock has already gone.
    expect(result.current.securityBranch).toBeNull();
  });

  it("orders the same live [Security] play when the server splits it across batches", async () => {
    const { result, rerender } = renderCuesOverBoard(LIVE_BOARD);
    await advance(0);

    await expectLiveCheckOrder(result, async () => {
      const batches: ServerEvent[][] = [
        [LIVE_ATTACK],
        [LIVE_REVEAL],
        [LIVE_PLAY],
        [LIVE_MOVE, LIVE_ON_PLAY, ...LIVE_REVEALS],
      ];
      const seen: ServerEvent[] = [];
      for (const batch of batches) {
        seen.push(...batch);
        rerender([...seen]);
        await advance(25);
      }
    });

    // The [Security] clause played the card onto the field, so the dock has already gone.
    expect(result.current.securityBranch).toBeNull();
  });

  /* A hidden tab (an automated screenshot run is one) puts the queue in `drain`: the
     centre-stage showcase is dropped outright, and the "played card" panel that normally
     stands in for it would name the very card the dock is holding up. */
  it("never repeats the docked card as a played-card panel when the showcase is dropped", async () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    try {
      const { result, rerender } = renderCuesOverBoard(LIVE_BOARD);
      await advance(0);

      rerender([LIVE_ATTACK, LIVE_REVEAL, LIVE_PLAY, LIVE_MOVE, LIVE_ON_PLAY, ...LIVE_REVEALS]);
      await advance(DOCKED_AT_MS + CLAUSE_HOLD_MS + SECURITY_DOCK_CLOSE_MS);

      expect(result.current.zoneShowcase).toBeNull();
      expect(result.current.sidePanels.some((panel) => panel.titleKey === "panel.playedCard")).toBe(false);
      // The reveal stays beside its clause, even when the decorative cues are drained.
      expect(result.current.notices.map((notice) => notice.body.variant)).toEqual(["effect"]);
      expect(result.current.sidePanels.at(-1)?.titleKey).toBe("panel.revealedCards");
      await advance(1000);
      expect(result.current.sidePanels.at(-1)?.cards).toHaveLength(4);
    } finally {
      hidden.mockRestore();
    }
  });

  /* The batches a live match actually delivers for the same check: the server flushes on
     its own tick, so the reveal, the free play and the [On Play] resolution each arrive
     alone, 25-40 ms apart, while the clash is still on its first frame. The close only
     lands seconds later, after the bot has answered. */
  const TAIKI_PLAY_MOVE: ServerEvent = {
    kind: "cardsMoved",
    instanceIds: ["sec-taiki"],
    cardIds: ["BT10-087"],
    seat: 1,
    from: "security",
    to: "battleArea",
  };

  it("keeps the order across the separate batches a live check arrives in", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    const batches: ServerEvent[][] = [
      [ATTACK],
      [OPP_EFFECT_REVEAL],
      [OPP_TAIKI_PLAY],
      [TAIKI_PLAY_MOVE, OPP_ON_PLAY, ...TAIKI_REVEALS],
    ];
    const seen: ServerEvent[] = [];
    for (const batch of batches) {
      seen.push(...batch);
      rerender([...seen]);
      await advance(30);
    }

    // Still mid-clash: nothing the check caused has reached the screen.
    expect(result.current.notices).toEqual([]);
    expect(result.current.sidePanels).toEqual([]);
    // The played Tamer is held off the field until its arrival cue runs.
    expect(result.current.pendingPermanentIds.has("perm-taiki")).toBe(true);

    // Step 2: the card docks on the right.
    await advance(DOCKED_AT_MS);
    expect(result.current.securityBranch?.state).toBe("docked");
    expect(result.current.sidePanels).toEqual([]);
    // Step 3: after the docked card's read, it is seen arriving, and the [On Play] result is
    // still not on screen.
    await advance(CLAUSE_HOLD_MS);
    expect(result.current.zoneShowcase?.cardId).toBe("BT10-087");
    expect(result.current.notices.some((notice) => notice.body.variant === "effect")).toBe(false);

    // Step 4: it has landed, so what it did reads out — the panel of revealed cards
    // first, and the clause that revealed them behind it.
    await advance(SHOWCASE_TOTAL_MS);
    expect(result.current.zoneShowcase).toBeNull();
    expect(result.current.pendingPermanentIds.has("perm-taiki")).toBe(false);
    // The dock leaves on the play, and the [On Play] clause reads out behind it.
    expect(result.current.securityBranch).toBeNull();
    await advance(SECURITY_DOCK_CLOSE_MS);
    expect(result.current.securityBranch).toBeNull();
    expect(result.current.notices.map((notice) => notice.body.variant)).toEqual(["effect"]);

    await advance(NOTICE_ITEM_MS);
    expect(result.current.sidePanels.at(-1)?.titleKey).toBe("panel.revealedCards");
    expect(result.current.sidePanels.at(-1)?.cards).toHaveLength(4);
  });

  // The permanent is rendered from state the instant its patch lands, so a card whose
  // arrival cue is still queued behind a check has to be held off the board until it plays.
  it("holds a card played by a [Security] effect off the field until its arrival cue runs", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([ATTACK, OPP_EFFECT_REVEAL, OPP_SECURITY_NOTICE, OPP_TAIKI_PLAY]);
    await advance(0);
    expect(result.current.pendingPermanentIds.has("perm-taiki")).toBe(true);
    expect(result.current.zoneShowcase).toBeNull();

    await advance(DOCKED_AT_MS + CLAUSE_HOLD_MS + SHOWCASE_TOTAL_MS);
    expect(result.current.pendingPermanentIds.has("perm-taiki")).toBe(false);
  });

  /* The real engine order: the reveal and its [Security] clause, then the play, then the
     Tamer's [On Play]. The dock has nothing left to hold once the card is on the field, so
     it must be gone before the [On Play] panels open. */
  it("closes the dock on the security card's own play, before its [On Play] panels open", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([ATTACK, OPP_EFFECT_REVEAL, OPP_SECURITY_NOTICE]);
    await advance(DOCKED_AT_MS);
    expect(result.current.securityBranch?.state).toBe("docked");
    expect(result.current.sidePanels).toEqual([]);

    rerender([ATTACK, OPP_EFFECT_REVEAL, OPP_SECURITY_NOTICE, OPP_TAIKI_PLAY]);
    await advance(CLAUSE_HOLD_MS + SHOWCASE_TOTAL_MS);
    expect(result.current.securityBranch).toBeNull();

    rerender([ATTACK, OPP_EFFECT_REVEAL, OPP_SECURITY_NOTICE, OPP_TAIKI_PLAY, OPP_ON_PLAY, ...TAIKI_REVEALS]);
    await advance(SECURITY_DOCK_CLOSE_MS + SHOWCASE_TOTAL_MS + NOTICE_ITEM_MS);
    expect(result.current.securityBranch).toBeNull();
    expect(result.current.sidePanels.at(-1)?.titleKey).toBe("panel.revealedCards");
  });

  // A security card whose effect does NOT play it keeps its dock until the check closes.
  it("keeps the dock for a [Security] effect that plays no card", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([ATTACK, EFFECT_REVEAL]);
    await advance(DOCKED_AT_MS);
    expect(result.current.securityBranch?.state).toBe("docked");

    rerender([ATTACK, EFFECT_REVEAL, EFFECT_NOTICE]);
    await advance(SHOWCASE_TOTAL_MS + NOTICE_ITEM_MS);
    expect(result.current.securityBranch?.state).toBe("docked");
  });

  // A Digimon that also resolved a [Security] effect still has a battle to show, and the
  // dock has no attacker beside it to show it against.
  it("brings a docked Digimon back to the centre for its battle", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([ATTACK, EFFECT_REVEAL]);
    await advance(DOCKED_AT_MS);
    expect(result.current.securityBranch?.state).toBe("docked");

    rerender([ATTACK, EFFECT_REVEAL, CHECK]);
    await advance(CLAUSE_HOLD_MS);
    await advance(0);
    expect(result.current.securityBranch).toBeNull();
    expect(result.current.securityClash?.resolution).toBe("battle");
    expect(result.current.securityClash?.revealedReady).toBe(true);
    await advance(TIMINGS.clashOutcome - 1);
    expect(result.current.securityClash?.exiting).not.toBe(true);
    await advance(1);
    expect(result.current.securityClash?.exiting).toBe(true);

    await advance(TIMINGS.securityCardExit);
    expect(result.current.securityClash).toBeNull();
  });

  // The dock holds the one serial track every centre-stage cue shares, so a close that
  // never arrives may not wedge it: the next check has to be able to play.
  it("recovers the centre-stage track when the close never arrives", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([ATTACK, EFFECT_REVEAL]);
    await advance(DOCKED_AT_MS);
    expect(result.current.securityBranch?.state).toBe("docked");

    await advance(TIMINGS.securityDockMax + TIMINGS.securityDockPoll);
    expect(result.current.securityBranch).toBeNull();

    // The track is free again, so a second check plays its whole scene.
    rerender([ATTACK, EFFECT_REVEAL, SECOND_REVEAL, SECOND_CHECK]);
    await advance(SECURITY_BREAK_TOTAL_MS);
    expect(result.current.securityClash?.revealed.cardId).toBe("BT1-011");
  });

  // A newer check takes the board off a dock still waiting, rather than queueing behind it.
  it("lets a newer reveal take the board off a dock that is still waiting", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([ATTACK, EFFECT_REVEAL]);
    await advance(DOCKED_AT_MS);
    expect(result.current.securityBranch?.state).toBe("docked");

    rerender([ATTACK, EFFECT_REVEAL, SECOND_REVEAL, SECOND_CHECK]);
    await advance(0);
    expect(result.current.securityBranch).toBeNull();
    await advance(SECURITY_BREAK_TOTAL_MS);
    expect(result.current.securityClash?.revealed.cardId).toBe("BT1-011");
  });

  // An older server, and a replayed history, send no hint: the card plays the centre-stage
  // scene out and leaves on its own clock, exactly as before.
  it("falls back to the centre-stage scene when the reveal carries no hint", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([ATTACK, REVEAL]);
    await advance(DOCK_AT_MS);
    expect(result.current.securityBranch).toBeNull();
    expect(result.current.securityClash).not.toBeNull();

    await advance(CLASH_TOTAL_MS);
    expect(result.current.securityClash).toBeNull();
    expect(result.current.securityBranch).toBeNull();
  });

  it("leaves a plain check with no branch to hold", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([CHECK]);
    await advance(SECURITY_BREAK_TOTAL_MS + CLASH_TOTAL_MS);
    expect(result.current.securityBranch).toBeNull();
  });

  // ST1-16 Gaia Force from security: the server deletes the attacker a moment after the
  // reveal, while the card is still growing into place. The shatter waits until the card
  // has docked and its clause has been on screen for a readable beat.
  it("holds a deletion a docked [Security] effect caused until its clause has been read", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    const deletion: ServerEvent = {
      kind: "cardsMoved",
      instanceIds: ["inst-dead"],
      from: "battleArea",
      to: "trash",
      deletedPermanents: [{ permanentId: "perm-dead", instanceId: "inst-dead", cardId: "BT1-020", seat: 1 }],
    };
    rerender([ATTACK, EFFECT_REVEAL, EFFECT_NOTICE]);
    await advance(20);
    rerender([ATTACK, EFFECT_REVEAL, EFFECT_NOTICE, deletion]);

    await advance(DOCKED_AT_MS + TIMINGS.effectAnnounce - 20 - 1);
    expect(result.current.deleteBursts).toEqual([]);

    await advance(1);
    expect(result.current.deleteBursts).toHaveLength(1);
  });

  it("bursts where a deleted permanent stood, and only where one was measured", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([COMBAT]);
    // A permanent beaten in battle takes the claw and the shake first; the burst
    // waits behind them rather than breaking the card before it is hit.
    await advance(0);
    expect(result.current.combatImpactIds.has("perm-dead")).toBe(true);
    expect(result.current.deleteBursts).toEqual([]);

    await advance(COMBAT_IMPACT_TOTAL_MS);
    expect(result.current.combatImpactIds.size).toBe(0);
    expect(result.current.deleteBursts).toHaveLength(1);
    expect(result.current.deleteBursts[0]).toMatchObject({
      x: 120 - 36,
      y: 80 - 50.5,
    });

    await advance(TIMINGS.cardBurst);
    expect(result.current.deleteBursts).toEqual([]);

    rerender([COMBAT, { ...COMBAT, deletedPermanentIds: ["perm-unmeasured"] }]);
    await advance(COMBAT_IMPACT_TOTAL_MS);
    expect(result.current.deleteBursts).toEqual([]);
  });

  describe("an effect battle", () => {
    const effectCompared = (loser: string): ServerEvent => ({
      kind: "battleCompared",
      attackerPermanentId: "perm-1",
      defenderPermanentId: loser,
      loserPermanentIds: [loser],
      effectBattle: { attackerSeat: 1, attackerCardId: "EX13-076", defenderCardId: "BT1-020" },
    });

    it("strikes the loser after its arrow and breaks it only after the contact", async () => {
      const { result, rerender } = renderCues();
      await advance(0);

      const deletion: ServerEvent = {
        kind: "cardsMoved",
        instanceIds: ["inst-dead"],
        from: "battleArea",
        to: "trash",
        battleDeletion: true,
        deletedPermanents: [{ permanentId: "perm-dead", instanceId: "inst-dead", cardId: "BT1-020", seat: 0 }],
      };
      const onDeletion: ServerEvent = {
        kind: "effectTriggered",
        seat: 0,
        sourceCardId: "BT1-020",
        effectKey: "effect-battle:onDeletion",
        timing: "OnDeletion",
        description: "Draw 1 card.",
      };
      // The server publishes the comparison a batch ahead of the deletion it causes.
      rerender([effectCompared("perm-dead")]);
      await advance(0);
      rerender([effectCompared("perm-dead"), deletion, onDeletion]);
      await advance(0);
      expect(result.current.fieldClash).toMatchObject({
        attacker: { permanentId: "perm-1", cardId: "EX13-076" },
        defender: { permanentId: "perm-dead", cardId: "BT1-020" },
        effectBattle: true,
      });
      expect(result.current.combatImpactIds.size).toBe(0);

      await advance(FIELD_CLASH_IMPACT_AT_MS);
      expect(result.current.combatImpactIds.has("perm-dead")).toBe(true);
      expect(result.current.combatImpactIds.has("perm-1")).toBe(false);
      expect(result.current.deleteBursts).toEqual([]);

      await advance(COMBAT_IMPACT_TOTAL_MS - 1);
      expect(result.current.deleteBursts).toEqual([]);
      // What the deletion caused reads only once the blow has landed.
      expect(result.current.notices).toHaveLength(0);
      await advance(1);
      expect(result.current.fieldClash).toBeNull();
      expect(result.current.combatImpactIds.size).toBe(0);
      expect(result.current.deleteBursts).toHaveLength(1);
      expect(result.current.notices).toHaveLength(1);
    });

    it.each([0, 100])(
      "queues an attack's blow %ims later behind it, and that loser breaks after its own blow",
      async (attackDelayMs) => {
        const { result, rerender } = renderCues();
        await advance(0);

        const declare: ServerEvent = {
          kind: "attackDeclared",
          seat: 1,
          attackerPermanentId: "perm-1",
          attackerCardId: "BT1-010",
          target: { kind: "permanent", permanentId: "perm-dead" },
          targetCardId: "BT1-020",
        };
        rerender([declare, effectCompared("perm-struck")]);
        await advance(attackDelayMs);
        rerender([declare, effectCompared("perm-struck"), COMBAT]);
        await advance(FIELD_CLASH_IMPACT_AT_MS - attackDelayMs);
        expect(result.current.combatImpactIds.has("perm-struck")).toBe(true);

        await advance(COMBAT_IMPACT_TOTAL_MS);
        expect(result.current.fieldClash).toMatchObject({ defender: { permanentId: "perm-dead" } });
        expect(result.current.combatImpactIds.size).toBe(0);

        await advance(FIELD_CLASH_IMPACT_AT_MS);
        expect(result.current.combatImpactIds.has("perm-dead")).toBe(true);
        // The fixed lead-in has passed; the burst still waits for the queued blow to land.
        await advance(COMBAT_IMPACT_TOTAL_MS - 1);
        expect(result.current.deleteBursts).toEqual([]);
        await advance(1);
        expect(result.current.fieldClash).toBeNull();
        expect(result.current.deleteBursts).toHaveLength(1);
      },
    );
  });

  it("lands the battle blow after the arrow, with no invented attacker movement or extra delay", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    const declare: ServerEvent = {
      kind: "attackDeclared",
      seat: 1,
      attackerPermanentId: "perm-1",
      attackerCardId: "BT1-010",
      target: { kind: "permanent", permanentId: "perm-dead" },
      targetCardId: "BT1-020",
    };
    // The declaration and its resolution arrive in one batch, the way an
    // uncontested attack does; the scene still plays each beat on its own clock.
    rerender([declare, COMBAT]);
    await advance(0);
    expect(result.current.fieldClash).toMatchObject({
      attacker: { permanentId: "perm-1", cardId: "BT1-010" },
      defender: { permanentId: "perm-dead", cardId: "BT1-020" },
      direction: "down",
    });
    expect(result.current.combatImpactIds.size).toBe(0);

    await advance(FIELD_CLASH_IMPACT_AT_MS - 1);
    expect(result.current.combatImpactIds.size).toBe(0);
    await advance(1);
    expect(result.current.combatImpactIds.has("perm-dead")).toBe(true);
    expect(result.current.combatImpactIds.has("perm-1")).toBe(false);
    expect(result.current.deleteBursts).toEqual([]);

    await advance(COMBAT_IMPACT_TOTAL_MS);
    expect(result.current.fieldClash).toBeNull();
    expect(result.current.combatImpactIds.size).toBe(0);
    expect(result.current.deleteBursts).toHaveLength(1);
  });

  it.each([0, 40, 180, 380])("waits only the declaration arrow's remaining %ims before impact", async (remainingMs) => {
    const declare: ServerEvent = {
      ...ATTACK,
      target: { kind: "permanent", permanentId: "perm-dead" },
      targetCardId: "BT1-020",
    };
    const arrowClock = {
      key: attackDeclarationKey(declare),
      elapsedMs: 380 - remainingMs,
      remainingMs,
      observedAtMs: 0,
    };
    const readClock = vi.fn<NonNullable<MatchCueAnchors["attackArrowClock"]>>(() => arrowClock);
    const { result, rerender } = renderCues([], undefined, false, undefined, {
      ...anchors,
      attackArrowClock: readClock,
    });
    await advance(0);
    rerender([declare, COMBAT]);
    await advance(0);
    expect(readClock).toHaveBeenCalledWith("perm-1", arrowClock.key);
    expect(result.current.fieldClash?.arrowClock).toEqual(arrowClock);
    await advance(Math.max(0, remainingMs - 1));
    expect(result.current.combatImpactIds.size).toBe(remainingMs > 0 ? 0 : 1);
    await advance(remainingMs > 0 ? 1 : 0);
    expect(result.current.combatImpactIds.has("perm-dead")).toBe(true);
    await advance(COMBAT_IMPACT_TOTAL_MS - 1);
    expect(result.current.deleteBursts).toHaveLength(0);
    await advance(1);
    expect(result.current.fieldClash).toBeNull();
    expect(result.current.deleteBursts).toHaveLength(1);
  });

  it.each([true, false])(
    "holds clauses and shards for a late painted impact (known defender: %s)",
    async (knownDefender) => {
      const descriptor = Object.getOwnPropertyDescriptor(document, "timeline");
      const root = document.createElement("div");
      root.dataset.combatImpact = "true";
      root.dataset.permanentId = "perm-dead";
      document.body.append(root);
      const start = Date.now() + 64;
      Object.defineProperty(document, "timeline", {
        configurable: true,
        value: {
          get currentTime() {
            return Date.now();
          },
        },
      });
      root.getAnimations = () => [
        {
          animationName: "battle-claw",
          startTime: start,
          currentTime: 250,
          playState: "finished",
          effect: { getTiming: () => ({ delay: 0 }) },
        } as unknown as Animation,
      ];
      try {
        const { result, rerender } = renderCues([], undefined, false, undefined, {
          ...anchors,
          attackArrowClock: () => ({ key: "attack:1:perm-1", elapsedMs: 380, remainingMs: 0, observedAtMs: 0 }),
        });
        await advance(0);
        const declare: ServerEvent = {
          ...ATTACK,
          target: { kind: "permanent", permanentId: "perm-dead" },
          targetCardId: "BT1-020",
        };
        const trigger: ServerEvent = {
          kind: "effectTriggered",
          seat: 1,
          sourceCardId: "BT1-010",
          effectKey: "late-impact:onDeletion",
          timing: "OnDeletion",
          description: "Draw 1 card.",
        };
        rerender([...(knownDefender ? [declare] : []), trigger, COMBAT]);
        await advance(COMBAT_IMPACT_TOTAL_MS);
        expect(result.current.fieldClash === null).toBe(!knownDefender);
        expect(result.current.combatImpactIds.has("perm-dead")).toBe(true);
        expect(result.current.notices).toHaveLength(0);
        expect(result.current.deleteBursts).toHaveLength(0);
        await advance(63);
        expect(result.current.notices).toHaveLength(0);
        await advance(1);
        expect(result.current.fieldClash).toBeNull();
        expect(result.current.notices).toHaveLength(1);
        expect(result.current.deleteBursts).toHaveLength(1);
      } finally {
        root.remove();
        if (descriptor) Object.defineProperty(document, "timeline", descriptor);
        else Reflect.deleteProperty(document, "timeline");
      }
    },
  );

  it("finishes a Raid field battle before a Piercing security battle", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    const redirect: ServerEvent = {
      kind: "attackDeclared",
      seat: 1,
      attackerPermanentId: "perm-1",
      attackerCardId: "BT1-010",
      target: { kind: "permanent", permanentId: "perm-dead" },
      targetCardId: "BT1-020",
      redirected: true,
    };
    const battleDeletion: ServerEvent = {
      kind: "cardsMoved",
      instanceIds: ["dead-card"],
      from: "battleArea",
      to: "trash",
      battleDeletion: true,
      deletedPermanents: [{ permanentId: "perm-dead", instanceId: "dead-card", cardId: "BT1-020", seat: 0 }],
    };
    const piercingReveal: ServerEvent = {
      ...REVEAL,
      isDigimon: true,
      attackerDP: 8_000,
      securityCardDP: 3_000,
    };

    rerender([ATTACK]);
    await advance(0);
    rerender([ATTACK, redirect]);
    await advance(0);
    rerender([ATTACK, redirect, battleDeletion]);
    await advance(0);
    expect(result.current.fieldClash).not.toBeNull();

    rerender([ATTACK, redirect, battleDeletion, piercingReveal]);
    await advance(0);
    expect(result.current.fieldClash).not.toBeNull();
    expect(result.current.securityBreak).toBeNull();
    expect(result.current.securityClash).toBeNull();

    await advance(FIELD_CLASH_TOTAL_MS + 16);
    expect(result.current.fieldClash).toBeNull();
    expect(result.current.securityBreak).not.toBeNull();

    await advance(SECURITY_BREAK_TOTAL_MS);
    expect(result.current.securityClash?.attacker).toMatchObject({ cardId: "BT1-010" });
  });

  it("holds a battle's effect notices until the blow has landed", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    const declare: ServerEvent = {
      kind: "attackDeclared",
      seat: 1,
      attackerPermanentId: "perm-1",
      attackerCardId: "BT1-010",
      target: { kind: "permanent", permanentId: "perm-dead" },
      targetCardId: "BT1-020",
    };
    // The server holds `combatResolved` until the attack ends, so the deletion trigger it
    // fired reaches the client ahead of the event the battle scene is cut from.
    const triggered: ServerEvent = {
      kind: "effectTriggered",
      seat: 1,
      sourceCardId: "BT1-010",
      effectKey: "BT1-010:onDeletion",
      timing: "OnDeletion",
      description: "Draw 1 card.",
    };
    rerender([declare, triggered, COMBAT]);
    await advance(0);
    expect(result.current.notices).toEqual([]);

    await advance(FIELD_CLASH_IMPACT_AT_MS);
    expect(result.current.notices).toEqual([]);

    await advance(COMBAT_IMPACT_TOTAL_MS);
    expect(result.current.notices).toHaveLength(1);
    expect(result.current.notices[0]).toMatchObject({
      body: { variant: "effect", cardId: "BT1-010" },
    });
  });

  it("bursts for an effect that trashes a permanent off the field", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([
      {
        kind: "cardsMoved",
        instanceIds: ["perm-dead"],
        from: "battleArea",
        to: "trash",
        deletedPermanents: [
          {
            permanentId: "perm-dead",
            instanceId: "perm-dead",
            cardId: "BT1-010",
            seat: 1,
          },
        ],
      },
    ]);
    await advance(0);
    expect(result.current.deleteBursts).toHaveLength(1);
  });

  it("deduplicates the battle and movement cues, while prevented deletion earns neither", async () => {
    const { result, rerender } = renderCues();
    await advance(0);
    rerender([
      COMBAT,
      {
        kind: "cardsMoved",
        instanceIds: ["perm-dead"],
        from: "battleArea",
        to: "trash",
        deletedPermanents: [
          {
            permanentId: "perm-dead",
            instanceId: "perm-dead",
            cardId: "BT1-020",
            seat: 1,
          },
        ],
      },
    ]);
    await advance(COMBAT_IMPACT_TOTAL_MS);
    expect(result.current.deleteBursts).toHaveLength(1);
    expect(result.current.notices.filter((notice) => notice.body.variant === "deletion")).toHaveLength(1);

    await advance(NOTICE_ITEM_MS);
    rerender([{ ...COMBAT, deletedPermanentIds: [] }]);
    await advance(0);
    expect(result.current.deleteBursts).toEqual([]);
    expect(result.current.notices.filter((notice) => notice.body.variant === "deletion")).toHaveLength(0);
  });

  it.each(["combat-first", "movement-first"] as const)(
    "deduplicates deletion cues when the battle and movement arrive in separate batches (%s)",
    async (order) => {
      const { result, rerender } = renderCues();
      await advance(0);
      const movement: ServerEvent = {
        kind: "cardsMoved",
        instanceIds: ["perm-dead"],
        from: "battleArea",
        to: "trash",
        deletedPermanents: [
          {
            permanentId: "perm-dead",
            instanceId: "perm-dead",
            cardId: "BT1-020",
            seat: 1,
          },
        ],
      };
      if (order === "combat-first") {
        rerender([COMBAT]);
        await advance(COMBAT_IMPACT_TOTAL_MS + TIMINGS.cardBurst);
        rerender([COMBAT, movement]);
        await advance(0);
      } else {
        rerender([movement]);
        await advance(TIMINGS.cardBurst);
        rerender([movement, COMBAT]);
        await advance(COMBAT_IMPACT_TOTAL_MS);
      }
      expect(result.current.deleteBursts).toEqual([]);
    },
  );

  it("sweeps the unsuspend phase across the turn player's board", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([UNSUSPEND_PHASE]);
    await advance(0);
    expect(result.current.unsuspendSweep?.seat).toBe(0);

    await advance(TIMINGS.suspendRotate + 8 * TIMINGS.suspendStagger);
    expect(result.current.unsuspendSweep).toBeNull();
  });

  it("plays no combat animation for the history a reconnect replays", async () => {
    const { result } = renderCues([ATTACK, EFFECT_CHECK, COMBAT, UNSUSPEND_PHASE]);
    await advance(0);

    expect(result.current.securityBreak).toBeNull();
    expect(result.current.securityBranch).toBeNull();
    expect(result.current.securityClash).toBeNull();
    expect(result.current.securityHitSeat).toBeNull();
    expect(result.current.deleteBursts).toEqual([]);
    expect(result.current.unsuspendSweep).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("restarts a cue rather than letting the outgoing one clear the new state", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([CHECK]);
    await advance(SECURITY_BREAK_TOTAL_MS + CLASH_TOTAL_MS - 100);
    const first = result.current.securityClash?.key;

    rerender([CHECK, SECOND_CHECK]);
    await advance(SECURITY_BREAK_TOTAL_MS + 100);
    expect(result.current.securityClash?.revealed.cardId).toBe("BT1-011");
    expect(result.current.securityClash?.key).not.toBe(first);

    await advance(CLASH_TOTAL_MS);
    expect(result.current.securityClash).toBeNull();
  });

  it("plays one sound per cue and hands a rejection to the caller's toast", async () => {
    const onActionRejected = vi.fn<(reason: string) => void>();
    const { rerender } = renderCues([], onActionRejected);
    await advance(0);

    rerender([TURN_END, { kind: "actionRejected", intent: "playCard", reason: "notYourTurn" }]);
    await advance(0);

    expect(playSound).toHaveBeenCalledWith("turnChange");
    expect(onActionRejected).toHaveBeenCalledWith("notYourTurn");
  });
});

describe("zone-change showcases", () => {
  it("holds the opponent's card centre-screen, then reveals it on its burst", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([OPP_PLAY]);
    await advance(0);
    expect(result.current.zoneShowcase).toMatchObject({ cardId: "BT1-010" });
    // The destination stays hidden while the card is being announced.
    expect(result.current.pendingPermanentIds.has("perm-9")).toBe(true);
    expect(result.current.permanentBursts.has("perm-9")).toBe(false);

    await advance(SHOWCASE_TOTAL_MS);
    expect(result.current.zoneShowcase).toBeNull();
    expect(result.current.pendingPermanentIds.has("perm-9")).toBe(false);
    expect(result.current.permanentBursts.get("perm-9")).toMatchObject({
      variant: "play",
    });

    await advance(TIMINGS.cardBurst);
    expect(result.current.permanentBursts.has("perm-9")).toBe(false);
  });

  it("reveals the viewer's accepted play before lighting its field slot", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([YOUR_PLAY]);
    await advance(0);
    expect(result.current.zoneShowcase).toMatchObject({ mine: true, kind: "play" });
    expect(result.current.pendingPermanentIds.has("perm-8")).toBe(true);
    expect(result.current.permanentBursts.size).toBe(0);
    await advance(SHOWCASE_TOTAL_MS);
    expect(result.current.zoneShowcase).toBeNull();
    expect(result.current.pendingPermanentIds.size).toBe(0);
    expect(result.current.permanentBursts.get("perm-8")).toMatchObject({
      variant: "play",
    });
  });

  it("holds the opponent's digivolution centre-screen like a play, then bursts the stack", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([
      {
        kind: "digivolved",
        seat: 1,
        permanentId: "perm-9",
        cardId: "BT1-011",
        mechanic: "normal",
      },
    ]);
    await advance(0);
    expect(result.current.zoneShowcase).toMatchObject({
      cardId: "BT1-011",
      kind: "digivolve",
    });
    // The destination stays hidden while the card is being announced.
    expect(result.current.pendingPermanentIds.has("perm-9")).toBe(true);
    expect(result.current.permanentBursts.has("perm-9")).toBe(false);

    await advance(SHOWCASE_TOTAL_MS);
    expect(result.current.zoneShowcase).toBeNull();
    expect(result.current.pendingPermanentIds.has("perm-9")).toBe(false);
    expect(result.current.permanentBursts.get("perm-9")).toMatchObject({
      variant: "evolve",
    });

    await advance(TIMINGS.cardBurst);
    expect(result.current.permanentBursts.has("perm-9")).toBe(false);
  });

  it("burns over a digivolution and opens the breeding slot on a hatch", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([{ kind: "hatched", seat: 0, permanentId: "perm-egg", cardId: "ST1-01" }]);
    await advance(0);
    expect(result.current.permanentBursts.get("perm-egg")).toMatchObject({
      variant: "hatch",
      inBreeding: true,
    });

    rerender([
      { kind: "hatched", seat: 0, permanentId: "perm-egg", cardId: "ST1-01" },
      {
        kind: "digivolved",
        seat: 0,
        permanentId: "perm-egg",
        cardId: "ST1-03",
        mechanic: "normal",
      },
    ]);
    await advance(0);
    // Later arrivals preserve the prior beat (and any prelude queued after it).
    expect(result.current.permanentBursts.get("perm-egg")).toMatchObject({
      variant: "hatch",
    });
    await advance(TIMINGS.cardBurst);
    expect(result.current.permanentBursts.get("perm-egg")).toMatchObject({
      variant: "evolve",
    });
  });

  it("plays nothing for the history a reconnect replays", async () => {
    const { result } = renderCues([
      OPP_PLAY,
      {
        kind: "digivolved",
        seat: 1,
        permanentId: "p",
        cardId: "BT1-011",
        mechanic: "normal",
      },
    ]);
    await advance(0);

    expect(result.current.zoneShowcase).toBeNull();
    expect(result.current.pendingPermanentIds.size).toBe(0);
    expect(result.current.permanentBursts.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never lets a security check paint over a showcase", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([OPP_PLAY]);
    await advance(0);
    expect(result.current.zoneShowcase).not.toBeNull();

    // The clash replaces the shared centre-stage track, and the showcase clears
    // itself rather than leaving the permanent hidden behind it.
    rerender([OPP_PLAY, CHECK]);
    await advance(0);
    expect(result.current.zoneShowcase).toBeNull();
    expect(result.current.pendingPermanentIds.size).toBe(0);
    expect(result.current.securityBreak).not.toBeNull();

    await advance(SECURITY_BREAK_TOTAL_MS);
    expect(result.current.securityClash).not.toBeNull();
  });

  it("announces the opponent's play in a side panel when the showcase is dropped", async () => {
    // A hidden tab drains the queue, so the centre-stage hold never plays and the panel
    // becomes the only thing that says the opponent played anything.
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    try {
      const { result, rerender } = renderCues();
      await advance(0);

      rerender([OPP_PLAY]);
      await advance(0);

      expect(result.current.zoneShowcase).toBeNull();
      expect(result.current.sidePanels).toEqual([
        expect.objectContaining({ titleKey: "panel.playedCard", side: "opp" }),
      ]);
    } finally {
      hidden.mockRestore();
    }
  });

  it("leaves the play to the showcase alone while it can still play", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([OPP_PLAY]);
    await advance(0);

    expect(result.current.zoneShowcase).not.toBeNull();
    expect(result.current.sidePanels).toEqual([]);
  });

  it("fast-forwards the hold when the player clicks through it", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([OPP_PLAY]);
    await advance(0);
    act(() => result.current.skipAnimations());
    await advance(0);
    // Fast-forward means the end state, so the hold and the burst are both spent.
    expect(result.current.zoneShowcase).toBeNull();
    expect(result.current.pendingPermanentIds.size).toBe(0);
    expect(result.current.permanentBursts.has("perm-9")).toBe(false);
  });
});

describe("notices", () => {
  const EFFECT: ServerEvent = {
    kind: "effectTriggered",
    seat: 0,
    sourceCardId: "BT1-010",
    effectKey: "k",
    description: "Draw 1.",
    timing: "OnPlay",
  };

  it("opens nothing for the history a reconnect replays", async () => {
    const { result } = renderCues([EFFECT, { kind: "securityRecovered", seat: 0, amount: 1 }]);
    await advance(0);
    expect(result.current.notices).toEqual([]);
  });

  it("holds a live notice for its full reading time", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([EFFECT]);
    await advance(0);
    expect(result.current.notices).toHaveLength(1);

    await advance(TIMINGS.noticeLifetime - 1);
    expect(result.current.notices).toHaveLength(1);
    await advance(1);
    expect(result.current.notices).toEqual([]);
  });

  it("does not repeat Wide Plasment's Recovery after its effect clause already names it", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([
      {
        kind: "effectTriggered",
        seat: 0,
        sourceCardId: "BT26-033",
        effectKey: "BT26-033/ir-4",
        description: "[Main] Delete all of your opponent's lowest DP Digimon. Then, ＜Recovery +1＞.",
        timing: "Main",
      },
      { kind: "securityRecovered", seat: 0, amount: 1 },
    ]);
    await advance(0);

    expect(result.current.notices).toHaveLength(1);
    expect(result.current.notices[0]).toMatchObject({
      body: { variant: "effect", cardId: "BT26-033", description: expect.stringContaining("Recovery +1") },
    });
  });

  it("keeps an accepted notice's reading clock running while the viewer decides", async () => {
    const { result, rerender } = renderCuesAwaitingAnswer();
    await advance(0);

    rerender({ events: [EFFECT], decisionPending: false });
    await advance(0);
    expect(result.current.notices).toHaveLength(1);

    // A question halfway through reading does not extend the toast's lifetime.
    await advance(TIMINGS.noticeLifetime / 2);
    rerender({
      events: [EFFECT],
      decisionPending: true,
      decisionStateVersion: 1,
    });
    await advance(TIMINGS.noticeLifetime / 2 - 1);
    expect(result.current.notices).toHaveLength(1);
    await advance(1);
    expect(result.current.notices).toEqual([]);
  });

  it("holds the memory gauge until the clause that moved it has been read", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([EFFECT, { kind: "memoryChanged", from: 3, to: 4, reason: "gainMemory" }]);
    expect(result.current.heldMemory?.memory).toBe(3);

    // A toast on screen is not yet a toast read: the gauge waits out its reading beat, so
    // the sentence lands before the consequence it explains.
    await advance(NARRATION_TICK_MS);
    expect(result.current.notices).toHaveLength(1);
    expect(result.current.heldMemory?.memory).toBe(3);

    await advance(TIMINGS.effectAnnounce + NARRATION_TICK_MS);
    expect(result.current.heldMemory).toBeUndefined();
  });

  it("pins the side the held gauge is read from, so a later turn change cannot flip it", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([EFFECT, { kind: "memoryChanged", from: 1, to: -1, reason: "gainMemory" }]);
    expect(result.current.heldMemory).toMatchObject({ memory: 1, turnSeat: 0 });

    // The turn passes in the batch behind it, which is what the raw gauge is signed for.
    rerender([
      EFFECT,
      { kind: "memoryChanged", from: 1, to: -1, reason: "gainMemory" },
      { kind: "turnEnded", endingSeat: 0, nextSeat: 1, turnCount: 2 },
    ]);
    expect(result.current.heldMemory).toMatchObject({ memory: 1, turnSeat: 0 });
  });

  it("pays a play cost at once rather than holding it behind the card's clause", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([{ kind: "memoryChanged", from: 5, to: 2, reason: "playCard" }, YOUR_PLAY, EFFECT]);
    expect(result.current.heldMemory).toBeUndefined();
  });

  it("mirrors an effect the security check raised", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([
      {
        kind: "securityChecked",
        seat: 0,
        revealedCardId: "BT1-010",
        resolution: "effect",
      },
      EFFECT,
    ]);
    await advance(EFFECT_CHECK_NOTICE_AT_MS);
    expect(result.current.notices[0]?.fromSecurity).toBe(true);
  });

  // The reported bug: the card's effect was read out while the card itself was still
  // behind the shield, so the viewer was told what a card they had not seen just did.
  it("says nothing about the revealed card until the card has been shown", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([REVEAL, EFFECT, EFFECT_CHECK]);
    await advance(0);
    expect(result.current.notices).toEqual([]);

    // Still nothing while the shield is breaking, while the two cards are held, and
    // while the revealed card is still sliding to the side it reads out from.
    await advance(EFFECT_CHECK_NOTICE_AT_MS - 1);
    expect(result.current.notices).toEqual([]);

    await advance(1);
    expect(result.current.notices).toHaveLength(1);
    expect(result.current.securityBranch).not.toBeNull();
  });

  const CHECK_OWNED_EFFECT: ServerEvent = {
    ...EFFECT,
    duringSecurityCheck: true,
  };

  // The reported bug's other half: the effect a check fires is announced before the
  // `securityChecked` that closes the check, and a decision inside the effect delivers
  // the two in separate batches — so the effect used to read out ahead of the clash.
  // The reveal is what it waits for now, not the close: the card is on screen long
  // before the server is done with it.
  it("holds a mid-check effect announced ahead of its check until the reveal has played", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([REVEAL, CHECK_OWNED_EFFECT]);
    await advance(REVEAL_EXIT_AT_MS - 1);
    expect(result.current.notices).toEqual([]);

    await advance(1);
    expect(result.current.notices).toHaveLength(1);
    expect(result.current.notices[0]?.fromSecurity).toBe(true);
  });

  it("reads a check-owned effect that arrives while the scene is still playing after the reveal", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([REVEAL]);
    await advance(TIMINGS.securityArm);

    rerender([REVEAL, CHECK_OWNED_EFFECT]);
    await advance(REVEAL_EXIT_AT_MS - TIMINGS.securityArm - 1);
    expect(result.current.notices).toEqual([]);

    await advance(1);
    expect(result.current.notices).toHaveLength(1);
  });

  // With the reveal announced on its own event there is never a mid-check effect ahead of
  // the card it describes, so one that arrives with no reveal holding the screen has
  // nothing left to wait for.
  it("raises a mid-check effect at once when no reveal is holding the screen", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([CHECK_OWNED_EFFECT]);
    await advance(0);
    expect(result.current.notices).toHaveLength(1);
  });

  it("still says what a superseded check did before the next one takes the screen", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([REVEAL, EFFECT]);
    await advance(TIMINGS.securityArm);
    expect(result.current.notices).toEqual([]);

    // A second strike replaces the centre of the screen. A dropped animation is a
    // shrug; a dropped effect description is information the viewer never gets back.
    rerender([REVEAL, EFFECT, SECOND_REVEAL]);
    await advance(0);
    expect(result.current.notices).toHaveLength(1);
  });

  it("lets the showcase finish before an On Play notice talks over it", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([OPP_PLAY, EFFECT]);
    await advance(0);
    expect(result.current.notices).toEqual([]);

    await advance(SHOWCASE_TOTAL_MS);
    expect(result.current.notices).toHaveLength(1);
    // The notice is raised late, so its reading clock starts late too.
    await advance(TIMINGS.noticeLifetime - 1);
    expect(result.current.notices).toHaveLength(1);
  });

  const XROS_PLAY: ServerEvent = {
    kind: "cardPlayed",
    seat: 0,
    cardId: "BT10-066",
    permanentId: "perm-7",
    mechanic: "digiXros",
  };

  it("calls out a DigiXros the moment the played card lands", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([XROS_PLAY]);
    await advance(0);
    expect(result.current.notices[0]?.body).toEqual({
      variant: "keyword",
      keyword: "digiXros",
      cardId: "BT10-066",
    });
  });

  it("calls out a DigiXros at once when its [On Play] arrives in the next batch", async () => {
    // Live, the server closes the play and the [On Play] announcement as separate batches in
    // the same tick. The call-out once waited on that later announcement's gate, which sat
    // behind it on the same serial track, so it only appeared after the 5 s ceiling.
    const xrosOnPlay: ServerEvent = {
      kind: "effectTriggered",
      seat: 0,
      sourceCardId: "BT10-066",
      effectKey: "onPlay",
      description: "<De-Digivolve 1> 1 of your opponent's Digimon.",
      timing: "On Play",
    };
    // DarkKnightmon is on the viewer's field, so its [On Play] clause queues on the same
    // centre-stage track as the call-out.
    const board = {
      players: [
        {
          battleArea: [{ permanentId: "perm-7", topCard: { cardId: "BT10-066", instanceId: "xros-top" }, stack: [] }],
          trash: [],
          hand: [],
        },
        { battleArea: [], trash: [], hand: [] },
      ],
    } as unknown as GameState;
    const feed = batchFeed();
    const { result, rerender } = renderHook(
      (batches: readonly ServerBatch[]) =>
        useMatchCues({
          narrationLimit: 3,
          batches,
          state: board,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors,
          onActionRejected: vi.fn<(reason: string) => void>(),
        }),
      { initialProps: feed([]) },
    );
    await advance(0);

    rerender(feed([XROS_PLAY]));
    rerender(feed([XROS_PLAY, xrosOnPlay]));
    await advance(SHOWCASE_TOTAL_MS);
    expect(result.current.notices.map((notice) => notice.body.variant)).toContain("keyword");
  });

  it("stays quiet for an ordinary play", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([YOUR_PLAY]);
    await advance(0);
    expect(result.current.notices).toEqual([]);
  });

  it("calls out nothing for the history a reconnect replays", async () => {
    const { result } = renderCues([XROS_PLAY, TURN_END]);
    await advance(0);
    expect(result.current.notices).toEqual([]);
    expect(result.current.turnTransition).toBeNull();
  });

  it("raises a rejection notice on demand", async () => {
    const { result } = renderCues();
    await advance(0);

    act(() => result.current.raiseRejection("Not enough memory."));
    expect(result.current.notices[0]?.body).toEqual({
      variant: "rejection",
      reason: "Not enough memory.",
    });
  });
});

describe("server-named signals", () => {
  it("riffles exactly the pile the server said it shuffled", async () => {
    const { result, rerender } = renderCues();
    await advance(0);
    rerender([SHUFFLE]);
    await advance(1);
    expect([...result.current.deckRiffles.keys()]).toEqual(["1:eggDeck"]);
    await advance(TIMINGS.deckRiffle + 10);
    expect(result.current.deckRiffles.size).toBe(0);
  });

  it("no longer riffles for cards merely returning to a deck", async () => {
    const { result, rerender } = renderCues();
    await advance(0);
    rerender([RETURN_TO_DECK]);
    await advance(1);
    expect(result.current.deckRiffles.size).toBe(0);
  });

  it("carries the server's DP compare onto the clash scene, in either direction", async () => {
    const { result, rerender } = renderCues([ATTACK]);
    await advance(0);
    rerender([
      ATTACK,
      {
        ...CHECK,
        battle: { attackerDeleted: false, securityDigimonDeleted: true },
      } as ServerEvent,
    ]);
    await advance(SECURITY_BREAK_TOTAL_MS + 1);
    expect(result.current.securityClash?.loser).toEqual({
      attacker: false,
      revealed: true,
    });
  });

  it("leaves the clash outcome unmarked when the server published no compare", async () => {
    const { result, rerender } = renderCues([ATTACK]);
    await advance(0);
    rerender([ATTACK, CHECK]);
    await advance(SECURITY_BREAK_TOTAL_MS + 1);
    expect(result.current.securityClash?.loser).toBeUndefined();
  });
});

describe("security a card effect trashes", () => {
  it("finishes a security payment before presenting the following Piercing check", async () => {
    const payment: ServerEvent = {
      kind: "cardsMoved",
      instanceIds: ["paid-security"],
      from: "security",
      to: "trash",
      cardIds: ["BT1-010"],
      seat: 0,
    };
    const { result, rerender } = renderCues();
    await advance(0);
    rerender([payment]);
    await advance(100);
    rerender([payment, SECOND_REVEAL, SECOND_CHECK]);
    await advance(SECURITY_BREAK_TOTAL_MS - 100);
    expect(result.current.securityClash?.cause).toBe("destruction");
    expect(result.current.securityClash?.revealed.cardId).toBe("BT1-010");
    await advance(SECURITY_DESTROY_TOTAL_MS + SECURITY_BREAK_TOTAL_MS);
    expect(result.current.securityClash?.revealed.cardId).toBe("BT1-011");
    await advance(CLASH_TOTAL_MS + TIMINGS.securityCardExit);
  });

  it("plays one scene per card, naming each card the stack lost", async () => {
    const { result, rerender } = renderCuesOverBoard(TRASHED_SECURITY_BOARD);
    await advance(0);
    rerender([SECURITY_TRASHED]);

    await advance(SECURITY_BREAK_TOTAL_MS);
    expect(result.current.securityClash?.revealed.cardId).toBe("BT1-010");
    expect(result.current.securityClash?.cause).toBe("destruction");

    // The second card gets the whole sequence again rather than sharing the first's scene.
    await advance(SECURITY_DESTROY_TOTAL_MS + SECURITY_BREAK_TOTAL_MS);
    expect(result.current.securityClash?.revealed.cardId).toBe("BT1-011");

    await advance(SECURITY_DESTROY_TOTAL_MS);
    expect(result.current.securityClash).toBeNull();
  });

  // Lamiamon (BT24-016) trashes the opponent's top security card and then fires several
  // triggers at once: the dialog asking their order must not cover the trashed card.
  it("keeps a question the same batch carries behind the last card's scene", async () => {
    const feed = batchFeed();
    const { result, rerender: rerenderBatches } = renderHook(
      ({ batches, decisionPending }: { batches: readonly ServerBatch[]; decisionPending: boolean }) =>
        useMatchCues({
          narrationLimit: 3,
          batches,
          state: TRASHED_SECURITY_BOARD,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          decisionPending,
          anchors,
          onActionRejected: vi.fn<(reason: string) => void>(),
        }),
      {
        initialProps: {
          batches: [] as readonly ServerBatch[],
          decisionPending: false,
        },
      },
    );
    const rerender = ({ events, decisionPending }: { events: readonly ServerEvent[]; decisionPending: boolean }) =>
      rerenderBatches({ batches: feed(events), decisionPending });
    await advance(0);
    expect(result.current.securityRevealPending).toBe(false);

    rerender({ events: [SECURITY_TRASHED], decisionPending: true });
    await advance(0);
    expect(result.current.securityRevealPending).toBe(true);

    const bothCardsMs = 2 * (SECURITY_BREAK_TOTAL_MS + SECURITY_DESTROY_TOTAL_MS);
    await advance(bothCardsMs - 1);
    expect(result.current.securityRevealPending).toBe(true);
    expect(result.current.securityClash?.revealed.cardId).toBe("BT1-011");

    await advance(1);
    expect(result.current.securityRevealPending).toBe(false);
    expect(result.current.securityClash).toBeNull();
  });

  it("breaks the shield of the stack that lost the cards, once per card", async () => {
    const { result, rerender } = renderCuesOverBoard(TRASHED_SECURITY_BOARD);
    await advance(0);
    rerender([SECURITY_TRASHED]);

    await advance(TIMINGS.securityArm);
    expect(result.current.securityBreak).toMatchObject({
      seat: 1,
      phase: "break",
    });

    // The same shield arms and breaks again for the second card rather than staying broken
    // through both, so a stack losing several cards is seen losing each one.
    const first = result.current.securityBreak?.key;
    await advance(SECURITY_BREAK_TOTAL_MS + SECURITY_DESTROY_TOTAL_MS - TIMINGS.securityArm);
    expect(result.current.securityBreak).toMatchObject({
      seat: 1,
      phase: "arm",
    });
    expect(result.current.securityBreak?.key).not.toBe(first);

    await advance(TIMINGS.securityArm);
    expect(result.current.securityBreak).toMatchObject({
      seat: 1,
      phase: "break",
    });
  });

  // The reported bug: a chained effect (Medusamon's Petrification tokens) delivers one
  // trash per event batch, and each new batch's shield break replaced the centre of the
  // screen — cancelling the previous card's still-playing scene.
  it("queues a later batch's trash behind the scene the first batch is still playing", async () => {
    const trashOf = (instanceId: string, cardId: string): ServerEvent => ({
      kind: "cardsMoved",
      instanceIds: [instanceId],
      from: "security",
      to: "trash",
      cardIds: [cardId],
      seat: 1,
    });
    const first = trashOf("i-a", "BT1-010");
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([first]);
    await advance(SECURITY_BREAK_TOTAL_MS);
    expect(result.current.securityClash?.revealed.cardId).toBe("BT1-010");

    // The second trash arrives while the first card's scene is on screen.
    rerender([first, trashOf("i-b", "BT1-011")]);
    await advance(0);
    expect(result.current.securityClash?.revealed.cardId).toBe("BT1-010");

    // The first scene runs its full clock, and only then does the second play.
    await advance(SECURITY_DESTROY_TOTAL_MS + SECURITY_BREAK_TOTAL_MS);
    expect(result.current.securityClash?.revealed.cardId).toBe("BT1-011");

    await advance(SECURITY_DESTROY_TOTAL_MS);
    expect(result.current.securityClash).toBeNull();
  });

  // The other half of the reported bug: the movement event outruns the state patch, so
  // the board index cannot name the card yet. The event's own identities carry the scene.
  it("plays the scene from the event's identities before the board has the card", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([
      {
        kind: "cardsMoved",
        instanceIds: ["i-not-in-any-index"],
        from: "security",
        to: "trash",
        cardIds: ["BT1-010"],
        seat: 1,
      },
    ]);
    await advance(SECURITY_BREAK_TOTAL_MS);
    expect(result.current.securityClash?.revealed.cardId).toBe("BT1-010");
    expect(result.current.securityClash?.cause).toBe("destruction");
  });
});

describe("the figure a shield shows", () => {
  it("keeps the card the board dropped until the reveal has put it on screen", async () => {
    const { result, rerender } = renderCuesOverBoard(STACKED_SECURITY_BOARD);
    await advance(0);
    rerender([ATTACK, REVEAL]);

    // The shield breaks first; the stack is still five while it does.
    await advance(SECURITY_BREAK_TOTAL_MS);
    expect(result.current.heldSecurityCounts.get(0)).toBe(5);

    await advance(CLASH_REVEAL_SHOWN_AT_MS);
    expect(result.current.heldSecurityCounts.get(0)).toBeUndefined();
  });

  it("drops one figure per card an effect trashes, as each card breaks", async () => {
    const { result, rerender } = renderCuesOverBoard(STACKED_SECURITY_BOARD);
    await advance(0);
    rerender([SECURITY_TRASHED]);

    await advance(SECURITY_BREAK_TOTAL_MS);
    expect(result.current.heldSecurityCounts.get(1)).toBe(5);

    // The first card breaks, so the shield gives up one — the second is still owed.
    await advance(SECURITY_DESTROY_OUTCOME_AT_MS);
    expect(result.current.heldSecurityCounts.get(1)).toBe(4);

    await advance(SECURITY_DESTROY_TOTAL_MS - SECURITY_DESTROY_OUTCOME_AT_MS + SECURITY_BREAK_TOTAL_MS);
    expect(result.current.heldSecurityCounts.get(1)).toBe(4);

    await advance(SECURITY_DESTROY_OUTCOME_AT_MS);
    expect(result.current.heldSecurityCounts.get(1)).toBeUndefined();
  });

  it("hands the figure back when a newer scene takes the board off the one holding it", async () => {
    const { result, rerender } = renderCuesOverBoard(STACKED_SECURITY_BOARD);
    await advance(0);
    rerender([ATTACK, REVEAL]);
    await advance(TIMINGS.securityArm);
    expect(result.current.heldSecurityCounts.get(0)).toBe(5);

    rerender([ATTACK, REVEAL, SECOND_REVEAL, SECOND_CHECK]);
    await advance(SECURITY_BREAK_TOTAL_MS + CLASH_TOTAL_MS);
    expect(result.current.heldSecurityCounts.get(0)).toBeUndefined();
  });
});

describe("security gains", () => {
  function boardWithSecurity(you: number, opp: number, stateVersion?: number): GameState {
    return {
      ...(stateVersion === undefined ? {} : { stateVersion }),
      players: [
        { battleArea: [], trash: [], hand: [], securityCount: you },
        { battleArea: [], trash: [], hand: [], securityCount: opp },
      ],
    } as unknown as GameState;
  }

  /** The same hook, with the board as a second input so a patch can land between batches. */
  function renderCuesOverGrowingBoard(initialState: GameState) {
    const feed = batchFeed();
    const view = renderHook(
      ({ batches, state }: { batches: readonly ServerBatch[]; state: GameState }) =>
        useMatchCues({
          narrationLimit: 3,
          batches,
          state,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors,
          onActionRejected: vi.fn<(reason: string) => void>(),
        }),
      {
        initialProps: {
          batches: [] as readonly ServerBatch[],
          state: initialState,
        },
      },
    );
    return {
      ...view,
      rerender: ({ events, state }: { events: readonly ServerEvent[]; state: GameState }) =>
        view.rerender({ batches: feed(events), state }),
    };
  }

  it("flies the card onto the stack and announces a growth an effect caused", async () => {
    const { result, rerender } = renderCuesOverGrowingBoard(boardWithSecurity(5, 5));
    await advance(0);

    rerender({ events: [], state: boardWithSecurity(6, 5) });
    await advance(0);
    expect(result.current.securityFlights.has(VIEWER)).toBe(true);
    expect(result.current.notices).toHaveLength(1);
    expect(result.current.notices[0]).toMatchObject({
      side: "you",
      body: { variant: "securityGain", amount: 1 },
    });

    await advance(TIMINGS.securityFlight);
    expect(result.current.securityFlights.has(VIEWER)).toBe(false);
  });

  it("announces the opponent's growth on the opponent's side", async () => {
    const { result, rerender } = renderCuesOverGrowingBoard(boardWithSecurity(5, 5));
    await advance(0);

    rerender({ events: [], state: boardWithSecurity(5, 7) });
    await advance(0);
    expect(result.current.securityFlights.has(1)).toBe(true);
    expect(result.current.notices[0]).toMatchObject({
      side: "opp",
      body: { variant: "securityGain", amount: 2 },
    });
  });

  it("leaves a growth a recovery announced to the recovery", async () => {
    const { result, rerender } = renderCuesOverGrowingBoard(boardWithSecurity(5, 5));
    await advance(0);

    rerender({
      events: [{ kind: "securityRecovered", seat: VIEWER, amount: 1 }],
      state: boardWithSecurity(6, 5),
    });
    await advance(0);
    expect(result.current.notices.map((notice) => notice.body.variant)).toEqual(["recovery"]);
  });

  it("keeps a recovery claim until its later state patch arrives", async () => {
    const { result, rerender } = renderCuesOverGrowingBoard(boardWithSecurity(5, 5, 0));
    await advance(0);

    rerender({
      events: [{ kind: "securityRecovered", seat: VIEWER, amount: 1 }],
      state: boardWithSecurity(5, 5, 0),
    });
    await advance(0);

    rerender({
      events: [
        { kind: "securityRecovered", seat: VIEWER, amount: 1 },
        { kind: "memoryChanged", from: 2, to: -2, reason: "playCard" },
      ],
      state: boardWithSecurity(6, 5, 2),
    });
    await advance(0);

    expect(result.current.notices.map((notice) => notice.body.variant)).toEqual(["recovery"]);
  });

  it("leaves a growth to the recovery still waiting to be presented when the patch lands first", async () => {
    // Over the wire the recovery event travels first, the state patch next, and the batch
    // close last. The patch therefore renders while the batch is still open: the stack has
    // grown, and the event that explains it is in the raw stream but not yet in a batch.
    const recovery = singleServerBatch([{ kind: "securityRecovered", seat: VIEWER, amount: 1 }], 1);
    const { result, rerender } = renderHook(
      ({
        batches,
        phaseEvents,
        state,
      }: {
        batches: readonly ServerBatch[];
        phaseEvents: readonly ServerEvent[];
        state: GameState;
      }) =>
        useMatchCues({
          narrationLimit: 3,
          batches,
          phaseEvents,
          state,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors,
          onActionRejected: vi.fn<(reason: string) => void>(),
        }),
      {
        initialProps: {
          batches: [] as readonly ServerBatch[],
          phaseEvents: [] as readonly ServerEvent[],
          state: boardWithSecurity(5, 5),
        },
      },
    );
    await advance(0);

    rerender({
      batches: [],
      phaseEvents: recovery.events,
      state: boardWithSecurity(6, 5),
    });
    await advance(0);
    expect(result.current.notices).toEqual([]);
    expect(result.current.securityFlights.size).toBe(0);

    rerender({
      batches: [recovery],
      phaseEvents: recovery.events,
      state: boardWithSecurity(6, 5),
    });
    await advance(0);
    expect(result.current.notices.map((notice) => notice.body.variant)).toEqual(["recovery"]);
    expect(result.current.securityFlights.has(VIEWER)).toBe(true);
  });

  it("announces an add the movement names a seat for, even when the count never moves", async () => {
    const { result, rerender } = renderCuesOverGrowingBoard(boardWithSecurity(5, 5));
    await advance(0);

    // "Place 1 card from your hand as the bottom security card. Then, trash your top
    // security card" (BT24-016): the opponent's stack is the same size after the patch.
    rerender({
      events: [
        {
          kind: "cardsMoved",
          instanceIds: ["placed"],
          from: "various",
          to: "security",
          seat: 1,
        },
        {
          kind: "cardsMoved",
          instanceIds: ["lost"],
          from: "security",
          to: "trash",
          cardIds: ["BT1-010"],
          seat: 1,
        },
      ],
      state: boardWithSecurity(5, 5),
    });
    await advance(0);
    expect(result.current.securityFlights.has(1)).toBe(true);
    expect(result.current.notices.map((notice) => [notice.side, notice.body])).toEqual([
      ["opp", { variant: "securityGain", amount: 1 }],
    ]);

    // The panel of what the same effect trashed follows it.
    await advance(NOTICE_ITEM_MS);
    expect(result.current.sidePanels.at(-1)?.titleKey).toBe("panel.trashedCards");
  });

  it("narrates a named add once, not again when its growth lands", async () => {
    const { result, rerender } = renderCuesOverGrowingBoard(boardWithSecurity(5, 5));
    await advance(0);

    rerender({
      events: [
        {
          kind: "cardsMoved",
          instanceIds: ["placed"],
          from: "various",
          to: "security",
          seat: VIEWER,
        },
      ],
      state: boardWithSecurity(6, 5),
    });
    await advance(0);
    expect(result.current.notices.map((notice) => notice.body.variant)).toEqual(["securityGain"]);
  });

  it("does not let a claim that met no growth swallow the next growth the count shows", async () => {
    const { result, rerender } = renderCuesOverGrowingBoard(boardWithSecurity(5, 5, 0));
    await advance(0);

    rerender({
      events: [
        {
          kind: "cardsMoved",
          instanceIds: ["placed"],
          from: "various",
          to: "security",
          seat: 1,
        },
      ],
      state: boardWithSecurity(5, 5, 1),
    });
    await advance(0);
    rerender({
      events: [
        {
          kind: "cardsMoved",
          instanceIds: ["placed"],
          from: "various",
          to: "security",
          seat: 1,
        },
        {
          kind: "cardsMoved",
          instanceIds: ["unnamed"],
          from: "deck",
          to: "security",
        },
      ],
      state: boardWithSecurity(5, 6, 2),
    });
    await advance(0);
    // Both independent security additions remain visible.
    expect(result.current.notices.map((notice) => [notice.side, notice.body.variant])).toEqual([
      ["opp", "securityGain"],
      ["opp", "securityGain"],
    ]);
    await advance(NOTICE_ITEM_MS);
    expect(result.current.notices).toEqual([]);
  });

  it("says nothing when the stack shrinks", async () => {
    const { result, rerender } = renderCuesOverGrowingBoard(boardWithSecurity(5, 5));
    await advance(0);

    rerender({ events: [], state: boardWithSecurity(4, 5) });
    await advance(0);
    expect(result.current.securityFlights.size).toBe(0);
    expect(result.current.notices).toEqual([]);
  });

  it("treats the dealt opening stack as a baseline, not a growth", async () => {
    const { result } = renderCuesOverGrowingBoard(boardWithSecurity(5, 5));
    await advance(0);
    expect(result.current.securityFlights.size).toBe(0);
    expect(result.current.notices).toEqual([]);
  });

  it("deals the opening stack card by card instead of gaining five at once", async () => {
    const { result, rerender } = renderCuesOverGrowingBoard(boardWithSecurity(0, 0));
    await advance(0);

    rerender({ events: [], state: boardWithSecurity(5, 5) });
    await advance(0);
    // Both shields start the deal empty and count up with the cards.
    expect(result.current.securityDealCounts.get(VIEWER)).toBe(0);
    expect(result.current.securityDealCounts.get(1)).toBe(0);
    expect(result.current.notices).toEqual([]);
    expect(result.current.securityFlights.size).toBe(0);

    await advance(TIMINGS.securityDealStagger * 2);
    expect(result.current.securityDealCounts.get(VIEWER)).toBe(2);

    await advance(TIMINGS.securityDealStagger * 3 + TIMINGS.securityFlight);
    // The deal hands the shields back to the live count once it has finished.
    expect(result.current.securityDealCounts.size).toBe(0);
    expect(result.current.notices).toEqual([]);
  });

  it("gains rather than deals when a stack grows after the opening", async () => {
    const { result, rerender } = renderCuesOverGrowingBoard(boardWithSecurity(5, 5));
    await advance(0);

    rerender({ events: [], state: boardWithSecurity(6, 5) });
    await advance(0);
    expect(result.current.securityDealCounts.size).toBe(0);
    expect(result.current.notices.map((notice) => notice.body.variant)).toEqual(["securityGain"]);
  });
});

describe("a DigiXros play whose [On Play] deletes, and the question it raises", () => {
  /* BT19-070 Kimeramon: DigiXrosed onto the opponent's board, its [On Play] deletes one of
     the viewer's Digimon, and the deletion arms a trigger the viewer must answer. Every
     event of it arrives in ONE batch, which is why the beats have to be sequenced here. */
  const KIMERAMON = "BT19-070";
  const XROS_PLAY: ServerEvent = {
    kind: "cardPlayed",
    seat: 1,
    cardId: KIMERAMON,
    permanentId: "perm-kimera",
    mechanic: "digiXros",
  };
  const XROS_MATERIALS: ServerEvent = {
    kind: "cardsMoved",
    instanceIds: ["mat-1", "mat-2"],
    from: "battleArea",
    to: "digivolutionCards",
  };
  const KIMERA_ON_PLAY: ServerEvent = {
    kind: "effectTriggered",
    seat: 1,
    sourceCardId: KIMERAMON,
    effectKey: "onPlay",
    description: "Delete 1 of your opponent's Digimon.",
    timing: "On Play",
  };
  /** The viewer's Digimon leaving the field. `perm-dead` is the only anchor the test board measures. */
  const VIEWER_DELETED: ServerEvent = {
    kind: "cardsMoved",
    instanceIds: ["perm-dead"],
    from: "battleArea",
    to: "trash",
    deletedPermanents: [
      {
        permanentId: "perm-dead",
        instanceId: "perm-dead",
        cardId: "BT1-010",
        seat: 0,
      },
    ],
  };
  const XROS_BATCH: readonly ServerEvent[] = [XROS_PLAY, XROS_MATERIALS, KIMERA_ON_PLAY, VIEWER_DELETED];

  /** When the [On Play] clause is read out: once the card has had the screen to itself. */
  const CLAUSE_AT_MS = SHOWCASE_TOTAL_MS;
  /** When what the clause did reaches the board, at the earliest: behind the play's lead-in. */
  const DELETION_AT_MS = CLAUSE_AT_MS + TIMINGS.effectSourceHold;
  /** When the viewer's own prompt may finally open, at the latest. */
  const PROMPT_AT_MS = CLAUSE_AT_MS + Math.max(TIMINGS.effectSourceHold, TIMINGS.effectAnnounce) + TIMINGS.cardShatter;

  it("plays the call-out, the clause and the deletion as three beats before the prompt opens", async () => {
    const { result, rerender } = renderCuesAwaitingAnswer();
    await advance(0);

    // The server asks the moment it has resolved: the question arrives with the batch it
    // was raised in, and its barrier holds the prompt until that batch is read out.
    rerender({
      events: XROS_BATCH,
      decisionPending: true,
      decisionStateVersion: 1,
    });
    await advance(0);

    // Beat one: the card centre-stage, and "DigiXros!" beside it — and nothing else.
    expect(result.current.zoneShowcase?.cardId).toBe(KIMERAMON);
    expect(result.current.notices.map((notice) => notice.body.variant)).toEqual(["keyword"]);
    expect(result.current.deleteBursts).toEqual([]);
    expect(result.current.decisionBarrierPending).toBe(true);
    // The board the prompt will open over is the board this batch produced.
    expect(result.current.presentedStateVersion).toBe(1);

    // Beat two: the clause is queued behind the call-out — the two never share the corner.
    await advance(CLAUSE_AT_MS);
    expect(result.current.zoneShowcase).toBeNull();
    expect(result.current.decisionBarrierPending).toBe(true);

    // Beat three: the consequence, with the shatter drawn from the card that stood there.
    // It waits out the play's lead-in, and never breaks the card before the clause has
    // been readable for a beat.
    let elapsedMs = CLAUSE_AT_MS;
    while (!result.current.notices.some((notice) => notice.body.variant === "effect")) {
      await advance(10);
      elapsedMs += 10;
      expect(elapsedMs).toBeLessThan(CONSEQUENCE_WAIT_LIMIT_MS);
    }
    const shatterAtMs = Math.max(DELETION_AT_MS, elapsedMs + TIMINGS.effectAnnounce);
    await advance(shatterAtMs - elapsedMs - 20);
    expect(result.current.deleteBursts).toEqual([]);
    await advance(20);
    expect(result.current.deleteBursts).toHaveLength(1);

    // Only then is the viewer asked about it.
    await advance(PLAY_LEAD_IN_BUDGET_MS);
    expect(result.current.decisionBarrierPending).toBe(false);

    // And once the last item has been read out, the board is the live one again.
    await advance(NOTICE_ITEM_MS * 3);
    expect(result.current.presentedStateVersion).toBeUndefined();
  });

  it("never holds the prompt longer than the budget, whatever the beats do", async () => {
    const { result, rerender } = renderCuesAwaitingAnswer();
    await advance(0);

    rerender({
      events: XROS_BATCH,
      decisionPending: true,
      decisionStateVersion: 1,
    });
    await advance(0);
    expect(result.current.decisionBarrierPending).toBe(true);
    expect(PROMPT_AT_MS).toBeLessThanOrEqual(PLAY_LEAD_IN_BUDGET_MS);

    // The budget is a wall clock, so a queue that never reaches those steps still hands
    // the board back.
    await advance(PLAY_LEAD_IN_BUDGET_MS);
    expect(result.current.decisionBarrierPending).toBe(false);
  });

  it("keeps the queued items moving while the viewer decides", async () => {
    const { result, rerender } = renderCuesAwaitingAnswer();
    await advance(0);

    rerender({
      events: XROS_BATCH,
      decisionPending: true,
      decisionStateVersion: 1,
    });
    await advance(0);
    expect(result.current.notices.map((notice) => notice.body.variant)).toEqual(["keyword"]);

    // Presentation continues during a question; earlier announcements expire independently.
    await advance(NOTICE_ITEM_MS + 1);
    expect(result.current.notices.map((notice) => notice.body.variant)).toEqual(["effect", "deletion"]);
    expect(result.current.notices[0]?.body).toMatchObject({
      cardId: KIMERAMON,
      timing: "On Play",
    });
  });

  it("raises no barrier for a question about a board already read out", async () => {
    const { result, rerender } = renderCuesAwaitingAnswer();
    await advance(0);

    rerender({ events: XROS_BATCH, decisionPending: false });
    await advance(NOTICE_ITEM_MS * 4);
    expect(result.current.presentedStateVersion).toBeUndefined();

    // The question is about the batch the screen has already finished: nothing to wait for.
    rerender({
      events: XROS_BATCH,
      decisionPending: true,
      decisionStateVersion: 1,
    });
    await advance(0);
    expect(result.current.decisionBarrierPending).toBe(false);
  });
});

/* Recent records remain visible independently of the action presentation. */
describe("the narration feed", () => {
  const effectOf = (seat: 0 | 1, cardId: string): ServerEvent => ({
    kind: "effectTriggered",
    seat,
    sourceCardId: cardId,
    effectKey: cardId,
    description: `Draw ${cardId}.`,
    timing: "OnPlay",
  });
  const yourEffect = (id: string) => effectOf(0, id);
  const theirEffect = (id: string) => effectOf(1, id);
  function cards(narration: ReadonlyMap<string, { notice?: { body: unknown } }>) {
    return [...narration.values()].map((item) => (item.notice?.body as { cardId?: string })?.cardId);
  }

  it("shows three same-side clauses together without holding the board or input", async () => {
    const { result, rerender } = renderCues();
    await advance(0);
    rerender([yourEffect("BT1-001"), yourEffect("BT1-002"), yourEffect("BT1-003")]);
    await advance(0);
    expect(cards(result.current.narration)).toEqual(["BT1-001", "BT1-002", "BT1-003"]);
    expect(result.current.presenting).toBe(false);
    expect(result.current.presentedStateVersion).toBeUndefined();
    await advance(TIMINGS.noticeLifetime);
    expect(result.current.narration.size).toBe(0);
  });

  /* The BT25-008 play of 2026-09-16: the clause that passed the turn was raised, and the
     five ribbons the turn change queues covered it for 5.3s while its six-second clock ran
     out underneath them. The ribbon waits for the clause to be readable, and then leaves it
     alone: a moment keeps running across the turn change and expires on its own clock. */
  it("reads the clause that passed the turn before the ribbon, and keeps it running across it", async () => {
    const { result, rerender } = renderCues();
    await advance(0);
    rerender([yourEffect("BT1-001")]);
    await advance(0);
    expect(cards(result.current.narration)).toEqual(["BT1-001"]);

    rerender([
      yourEffect("BT1-001"),
      { kind: "phaseChanged", phase: "End", turnSeat: 0, turnCount: 1 },
      { kind: "turnEnded", endingSeat: 0, nextSeat: 1, turnCount: 1 },
    ]);
    await advance(TIMINGS.phaseBannerNoticeRead - 200);
    expect(result.current.phaseBanner).toBeNull();
    expect(cards(result.current.narration)).toEqual(["BT1-001"]);

    await advance(200 + 16);
    expect(result.current.phaseBanner).toBeNull();
    expect(result.current.turnTransition?.endingSeat).toBe(0);
    expect(cards(result.current.narration)).toEqual(["BT1-001"]);

    // Still its own clock, not the ribbon's: it goes when its reading time is up.
    await advance(TIMINGS.noticeLifetime);
    expect(result.current.narration.size).toBe(0);
  });

  it("does not hold a ribbon for a clause the same phase raised after it", async () => {
    const { result, rerender } = renderCues();
    await advance(0);
    rerender([
      { kind: "phaseChanged", phase: "End", turnSeat: 0, turnCount: 1 },
      { kind: "turnEnded", endingSeat: 0, nextSeat: 1, turnCount: 1 },
    ]);
    await advance(16);
    expect(result.current.phaseBanner).toBeNull();
    expect(result.current.turnTransition?.endingSeat).toBe(0);
  });

  it("expires each batch independently without resetting the earlier record", async () => {
    const { result, rerender } = renderCues();
    await advance(0);
    rerender([yourEffect("BT1-001")]);
    await advance(1000);
    rerender([yourEffect("BT1-001"), yourEffect("BT1-002")]);
    await advance(0);
    expect(cards(result.current.narration)).toEqual(["BT1-001", "BT1-002"]);
    await advance(TIMINGS.noticeLifetime - 1000);
    expect(cards(result.current.narration)).toEqual(["BT1-002"]);
    await advance(1000);
    expect(result.current.narration.size).toBe(0);
  });

  // Both layouts retain the recent effects from both players in activation order.
  it.each([true, false])("stacks recent effects from both players (portrait=%s)", async (portrait) => {
    const feed = batchFeed();
    const view = renderHook(
      (batches: readonly ServerBatch[]) =>
        useMatchCues({
          batches,
          state: undefined,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          collapseNarration: portrait,
          anchors,
          onActionRejected: vi.fn<(reason: string) => void>(),
        }),
      { initialProps: feed([]) },
    );
    await advance(0);
    view.rerender(feed([yourEffect("BT1-001"), yourEffect("BT1-002"), theirEffect("BT1-009")]));
    await advance(0);
    const expected = ["BT1-001", "BT1-002", "BT1-009"];
    expect(cards(view.result.current.narration)).toEqual(portrait ? expected.slice(0, 1) : expected);
    await advance(TIMINGS.effectAnnounce);
    expect(cards(view.result.current.narration)).toEqual(portrait ? expected.slice(0, 2) : expected);
    await advance(TIMINGS.effectAnnounce);
    expect(cards(view.result.current.narration)).toEqual(expected);
    expect(view.result.current.narrationLock).toBe(false);
    expect(view.result.current.presenting).toBe(false);
  });

  it("dismisses the selected record without dismissing its neighbors or changing their clocks", async () => {
    const { result, rerender } = renderCues();
    await advance(0);
    expect(result.current.advanceNarration()).toBe(false);
    rerender([yourEffect("BT1-001"), yourEffect("BT1-002"), theirEffect("BT1-009")]);
    await advance(1000);
    const middle = [...result.current.narration.keys()][1]!;
    act(() => {
      expect(result.current.advanceNarration(middle)).toBe(true);
    });
    expect(cards(result.current.narration)).toEqual(["BT1-001", "BT1-009"]);
    expect(result.current.advanceNarration(middle)).toBe(false);
    await advance(TIMINGS.noticeLifetime - 1000);
    expect(result.current.narration.size).toBe(0);
  });

  it("keeps the arrival clock when its cards half arrives during a decision", async () => {
    const { result, rerender } = renderCuesAwaitingAnswer();
    const events: ServerEvent[] = [
      theirEffect("BT1-001"),
      { kind: "cardRevealed", seat: 1, cardId: "BT1-001", sourceCardId: "BT1-001" },
    ];
    rerender({ events, decisionPending: false });
    await advance(0);
    const original = [...result.current.narration.values()][0]!;
    expect(original.notice).toBeDefined();
    expect(original.panel).toBeUndefined();
    await advance(TIMINGS.narrationCardsLag / 2);
    rerender({ events, decisionPending: true, decisionStateVersion: 1 });
    await advance(TIMINGS.narrationCardsLag / 2);
    const withCards = result.current.narration.get(original.id)!;
    expect(withCards.panel).toBeDefined();
    expect(withCards.pausedAt).toBeUndefined();
    expect(withCards.createdAt).toBe(original.createdAt);
    await advance(12_000);
    expect(result.current.narration.has(original.id)).toBe(false);
  });

  it("keeps repeated activations of the same card independently dismissible", async () => {
    const { result, rerender } = renderCues();
    await advance(0);
    rerender([yourEffect("BT1-001"), yourEffect("BT1-001")]);
    await advance(0);
    expect(result.current.narration.size).toBe(2);
    act(() => {
      result.current.advanceNarration();
    });
    expect(cards(result.current.narration)).toEqual(["BT1-001"]);
  });

  it("clears visible records on skip and accepts subsequent batches", async () => {
    const { result, rerender } = renderCues();
    await advance(0);
    rerender([yourEffect("BT1-001"), theirEffect("BT1-009")]);
    await advance(0);
    act(() => result.current.skipAnimations());
    await advance(0);
    expect(result.current.narration.size).toBe(0);
    rerender([yourEffect("BT1-001"), theirEffect("BT1-009"), yourEffect("BT1-002")]);
    await advance(0);
    expect(cards(result.current.narration)).toEqual(["BT1-002"]);
  });

  it("expires accepted toasts from arrival while a chain is still asking a question", async () => {
    const { result, rerender } = renderCuesAwaitingAnswer();
    await advance(0);
    rerender({
      events: [yourEffect("BT1-001"), yourEffect("BT1-002")],
      decisionPending: false,
    });
    await advance(0);
    expect(cards(result.current.narration)).toEqual(["BT1-001", "BT1-002"]);
    rerender({
      events: [yourEffect("BT1-001"), yourEffect("BT1-002")],
      decisionPending: true,
      decisionStateVersion: 1,
    });
    await advance(0);
    expect(result.current.decisionBarrierPending).toBe(false);
    await advance(TIMINGS.noticeLifetime);
    expect(result.current.narration.size).toBe(0);
    rerender({ events: [yourEffect("BT1-001"), yourEffect("BT1-002")], decisionPending: false });
    await advance(TIMINGS.noticeLifetime);
    expect(result.current.narration.size).toBe(0);
  });

  it("shows refusals immediately, with their own lifetime", async () => {
    const { result, rerender } = renderCues();
    await advance(0);
    rerender([theirEffect("BT1-009")]);
    await advance(0);
    act(() => result.current.raiseRejection("Not enough memory."));
    expect(result.current.rejection?.body).toEqual({
      variant: "rejection",
      reason: "Not enough memory.",
    });
    expect(cards(result.current.narration)).toEqual(["BT1-009"]);
    await advance(TIMINGS.noticeLifetime);
    expect(result.current.rejection).not.toBeNull();
    await advance(REJECTION_LIFETIME_MS - TIMINGS.noticeLifetime);
    expect(result.current.rejection).toBeNull();
  });

  it("does not replay reconnect history or leave reading timers behind", async () => {
    const { result } = renderCues([yourEffect("BT1-001"), theirEffect("BT1-009")]);
    await advance(0);
    expect(result.current.narration.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

/* The board the screen renders from: the snapshot of the batch the queue is presenting,
   not whatever the server has since resolved (docs/presentation-queue-plan.md 3.2). */
describe("the presented revision", () => {
  const OPP_TRIGGER: ServerEvent = {
    kind: "effectTriggered",
    seat: 1,
    sourceCardId: "BT1-010",
    effectKey: "onDeletion",
    description: "Draw 1 card.",
    timing: "On Deletion",
  };

  it("stays on the battle's own revision while a later trigger waits its turn", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    // Batch 1: the attack and the battle that deletes the viewer's Digimon.
    rerender([ATTACK, COMBAT]);
    await advance(0);
    expect(result.current.presentedStateVersion).toBe(1);

    // Batch 2 arrives while batch 1 is still being read out. The board does NOT jump to
    // it: the loser is still on the board the battle produced until its trigger is read.
    rerender([ATTACK, COMBAT, OPP_TRIGGER]);
    await advance(0);
    expect(result.current.presentedStateVersion).toBe(1);

    // Once the battle finishes, the trigger can remain readable over the live board.
    await advance(FIELD_CLASH_TOTAL_MS + COMBAT_IMPACT_TOTAL_MS);
    expect(result.current.presentedStateVersion).toBeUndefined();
    expect(result.current.notices.length).toBeGreaterThan(0);

    // Read out: the board is the live board again.
    await advance(NOTICE_ITEM_MS * 2);
    expect(result.current.presentedStateVersion).toBeUndefined();
  });

  it("holds the reveal's revision through a check the server has not closed yet", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([ATTACK, REVEAL]);
    await advance(0);
    expect(result.current.presentedStateVersion).toBe(1);

    // The close is a batch of its own; the reveal is still on screen, so the board stays
    // on the revision the reveal belongs to.
    rerender([ATTACK, REVEAL, CHECK]);
    await advance(REVEAL_SHOWN_AT_MS);
    expect(result.current.presentedStateVersion).toBe(1);
  });

  it("presents a DNA digivolve over its own board and then hands it back", async () => {
    const { result, rerender } = renderCues();
    await advance(0);

    rerender([
      {
        kind: "cardPlayed",
        seat: 1,
        cardId: "BT1-010",
        permanentId: "perm-dna",
        mechanic: "dna",
        sourceCardIds: ["BT1-011", "BT1-012"],
      },
    ]);
    await advance(0);
    expect(result.current.presentedStateVersion).toBe(1);

    await advance(PRESENTED_BOARD_BUDGET_MS);
    expect(result.current.presentedStateVersion).toBeUndefined();
  });

  it("presents the live board while a reconnect replays its history", async () => {
    // The first pass is history: it leaves the final state behind without playing a frame,
    // so there is no moment to hold the board on.
    const { result } = renderCues([ATTACK, REVEAL, CHECK, OPP_TRIGGER]);
    await advance(0);
    expect(result.current.presentedStateVersion).toBeUndefined();

    await advance(NOTICE_ITEM_MS * 2);
    expect(result.current.presentedStateVersion).toBeUndefined();
  });
});

it("presents every security check in a single server batch in order", async () => {
  const { result, rerender } = renderCues();
  await advance(0);
  rerender([ATTACK, REVEAL, CHECK, SECOND_REVEAL, SECOND_CHECK]);
  await advance(SECURITY_BREAK_TOTAL_MS);
  expect(result.current.securityClash?.revealed.cardId).toBe("BT1-010");
  await advance(CLASH_TOTAL_MS + SECURITY_BREAK_TOTAL_MS);
  expect(result.current.securityClash?.revealed.cardId).toBe("BT1-011");
  await advance(CLASH_TOTAL_MS);
  expect(result.current.securityClash).toBeNull();
});

describe("triggered effect source prelude", () => {
  const trigger: ServerEvent = {
    kind: "effectTriggered",
    seat: 1,
    sourceCardId: "BT1-010",
    effectKey: "prelude",
    timing: "On Deletion",
    description: "Draw 1.",
  };

  it("finishes the deletion before flashing the trash source and then publishing the toast", async () => {
    const { result, rerender } = renderCuesOverBoard({
      ...TRASHED_SECURITY_BOARD,
      players: [
        TRASHED_SECURITY_BOARD.players[0],
        {
          ...TRASHED_SECURITY_BOARD.players[1],
          battleArea: [
            {
              permanentId: "surviving-copy",
              topCard: { cardId: "BT1-010", instanceId: "survivor" },
            },
          ],
        },
      ],
    } as unknown as GameState);
    await advance(0);
    rerender([
      {
        kind: "cardsMoved",
        instanceIds: ["sec-1"],
        from: "battleArea",
        to: "trash",
        deletedPermanents: [
          {
            permanentId: "perm-dead",
            instanceId: "sec-1",
            cardId: "BT1-010",
            seat: 1,
          },
        ],
      },
      trigger,
    ]);
    await advance(0);
    expect(result.current.deleteBursts).toHaveLength(1);
    expect(result.current.effectSources).toHaveLength(0);
    expect(result.current.notices.filter((notice) => notice.body.variant === "effect")).toHaveLength(0);
    await advance(TIMINGS.deletionBurst);
    // Only the non-blocking light remains; the source may now activate in the trash.
    expect(result.current.deleteBursts).toHaveLength(1);
    expect(result.current.effectSources).toMatchObject([{ site: { zone: "trash", instanceId: "sec-1" } }]);
    expect(result.current.notices.filter((notice) => notice.body.variant === "effect")).toHaveLength(0);
    await advance(TIMINGS.effectTrashPreparation - 1);
    expect(result.current.notices.filter((notice) => notice.body.variant === "effect")).toHaveLength(0);
    await advance(1);
    /* The punch is over, but the source does not go dark: it is handed to the clause it
       raised and stays lit for as long as that clause is on screen, so the toast and the
       card it is about are one moment rather than two signals a beat apart. */
    expect(result.current.effectSources).toMatchObject([{ site: { zone: "trash" }, linked: true }]);
    expect(result.current.notices.filter((notice) => notice.body.variant === "effect")).toHaveLength(1);
    await advance(TIMINGS.noticeLifetime - 1);
    expect(result.current.notices.filter((notice) => notice.body.variant === "effect")).toHaveLength(1);
    expect(result.current.effectSources).toHaveLength(1);
    await advance(1);
    expect(result.current.notices.filter((notice) => notice.body.variant === "effect")).toHaveLength(0);
    // The clause leaving is what takes the light with it.
    expect(result.current.effectSources).toHaveLength(0);
  });

  it("preserves both triggered notices when an automatic second evolution arrives", async () => {
    const board = {
      ...TRASHED_SECURITY_BOARD,
      players: [
        TRASHED_SECURITY_BOARD.players[0],
        {
          ...TRASHED_SECURITY_BOARD.players[1],
          battleArea: [
            {
              permanentId: "perm-9",
              topCard: { cardId: "BT1-010", instanceId: "arrived" },
            },
          ],
        },
      ],
    } as unknown as GameState;
    const { result, rerender } = renderCuesOverBoard(board);
    const arrival: ServerEvent = {
      kind: "digivolved",
      seat: 1,
      permanentId: "perm-9",
      cardId: "BT1-010",
      mechanic: "normal",
    };
    const first = {
      ...trigger,
      timing: "When Digivolving",
      effectKey: "first",
      description: "First effect.",
    };
    const second = {
      ...first,
      effectKey: "second",
      description: "Second effect.",
    };
    await advance(0);
    rerender([arrival, first]);
    await advance(100);
    rerender([arrival, first, { ...arrival }, second]);
    await advance(SHOWCASE_TOTAL_MS + TIMINGS.cardBurst - 100 + TIMINGS.effectSourceHold);
    expect(result.current.notices.map((notice) => notice.body)).toContainEqual(
      expect.objectContaining({ description: "First effect." }),
    );
    await advance(SHOWCASE_TOTAL_MS + TIMINGS.cardBurst + TIMINGS.effectSourceHold);
    expect(result.current.notices.map((notice) => notice.body)).toEqual([
      expect.objectContaining({ description: "First effect." }),
      expect.objectContaining({ description: "Second effect." }),
    ]);
  });

  it("publishes without a visual wait when the tab is hidden", async () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    try {
      const { result, rerender } = renderCuesOverBoard(TRASHED_SECURITY_BOARD);
      await advance(0);
      rerender([trigger]);
      await advance(0);
      expect(result.current.effectSources).toHaveLength(0);
      expect(result.current.notices).toHaveLength(1);
      expect(result.current.decisionAnimationsPending).toBe(false);
    } finally {
      hidden.mockRestore();
    }
  });

  it("waits for the Main Phase banner before highlighting its source", async () => {
    const { result, rerender } = renderCuesOverBoard(TRASHED_SECURITY_BOARD);
    await advance(0);
    rerender([
      { kind: "phaseChanged", phase: Phase.Main, turnSeat: 1, turnCount: 2 },
      { ...trigger, timing: "Start of Main Phase" },
    ]);
    await advance(0);
    expect(result.current.phaseBanner).not.toBeNull();
    expect(result.current.effectSources).toHaveLength(0);
    expect(result.current.notices.filter((notice) => notice.body.variant === "effect")).toHaveLength(0);
    await advance(TIMINGS.phaseBanner + TIMINGS.phaseBannerGap + 16);
    expect(result.current.effectSources).toHaveLength(1);
    expect(result.current.notices.filter((notice) => notice.body.variant === "effect")).toHaveLength(0);
    await advance(TIMINGS.effectTrashPreparation);
    expect(result.current.notices.filter((notice) => notice.body.variant === "effect")).toHaveLength(1);
  });

  it.each(["On Play", "When Digivolving"])(
    "waits for the %s arrival before highlighting its source",
    async (timing) => {
      const { result, rerender } = renderCuesOverBoard({
        ...TRASHED_SECURITY_BOARD,
        players: [
          TRASHED_SECURITY_BOARD.players[0],
          {
            ...TRASHED_SECURITY_BOARD.players[1],
            battleArea: [
              {
                permanentId: "perm-9",
                topCard: { cardId: "BT1-010", instanceId: "arrived" },
              },
            ],
          },
        ],
      } as unknown as GameState);
      await advance(0);
      const arrival: ServerEvent =
        timing === "On Play"
          ? OPP_PLAY
          : {
              kind: "digivolved",
              seat: 1,
              permanentId: "perm-9",
              cardId: "BT1-010",
              mechanic: "normal",
            };
      rerender([arrival, { ...trigger, timing }]);
      await advance(0);
      expect(result.current.effectSources).toHaveLength(0);
      expect(result.current.notices.filter((notice) => notice.body.variant === "effect")).toHaveLength(0);
      await advance(SHOWCASE_TOTAL_MS + CARD_BURST_PEAK_MS + POLL_MS);
      expect(result.current.effectSources).toHaveLength(1);
      expect(result.current.notices.filter((notice) => notice.body.variant === "effect")).toHaveLength(0);
      await advance(TIMINGS.effectSourceHold);
      expect(result.current.notices.filter((notice) => notice.body.variant === "effect")).toHaveLength(1);
    },
  );
});

it("shows Analog Youth's On Play before its trash result across server batches", async () => {
  const board = {
    players: [
      { battleArea: [], hand: [], trash: [] },
      {
        battleArea: [
          {
            permanentId: "perm-4",
            topCard: { cardId: "EX1-066", instanceId: "s1-42" },
          },
        ],
        hand: [],
        trash: [
          { instanceId: "s1-47", cardId: "P-205" },
          { instanceId: "s1-31", cardId: "BT18-019" },
        ],
      },
    ],
  } as unknown as GameState;
  const reports: import("@aegis/shared").PresentationReport[] = [];
  const { result, rerender } = renderCuesOverBoard(board, undefined, (report) => reports.push(report));
  const play: ServerEvent = {
    kind: "cardPlayed",
    seat: 1,
    cardId: "EX1-066",
    permanentId: "perm-4",
  };
  const effect: ServerEvent = {
    kind: "effectTriggered",
    seat: 1,
    sourceCardId: "EX1-066",
    sourcePermanentId: "perm-4",
    sourceInstanceId: "s1-42",
    effectKey: "EX1-066/ir-6-0",
    timing: "OnPlay",
    description: "Reveal top 3 and add",
  };
  rerender([play]);
  await advance(12);
  rerender([play, effect]);
  await advance(0);
  expect(result.current.effectSources).toHaveLength(0);
  expect(result.current.notices).toHaveLength(0);
  await advance(SHOWCASE_TOTAL_MS + CARD_BURST_PEAK_MS + TIMINGS.effectSourceHold - 24);
  rerender([
    play,
    effect,
    {
      kind: "cardsMoved",
      instanceIds: ["s1-47", "s1-31"],
      from: "various",
      to: "trash",
    },
  ]);
  await advance(0);
  expect(result.current.sidePanels.filter((panel) => panel.titleKey === "panel.trashedCards")).toHaveLength(0);
  await advance(28);
  expect(
    result.current.notices.some((notice) => notice.body.variant === "effect" && notice.body.cardId === "EX1-066"),
  ).toBe(true);
  await advance(TIMINGS.effectAnnounce);
  expect(result.current.sidePanels.some((panel) => panel.titleKey === "panel.trashedCards")).toBe(true);
  const arrivalReport = reports.find((report) => report.stepId.startsWith("zone-change-") && report.phase === "queued");
  expect(reports.find((report) => report.stepId.startsWith("burst-") && report.phase === "started")).toMatchObject({
    batchId: arrivalReport?.batchId,
    stateVersion: 1,
  });
});

// The engine closes a check only once everything it caused has resolved, so a removal
// reaction that stops to ask a question lands between the reveal and the battle's verdict.
// A revealed Digimon waits on stage for that verdict rather than playing out, leaving, and
// being flashed back for an outcome beat on a board it had already handed over.
it("holds a revealed Digimon on stage until the server closes its battle", async () => {
  const REVEALED_DIGIMON: ServerEvent = {
    ...REVEAL,
    isDigimon: true,
    hasSecurityEffect: false,
    attackerDP: 2000,
    securityCardDP: 4000,
  };
  const { result, rerender } = renderCues();
  rerender([ATTACK]);
  await advance(10000);
  rerender([ATTACK, REVEALED_DIGIMON]);
  await advance(10000);
  // Long past the scene's own length, and the card is still up with no verdict on it.
  expect(result.current.securityClash?.revealed.cardId).toBe("BT1-010");
  expect(result.current.securityClash?.resolution).toBe("pending");

  rerender([
    ATTACK,
    REVEALED_DIGIMON,
    {
      ...CHECK,
      battle: {
        attackerDP: 2000,
        securityCardDP: 4000,
        attackerDeleted: true,
        securityDigimonDeleted: true,
      },
    },
  ]);
  await advance(0);
  // The verdict lands on the card that was already there: no second entrance.
  expect(result.current.securityClash?.resolution).toBe("battle");

  await advance(CLASH_TOTAL_MS);
  expect(result.current.securityClash).toBeNull();
});

// The hold is open-ended, so it is bounded: a close that never comes must not park a card
// on the centre of the screen for the rest of the match.
it("gives up the battle hold when the check never closes", async () => {
  const { result, rerender } = renderCues();
  rerender([ATTACK]);
  await advance(10000);
  rerender([
    ATTACK,
    {
      ...REVEAL,
      isDigimon: true,
      hasSecurityEffect: false,
      attackerDP: 2000,
      securityCardDP: 4000,
    },
  ]);
  await advance(TIMINGS.securityDockMax + TIMINGS.securityDockPoll);
  expect(result.current.securityClash).toBeNull();
});

// A close that arrives after the hold has given up finds an empty stage. The battle it
// carries has to be played from the start rather than dropped onto the outcome beat: a
// live match sat on a decision for minutes, the hold expired, and the verdict then ran in
// the 510 ms tail -- both Digimon died before the card had finished arriving.
it("plays the whole battle when the close arrives after the hold gave up", async () => {
  const REVEALED_DIGIMON: ServerEvent = {
    ...REVEAL,
    isDigimon: true,
    hasSecurityEffect: false,
    attackerDP: 2000,
    securityCardDP: 4000,
  };
  const CLOSE: ServerEvent = {
    ...CHECK,
    battle: {
      attackerDP: 2000,
      securityCardDP: 4000,
      attackerDeleted: true,
      securityDigimonDeleted: true,
    },
  };
  const { result, rerender } = renderCues();
  rerender([ATTACK]);
  await advance(10000);
  rerender([ATTACK, REVEALED_DIGIMON]);
  await advance(TIMINGS.securityDockMax + TIMINGS.securityDockPoll);
  expect(result.current.securityClash).toBeNull();

  rerender([ATTACK, REVEALED_DIGIMON, CLOSE]);
  await advance(0);
  // Back on stage with its full lead-in ahead of it, not already at the blow.
  expect(result.current.securityClash?.resolution).toBe("battle");
  // Left unset, which is the scene's own lead-in; the bug pinned it to 0.
  expect(result.current.securityClash?.outcomeAtMs).not.toBe(0);

  // It stays for the whole scene: the attacker's entrance, the reveal and the hold all
  // still have to play before the outcome beat the tail alone used to cover.
  await advance(CLASH_OUTCOME_AT_MS + TIMINGS.clashOutcome + TIMINGS.cardShatter - 1);
  expect(result.current.securityClash?.resolution).toBe("battle");
  await advance(1);
  expect(result.current.securityClash).toBeNull();
});

it("highlights the field host for a Succession effect even with another copy of the level 6 in hand", async () => {
  const board = {
    players: [
      {
        battleArea: [
          {
            permanentId: "succession-host",
            topCard: { cardId: "BT26-087", instanceId: "level-7" },
            stack: [{ cardId: "BT26-016", instanceId: "level-6-source" }],
          },
        ],
        hand: [{ cardId: "BT26-016", instanceId: "level-6-in-hand" }],
        trash: [],
      },
      { battleArea: [], hand: [], trash: [] },
    ],
  } as unknown as GameState;
  const { result, rerender } = renderCuesOverBoard(board);
  rerender([
    {
      kind: "effectTriggered",
      seat: 0,
      sourceCardId: "BT26-016",
      effectKey: "succession-when-digivolving",
      description: "[When Digivolving] Delete 1 of your opponent's Digimon.",
      timing: "WhenDigivolving",
    },
  ]);
  await advance(0);
  expect(result.current.effectSources).toMatchObject([
    {
      cardId: "BT26-016",
      site: { zone: "field", permanentId: "succession-host" },
    },
  ]);
});

it("highlights each physical Digimon when identical cards resolve their start-of-main effects", async () => {
  const board = {
    players: [
      {
        battleArea: [
          {
            permanentId: "first-hyokomon",
            topCard: { cardId: "BT26-009", instanceId: "first-copy" },
          },
          {
            permanentId: "second-hyokomon",
            topCard: { cardId: "BT26-009", instanceId: "second-copy" },
          },
        ],
        hand: [],
        trash: [],
      },
      { battleArea: [], hand: [], trash: [] },
    ],
  } as unknown as GameState;
  const { result, rerender } = renderCuesOverBoard(board);
  const first = {
    kind: "effectTriggered",
    seat: 0,
    sourceCardId: "BT26-009",
    sourceInstanceId: "first-copy",
    sourcePermanentId: "first-hyokomon",
    effectKey: "start-main",
    description: "[Start of Your Main Phase] Draw 1 card.",
    timing: "StartOfYourMainPhase",
  } as unknown as ServerEvent;
  const second = {
    ...first,
    sourceInstanceId: "second-copy",
    sourcePermanentId: "second-hyokomon",
  } as unknown as ServerEvent;
  rerender([first]);
  await advance(0);
  expect(result.current.effectSources).toMatchObject([{ site: { zone: "field", permanentId: "first-hyokomon" } }]);
  await advance(10000);
  rerender([first, second]);
  await advance(0);
  expect(result.current.effectSources).toMatchObject([{ site: { zone: "field", permanentId: "second-hyokomon" } }]);
});

it("keeps the activation glow and clause together when an effect asks for a decision", async () => {
  const board = {
    players: [
      {
        battleArea: [
          {
            permanentId: "second",
            topCard: { cardId: "BT26-009", instanceId: "copy-2" },
          },
        ],
        hand: [],
        trash: [],
      },
      { battleArea: [], hand: [], trash: [] },
    ],
  } as unknown as GameState;
  const { result, rerender } = renderCuesOverBoard(board);
  rerender([
    {
      kind: "effectTriggered",
      seat: 0,
      sourceCardId: "BT26-009",
      sourcePermanentId: "second",
      sourceInstanceId: "copy-2",
      effectKey: "start-main",
      description: "[Start of Your Main Phase] Draw 1 card.",
      timing: "StartOfYourMainPhase",
    },
  ]);
  await advance(0);
  expect(result.current.effectSources).toMatchObject([{ site: { zone: "field", permanentId: "second" } }]);
  await advance(TIMINGS.effectSourceHold);
  expect(result.current.notices).toHaveLength(1);
});

const RINA_BOARD = {
  players: [
    {
      battleArea: [
        {
          permanentId: "rina",
          topCard: { cardId: "EX13-069", instanceId: "rina-card" },
        },
      ],
      hand: [],
      trash: [],
    },
    { battleArea: [], hand: [], trash: [] },
  ],
} as unknown as GameState;

const RINA_YOUR_TURN_PROMPT: ServerEvent = {
  kind: "effectTriggered",
  seat: 0,
  sourceCardId: "EX13-069",
  sourcePermanentId: "rina",
  sourceInstanceId: "rina-card",
  effectKey: "EX13-069/ir-2-0",
  description: "[Your Turn] When any of your Digimon unsuspend, by suspending this Tamer, ＜Draw 1＞.",
  timing: "YourTurn",
};

it("reads an accepted clause once without a decision-return delay", async () => {
  const { result, rerender } = renderCuesOverBoard(RINA_BOARD);
  rerender([RINA_YOUR_TURN_PROMPT]);
  await advance(TIMINGS.effectSourceHold + NARRATION_TICK_MS);
  expect(result.current.notices).toMatchObject([{ body: { variant: "effect", cardId: "EX13-069" } }]);
  await advance(NOTICE_ITEM_MS);
  expect(result.current.notices).toHaveLength(0);

  const startOfMain: ServerEvent = {
    ...RINA_YOUR_TURN_PROMPT,
    effectKey: "EX13-069/ir-1-0",
    description: "[StartOfYourMainPhase] Gain 1 memory",
    timing: "OnStartMainPhase",
  };
  rerender([RINA_YOUR_TURN_PROMPT, startOfMain]);
  await advance(TIMINGS.effectSourceHold + NARRATION_TICK_MS);
  expect(result.current.notices).toMatchObject([
    { body: { variant: "effect", cardId: "EX13-069", description: startOfMain.description } },
  ]);
});

it("Discord 1555741214014447737: stacks accepted clauses from two copies in their activation order", async () => {
  const board = {
    players: [
      {
        battleArea: [
          { permanentId: "first", topCard: { cardId: "BT26-091", instanceId: "copy-1" } },
          { permanentId: "second", topCard: { cardId: "BT26-091", instanceId: "copy-2" } },
        ],
        hand: [],
        trash: [],
      },
      { battleArea: [], hand: [], trash: [] },
    ],
  } as unknown as GameState;
  const startOfMain = (permanentId: string, instanceId: string): ServerEvent => ({
    kind: "effectTriggered",
    seat: 0,
    sourceCardId: "BT26-091",
    sourcePermanentId: permanentId,
    sourceInstanceId: instanceId,
    effectKey: "BT26-091/ir-1-0",
    description:
      "[Start of Your Main Phase] By placing 1 [DATA SQUAD] trait card from your hand face down under this Tamer, ＜Draw 1＞ and gain 1 memory.",
    timing: "StartOfYourMainPhase",
  });
  const { result, rerender } = renderCuesOverBoard(board);
  const first = startOfMain("first", "copy-1");
  rerender([first]);
  await advance(TIMINGS.effectSourceHold + NARRATION_TICK_MS);

  // The answer resolves the first copy, and the server announces the second in the same tick.
  rerender([first, startOfMain("second", "copy-2")]);
  await advance(TIMINGS.effectSourceHold + NARRATION_TICK_MS);

  expect(
    result.current.notices.map((notice) => notice.body.variant === "effect" && notice.body.sourcePermanentId),
  ).toEqual(["first", "second"]);
});

it("highlights the opponent's Plutomon when its All Turns hand-trash effect activates", async () => {
  const board = {
    players: [
      { battleArea: [], hand: [], trash: [] },
      {
        battleArea: [
          {
            permanentId: "plutomon",
            topCard: { cardId: "BT26-059", instanceId: "plutomon-card" },
          },
        ],
        hand: [],
        trash: [],
      },
    ],
  } as unknown as GameState;
  const { result, rerender } = renderCuesOverBoard(board);
  rerender([
    {
      kind: "effectTriggered",
      seat: 1,
      sourceCardId: "BT26-059",
      sourceInstanceId: "plutomon-card",
      sourcePermanentId: "plutomon",
      effectKey: "hand-trash",
      timing: "whenHandTrashed",
      printedTiming: "AllTurns",
      description: "whenHandTrashed",
    },
  ]);
  await advance(0);
  expect(result.current.effectSources).toMatchObject([
    {
      seat: 1,
      cardId: "BT26-059",
      site: { zone: "field", permanentId: "plutomon" },
    },
  ]);
});

describe("Taiki hand-play reveal on a single narration slot", () => {
  it("keeps all four cards readable alongside their On Play clause", async () => {
    const feed = batchFeed();
    const state = {
      players: [
        { battleArea: [], trash: [], hand: [] },
        {
          battleArea: [
            {
              permanentId: "perm-4",
              topCard: { instanceId: "s1-40", cardId: "BT10-087" },
            },
          ],
          trash: [],
          hand: [],
        },
      ],
    } as unknown as GameState;
    const { result, rerender } = renderHook(
      (batches: readonly ServerBatch[]) =>
        useMatchCues({
          narrationLimit: 1,
          batches,
          state,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors,
          onActionRejected: vi.fn<(reason: string) => void>(),
        }),
      { initialProps: [] as readonly ServerBatch[] },
    );
    await advance(0);
    const play: ServerEvent = {
      kind: "cardPlayed",
      seat: 1,
      cardId: "BT10-087",
      artId: "BT10-087",
      permanentId: "perm-4",
    };
    rerender(feed([play]));
    await advance(10);
    const effect: ServerEvent = {
      kind: "effectTriggered",
      seat: 1,
      sourceCardId: "BT10-087",
      sourceInstanceId: "s1-40",
      sourcePermanentId: "perm-4",
      effectKey: "BT10-087/ir-6-0",
      description: "[OnPlay] Reveal top 4 and add",
      timing: "OnPlay",
    };
    const cardIds = ["BT19-014", "BT8-095", "AD1-006", "BT19-051"];
    const reveals: ServerEvent[] = cardIds.map((cardId) => ({
      kind: "cardRevealed",
      seat: 1,
      cardId,
      artId: cardId,
    }));
    rerender(feed([play, effect, ...reveals]));
    await advance(SHOWCASE_TOTAL_MS + TIMINGS.cardBurst + TIMINGS.effectSourceHold + TIMINGS.narrationCardsLag);
    expect(result.current.sidePanels.at(-1)?.cards.map((card) => card.cardId)).toEqual(cardIds);
    expect(result.current.notices.at(-1)?.body).toMatchObject({
      variant: "effect",
      cardId: "BT10-087",
    });
    await advance(1000);
    expect(result.current.sidePanels.at(-1)?.cards.map((card) => card.cardId)).toEqual(cardIds);
  });
});

it("presents Imperial's late security consequence before the next turn phases", async () => {
  const board = {
    players: [
      {
        battleArea: [
          {
            permanentId: "imperial",
            topCard: { cardId: "AD1-024", instanceId: "imperial-card" },
          },
        ],
        hand: [],
        trash: [],
      },
      { battleArea: [], hand: [], trash: [] },
    ],
  } as unknown as GameState;
  const reports: import("@aegis/shared").PresentationReport[] = [];
  const { result, rerender } = renderCuesOverBoard(board, undefined, (report) => reports.push(report));
  const imperial: ServerEvent = {
    kind: "effectTriggered",
    seat: 0,
    sourceCardId: "AD1-024",
    sourcePermanentId: "imperial",
    sourceInstanceId: "imperial-card",
    effectKey: "entry-response",
    timing: "AllTurns",
    description: "Suspend, then unsuspend.",
  };
  rerender([ATTACK, REVEAL]);
  await advance(100);
  rerender([ATTACK, REVEAL, imperial]);
  await advance(0);
  rerender([
    ATTACK,
    REVEAL,
    imperial,
    CHECK,
    TURN_END,
    { kind: "phaseChanged", phase: Phase.Main, turnSeat: 0, turnCount: 4 },
  ]);
  let sourceBeforePhase = false;
  let observedPhase = false;
  for (let tick = 0; tick < 200; tick++) {
    await advance(100);
    if (reports.some((report) => report.phase === "shown" && report.sourceCardId === "AD1-024"))
      sourceBeforePhase = true;
    if (result.current.phaseBanner !== null) {
      observedPhase = true;
      break;
    }
  }
  expect(observedPhase).toBe(true);
  expect(sourceBeforePhase).toBe(true);
  const source = reports.findIndex((report) => report.phase === "shown" && report.sourceCardId === "AD1-024");

  expect(source).toBeGreaterThanOrEqual(0);

  expect(reports[source]).toMatchObject({ stateVersion: 2 });
});

it.each(["together", "split"] as const)(
  "Discord 1556410279602946198: the phone reads field Mistymon before Thetismon's deletion ($0)",
  async (delivery) => {
    const board = {
      players: [
        {
          battleArea: [{ permanentId: "thetismon", topCard: { cardId: "EX12-030", instanceId: "attacker" } }],
          hand: [],
          trash: [],
        },
        {
          battleArea: [{ permanentId: "mistymon", topCard: { cardId: "EX13-033", instanceId: "field-mistymon" } }],
          hand: [],
          trash: [],
        },
      ],
    } as unknown as GameState;
    const feed = batchFeed();
    const { result, rerender } = renderHook(
      (batches: readonly ServerBatch[]) =>
        useMatchCues({
          collapseNarration: true,
          batches,
          state: board,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors,
          onActionRejected: vi.fn<(reason: string) => void>(),
        }),
      { initialProps: [] as readonly ServerBatch[] },
    );
    const events: ServerEvent[] = [
      {
        kind: "attackDeclared",
        seat: 0,
        attackerPermanentId: "thetismon",
        attackerCardId: "EX12-030",
        target: { kind: "player" },
      },
      {
        kind: "securityRevealed",
        seat: 1,
        revealedCardId: "EX13-033",
        attackerPermanentId: "thetismon",
        attackerDP: 7000,
        securityCardDP: 7000,
        securityCountBefore: 3,
        hasSecurityEffect: false,
        isDigimon: true,
      },
      {
        kind: "effectTriggered",
        seat: 1,
        sourceCardId: "EX13-033",
        sourceInstanceId: "field-mistymon",
        sourcePermanentId: "mistymon",
        effectKey: "subtrigger/whenSecurityRemoved",
        timing: "whenSecurityRemoved",
        printedTiming: "AllTurns",
        duringSecurityCheck: true,
        description:
          "[All Turns] [Once Per Turn] When security is removed, give -6000 DP, then delete a Digimon with 6000 DP or less.",
      },
      {
        kind: "cardsMoved",
        instanceIds: ["attacker"],
        from: "battleArea",
        to: "trash",
        deletedPermanents: [{ permanentId: "thetismon", instanceId: "attacker", cardId: "EX12-030", seat: 0 }],
      },
      { kind: "securityChecked", seat: 1, revealedCardId: "EX13-033", resolution: "trashed" },
    ];
    if (delivery === "together") rerender(feed(events));
    else for (let index = 0; index < events.length; index++) rerender(feed(events.slice(0, index + 1)));
    const newest = () => [...result.current.narration.values()].at(-1)?.notice?.body;
    let sawFieldEffect = false;
    for (let tick = 0; tick < 200; tick++) {
      await advance(50);
      const body = newest();
      if (body?.variant === "effect" && body.cardId === "EX13-033") {
        sawFieldEffect = true;
        break;
      }
    }
    expect(sawFieldEffect).toBe(true);
    expect(newest()).toMatchObject({
      variant: "effect",
      cardId: "EX13-033",
      sourcePermanentId: "mistymon",
      timing: "AllTurns",
    });
    await advance(TIMINGS.effectAnnounce - 50);
    expect(newest()).toMatchObject({ variant: "effect", cardId: "EX13-033" });
    await advance(2000);
    expect(newest()).toMatchObject({ variant: "deletion", cards: [{ cardId: "EX12-030" }] });
  },
);

it("reads a reaction the removal armed once across the deletion it caused and the next check", async () => {
  const board = {
    players: [
      {
        battleArea: [
          {
            permanentId: "perm-18",
            topCard: { cardId: "BT23-047", instanceId: "s0-31" },
          },
        ],
        hand: [],
        trash: [],
      },
      {
        battleArea: [
          {
            permanentId: "perm-16",
            topCard: { cardId: "BT10-087", instanceId: "s1-39" },
          },
        ],
        hand: [],
        trash: [],
      },
    ],
  } as unknown as GameState;
  const reports: import("@aegis/shared").PresentationReport[] = [];
  const { result, rerender } = renderCuesOverBoard(board, undefined, (report) => reports.push(report));
  const attack: ServerEvent = {
    kind: "attackDeclared",
    seat: 0,
    attackerPermanentId: "perm-18",
    attackerCardId: "BT23-047",
    target: { kind: "player" },
  };
  const firstReveal: ServerEvent = {
    kind: "securityRevealed",
    seat: 1,
    revealedCardId: "BT19-061",
    attackerPermanentId: "perm-18",
    attackerDP: 21000,
    securityCardDP: 5000,
    securityCountBefore: 2,
    hasSecurityEffect: false,
    isDigimon: true,
  };
  const removalReaction: ServerEvent = {
    kind: "effectTriggered",
    seat: 0,
    sourceCardId: "BT23-047",
    sourceInstanceId: "s0-31",
    sourcePermanentId: "perm-18",
    effectKey: "subtrigger/whenSecurityRemoved",
    timing: "whenSecurityRemoved",
    printedTiming: "YourTurn",
    duringSecurityCheck: true,
    description:
      "[Your Turn] [Once Per Turn] When your opponent's security stack is removed from, trash 1 of their Option cards in the battle area. Then, delete 1 of their suspended Digimon or Tamers.",
  };
  const tamerDeleted: ServerEvent = {
    kind: "cardsMoved",
    instanceIds: ["s1-29", "s1-39"],
    from: "battleArea",
    to: "trash",
    deletedPermanents: [{ permanentId: "perm-16", instanceId: "s1-39", cardId: "BT10-087", seat: 1 }],
  };
  const reactionResolved: ServerEvent = { ...removalReaction, kind: "effectResolved" };
  const firstCheck: ServerEvent = {
    kind: "securityChecked",
    seat: 1,
    revealedCardId: "BT19-061",
    resolution: "battle",
    battle: {
      attackerDP: 21000,
      securityCardDP: 5000,
      attackerDeleted: false,
      securityDigimonDeleted: true,
    },
  };
  const secondReveal: ServerEvent = {
    ...firstReveal,
    revealedCardId: "BT19-035",
    securityCountBefore: 1,
  };
  const secondCheck: ServerEvent = { ...firstCheck, revealedCardId: "BT19-035" };
  const batches: ServerEvent[][] = [
    [attack],
    [firstReveal],
    [removalReaction],
    [tamerDeleted],
    [reactionResolved],
    [firstCheck],
    [secondReveal],
    [secondCheck],
    [{ kind: "phaseChanged", phase: Phase.End, turnSeat: 0, turnCount: 10 }],
    [{ kind: "turnEnded", endingSeat: 0, nextSeat: 1, turnCount: 10 }],
    [{ kind: "phaseChanged", phase: "Active", turnSeat: 1, turnCount: 10 }],
    [{ kind: "phaseChanged", phase: "Draw", turnSeat: 1, turnCount: 11 }],
    [{ kind: "phaseChanged", phase: Phase.Main, turnSeat: 1, turnCount: 11 }],
  ];
  // The whole run reached the client in one patch, as separate batches delivered in the
  // same tick: the turn ends while the first reveal is still on stage, which flushes what
  // the check held, and the late cue the reaction's batch queued must not read it again.
  const seen: ServerEvent[] = [];
  for (const batch of batches) {
    seen.push(...batch);
    rerender([...seen]);
  }
  for (let tick = 0; tick < 300; tick++) await advance(100);
  const readOut = new Set(
    reports
      .filter((report) => report.sourceCardId === "BT23-047" && report.stepId?.startsWith("narration-step"))
      .map((report) => report.stepId),
  );
  expect(readOut.size).toBe(1);
  expect(result.current.notices.filter((notice) => notice.body.variant === "effect")).toHaveLength(0);
});

describe("a run of security checks the patch delivered at once", () => {
  /** The board once both checks have resolved, which is the only board the client has. */
  const TWO_CHECKS_DOWN = {
    players: [
      { battleArea: [], trash: [], hand: [], securityCount: 3 },
      { battleArea: [], trash: [], hand: [], securityCount: 5 },
    ],
  } as unknown as GameState;

  it("shows the shield losing one card per check, in the order they were revealed", async () => {
    const { result, rerender } = renderCuesOverBoard(TWO_CHECKS_DOWN);
    await advance(0);
    rerender([ATTACK, { ...REVEAL, securityCountBefore: 5 }, CHECK]);
    rerender([
      ATTACK,
      { ...REVEAL, securityCountBefore: 5 },
      CHECK,
      { ...SECOND_REVEAL, securityCountBefore: 4 },
      SECOND_CHECK,
    ]);

    // The figures the shield shows, in order, with repeats folded: five while the first
    // card is being revealed, four while the second is, then the board's own three.
    const shown: (number | undefined)[] = [];
    for (let elapsed = 0; elapsed < SECURITY_BREAK_TOTAL_MS * 2 + CLASH_TOTAL_MS * 3; elapsed += 50) {
      await advance(50);
      const figure = result.current.heldSecurityCounts.get(0);
      if (shown.length === 0 || shown.at(-1) !== figure) shown.push(figure);
    }
    expect(shown).toEqual([5, 4, undefined]);
  });
});

describe("an opponent's arrival behind the turn's ribbons", () => {
  const BREEDING_PHASE: ServerEvent = {
    kind: "phaseChanged",
    phase: "Breeding",
    turnSeat: 1,
    turnCount: 2,
  };
  const OUT_OF_BREEDING: ServerEvent = {
    kind: "movedFromBreeding",
    seat: 1,
    permanentId: "perm-9",
    cardId: "BT1-010",
  };

  it("waits out the ribbon, then holds the destination through the breeding transfer", async () => {
    const { result, rerender } = renderCues();
    await advance(0);
    rerender([BREEDING_PHASE]);
    await advance(32);
    expect(result.current.phaseBanner?.phase).toBe("Breeding");

    // A fast opponent leaves breeding while the ribbon is still up. The burst waits behind
    // the ribbon, so the field must not show the card before the burst does.
    rerender([BREEDING_PHASE, OUT_OF_BREEDING]);
    await advance(32);
    expect(result.current.pendingPermanentIds.has("perm-9")).toBe(true);
    expect(result.current.permanentBursts.has("perm-9")).toBe(false);

    await advance(TIMINGS.phaseBanner + TIMINGS.phaseBannerGap + 32);
    expect(result.current.phaseBanner).toBeNull();
    expect(result.current.pendingPermanentIds.has("perm-9")).toBe(true);
    expect(result.current.permanentBursts.get("perm-9")).toMatchObject({
      moveFromBreeding: true,
    });
    await advance(200);
    expect(result.current.pendingPermanentIds.has("perm-9")).toBe(false);
    expect(result.current.permanentBursts.has("perm-9")).toBe(false);
  });

  it("retains the destination until the unobstructed transfer lands", async () => {
    const { result, rerender } = renderCues();
    await advance(0);
    // An idle track starts the arrival step the moment it is queued, and a step with no
    // showcase hands the permanent straight back. The hold must not outlive that release,
    // or the card vanishes from the field until the whole queue has run dry.
    rerender([OUT_OF_BREEDING]);
    await advance(0);
    expect(result.current.pendingPermanentIds.has("perm-9")).toBe(true);
    expect(result.current.permanentBursts.get("perm-9")).toMatchObject({ moveFromBreeding: true });
    await advance(200);
    expect(result.current.pendingPermanentIds.has("perm-9")).toBe(false);
    expect(result.current.permanentBursts.has("perm-9")).toBe(false);
  });
});

describe("a permanent an opponent's clause deletes", () => {
  const STANDING = {
    permanentId: "perm-dead",
    topCard: { cardId: "BT1-010", instanceId: "dead-top" },
  } as unknown as Permanent;
  /** The board before the deletion, which only a snapshot still remembers. */
  const BEFORE = {
    stateVersion: 1,
    players: [
      { battleArea: [STANDING], trash: [], hand: [] },
      { battleArea: [], trash: [], hand: [] },
    ],
  } as unknown as GameState;
  const AFTER = {
    stateVersion: 2,
    players: [
      {
        battleArea: [],
        trash: [{ cardId: "BT1-010", instanceId: "dead-top" }],
        hand: [],
      },
      { battleArea: [], trash: [], hand: [] },
    ],
  } as unknown as GameState;
  const OPP_CLAUSE: ServerEvent = {
    kind: "effectTriggered",
    seat: 1,
    sourceCardId: "BT1-011",
    effectKey: "onPlay",
    description: "Delete 1 of your opponent's Digimon.",
    timing: "On Play",
  };
  const VIEWER_DELETED: ServerEvent = {
    kind: "cardsMoved",
    instanceIds: ["dead-top"],
    from: "battleArea",
    to: "trash",
    deletedPermanents: [
      {
        permanentId: "perm-dead",
        instanceId: "dead-top",
        cardId: "BT1-010",
        seat: 0,
      },
    ],
  };

  it("stays on the board until the clause has been read for a beat, then shatters", async () => {
    const { result, rerender } = renderCuesOverBoard(AFTER, [{ stateVersion: 1, state: BEFORE }]);
    await advance(0);
    rerender([OPP_CLAUSE, VIEWER_DELETED]);
    await advance(0);

    // Held in its slot from the moment the batch is presented, with nothing drawn over it.
    expect([...result.current.heldDeletions.values()]).toMatchObject([
      { seat: 0, index: 0, permanent: { permanentId: "perm-dead" }, trash: [] },
    ]);
    expect(result.current.deleteBursts).toEqual([]);

    let clauseShownAfterMs = 0;
    while (!result.current.notices.some((notice) => notice.body.variant === "effect")) {
      await advance(10);
      clauseShownAfterMs += 10;
      expect(clauseShownAfterMs).toBeLessThan(CONSEQUENCE_WAIT_LIMIT_MS);
    }
    expect(result.current.heldDeletions.size).toBe(1);
    expect(result.current.deleteBursts).toEqual([]);

    // The clause gets its beat; only then do the shards take over from the card.
    await advance(TIMINGS.effectAnnounce - 20);
    expect(result.current.heldDeletions.size).toBe(1);
    expect(result.current.deleteBursts).toEqual([]);
    await advance(20);
    // The hold stays, marked departed, until paced presentation catches up; the board omits it.
    expect([...result.current.heldDeletions.values()]).toMatchObject([{ departed: true }]);
    expect(result.current.deleteBursts).toHaveLength(1);
  });

  it("shatters at once when the clause was read out long before", async () => {
    const { result, rerender } = renderCuesOverBoard(AFTER, [{ stateVersion: 1, state: BEFORE }]);
    await advance(0);
    rerender([OPP_CLAUSE]);
    await advance(NOTICE_ITEM_MS);
    rerender([OPP_CLAUSE, VIEWER_DELETED]);
    await advance(0);
    expect(result.current.deleteBursts).toHaveLength(1);
    expect([...result.current.heldDeletions.values()]).toMatchObject([{ departed: true }]);
  });
});

// BT23-099's ＜Delay＞ pays by trashing the Option itself, and the server sends the trigger,
// the trash and the card it plays as three batches. The Option is lit where it stands, it
// breaks, its clause is read, and only then does the Sistermon it played arrive.
it("plays a ＜Delay＞ Option's break, then its clause, then the card it played", async () => {
  const board = {
    players: [
      {
        battleArea: [{ permanentId: "perm-dead", topCard: { cardId: "BT23-099", instanceId: "gym-card" } }],
        hand: [],
        trash: [],
      },
      { battleArea: [], hand: [], trash: [] },
    ],
  } as unknown as GameState;
  const { result, rerender } = renderCuesOverBoard(board);
  const trigger: ServerEvent = {
    kind: "effectTriggered",
    seat: 0,
    sourceCardId: "BT23-099",
    sourcePermanentId: "perm-dead",
    sourceInstanceId: "gym-card",
    effectKey: "subtrigger/1/delay",
    description:
      "[Your Turn] When any of your Digimon digivolve into a Digimon with [Huckmon] or [Jesmon] in its name, ＜Delay＞ ・You may play 1 card with [Sistermon] in its name from your hand or trash without paying the cost.",
    timing: "YourTurn",
  };
  const trash: ServerEvent = {
    kind: "cardsMoved",
    instanceIds: ["gym-card"],
    from: "various",
    to: "trash",
    trashedPermanents: [{ permanentId: "perm-dead", instanceId: "gym-card", cardId: "BT23-099", seat: 0 }],
  };
  const play: ServerEvent = { kind: "cardPlayed", seat: 0, cardId: "BT23-077", permanentId: "perm-ciel" };

  rerender([trigger]);
  rerender([trigger, trash]);
  rerender([trigger, trash, play]);

  const firstSeen: Partial<Record<"glow" | "break" | "clause" | "arrival", number>> = {};
  for (let elapsed = 0; elapsed <= 6000; elapsed += 20) {
    const seen = {
      glow: result.current.effectSources.some(
        (source) => source.site.zone === "field" && source.site.permanentId === "perm-dead",
      ),
      break: result.current.deleteBursts.some((burst) => burst.cardId === "BT23-099"),
      clause: result.current.notices.some(
        (notice) => notice.body.variant === "effect" && notice.body.cardId === "BT23-099",
      ),
      arrival: result.current.permanentBursts.has("perm-ciel"),
    };
    for (const [beat, shown] of Object.entries(seen) as [keyof typeof seen, boolean][])
      if (shown && firstSeen[beat] === undefined) firstSeen[beat] = elapsed;
    await advance(20);
  }

  expect(firstSeen.glow).toBeDefined();
  expect(firstSeen.break).toBeGreaterThanOrEqual(firstSeen.glow! + TIMINGS.effectSourceHold - 20);
  expect(firstSeen.clause).toBeGreaterThan(firstSeen.break!);
  expect(firstSeen.arrival).toBeGreaterThanOrEqual(firstSeen.clause! + TIMINGS.effectAnnounce - 20);
});

it("does not name a ＜Delay＞ Option twice in a trashed-cards panel beside its break", async () => {
  const { result, rerender } = renderCues();
  rerender([
    {
      kind: "cardsMoved",
      instanceIds: ["gym-card"],
      from: "various",
      to: "trash",
      trashedPermanents: [{ permanentId: "perm-dead", instanceId: "gym-card", cardId: "BT23-099", seat: 0 }],
    },
  ]);
  await advance(TIMINGS.cardBurst + TIMINGS.effectSourceHold);
  expect(result.current.sidePanels).toEqual([]);
});

it.each([false, true])(
  "Discord 1556321937188196474: Koromon draws before security (coalesced=%s)",
  async (coalesced) => {
    const board = document.createElement("div");
    const deck = document.createElement("div");
    const hand = document.createElement("div");
    vi.spyOn(board, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600));
    vi.spyOn(deck, "getBoundingClientRect").mockReturnValue(new DOMRect(600, 400, 80, 100));
    vi.spyOn(hand, "getBoundingClientRect").mockReturnValue(new DOMRect(200, 500, 300, 80));
    const state = {
      players: [
        { battleArea: [], hand: [], trash: [], handCount: 5 },
        {
          battleArea: [
            {
              permanentId: "perm-3",
              topCard: { cardId: "BT12-062", instanceId: "greymon" },
              stack: [{ cardId: "BT5-001", instanceId: "koromon" }],
            },
          ],
          hand: [],
          trash: [],
          handCount: 5,
        },
      ],
    } as unknown as GameState;
    const { result, rerender } = renderHook(
      (batches: readonly ServerBatch[]) =>
        useMatchCues({
          batches,
          state,
          viewerSeat: 0,
          mulliganOpen: false,
          anchors: {
            ...anchors,
            board: { current: board },
            oppDeck: { current: deck },
            oppHandStrip: { current: hand },
          },
          onActionRejected: vi.fn<(reason: string) => void>(),
        }),
      { initialProps: [] as readonly ServerBatch[] },
    );
    const batches = [
      singleServerBatch([{ ...ATTACK, attackerPermanentId: "perm-3", attackerCardId: "BT12-062" }], 68),
      singleServerBatch(
        [
          {
            kind: "effectTriggered",
            seat: 1,
            sourceCardId: "BT5-001",
            sourcePermanentId: "perm-3",
            sourceInstanceId: "koromon",
            effectKey: "BT5-001/ir-12-0",
            timing: "OnUseAttack",
            printedTiming: "WhenAttacking",
            isInherited: true,
            description: "[When Attacking][Once Per Turn] Draw 1.",
          },
          { kind: "cardsMoved", seat: 1, instanceIds: ["drawn"], from: "deck", to: "hand" },
        ],
        69,
      ),
      singleServerBatch([{ ...REVEAL, attackerPermanentId: "perm-3", revealedCardId: "EX4-017" }], 71),
      singleServerBatch([{ ...CHECK, revealedCardId: "EX4-017" }], 72),
    ];
    if (coalesced) rerender(batches);
    else
      for (let index = 0; index < batches.length; index++) {
        rerender(batches.slice(0, index + 1));
        await advance(40);
      }
    let drawSeen = false;
    let drawFinished = false;
    let shieldSeen = false;
    for (let tick = 0; tick < 500; tick++) {
      await advance(20);
      if (result.current.drawFlights.length > 0) drawSeen = true;
      if (drawSeen && result.current.drawFlights.length === 0) drawFinished = true;
      if (result.current.securityBreak !== null || result.current.securityClash !== null) {
        shieldSeen = true;
        break;
      }
    }
    expect(shieldSeen).toBe(true);
    expect(drawSeen).toBe(true);
    expect(drawFinished).toBe(true);
  },
);

describe("manual effect signal narration", () => {
  function createManualSignalState(signalSeat: 0 | 1) {
    const state = new ManualGameState();
    state.gameMode = GameMode.MANUAL.value;
    state.matchId = "manual-effect-notice";
    state.phase = Phase.Main;
    state.turnCount = 1;
    state.players.push(
      Object.assign(new PlayerState(), { seat: 0, displayName: "First" }),
      Object.assign(new PlayerState(), { seat: 1, displayName: "Second" }),
    );
    state.manual.signalSeat = signalSeat;
    state.manual.signalRevision = 1;
    state.manual.signalCardId = "BT1-010";
    state.manual.signalTargetSeat = 1 - signalSeat;
    return state;
  }

  for (const signalSeat of [0, 1] as const) {
    it(`shows the current signal as a native ${signalSeat === 0 ? "own" : "opponent"} effect notice for a late reader`, () => {
      const state = createManualSignalState(signalSeat);
      const { result } = renderHook(() =>
        useMatchCues({ batches: [], state, viewerSeat: 0, mulliganOpen: false, anchors, onActionRejected() {} }),
      );
      const item = [...result.current.narration.values()][0]!;
      expect(item.side).toBe(signalSeat === 0 ? "you" : "opp");
      expect(item.notice?.body).toMatchObject({
        variant: "effect",
        cardId: "BT1-010",
        manualSignalText: expect.stringContaining("Effect target"),
      });
      expect(item.notice?.body).toMatchObject({
        manualSignalText: expect.stringContaining(signalSeat === 0 ? "First signals" : "Second signals"),
      });
    });
  }

  it("keeps local dismissal independent of the server signal and raises a new repeated signal only once", () => {
    const state = createManualSignalState(0);
    const { result, rerender } = renderHook(() =>
      useMatchCues({ batches: [], state, viewerSeat: 0, mulliganOpen: false, anchors, onActionRejected() {} }),
    );
    const id = [...result.current.narration.keys()][0]!;
    act(() => result.current.advanceNarration(id));
    expect(result.current.narration.size).toBe(0);
    expect(state.manual.signalSeat).toBe(0);
    state.manual.revision += 1;
    rerender();
    expect(result.current.narration.size).toBe(0);
    state.manual.signalRevision += 1;
    rerender();
    expect(result.current.narration.size).toBe(1);
    expect([...result.current.narration.keys()][0]).not.toBe(id);
    rerender();
    expect(result.current.narration.size).toBe(1);
  });

  it("expires a manual signal using the normal narration reading lifetime", async () => {
    const state = createManualSignalState(0);
    const { result } = renderHook(() =>
      useMatchCues({ batches: [], state, viewerSeat: 0, mulliganOpen: false, anchors, onActionRejected() {} }),
    );
    expect(result.current.narration.size).toBe(1);
    await advance(NOTICE_ITEM_MS);
    expect(result.current.narration.size).toBe(0);
    expect(state.manual.signalSeat).toBe(0);
  });
});
