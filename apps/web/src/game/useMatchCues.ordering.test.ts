import { deletionField } from "./screen/model/presentedBoard";
// @vitest-environment jsdom

import { act, cleanup, render as renderDom, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { GameState, Seat, ServerEvent } from "@aegis/shared";
import { useMatchCues, type MatchCueAnchors } from "./useMatchCues";
import { singleServerBatch, type ServerBatch } from "../net/serverBatches";
import { recordSnapshot, selectPresentedState, type StateSnapshot } from "../net/presentedState";
import { presentedSeats } from "./screen/model/presentedSeats";
import { TIMINGS } from "./timings";
import { observeGateExpiry as observeTitanGateExpiry } from "./match/presentationGate";
import type { PresentationPacing, PresentationProbe, PresentationControls } from "./presentationProbe";
import { NarrationStack } from "./NarrationStack";
import { I18nProvider } from "../i18n";
import { CardOpenerProvider } from "./cardLinks";

vi.mock("../design/sound", () => ({ playSound: vi.fn<(kind: string) => void>() }));

const VIEWER = 0;

const BOARD = {
  players: [
    {
      battleArea: [
        {
          permanentId: "perm-3",
          topCard: { instanceId: "s0-27", cardId: "AD1-002" },
          stack: [],
          currentDP: 12000,
        },
      ],
      trash: [],
      hand: [],
    },
    {
      battleArea: [
        {
          permanentId: "perm-1",
          topCard: { instanceId: "s1-17", cardId: "BT18-015" },
          stack: [{ instanceId: "s1-51", cardId: "BT15-006" }],
          currentDP: 5000,
        },
      ],
      trash: [],
      hand: [],
    },
  ],
} as unknown as GameState;

const anchors: MatchCueAnchors = {
  board: { current: null },
  permanentCenter: (permanentId) =>
    permanentId === "perm-1" || permanentId === "perm-3" ? { x: 120, y: 80 } : undefined,
  yourDeck: { current: null },
  oppDeck: { current: null },
  yourHandDock: { current: null },
  oppHandStrip: { current: null },
  yourSecurity: { current: null },
  oppSecurity: { current: null },
};

function batchFeed(): (fresh: readonly ServerEvent[]) => readonly ServerBatch[] {
  let version = 0;
  let batches: readonly ServerBatch[] = [];
  return (fresh) => {
    if (fresh.length > 0) batches = [...batches, singleServerBatch(fresh, (version += 1))];
    return batches;
  };
}

interface OrderingProps {
  batches: readonly ServerBatch[];
  decisionPending: boolean;
  state: GameState;
  snapshots: readonly StateSnapshot[];
}

function renderOrderingCues(
  initialState: GameState = BOARD,
  cueAnchors: MatchCueAnchors = anchors,
  viewerSeat: Seat = VIEWER,
  presentationPacing: PresentationPacing = "current",
  devProbe?: PresentationProbe,
) {
  const feed = batchFeed();
  let snapshots = recordSnapshot([], initialState);
  const view = renderHook(
    ({ batches, decisionPending, state, snapshots: taken }: OrderingProps) =>
      useMatchCues({
        narrationLimit: 3,
        presentationPacing,
        devProbe,
        batches,
        state,
        snapshots: taken,
        viewerSeat,
        mulliganOpen: false,
        decisionPending,
        anchors: cueAnchors,
        onActionRejected: vi.fn<(reason: string) => void>(),
      }),
    {
      initialProps: {
        batches: [],
        decisionPending: false,
        state: initialState,
        snapshots,
      } as OrderingProps,
    },
  );
  let pending = false;
  let board = initialState;
  const render = (batches: readonly ServerBatch[]) =>
    view.rerender({ batches, decisionPending: pending, state: board, snapshots });
  const takeBoard = (nextState: GameState) => {
    board = nextState;
    snapshots = recordSnapshot(snapshots, board);
  };
  return {
    ...view,
    feedBatch: (fresh: readonly ServerEvent[], nextState: GameState = board) => {
      takeBoard(nextState);
      render(feed(fresh));
    },
    feedBatches: (freshBatches: readonly (readonly ServerEvent[])[], nextState: GameState = board) => {
      takeBoard(nextState);
      let batches: readonly ServerBatch[] = [];
      for (const fresh of freshBatches) batches = feed(fresh);
      render(batches);
    },
    setDecisionPending: (value: boolean) => {
      pending = value;
      render(feed([]));
    },
  };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function firstSeenOrder(
  probes: Record<string, () => boolean>,
  totalMs: number,
  observeFrame?: () => void,
): Promise<readonly string[]> {
  const seen: string[] = [];
  for (let elapsed = 0; elapsed <= totalMs; elapsed += 16) {
    observeFrame?.();
    for (const [name, probe] of Object.entries(probes)) if (!seen.includes(name) && probe()) seen.push(name);
    await advance(16);
  }
  return seen;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("keeps a raising evolution's card through its arrival tail before the next live top", async () => {
  const board = (cardId: string, stateVersion: number) =>
    ({
      ...BOARD,
      stateVersion,
      players: [
        BOARD.players[0],
        {
          ...BOARD.players[1],
          breeding: {
            permanentId: "raising",
            topCard: { cardId, instanceId: cardId },
            stack: [],
            currentDP: 0,
          },
        },
      ],
    }) as unknown as GameState;
  const first = board("ST1-03", 1);
  const next = board("ST1-05", 2);
  const view = renderOrderingCues(board("ST1-01", 0));
  view.feedBatch(
    [{ kind: "digivolved", seat: 1, permanentId: "raising", cardId: "ST1-03", mechanic: "normal", inBreeding: true }],
    first,
  );
  await advance(800);
  expect(view.result.current.permanentBursts.get("raising")?.variant).toBe("evolve");
  view.feedBatch(
    [{ kind: "digivolved", seat: 1, permanentId: "raising", cardId: "ST1-05", mechanic: "normal", inBreeding: true }],
    next,
  );
  await advance(16);
  const selected = selectPresentedState({
    live: next,
    snapshots: recordSnapshot(recordSnapshot([], first), next),
    presentedStateVersion: view.result.current.presentedStateVersion,
  });
  expect(selected!.players[1]!.breeding!.topCard.cardId).toBe("ST1-03");
  await advance(TIMINGS.cardBurst + 800);
  expect(
    selectPresentedState({
      live: next,
      snapshots: recordSnapshot(recordSnapshot([], first), next),
      presentedStateVersion: view.result.current.presentedStateVersion,
    })!.players[1]!.breeding!.topCard.cardId,
  ).toBe("ST1-05");
});

it.each([
  { redacted: false, viewerSeat: 0 as Seat, skip: false, destination: "hand" },
  { redacted: true, viewerSeat: 0 as Seat, skip: false, destination: "hand" },
  { redacted: false, viewerSeat: 1 as Seat, skip: false, destination: "hand" },
  { redacted: true, viewerSeat: 0 as Seat, skip: true, destination: "hand" },
  { redacted: true, viewerSeat: 0 as Seat, skip: false, destination: "deck" },
])(
  "issue #4905: source peels precede Merciful returning to $destination ($redacted, viewer $viewerSeat, skip $skip)",
  async ({ redacted, viewerSeat, skip, destination }) => {
    const sources = ["AD1-025", "EX9-019", "BT21-061", "ST20-02", "ST21-08", "ST20-06"].map((cardId, index) => ({
      instanceId: `source-${index}`,
      cardId,
    }));
    const merciful = { instanceId: "merciful", cardId: "EX13-077" };
    const before = {
      ...BOARD,
      stateVersion: 0,
      players: [
        { ...BOARD.players[0], handCount: 0 },
        {
          ...BOARD.players[1],
          handCount: 0,
          battleArea: [{ permanentId: "perm-1", topCard: merciful, stack: [...sources].reverse(), currentDP: 22000 }],
        },
      ],
    } as unknown as GameState;
    const { hand: _privateHand, ...publicOpponent } = before.players[1]!;
    const after = {
      ...before,
      stateVersion: 3,
      players: [
        before.players[0],
        {
          ...publicOpponent,
          battleArea: [],
          trash: sources,
          ...(redacted ? {} : { hand: destination === "deck" ? [] : [merciful] }),
          handCount: destination === "hand" ? 1 : 0,
        },
      ],
    } as unknown as GameState;
    const node = document.createElement("div");
    node.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const view = renderOrderingCues(
      before,
      {
        ...anchors,
        board: { current: node },
        oppDeck: { current: node },
        oppHandStrip: { current: node },
        yourDeck: { current: node },
        yourHandDock: { current: node },
      },
      viewerSeat,
    );
    await advance(0);
    const trigger: ServerEvent = {
      kind: "effectTriggered",
      seat: 0,
      sourceCardId: "ST17-13",
      sourcePermanentId: "perm-3",
      effectKey: "magnamon-colors",
      timing: "WhenDigivolving",
      description:
        "[When Digivolving] Trash the top digivolution card of 1 of your opponent's Digimon for each of that Digimon's colors. Then, return 1 of your opponent's Digimon with no digivolution cards to the hand.",
    };
    view.feedBatches(
      [
        [trigger],
        [
          {
            kind: "cardsMoved",
            instanceIds: sources.map((card) => card.instanceId),
            cardIds: sources.map((card) => card.cardId),
            seat: 1,
            from: "various",
            to: "trash",
            trashedSources: { permanentId: "perm-1", hostCardId: "EX13-077", sourceCardId: "ST17-13" },
          },
        ],
        [
          {
            kind: "cardsMoved",
            instanceIds: ["merciful"],
            from: "various",
            to: destination as "hand" | "deck",
            ...(destination === "deck"
              ? {
                  returnedPermanents: [
                    { permanentId: "perm-1", seat: 1 as Seat, instanceId: "merciful", cardId: "EX13-077" },
                  ],
                }
              : {}),
          },
        ],
      ],
      after,
    );
    const snapshots = recordSnapshot(recordSnapshot([], before), after);
    const shown = () => {
      const cues = view.result.current;
      return presentedSeats({
        shownState: selectPresentedState({
          live: after,
          snapshots,
          presentedStateVersion: cues.presentedStateVersion,
        })!,
        viewer: after.players[viewerSeat]!,
        opponent: after.players[viewerSeat === 0 ? 1 : 0]!,
        viewerSeat,
        heldPhaseState: cues.heldPhaseState,
        heldBlowState: cues.heldBlowState,
        heldSecurityEffectState: cues.heldSecurityEffectState,
        heldDrawState: cues.heldDrawState,
        heldBreedingState: cues.heldBreedingState,
        heldDeletions: cues.heldDeletions,
        heldStackStrips: cues.heldStackStrips,
        heldTrashArrivals: cues.heldTrashArrivals,
        optimisticPlayedInstanceId: undefined,
      });
    };
    const peelsSeen: string[] = [];
    const frames: { shown: ReturnType<typeof shown>; peelCount: number; flightCount: number }[] = [];
    for (let elapsed = 0; elapsed < 6000; elapsed += 16) {
      const peel = view.result.current.deleteBursts.find((burst) => burst.stackStrip);
      if (peel?.cardId && peelsSeen.at(-1) !== peel.cardId) peelsSeen.push(peel.cardId);
      if (peel) {
        frames.push({
          shown: shown(),
          peelCount: peelsSeen.length,
          flightCount: view.result.current.drawFlights.length,
        });
        if (skip) act(() => view.result.current.skipAnimations());
      }
      await advance(16);
    }
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      const field = (viewerSeat === 0 ? frame.shown.shownOpponent : frame.shown.shownViewer).battleArea;
      expect(field.map((permanent) => permanent.topCard.instanceId)).toContain("merciful");
      expect(field.find((permanent) => permanent.permanentId === "perm-1")?.stack).toHaveLength(7 - frame.peelCount);
      expect(viewerSeat === 0 ? frame.shown.shownOpponentHandCount : frame.shown.shownHandCount).toBe(0);
      expect(frame.shown.shownHand.some((card) => card.instanceId === "merciful")).toBe(false);
      expect(frame.flightCount).toBe(0);
    }
    expect(peelsSeen).toEqual((skip ? sources.slice(0, 1) : sources).map((card) => card.cardId));
    expect((viewerSeat === 0 ? shown().shownOpponent : shown().shownViewer).battleArea).toHaveLength(0);
    expect(viewerSeat === 0 ? shown().shownOpponentHandCount : shown().shownHandCount).toBe(
      destination === "hand" ? 1 : 0,
    );
    expect((viewerSeat === 0 ? shown().shownOpponent : shown().shownViewer).hand).toEqual(
      redacted ? undefined : after.players[1]!.hand,
    );
    expect(view.result.current.heldStackStrips.size).toBe(0);
    expect(view.result.current.deleteBursts).toHaveLength(0);
    expect(shown().shownHand).toEqual(viewerSeat === 1 ? [merciful] : after.players[0]!.hand);
  },
);

describe("an effect's consequences follow the toast that names it", () => {
  const batches: ServerEvent[][] = [];
  const push = (...batch: ServerEvent[]) => {
    batches.push(batch);
  };
  push(
    { kind: "cardsMoved", instanceIds: ["s0-27"], from: "hand", to: "battleArea" },
    { kind: "digivolved", seat: 0, permanentId: "perm-3", cardId: "AD1-002", mechanic: "normal", inBreeding: false },
  );
  push({
    kind: "effectTriggered",
    seat: 0,
    sourceCardId: "AD1-002",
    sourceInstanceId: "s0-27",
    sourcePermanentId: "perm-3",
    effectKey: "AD1-002/ir-7-0",
    description: "[WhenDigivolving] Delete 1 target(s)",
    timing: "WhenDigivolving",
  });
  push({
    kind: "cardsMoved",
    instanceIds: ["s1-51", "s1-17"],
    from: "battleArea",
    to: "trash",
    deletedPermanents: [{ permanentId: "perm-1", instanceId: "s1-17", cardId: "BT18-015", seat: 1 }],
  });
  push({
    kind: "effectResolved",
    seat: 0,
    sourceCardId: "AD1-002",
    sourceInstanceId: "s0-27",
    sourcePermanentId: "perm-3",
    effectKey: "AD1-002/ir-7-0",
    description: "[WhenDigivolving] Delete 1 target(s)",
    timing: "WhenDigivolving",
  });
  push({
    kind: "effectTriggered",
    seat: 1,
    sourceCardId: "BT15-006",
    sourceInstanceId: "s1-51",
    effectKey: "BT15-006/ir-11-0",
    description: "[OnDeletion] Draw 2",
    timing: "OnDestroyedAnyone",
    isInherited: true,
  });

  it("shows the [When Digivolving] toast before the shatter and the victim's own toast", async () => {
    const view = renderOrderingCues();
    await advance(0);
    for (const batch of batches) {
      view.feedBatch(batch);
      await advance(16);
    }
    const noticeFor = (cardId: string) => () =>
      view.result.current.notices.some((notice) => notice.body.variant === "effect" && notice.body.cardId === cardId);
    const order = await firstSeenOrder(
      {
        announce: noticeFor("AD1-002"),
        shatter: () => view.result.current.deleteBursts.length > 0,
        victimToast: noticeFor("BT15-006"),
      },
      4000,
    );
    expect(order[0]).toBe("announce");
    expect(order).toContain("shatter");
    expect(order).toContain("victimToast");
  });
});

describe("Seventh Fascination's end-turn deletion and Lilithmon's reaction", () => {
  it("shows the granted clause, then deletion, then Lilithmon before security breaks", async () => {
    const before = {
      players: [
        {
          battleArea: [
            { permanentId: "perm-3", topCard: { instanceId: "lilith", cardId: "EX7-061" }, stack: [] },
            { permanentId: "perm-asuna", topCard: { instanceId: "asuna", cardId: "BT24-088" }, stack: [] },
          ],
          trash: [],
          hand: [],
          securityCount: 5,
        },
        {
          battleArea: [{ permanentId: "perm-1", topCard: { instanceId: "target", cardId: "BT1-009" }, stack: [] }],
          trash: [],
          hand: [],
          securityCount: 5,
        },
      ],
    } as unknown as GameState;
    const after = {
      players: [
        before.players[0],
        {
          battleArea: [],
          trash: [
            { instanceId: "target", cardId: "BT1-009" },
            { instanceId: "top", cardId: "BT1-020" },
          ],
          hand: [],
          securityCount: 4,
        },
      ],
    } as unknown as GameState;
    const view = renderOrderingCues(before);
    await advance(0);
    // The live arena closes these as separate batches. Asuna's earlier [On Play]
    // uses centerStage; that track was still pending when Lilithmon's reaction
    // arrived and a later shield break replaced it.
    const events: ServerEvent[] = [
      {
        kind: "effectTriggered",
        seat: 0,
        sourceCardId: "BT24-088",
        sourceInstanceId: "asuna",
        sourcePermanentId: "perm-asuna",
        effectKey: "asuna-on-play",
        description: "[On Play] Draw 2",
        timing: "OnPlay",
      },
      {
        kind: "effectTriggered",
        seat: 1,
        sourceCardId: "BT1-009",
        sourceInstanceId: "target",
        sourcePermanentId: "perm-1",
        effectKey: "grant",
        description: "[Granted] [End of Your Turn] Delete 1 of your Digimon.",
        timing: "endOfTurn",
      },
      {
        kind: "cardsMoved",
        from: "battleArea",
        to: "trash",
        instanceIds: ["target"],
        deletedPermanents: [{ permanentId: "perm-1", instanceId: "target", cardId: "BT1-009", seat: 1 }],
      },
      {
        kind: "effectResolved",
        seat: 1,
        sourceCardId: "BT1-009",
        effectKey: "grant",
        description: "[Granted] [End of Your Turn] Delete 1 of your Digimon.",
        timing: "endOfTurn",
      },
      {
        kind: "effectTriggered",
        seat: 0,
        sourceCardId: "EX7-061",
        sourceInstanceId: "lilith",
        sourcePermanentId: "perm-3",
        effectKey: "reaction",
        description:
          "[All Turns] [Once Per Turn] When another Digimon is deleted, if it's your turn, you may play 1 purple level 4 or lower Digimon card from your trash without paying the cost. If it's your opponent's turn, trash the top card of their security stack.",
        timing: "onDeletionOf",
        printedTiming: "AllTurns",
      },
      { kind: "cardsMoved", from: "security", to: "trash", seat: 1, instanceIds: ["top"], cardIds: ["BT1-020"] },
      {
        kind: "effectResolved",
        seat: 0,
        sourceCardId: "EX7-061",
        effectKey: "reaction",
        description: "Lilithmon reaction",
        timing: "onDeletionOf",
      },
    ];
    view.feedBatches(
      events.map((event) => [event]),
      after,
    );
    const narrationView = () =>
      createElement(
        I18nProvider,
        null,
        createElement(
          CardOpenerProvider,
          null,
          createElement(NarrationStack, {
            narration: view.result.current.narration,
            rejection: null,
            onAdvance: () => undefined,
            onDismissRejection: () => undefined,
          }),
        ),
      );
    const dom = renderDom(narrationView());
    const visibleToastFor = (cardName: string, clause: string) => () => {
      dom.rerender(narrationView());
      return [...dom.container.querySelectorAll(".match-notice-stack")].some(
        (node) => node.textContent?.includes(cardName) && node.textContent?.includes(clause),
      );
    };
    const order = await firstSeenOrder(
      {
        grantToast: visibleToastFor("Monodramon", "Delete 1 of your Digimon"),
        deletion: () => view.result.current.deleteBursts.length > 0,
        lilithToast: visibleToastFor("Lilithmon (X Antibody)", "trash the top card of their security stack"),
        securityBreak: () => view.result.current.securityBreak !== null,
      },
      6000,
    );
    expect(order).toEqual(["grantToast", "deletion", "lilithToast", "securityBreak"]);
  });
});

describe("an effect plays a token onto the viewer's own field", () => {
  const TOKEN_PERMANENT = "perm-token";
  const TOKEN_BATCH: ServerEvent[] = [
    {
      kind: "effectTriggered",
      seat: 0,
      sourceCardId: "AD1-002",
      sourceInstanceId: "s0-27",
      sourcePermanentId: "perm-3",
      effectKey: "AD1-002/ir-7-0",
      description: "[OnPlay] Play 1 Fujitsumon Token",
      timing: "OnPlay",
    },
    {
      kind: "cardPlayed",
      seat: 0,
      cardId: "TOKEN-Fujitsumon-Token",
      permanentId: TOKEN_PERMANENT,
    },
  ] as ServerEvent[];

  function boardWithToken(): GameState {
    const board = structuredClone(BOARD) as GameState;
    board.players[0]!.battleArea.push({
      permanentId: TOKEN_PERMANENT,
      topCard: { instanceId: "tok-1", cardId: "TOKEN-Fujitsumon-Token" },
      stack: [],
      currentDP: 3000,
    } as unknown as (typeof board.players)[0]["battleArea"][number]);
    return board;
  }

  it("holds the token off the field until the toast that made it is up", async () => {
    const view = renderOrderingCues();
    await advance(0);
    view.feedBatch(TOKEN_BATCH, boardWithToken());
    await advance(16);
    const order = await firstSeenOrder(
      {
        toast: () =>
          view.result.current.notices.some(
            (notice) => notice.body.variant === "effect" && notice.body.cardId === "AD1-002",
          ),
        token: () => !view.result.current.pendingPermanentIds.has(TOKEN_PERMANENT),
      },
      4000,
    );
    expect(order).toEqual(["toast", "token"]);
  });
});

const ONE_BATCH: ServerEvent[] = [
  { kind: "cardsMoved", instanceIds: ["s0-27"], from: "hand", to: "battleArea" },
  { kind: "digivolved", seat: 0, permanentId: "perm-3", cardId: "AD1-002", mechanic: "normal", inBreeding: false },
  {
    kind: "effectTriggered",
    seat: 0,
    sourceCardId: "AD1-002",
    sourceInstanceId: "s0-27",
    sourcePermanentId: "perm-3",
    effectKey: "AD1-002/ir-7-0",
    description: "[WhenDigivolving] Delete 1 target(s)",
    timing: "WhenDigivolving",
  },
  {
    kind: "cardsMoved",
    instanceIds: ["s1-51", "s1-17"],
    from: "battleArea",
    to: "trash",
    deletedPermanents: [{ permanentId: "perm-1", instanceId: "s1-17", cardId: "BT18-015", seat: 1 }],
  },
  {
    kind: "effectResolved",
    seat: 0,
    sourceCardId: "AD1-002",
    sourceInstanceId: "s0-27",
    sourcePermanentId: "perm-3",
    effectKey: "AD1-002/ir-7-0",
    description: "[WhenDigivolving] Delete 1 target(s)",
    timing: "WhenDigivolving",
  },
] as ServerEvent[];

const FREEZE_BATCH: ServerEvent[] = [
  {
    kind: "effectTriggered",
    seat: 0,
    sourceCardId: "AD1-002",
    sourceInstanceId: "s0-27",
    sourcePermanentId: "perm-3",
    effectKey: "AD1-002/ir-9-0",
    description: "[WhenDigivolving] This Digimon can't attack",
    timing: "WhenDigivolving",
  },
] as ServerEvent[];

function frozenBoard(): GameState {
  const board = structuredClone(BOARD) as GameState;
  (board.players[1]!.battleArea[0] as unknown as { cannotAttack: boolean }).cannotAttack = true;
  return board;
}

describe("one batch carries a clause and what it deleted", () => {
  it("shows the toast before the shatter", async () => {
    const view = renderOrderingCues();
    await advance(0);
    view.feedBatch(ONE_BATCH);
    await advance(16);
    const order = await firstSeenOrder(
      {
        announce: () =>
          view.result.current.notices.some(
            (notice) => notice.body.variant === "effect" && notice.body.cardId === "AD1-002",
          ),
        shatter: () => view.result.current.deleteBursts.length > 0,
      },
      6000,
    );
    expect(order).toEqual(["announce", "shatter"]);
  });
});

describe("one batch carries a clause and the Digimon it locked down", () => {
  it("shows the toast before the jolt", async () => {
    const view = renderOrderingCues();
    await advance(0);
    view.feedBatch(FREEZE_BATCH, frozenBoard());
    await advance(16);
    const order = await firstSeenOrder(
      {
        announce: () =>
          view.result.current.notices.some(
            (notice) => notice.body.variant === "effect" && notice.body.cardId === "AD1-002",
          ),
        jolt: () => view.result.current.freezePulses.size > 0,
      },
      6000,
    );
    expect(order).toEqual(["announce", "jolt"]);
  });
});

describe("a security battle's outcome comes before the attacker's death", () => {
  const ATTACK: ServerEvent = {
    kind: "attackDeclared",
    seat: 0,
    attackerPermanentId: "perm-3",
    attackerCardId: "AD1-002",
    attackerArtId: "AD1-002",
    target: { kind: "player" },
  };
  const REVEAL: ServerEvent = {
    kind: "securityRevealed",
    seat: 1,
    revealedCardId: "BT18-019",
    artId: "BT18-019",
    attackerPermanentId: "perm-3",
    attackerArtId: "AD1-002",
    securityCardDP: 14000,
    attackerDP: 12000,
    hasSecurityEffect: false,
    isDigimon: true,
  };
  const ATTACKER_TRASHED: ServerEvent = {
    kind: "cardsMoved",
    instanceIds: ["s0-27"],
    from: "battleArea",
    to: "trash",
    deletedPermanents: [{ permanentId: "perm-3", instanceId: "s0-27", cardId: "AD1-002", seat: 0 }],
  };
  const CHECKED: ServerEvent = {
    kind: "securityChecked",
    seat: 1,
    revealedCardId: "BT18-019",
    artId: "BT18-019",
    resolution: "battle",
    battle: { securityDigimonDeleted: false, attackerDeleted: true, attackerDP: 12000, securityCardDP: 14000 },
  };
  const ON_DELETION: ServerEvent = {
    kind: "effectTriggered",
    seat: 0,
    sourceCardId: "AD1-002",
    sourceInstanceId: "s0-27",
    effectKey: "AD1-002/ir-11-0",
    description: "[OnDeletion] Draw 2",
    timing: "OnDestroyedAnyone",
    duringSecurityCheck: true,
  };

  function boardAt(stateVersion: number, { attacker = true }: { attacker?: boolean } = {}): GameState {
    const board = structuredClone(BOARD);
    board.stateVersion = stateVersion;
    if (!attacker) {
      const [dying] = board.players[0]!.battleArea.splice(0);
      if (dying) board.players[0]!.trash.push(dying.topCard);
    }
    return board;
  }

  const settled = (view: ReturnType<typeof renderOrderingCues>) => () =>
    view.result.current.securityClash?.resolution === "battle";

  it("plays the outcome, then the shatter, then the [On Deletion] toast (new server order)", async () => {
    const view = renderOrderingCues();
    await advance(0);
    for (const batch of [[ATTACK], [REVEAL], [ATTACKER_TRASHED], [CHECKED], [ON_DELETION]]) {
      view.feedBatch(batch as ServerEvent[]);
      await advance(16);
    }
    const order = await firstSeenOrder(
      {
        outcome: settled(view),
        shatter: () => view.result.current.deleteBursts.length > 0,
        deathToast: () =>
          view.result.current.notices.some(
            (notice) => notice.body.variant === "effect" && notice.body.cardId === "AD1-002",
          ),
      },
      8000,
    );
    expect(order).toEqual(["outcome", "shatter", "deathToast"]);
  });

  it("keeps the shatter behind the outcome when the viewer fast-forwards", async () => {
    const view = renderOrderingCues();
    await advance(0);
    for (const batch of [[ATTACK], [REVEAL], [ATTACKER_TRASHED]]) {
      view.feedBatch(batch as ServerEvent[]);
      await advance(16);
    }
    act(() => view.result.current.skipAnimations());
    await advance(1000);
    expect(view.result.current.deleteBursts).toHaveLength(0);

    view.feedBatch([CHECKED]);
    await advance(2000);
    expect(view.result.current.heldBlowState).toBeUndefined();
    expect(view.result.current.securityClash).toBeNull();
    expect(view.result.current.deleteBursts).toHaveLength(0);
  });

  it("keeps the attacker on the field when its whole check lands in one patch", async () => {
    const view = renderOrderingCues(boardAt(1));
    await advance(0);
    view.feedBatches([[ATTACK], [REVEAL], [ATTACKER_TRASHED], [CHECKED]], boardAt(2, { attacker: false }));
    await advance(16);
    const held = view.result.current.heldBlowState?.players[VIEWER];
    expect(held?.battleArea.map((permanent) => permanent.permanentId)).toContain("perm-3");
    expect(held?.battleArea.find((permanent) => permanent.permanentId === "perm-3")?.isSuspended).toBe(true);
    expect(held?.trash.map((card) => card.instanceId)).not.toContain("s0-27");
  });

  it("shows the outcome before the attacker's deletion when both arrive in one batch", async () => {
    // A tied security battle deletes both Digimon; the server sends the attacker's trash move
    // and the outcome in a single batch (Gallantmon 12000 vs BT26-079 12000).
    const tie: ServerEvent = {
      ...CHECKED,
      battle: { securityDigimonDeleted: true, attackerDeleted: true, attackerDP: 12000, securityCardDP: 12000 },
    } as ServerEvent;
    const view = renderOrderingCues(boardAt(1));
    await advance(0);
    view.feedBatch([ATTACK]);
    await advance(16);
    view.feedBatch([REVEAL]);
    await advance(16);
    view.feedBatch([ATTACKER_TRASHED, tie], boardAt(2, { attacker: false }));
    await advance(16);
    const held = view.result.current.heldBlowState?.players[VIEWER];
    expect(held?.battleArea.map((permanent) => permanent.permanentId)).toContain("perm-3");
    expect(held?.trash.map((card) => card.instanceId)).not.toContain("s0-27");
    const order = await firstSeenOrder(
      {
        outcome: settled(view),
        shatter: () => view.result.current.deleteBursts.length > 0,
        deletedNotice: () =>
          view.result.current.notices.some(
            (notice) =>
              notice.body.variant === "deletion" && notice.body.cards.some((card) => card.cardId === "AD1-002"),
          ),
      },
      8000,
    );
    expect(order.indexOf("outcome")).toBe(0);
    expect(order).toEqual(expect.arrayContaining(["outcome", "shatter", "deletedNotice"]));
  });

  it("shatters the first attacker when the next check is staged before its outcome", async () => {
    const SECOND_ATTACK: ServerEvent = { ...ATTACK, attackerPermanentId: "perm-4", attackerCardId: "BT18-015" };
    const SECOND_REVEAL: ServerEvent = {
      ...REVEAL,
      revealedCardId: "BT21-013",
      artId: "BT21-013",
      attackerPermanentId: "perm-4",
      attackerArtId: "BT18-015",
    };
    const view = renderOrderingCues();
    await advance(0);
    for (const batch of [[ATTACK], [REVEAL], [ATTACKER_TRASHED]]) {
      view.feedBatch(batch as ServerEvent[]);
      await advance(16);
    }
    // The next attack's reveal reaches the client before the first check's outcome does,
    // which is what retires the first check's blow.
    view.feedBatch([SECOND_ATTACK, SECOND_REVEAL]);
    await advance(16);
    view.feedBatch([CHECKED]);
    const order = await firstSeenOrder(
      { shatter: () => view.result.current.deleteBursts.length > 0 },
      TIMINGS.securityDockMax / 4,
    );
    expect(order).toEqual(["shatter"]);
  });

  it("lets the clash go when the old server stops to ask the viewer something", async () => {
    const view = renderOrderingCues();
    await advance(0);
    view.feedBatch([ATTACK]);
    await advance(16);
    view.feedBatch([REVEAL]);
    await advance(16);
    view.feedBatch([ATTACKER_TRASHED, ON_DELETION]);
    await advance(16);
    view.setDecisionPending(true);

    await advance(TIMINGS.securityDockMax / 4);
    expect(view.result.current.securityClash).toBeNull();
    expect(view.result.current.securityRevealPending).toBe(false);
  });
});

describe("BeelStarmon's [When Attacking] clauses read before the security check deletes it (Discord 1555578375677018193)", () => {
  it("shows the unsuspend and Hurricane Screw Shot toasts before the security break and BeelStarmon's shatter", async () => {
    const before = {
      players: [
        {
          battleArea: [
            {
              permanentId: "perm-3",
              topCard: { instanceId: "beel", cardId: "BT25-085" },
              stack: [
                { instanceId: "shot", cardId: "EX7-071" },
                { instanceId: "base", cardId: "BT10-012" },
              ],
            },
          ],
          trash: [],
          hand: [],
          securityCount: 5,
        },
        {
          battleArea: [{ permanentId: "perm-1", topCard: { instanceId: "target", cardId: "BT1-009" }, stack: [] }],
          trash: [],
          hand: [],
          securityCount: 5,
        },
      ],
    } as unknown as GameState;
    const after = {
      players: [
        {
          battleArea: [],
          trash: [
            { instanceId: "shot", cardId: "EX7-071" },
            { instanceId: "base", cardId: "BT10-012" },
            { instanceId: "beel", cardId: "BT25-085" },
          ],
          hand: [],
          securityCount: 5,
        },
        { battleArea: [], trash: [{ instanceId: "target", cardId: "BT1-009" }], hand: [], securityCount: 4 },
      ],
    } as unknown as GameState;
    const useOption =
      "[When Digivolving] [When Attacking] [Once Per Turn] You may use 1 [Three Musketeers] or [TS] trait Option card from your hand or this Digimon's digivolution cards without paying the cost.";
    const unsuspend =
      "[When Digivolving] [When Attacking] [Counter] [Once Per Turn] By trashing 1 Option card from any of your Digimon's digivolution cards or link cards, this Digimon unsuspends.";
    const beelEffect = (kind: "effectTriggered" | "effectResolved", effectKey: string, description: string) =>
      ({
        kind,
        seat: 0,
        sourceCardId: "BT25-085",
        sourceInstanceId: "beel",
        sourcePermanentId: "perm-3",
        effectKey,
        description,
        timing: "WhenAttacking",
      }) as ServerEvent;
    const screwShot = (kind: "effectTriggered" | "effectResolved") =>
      ({
        kind,
        seat: 0,
        sourceCardId: "EX7-071",
        sourceInstanceId: "shot",
        effectKey: "subtrigger/18/onDigivolutionCardDiscarded",
        description: "onDigivolutionCardDiscarded",
        timing: "onDigivolutionCardDiscarded",
        printedTiming: "Static",
        isInherited: true,
      }) as ServerEvent;
    // The live board names the attacker's card; the security scene needs it to hold the attacker.
    anchors.permanentCardId = (permanentId) => (permanentId === "perm-3" ? "BT25-085" : undefined);
    onTestFinished(() => {
      delete anchors.permanentCardId;
    });
    const view = renderOrderingCues(before);
    await advance(0);
    view.feedBatches([
      [
        {
          kind: "attackDeclared",
          seat: 0,
          attackerPermanentId: "perm-3",
          attackerCardId: "BT25-085",
          target: { kind: "player" },
        },
      ],
      [beelEffect("effectTriggered", "BT25-085/ir-shared-0", useOption)],
    ]);
    await advance(2000);
    // Everything after the Option choice reaches the client in one patch, as in the reported match.
    const screwShotMain = (kind: "effectTriggered" | "effectResolved") =>
      ({
        kind,
        seat: 0,
        sourceCardId: "EX7-071",
        sourceInstanceId: "shot",
        effectKey: "EX7-071/main",
        description: "[Main] Delete 1 of your opponent's level 3 Digimon.",
        timing: "OnUseOption",
        ...(kind === "effectTriggered" ? { printedTiming: "Main" } : {}),
      }) as ServerEvent;
    view.feedBatches(
      [
        [{ kind: "cardPlayed", seat: 0, cardId: "EX7-071" }],
        [screwShotMain("effectTriggered")],
        [
          {
            kind: "cardsMoved",
            instanceIds: ["target"],
            from: "battleArea",
            to: "trash",
            deletedPermanents: [{ permanentId: "perm-1", instanceId: "target", cardId: "BT1-009", seat: 1 }],
          },
        ],
        [
          {
            kind: "cardsMoved",
            instanceIds: ["shot"],
            from: "various",
            to: "battleArea",
            optionUsed: true,
            placedUnder: { permanentId: "perm-3" },
          },
        ],
        [screwShotMain("effectResolved")],
        [beelEffect("effectResolved", "BT25-085/ir-shared-0", useOption)],
        [beelEffect("effectTriggered", "BT25-085/ir-shared-1", unsuspend)],
        [{ kind: "cardsMoved", instanceIds: ["shot"], from: "various", to: "trash" }],
        [{ kind: "cardsMoved", instanceIds: ["perm-3"], from: "suspended", to: "unsuspended" }],
        [beelEffect("effectResolved", "BT25-085/ir-shared-1", unsuspend)],
        [screwShot("effectTriggered"), { kind: "memoryChanged", from: 5, to: 6, reason: "gainMemory" }],
        [screwShot("effectResolved")],
        [
          {
            kind: "securityRevealed",
            seat: 1,
            revealedCardId: "BT1-010",
            attackerPermanentId: "perm-3",
            isDigimon: true,
          },
        ],
        [
          {
            kind: "cardsMoved",
            instanceIds: ["base", "beel"],
            from: "battleArea",
            to: "trash",
            deletedPermanents: [{ permanentId: "perm-3", instanceId: "beel", cardId: "BT25-085", seat: 0 }],
          },
          { kind: "securityChecked", seat: 1, revealedCardId: "BT1-010", resolution: "battle" },
        ],
      ] as ServerEvent[][],
      after,
    );
    let monodramonHeldAtBreak: boolean | undefined;
    let beelStarmonAtBreak: { isSuspended: boolean; stack: { instanceId: string }[] } | undefined;
    let optionWasDocked = false;
    let shotHeldWhileDocked: boolean | undefined;
    let shotHeldAtUnsuspend: boolean | undefined;
    const shotHeld = () =>
      [...view.result.current.heldTrashArrivals.values()].some((arrival) => arrival.instanceIds.includes("shot"));
    const order = await firstSeenOrder(
      {
        optionDocked: () => {
          optionWasDocked ||= view.result.current.optionBranch !== null;
          if (optionWasDocked) shotHeldWhileDocked ??= shotHeld();
          return optionWasDocked;
        },
        monodramonShatter: () => view.result.current.deleteBursts.some((burst) => burst.cardId === "BT1-009"),
        optionLeft: () => optionWasDocked && view.result.current.optionBranch === null,
        unsuspendToast: () => {
          const shown = view.result.current.notices.some(
            (notice) =>
              notice.body.variant === "effect" &&
              notice.body.cardId === "BT25-085" &&
              (notice.body.description ?? "").includes("this Digimon unsuspends"),
          );
          if (shown) shotHeldAtUnsuspend ??= shotHeld();
          return shown;
        },
        screwShotToast: () =>
          view.result.current.notices.some(
            (notice) =>
              notice.body.variant === "effect" &&
              notice.body.cardId === "EX7-071" &&
              !(notice.body.description ?? "").startsWith("[Main]"),
          ),
        securityBreak: () => {
          if (view.result.current.securityBreak === null) return false;
          monodramonHeldAtBreak ??= view.result.current.heldBlowState?.players[1]?.battleArea.some(
            (permanent) => permanent.permanentId === "perm-1",
          );
          beelStarmonAtBreak ??= view.result.current.heldBlowState?.players[0]?.battleArea.find(
            (permanent) => permanent.permanentId === "perm-3",
          ) as unknown as typeof beelStarmonAtBreak;
          return true;
        },
        beelShatter: () => view.result.current.deleteBursts.some((burst) => burst.cardId === "BT25-085"),
      },
      15000,
    );
    expect(order).toEqual([
      "optionDocked",
      "monodramonShatter",
      "optionLeft",
      "unsuspendToast",
      "screwShotToast",
      "securityBreak",
      "beelShatter",
    ]);
    expect(monodramonHeldAtBreak).not.toBe(true);
    // Hurricane Screw Shot reaches the trash with the unsuspend cost, not when it is used.
    expect(shotHeldWhileDocked).toBe(true);
    expect(shotHeldAtUnsuspend).toBe(false);
    // The unsuspend paid for with Hurricane Screw Shot is on screen before the battle.
    expect(beelStarmonAtBreak?.isSuspended).toBe(false);
    expect(beelStarmonAtBreak?.stack.map((card) => card.instanceId)).toEqual(["base"]);
  });
});

describe("a ＜Delay＞ Option paying its cost", () => {
  const guardian = {
    seat: 0,
    sourceCardId: "BT20-100",
    sourceInstanceId: "guardian",
    sourcePermanentId: "perm-3",
    effectKey: "BT20-100/ir-1-0/action-0",
    description:
      "[All Turns] When any of your Digimon with [Omnimon] in its name would leave the battle area, ＜Delay＞",
    timing: "AllTurns",
  } as const;
  const guardianBoard = {
    players: [
      {
        battleArea: [
          { permanentId: "perm-3", topCard: { instanceId: "guardian", cardId: "BT20-100" }, stack: [], currentDP: 0 },
        ],
        trash: [],
        hand: [],
      },
      {
        ...BOARD.players[1],
        battleArea: [
          ...BOARD.players[1]!.battleArea,
          { permanentId: "perm-7", topCard: { instanceId: "s1-30", cardId: "BT1-009" }, stack: [], currentDP: 3000 },
        ],
      },
    ],
  } as unknown as GameState;
  const afterWipe = {
    players: [
      { battleArea: [], trash: [{ instanceId: "guardian", cardId: "BT20-100" }], hand: [] },
      { battleArea: [], trash: [], hand: [] },
    ],
  } as unknown as GameState;
  // The server sends each of these in a batch of its own, as it did in match f1c49980.
  const delayThenWipe: ServerEvent[][] = [
    [{ kind: "effectTriggered", ...guardian }],
    [
      {
        kind: "cardsMoved",
        instanceIds: ["guardian"],
        from: "various",
        to: "trash",
        trashedPermanents: [{ permanentId: "perm-3", instanceId: "guardian", cardId: "BT20-100", seat: 0 }],
      },
    ],
    [{ kind: "effectResolved", ...guardian }],
    [{ kind: "deletionPrevented", keyword: "Delay", seat: 0, permanentId: "perm-9", cardId: "BT20-102" }],
    [
      {
        kind: "cardsMoved",
        instanceIds: ["s1-51", "s1-17"],
        from: "battleArea",
        to: "trash",
        deletedPermanents: [{ permanentId: "perm-1", instanceId: "s1-17", cardId: "BT18-015", seat: 1 }],
      },
    ],
    [
      {
        kind: "cardsMoved",
        instanceIds: ["s1-30"],
        from: "various",
        to: "deckBottom",
        seat: 1,
        returnedPermanents: [{ permanentId: "perm-7", instanceId: "s1-30", cardId: "BT1-009", seat: 1 }],
      },
    ],
  ];

  it("takes the Option, then each opponent Digimon, off the field one at a time (Discord 1555673696960774224)", async () => {
    const view = renderOrderingCues(guardianBoard);
    await advance(0);
    view.feedBatches(delayThenWipe, afterWipe);
    const seenAt: Record<string, number> = {};
    const at = (name: string, shown: boolean) => {
      if (shown) seenAt[name] ??= Date.now();
      return shown;
    };
    await firstSeenOrder(
      {
        clause: () =>
          at(
            "clause",
            view.result.current.notices.some(
              (notice) => notice.body.variant === "effect" && notice.body.cardId === "BT20-100",
            ),
          ),
        optionBreak: () =>
          at(
            "optionBreak",
            view.result.current.deleteBursts.some((burst) => burst.cardId === "BT20-100"),
          ),
        opponentBreak: () =>
          at(
            "opponentBreak",
            view.result.current.deleteBursts.some((burst) => burst.cardId === "BT18-015"),
          ),
        returnLeaves: () =>
          at(
            "returnLeaves",
            seenAt.opponentBreak !== undefined &&
              ![...view.result.current.heldDeletions.values()].some((held) => held.permanent.permanentId === "perm-7"),
          ),
      },
      8000,
    );
    const probeStepMs = 16;
    expect(seenAt.opponentBreak! - seenAt.optionBreak!).toBeGreaterThanOrEqual(TIMINGS.removalStagger - probeStepMs);
    expect(seenAt.returnLeaves! - seenAt.opponentBreak!).toBeGreaterThanOrEqual(TIMINGS.removalStagger - probeStepMs);
    // The Option breaks as its clause is read, with no reading beat in between.
    expect(seenAt.optionBreak! - seenAt.clause!).toBeLessThan(TIMINGS.effectAnnounce);
    expect(
      view.result.current.notices.some(
        (notice) => notice.body.variant === "keyword" && notice.body.cardId === "BT20-102",
      ),
    ).toBe(false);
  });
});

it("presents the resolving clause, its public target, then the opponent's leave protection", async () => {
  vi.useFakeTimers();
  const view = renderOrderingCues();
  view.feedBatch([
    {
      kind: "effectTriggered",
      seat: 0,
      sourceCardId: "AD1-002",
      sourcePermanentId: "perm-3",
      sourceInstanceId: "s0-27",
      effectKey: "on-play",
      timing: "OnPlay",
      description: "Delete 1 of your opponent's Digimon.",
    },
    { kind: "effectTargetsSelected", seat: 0, sourcePermanentId: "perm-3", targetPermanentIds: ["perm-1"] },
    {
      kind: "effectTriggered",
      seat: 1,
      sourceCardId: "BT18-015",
      sourcePermanentId: "perm-1",
      sourceInstanceId: "s1-17",
      effectKey: "protection",
      timing: "AllTurns",
      beforeRemoval: true,
      description: "When this Digimon would leave, it doesn't leave.",
    },
  ]);
  const order = await firstSeenOrder(
    {
      onPlay: () =>
        view.result.current.notices.some(
          (notice) => notice.body.variant === "effect" && notice.body.timing === "OnPlay",
        ),
      target: () => view.result.current.effectSources.some((source) => source.targetPermanentIds?.includes("perm-1")),
      protection: () =>
        view.result.current.notices.some(
          (notice) => notice.body.variant === "effect" && notice.body.timing === "AllTurns",
        ),
    },
    6000,
  );
  expect(order).toEqual(["onPlay", "target", "protection"]);
});

it.each([0, 1] as const)(
  "does not cycle when interrupted source on seat %s is deleted later in the same batch",
  async (deletedSeat) => {
    vi.useFakeTimers();
    const { observeGateExpiry } = await import("./match/presentationGate");
    const expiries: string[] = [];
    const stop = observeGateExpiry(({ label }) => expiries.push(label));
    onTestFinished(stop);
    const view = renderOrderingCues();
    const after = structuredClone(BOARD);
    after.players[deletedSeat]!.battleArea.splice(0);
    view.feedBatch(
      [
        {
          kind: "effectTriggered",
          seat: 0,
          sourceCardId: "AD1-002",
          sourcePermanentId: "perm-3",
          sourceInstanceId: "s0-27",
          effectKey: "on-play",
          timing: "OnPlay",
          description: "Delete 1 of your opponent's Digimon.",
        },
        { kind: "effectTargetsSelected", seat: 0, sourcePermanentId: "perm-3", targetPermanentIds: ["perm-1"] },
        {
          kind: "effectTriggered",
          seat: 1,
          sourceCardId: "BT18-015",
          sourcePermanentId: "perm-1",
          sourceInstanceId: "s1-17",
          effectKey: "protection",
          timing: "AllTurns",
          beforeRemoval: true,
          description: "When this Digimon would leave, by deleting 1 Digimon, it doesn't leave.",
        },
        { kind: "effectTargetsSelected", seat: 1, sourcePermanentId: "perm-1", targetPermanentIds: ["perm-3"] },
        {
          kind: "cardsMoved",
          instanceIds: deletedSeat === 1 ? ["s1-51", "s1-17"] : ["s0-27"],
          from: "battleArea",
          to: "trash",
          deletedPermanents: [
            deletedSeat === 1
              ? { permanentId: "perm-1", instanceId: "s1-17", cardId: "BT18-015", seat: 1 }
              : { permanentId: "perm-3", instanceId: "s0-27", cardId: "AD1-002", seat: 0 },
          ],
        },
      ],
      after,
    );
    await advance(12_000);
    expect(expiries).toEqual([]);
  },
);

// Actual Titan cascade: hand-trash reactions precede two physical Delay costs.
// Each cost must wait its turn without spending its own gate ceiling in that queue.
it.each([
  [false, 2, "live"],
  [true, 1, "live"],
  [true, 2, "live"],
  [true, 2, "skip"],
  [true, 2, "cancel"],
  [true, 2, "skip-tail"],
  [true, 2, "cancel-tail"],
] as const)(
  "keeps Titan Delay costs physical with earlier reactions queued=%s and copies=%s, %s",
  async (queuedReactions, copies, exit) => {
    const expiries: string[] = [];
    onTestFinished(observeTitanGateExpiry(({ label }) => expiries.push(label)));
    const option = (permanentId: string, instanceId: string) => ({
      permanentId,
      topCard: { instanceId, cardId: "BT24-098" },
      stack: [],
      currentDP: 0,
    });
    const first = option("delay-first", "option-first");
    const second = option("delay-second", "option-second");
    const titan = {
      permanentId: "titan",
      topCard: { instanceId: "titamon", cardId: "BT25-084" },
      stack: [],
      currentDP: 14000,
    };
    const before = {
      stateVersion: 0,
      players: [
        {
          battleArea: [titan, first, second],
          trash: [{ instanceId: "discard", cardId: "BT26-069" }],
          hand: [],
          deckCount: 30,
          securityCount: 0,
        },
        { battleArea: [], trash: [], hand: [], securityCount: 0 },
      ],
    } as unknown as GameState;
    const after = {
      ...before,
      stateVersion: 20,
      players: [
        {
          ...before.players[0],
          battleArea: copies === 2 ? [titan] : [titan, second],
          trash: [...[first, second].slice(0, copies).map((physical) => physical.topCard), ...before.players[0]!.trash],
          hand: [{ instanceId: "drawn", cardId: "BT1-009" }],
        },
        before.players[1],
      ],
    } as unknown as GameState;
    let controls: PresentationControls | undefined;
    const view = renderOrderingCues(
      before,
      {
        ...anchors,
        permanentCenter: () => ({ x: 200, y: 300 }),
        permanentFace: (id) => ({ x: id === "delay-first" ? 200 : 300, y: 300, width: 99, height: 139, angle: 0 }),
      },
      0,
      "sequential",
      {
        onQueue: (next) => {
          controls = next;
        },
      },
    );
    await advance(0);
    view.setDecisionPending(queuedReactions);
    const batches: ServerEvent[][] = [];
    if (queuedReactions) {
      const reaction = {
        seat: 0,
        sourceCardId: "BT25-084",
        sourceInstanceId: "titamon",
        sourcePermanentId: "titan",
        effectKey: "hand-trash",
        timing: "whenHandTrashed",
        description: "[All Turns] When your hand is trashed from, delete 1 of your opponent's lowest DP Digimon.",
      } as const;
      const draw = {
        seat: 0,
        sourceCardId: "BT26-069",
        sourceInstanceId: "discard",
        effectKey: "hand-draw",
        timing: "whenTrashedFromHand",
        description: "When this card is trashed from the hand, if your hand has 5 or fewer cards, ＜Draw 1＞",
      } as const;
      batches.push(
        [{ kind: "effectTriggered", ...reaction }],
        [{ kind: "effectResolved", ...reaction }],
        [
          { kind: "effectTriggered", ...draw },
          { kind: "cardsMoved", from: "deck", to: "hand", handAddition: "draw", seat: 0, instanceIds: ["drawn"] },
        ],
        [{ kind: "effectResolved", ...draw }],
      );
    }
    for (const physical of [first, second].slice(0, copies)) {
      const clause = {
        seat: 0,
        sourceCardId: "BT24-098",
        sourceInstanceId: physical.topCard.instanceId,
        sourcePermanentId: physical.permanentId,
        effectKey: `delay-${physical.permanentId}`,
        timing: "whenPlayed",
        description:
          "[Your Turn] When any of your [Titan] trait Digimon are played, ＜Delay＞ · If your opponent has 5 or more memory, you may play 1 level 5 or lower [Titan] Digimon from your trash.",
      } as const;
      batches.push(
        [{ kind: "effectTriggered", ...clause }],
        [
          {
            kind: "cardsMoved",
            from: "various",
            to: "trash",
            instanceIds: [physical.topCard.instanceId],
            trashedPermanents: [
              {
                permanentId: physical.permanentId,
                instanceId: physical.topCard.instanceId,
                cardId: "BT24-098",
                seat: 0,
              },
            ],
          },
        ],
        [{ kind: "effectResolved", ...clause }],
      );
    }
    view.feedBatches(batches, after);
    const assertBothHeld = () => expect(view.result.current.heldDeletions.size).toBe(2);
    const assertDepartureBegan = () =>
      expect([...view.result.current.heldDeletions.values()].some((held) => held.departed)).toBe(true);
    const assertSettled = () => {
      expect(controls?.queue.isIdle()).toBe(true);
      expect(expiries).toEqual([]);
    };
    const assertDecorationClean = () => {
      expect(view.result.current.heldDeletions.size).toBe(0);
      expect(view.result.current.deleteBursts).toHaveLength(0);
    };
    if (exit !== "live") {
      await advance(16);
      assertBothHeld();
      if (exit.endsWith("tail")) {
        await firstSeenOrder({ break: () => view.result.current.deleteBursts.length > 0 }, 8000);
        assertDepartureBegan();
      }
      if (exit.startsWith("skip")) act(() => view.result.current.skipAnimations());
      else view.unmount();
      await advance(1000);
      if (exit.startsWith("skip")) assertDecorationClean();
      assertSettled();
      return;
    }
    const visibleBrokenCopies: string[] = [];
    let breakFrames = 0;
    let tailFrames = 0;
    const brokenAt = new Map<string, number>();
    const missingWaitingCopies: string[] = [];
    const observeDepartureFrame = () => {
      const held = [...view.result.current.heldDeletions.values()];
      const departed = held.filter((hold) => hold.departed).map((hold) => hold.permanent.permanentId);
      if (!departed.length) return;
      breakFrames++;
      const shown = deletionField({ player: before.players[0]!, held });
      const visibleIds = shown.battleArea.map((permanent) => permanent.permanentId);
      for (const id of departed) {
        if (!brokenAt.has(id)) brokenAt.set(id, Date.now());
        if (Date.now() - brokenAt.get(id)! > TIMINGS.deletionBurst) tailFrames++;
      }
      visibleBrokenCopies.push(...visibleIds.filter((id) => departed.includes(id)));
      if (!departed.includes("delay-second") && !visibleIds.includes("delay-second"))
        missingWaitingCopies.push("delay-second");
    };
    const moments = await firstSeenOrder(
      {
        firstFocus: () =>
          view.result.current.effectSources.some(
            (source) => source.site.zone === "field" && source.site.permanentId === "delay-first",
          ),
        firstBreak: () => view.result.current.deleteBursts.some((burst) => burst.face?.x === 200),
        firstClause: () =>
          view.result.current.notices.some(
            (notice) => notice.body.variant === "effect" && notice.body.sourceInstanceId === "option-first",
          ),
        secondFocus: () =>
          copies === 2 &&
          view.result.current.effectSources.some(
            (source) => source.site.zone === "field" && source.site.permanentId === "delay-second",
          ),
        secondBreak: () => copies === 2 && view.result.current.deleteBursts.some((burst) => burst.face?.x === 300),
        secondClause: () =>
          copies === 2 &&
          view.result.current.notices.some(
            (notice) => notice.body.variant === "effect" && notice.body.sourceInstanceId === "option-second",
          ),
      },
      12000,
      observeDepartureFrame,
    );
    expect(moments).toEqual([
      "firstFocus",
      "firstBreak",
      "firstClause",
      ...(copies === 2 ? ["secondFocus", "secondBreak", "secondClause"] : []),
    ]);
    expect(breakFrames).toBeGreaterThan(1);
    expect(tailFrames).toBeGreaterThan(0);
    expect([...brokenAt.keys()]).toEqual(["delay-first", ...(copies === 2 ? ["delay-second"] : [])]);
    expect(missingWaitingCopies).toEqual([]);
    expect(visibleBrokenCopies).toEqual([]);
    assertDecorationClean();
    assertSettled();
  },
);

it("finishes a borrowed On Play presentation before the parent's then-discard", async () => {
  const expiries: string[] = [];
  onTestFinished(observeTitanGateExpiry(({ label }) => expiries.push(label)));
  const view = renderOrderingCues(BOARD, anchors, 0, "sequential");
  const effect = (kind: "effectTriggered" | "effectResolved", cardId: string, timing: string): ServerEvent => ({
    kind,
    seat: 0,
    sourceCardId: cardId,
    sourceInstanceId: "s0-27",
    sourcePermanentId: "perm-3",
    effectKey: `${cardId}/copy`,
    timing,
    description:
      cardId === "BT15-102"
        ? "[End of Your Turn] Activate 1 [On Play] effect. Then, trash the top 2 cards of your opponent's deck."
        : "[On Play] Gain 1 memory.",
  });
  view.feedBatches([
    [effect("effectTriggered", "BT15-102", "EndOfYourTurn")],
    [effect("effectTriggered", "BT15-031", "OnPlay")],
    [{ kind: "memoryChanged", from: 3, to: 4, reason: "gainMemory" }],
    [effect("effectResolved", "BT15-031", "OnPlay")],
    [{ kind: "cardsMoved", from: "deck", to: "trash", seat: 1, instanceIds: ["milled"], cardIds: ["ST1-03"] }],
    [effect("effectResolved", "BT15-102", "EndOfYourTurn")],
  ]);
  const order = await firstSeenOrder(
    {
      copiedEffect: () =>
        view.result.current.notices.some(
          (notice) => notice.body.variant === "effect" && notice.body.cardId === "BT15-031",
        ),
      discard: () => view.result.current.sidePanels.some((panel) => panel.titleKey === "panel.trashedCards"),
    },
    12000,
  );
  expect(order).toEqual(["copiedEffect", "discard"]);
  expect(expiries).toEqual([]);
});

it("keeps a borrowed effect's target on the field through its arrow before the Then notice", async () => {
  const expiries: string[] = [];
  onTestFinished(observeTitanGateExpiry(({ label }) => expiries.push(label)));
  const view = renderOrderingCues(BOARD, anchors, 0, "sequential");
  const source = {
    seat: 0 as const,
    sourceCardId: "BT15-102",
    sourceInstanceId: "s0-27",
    sourcePermanentId: "perm-3",
    effectKey: "apocalymon",
    timing: "EndOfYourTurn",
    description: "Activate an On Play. Then, trash the deck.",
  };
  const copied = {
    ...source,
    sourceCardId: "BT15-031",
    effectKey: "borrowed",
    timing: "OnPlay",
    description: "Return 1 opponent's Digimon to the hand.",
  };
  const continuation = {
    ...source,
    effectKey: "apocalymon/processing/TrashTopDeck",
    description:
      "Then, trash the top 2 cards of your opponent's deck for each of this Digimon's level 6 digivolution cards.",
  };
  const after = structuredClone(BOARD);
  after.players[1]!.battleArea.splice(0);
  view.feedBatches(
    [
      [{ kind: "effectTriggered", ...source }],
      [{ kind: "effectTriggered", ...copied }],
      [{ kind: "effectTargetsSelected", seat: 0, sourcePermanentId: "perm-3", targetPermanentIds: ["perm-1"] }],
      [
        {
          kind: "cardsMoved",
          from: "battleArea",
          to: "hand",
          seat: 1,
          instanceIds: ["s1-17"],
          returnedPermanents: [{ permanentId: "perm-1", instanceId: "s1-17", cardId: "BT18-015", seat: 1 }],
        },
      ],
      [{ kind: "effectResolved", ...copied }],
      [{ kind: "effectTriggered", ...continuation, effectTextPart: continuation.description }],
      [{ kind: "cardsMoved", from: "deck", to: "trash", seat: 1, instanceIds: ["milled"], cardIds: ["ST1-03"] }],
      [{ kind: "effectResolved", ...continuation }],
      [{ kind: "effectResolved", ...source }],
    ],
    after,
  );
  const missingTarget: boolean[] = [];
  const order = await firstSeenOrder(
    {
      copied: () =>
        view.result.current.notices.some(
          (notice) => notice.body.variant === "effect" && notice.body.effectKey === "borrowed",
        ),
      arrow: () =>
        view.result.current.effectSources.some((activation) => activation.targetPermanentIds?.includes("perm-1")),
      then: () =>
        view.result.current.notices.some(
          (notice) => notice.body.variant === "effect" && notice.body.effectTextPart === continuation.description,
        ),
      discard: () => view.result.current.sidePanels.some((panel) => panel.titleKey === "panel.trashedCards"),
    },
    16000,
    () => {
      if (view.result.current.effectSources.some((activation) => activation.targetPermanentIds?.includes("perm-1"))) {
        missingTarget.push(
          ![...view.result.current.heldDeletions.values()].some((held) => held.permanent.permanentId === "perm-1"),
        );
      }
    },
  );
  expect(order).toEqual(["copied", "arrow", "then", "discard"]);
  expect(missingTarget.length).toBeGreaterThan(0);
  expect(missingTarget).not.toContain(true);
  expect(expiries).toEqual([]);
});
