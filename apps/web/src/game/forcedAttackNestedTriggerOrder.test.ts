// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { GameState, Seat, ServerEvent } from "@aegis/shared";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ServerBatch } from "../net/serverBatches";
import { recordSnapshot, type StateSnapshot } from "../net/presentedState";
import { useMatchCues, type MatchCueAnchors } from "./useMatchCues";

vi.mock("../design/sound", () => ({ playSound: vi.fn<(kind: string) => void>() }));

function geometry(): MatchCueAnchors {
  const boardElement = document.createElement("div");
  const pile = document.createElement("div");
  vi.spyOn(boardElement, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600));
  vi.spyOn(pile, "getBoundingClientRect").mockReturnValue(new DOMRect(600, 40, 80, 100));
  return {
    board: { current: boardElement },
    permanentCenter: () => ({ x: 320, y: 120 }),
    permanentStack: (permanentId) => ({ x: 320, y: 120, width: 72, height: 100.8, angle: 0, permanentId }),
    yourDeck: { current: pile },
    oppDeck: { current: pile },
    yourHandDock: { current: pile },
    oppHandStrip: { current: pile },
    yourSecurity: { current: pile },
    oppSecurity: { current: pile },
  };
}

const attackerSeat: Seat = 1;
const defenderSeat: Seat = 0;
const marcusPermanentId = "perm-marcus";
const marcusInstanceId = "s1-marcus";
const drawnInstanceId = "s1-drawn";
const endTurnDescription =
  "[End of Your Turn] [Once Per Turn] If you have a yellow Digimon with [Agumon] or [Greymon] in its name, for the turn, 1 of your [Marcus Damon]s is also treated as a 6000 DP Digimon, gains ＜Rush＞ and can't digivolve. Then, 1 of your Digimon may attack.";
const suspendDescription =
  "[Your Turn] When this Tamer suspends, ＜Draw 1＞ Then, 1 of your Digimon may digivolve into a yellow Digimon card with [Greymon] in its name in the hand with the digivolution cost reduced by 3.";
const marcusSource = {
  seat: attackerSeat,
  sourceCardId: "AD1-021",
  sourceInstanceId: marcusInstanceId,
  sourcePermanentId: marcusPermanentId,
};
const endTurnEffect = {
  ...marcusSource,
  effectKey: "AD1-021/ir-3-0",
  description: endTurnDescription,
  timing: "OnEndTurn",
};
const suspendEffect = {
  ...marcusSource,
  effectKey: "subtrigger/whenSuspended~perm-marcus/whenSuspended",
  description: suspendDescription,
  timing: "whenSuspended",
};

interface BoardShape {
  marcusSuspended: boolean;
  marcusOnField: boolean;
  drawn: boolean;
  securityCount: number;
}

function board(stateVersion: number, shape: BoardShape): GameState {
  const marcus = {
    permanentId: marcusPermanentId,
    controllerSeat: attackerSeat,
    topCard: { instanceId: marcusInstanceId, cardId: "AD1-021", artId: "AD1-021", ownerSeat: attackerSeat },
    stack: [],
    linked: [],
    isSuspended: shape.marcusSuspended,
    currentDP: 6000,
    keywords: [],
  };
  const hand = shape.drawn ? [{ instanceId: drawnInstanceId, cardId: "EX13-026", artId: "EX13-026" }] : [];
  return {
    stateVersion,
    turnSeat: attackerSeat,
    turnCount: 6,
    phase: "Main",
    memory: -1,
    players: [
      {
        seat: defenderSeat,
        battleArea: [],
        trash: [],
        hand: [],
        handCount: 5,
        security: [],
        securityCount: shape.securityCount,
        deckCount: 30,
      },
      {
        seat: attackerSeat,
        battleArea: shape.marcusOnField ? [marcus] : [],
        trash: [],
        hand,
        handCount: hand.length,
        security: [],
        securityCount: 5,
        deckCount: shape.drawn ? 29 : 30,
      },
    ],
  } as unknown as GameState;
}

const settled: BoardShape = { marcusSuspended: false, marcusOnField: true, drawn: false, securityCount: 2 };
const attacking: BoardShape = { ...settled, marcusSuspended: true };
const drew: BoardShape = { ...attacking, drawn: true };
const checked: BoardShape = { ...drew, marcusOnField: false, securityCount: 1 };

const serverBatches: readonly { events: ServerEvent[]; shape: BoardShape }[] = [
  { events: [{ kind: "effectTriggered", ...endTurnEffect } as ServerEvent], shape: settled },
  {
    events: [
      {
        kind: "attackDeclared",
        seat: attackerSeat,
        attackerPermanentId: marcusPermanentId,
        attackerCardId: "AD1-021",
        attackerArtId: "AD1-021",
        target: { kind: "player" },
      } as ServerEvent,
    ],
    shape: attacking,
  },
  {
    events: [
      { kind: "effectTriggered", ...suspendEffect } as ServerEvent,
      {
        kind: "cardsMoved",
        instanceIds: [drawnInstanceId],
        from: "deck",
        to: "hand",
        handAddition: "draw",
        seat: attackerSeat,
      } as ServerEvent,
    ],
    shape: drew,
  },
  { events: [{ kind: "effectResolved", ...suspendEffect } as ServerEvent], shape: drew },
  {
    events: [
      {
        kind: "securityRevealed",
        artId: "BT23-043",
        attackerArtId: "AD1-021",
        securityCardDP: 8000,
        attackerDP: 6000,
        securityCountBefore: 2,
        seat: defenderSeat,
        revealedCardId: "BT23-043",
        attackerPermanentId: marcusPermanentId,
        hasSecurityEffect: false,
        isDigimon: true,
      } as ServerEvent,
    ],
    shape: drew,
  },
  {
    events: [
      {
        kind: "cardsMoved",
        instanceIds: [marcusInstanceId],
        from: "battleArea",
        to: "trash",
        deletedPermanents: [
          {
            permanentId: marcusPermanentId,
            instanceId: marcusInstanceId,
            cardId: "AD1-021",
            artId: "AD1-021",
            seat: attackerSeat,
          },
        ],
      } as ServerEvent,
      {
        kind: "securityChecked",
        artId: "BT23-043",
        seat: defenderSeat,
        revealedCardId: "BT23-043",
        resolution: "battle",
        battle: { securityDigimonDeleted: false, attackerDeleted: true, attackerDP: 6000, securityCardDP: 8000 },
      } as ServerEvent,
    ],
    shape: checked,
  },
  {
    events: [{ kind: "attackEnded", seat: attackerSeat, attackerPermanentId: marcusPermanentId } as ServerEvent],
    shape: checked,
  },
  { events: [{ kind: "effectResolved", ...endTurnEffect } as ServerEvent], shape: checked },
];

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const probeMs = 8;

it.each([attackerSeat, defenderSeat])(
  "plays a trigger nested in an effect's forced attack before that attack's security check for seat %s (GitHub #6371)",
  async (viewerSeat) => {
    const firstVersion = 264;
    const before = board(firstVersion - 1, settled);
    let snapshots: readonly StateSnapshot[] = recordSnapshot([], before);
    let live = before;
    const fed: ServerBatch[] = serverBatches.map(({ events, shape }, index) => {
      const stateVersion = firstVersion + index;
      live = board(stateVersion, shape);
      snapshots = recordSnapshot(snapshots, live);
      const id = `batch-${stateVersion}`;
      return {
        id,
        stateVersion,
        events: events.map((event, seq) => ({ ...event, seq: seq + 1, batch: id, stateVersion: stateVersion - 1 })),
      };
    });
    const view = renderHook(
      ({ batches, state, taken }: { batches: readonly ServerBatch[]; state: GameState; taken: typeof snapshots }) =>
        useMatchCues({
          state,
          batches,
          snapshots: taken,
          viewerSeat,
          anchors: geometry(),
          mulliganOpen: false,
          onActionRejected: vi.fn<(reason: string) => void>(),
          presentationPacing: "sequential",
        }),
      { initialProps: { batches: [] as readonly ServerBatch[], state: before, taken: snapshots } },
    );
    const advance = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));
    await advance(0);
    view.rerender({ batches: fed, state: live, taken: snapshots });

    let attackAnnouncedAt: number | undefined;
    let suspendClauseAt: number | undefined;
    let drawFlightAt: number | undefined;
    let securityBreakAt: number | undefined;
    for (let elapsed = 0; elapsed <= 15_000; elapsed += probeMs) {
      const cues = view.result.current;
      if (cues.attackAnnouncement) attackAnnouncedAt ??= elapsed;
      if (
        cues.notices.some(
          (notice) => notice.body.variant === "effect" && notice.body.description === suspendDescription,
        )
      )
        suspendClauseAt ??= elapsed;
      if (cues.drawFlights.length > 0) drawFlightAt ??= elapsed;
      if (cues.securityBreak) securityBreakAt ??= elapsed;
      await advance(probeMs);
    }

    expect(attackAnnouncedAt).toBeDefined();
    expect(suspendClauseAt).toBeDefined();
    expect(drawFlightAt).toBeDefined();
    expect(securityBreakAt).toBeDefined();
    expect(suspendClauseAt!).toBeGreaterThan(attackAnnouncedAt!);
    expect(securityBreakAt!).toBeGreaterThan(suspendClauseAt!);
    expect(securityBreakAt!).toBeGreaterThan(drawFlightAt!);
  },
);
