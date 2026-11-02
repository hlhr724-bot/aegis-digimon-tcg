// @vitest-environment jsdom
import { useState } from "react";
import { createAnimationQueue } from "@/game/animationQueue";
import { useRestrictionPulses } from "@/game/match/watchers/useRestrictionPulses";
import type { FreezeFlags, FreezePulse } from "@/game/freezePulse";

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Phase, type GameState, type ServerEvent } from "@aegis/shared";
import { CardInstance } from "@aegis/shared/schema/CardInstance";
import { createArenaDemoState } from "../dev/ArenaDemo";
import { singleServerBatch, type ServerBatch } from "../net/serverBatches";
import { snapshotGameState } from "../net/presentedState";
import { useMatchCues, type MatchCueAnchors } from "./useMatchCues";
import type { PresentationControls, PresentationPacing } from "./presentationProbe";
import { createPresentationGate, observeGateExpiry } from "./match/presentationGate";
import { TIMINGS } from "./timings";

vi.mock("../design/sound", () => ({ playSound: vi.fn<(kind: string) => void>() }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function advance(ms: number) {
  await act(async () => vi.advanceTimersByTimeAsync(ms));
}

// Diagnostic control for the between-turn report in Discord 1557702941106901032.
// The recording omits the preceding actions: this is not that match's event replay.
function turnHandoff(pacing: PresentationPacing) {
  const before = snapshotGameState(createArenaDemoState());
  before.phase = Phase.Main;
  before.turnSeat = 1;
  before.stateVersion = 1;
  const after = snapshotGameState(before);
  after.phase = Phase.Breeding;
  after.turnSeat = 0;
  after.turnCount += 1;
  after.stateVersion = 6;
  after.players[0]!.hand.push({ instanceId: "turn-draw", cardId: "BT13-112" } as never);
  after.players[0]!.handCount += 1;
  after.players[0]!.deckCount -= 1;
  const phases: ServerEvent[][] = [
    [{ kind: "turnEnded", endingSeat: 1, nextSeat: 0, turnCount: before.turnCount }],
    [{ kind: "phaseChanged", phase: Phase.Active, turnSeat: 0, turnCount: after.turnCount }],
    [{ kind: "phaseChanged", phase: Phase.Draw, turnSeat: 0, turnCount: after.turnCount }],
    [{ kind: "cardsMoved", seat: 0, from: "deck", to: "hand", instanceIds: ["turn-draw"], handAddition: "draw" }],
    [{ kind: "phaseChanged", phase: Phase.Breeding, turnSeat: 0, turnCount: after.turnCount }],
  ];
  const batches = phases.map((events, index) => singleServerBatch(events, index + 2));
  const anchors: MatchCueAnchors = {
    board: { current: null },
    permanentCenter: () => undefined,
    yourDeck: { current: null },
    oppDeck: { current: null },
    yourHandDock: { current: null },
    oppHandStrip: { current: null },
    yourSecurity: { current: null },
    oppSecurity: { current: null },
  };
  let controls: PresentationControls | undefined;
  const expired: string[] = [];
  const stop = observeGateExpiry(({ label }) => expired.push(label));
  const view = renderHook(
    ({ fed, state }: { fed: readonly ServerBatch[]; state: GameState }) =>
      useMatchCues({
        batches: fed,
        state,
        snapshots: [
          { stateVersion: 1, state: before },
          { stateVersion: 6, state: after },
        ],
        viewerSeat: 0,
        mulliganOpen: false,
        anchors,
        presentationPacing: pacing,
        onActionRejected: vi.fn<(reason: string) => void>(),
        devProbe: {
          onQueue: (next) => {
            controls = next;
          },
        },
      }),
    { initialProps: { fed: [] as readonly ServerBatch[], state: before } },
  );
  return {
    ...view,
    start: () => view.rerender({ fed: batches, state: after }),
    idle: () => controls?.queue.isIdle(),
    expired,
    stop,
  };
}

it.each(["current", "sequential"] as const)(
  "finishes the turn handoff with absent animation elements and preserves ribbon order (%s)",
  async (pacing) => {
    const view = turnHandoff(pacing);
    try {
      view.start();
      await advance(16);
      expect(view.result.current.turnTransition).not.toBeNull();
      expect(view.result.current.phaseTransitionPending).toBe(true);
      await advance(TIMINGS.turnBanner - 32);
      expect(view.result.current.turnTransition).not.toBeNull();
      const seen: string[] = [];
      const visibleMs = new Map<string, number>();
      for (let elapsed = 0; elapsed < 5_000; elapsed += 16) {
        await advance(16);
        const phase = view.result.current.phaseBanner?.phase;
        if (!phase) continue;
        if (!seen.includes(phase)) seen.push(phase);
        visibleMs.set(phase, (visibleMs.get(phase) ?? 0) + 16);
      }
      expect(seen).toEqual([Phase.Active, Phase.Draw, Phase.Breeding]);
      for (const phase of seen) expect(visibleMs.get(phase)).toBeGreaterThanOrEqual(TIMINGS.phaseBanner - 16);
      expect(view.result.current.phaseTransitionPending).toBe(false);
      expect(view.result.current.phaseBanner).toBeNull();
      expect(view.result.current.heldDrawState).toBeUndefined();
      expect(view.idle()).toBe(true);
      expect(view.expired).toEqual([]);
    } finally {
      view.unmount();
      view.stop();
    }
  },
);

it.each(["skip", "hidden"] as const)(
  "releases an interrupted Active ribbon and its queued draw/Breeding work on %s",
  async (exit) => {
    const view = turnHandoff("current");
    try {
      view.start();
      await advance(TIMINGS.turnBanner + TIMINGS.phaseBannerGap + 32);
      expect(view.result.current.phaseBanner?.phase).toBe(Phase.Active);
      if (exit === "skip") act(() => view.result.current.skipAnimations());
      else {
        vi.spyOn(document, "hidden", "get").mockReturnValue(true);
        act(() => document.dispatchEvent(new Event("visibilitychange")));
      }
      await advance(32);
      expect(view.idle()).toBe(true);
      expect(view.expired).toEqual([]);
      expect(view.result.current.phaseTransitionPending).toBe(false);
      expect(view.result.current.phaseBanner).toBeNull();
      expect(view.result.current.heldDrawState).toBeUndefined();
    } finally {
      view.unmount();
      view.stop();
    }
  },
);

it("clears running and queued phase work when unmounted during Active", async () => {
  const view = turnHandoff("current");
  try {
    view.start();
    await advance(TIMINGS.turnBanner + TIMINGS.phaseBannerGap + 32);
    expect(view.result.current.phaseBanner?.phase).toBe(Phase.Active);
    view.unmount();
    await advance(32);
    expect(view.idle()).toBe(true);
    expect(view.expired).toEqual([]);
  } finally {
    view.unmount();
    view.stop();
  }
});

it.each([0, 1] as const)(
  "Discord 1557702941106901032: viewer %s does not wait on Active for an earlier DP expiry",
  async (viewerSeat) => {
    const before = snapshotGameState(createArenaDemoState());
    before.stateVersion = 123;
    before.turnSeat = 1;
    before.phase = Phase.Main;
    const permanent = before.players[1]!.battleArea[0]!;
    permanent.topCard.cardId = "EX13-015";
    permanent.currentDP = 15_000;
    const ended = snapshotGameState(before);
    ended.stateVersion = 124;
    ended.players[1]!.battleArea[0]!.currentDP = 12_000;
    const after = snapshotGameState(ended);
    after.stateVersion = 129;
    after.turnSeat = 0;
    after.phase = Phase.Breeding;
    const setter = {
      seat: 0,
      sourceCardId: "BT3-093",
      sourceInstanceId: "s0-34",
      sourcePermanentId: "perm-3",
      effectKey: "BT3-093/ir-0-0",
      timing: "OnStartTurn",
      description: "[Start of Your Turn] If you have 2 memory or less, set your memory to 3.",
    } as const;
    // Public order/versions from match 8b1b107c, batches 155..160 (15:42:07 UTC).
    // DP values are a minimized expiry control until the original snapshots are available.
    const script: ServerEvent[][] = [
      [{ kind: "turnEnded", endingSeat: 1, nextSeat: 0, turnCount: 5 }],
      [{ kind: "phaseChanged", phase: Phase.Active, turnSeat: 0, turnCount: 5 }],
      [
        { kind: "effectTriggered", ...setter },
        { kind: "memoryChanged", from: 2, to: 3, reason: "setMemory" },
      ],
      [{ kind: "effectResolved", ...setter }],
      [{ kind: "phaseChanged", phase: Phase.Draw, turnSeat: 0, turnCount: 6 }],
      [{ kind: "phaseChanged", phase: Phase.Breeding, turnSeat: 0, turnCount: 6 }],
    ];
    const batches = script.map((events, index) => singleServerBatch(events, 124 + index));
    const expired: string[] = [];
    const stop = observeGateExpiry(({ label }) => expired.push(label));
    let controls: PresentationControls | undefined;
    const view = renderHook(
      ({ fed, state }: { fed: readonly ServerBatch[]; state: GameState }) =>
        useMatchCues({
          batches: fed,
          state,
          snapshots: [
            { stateVersion: 123, state: before },
            { stateVersion: 124, state: ended },
            { stateVersion: 129, state: after },
          ],
          viewerSeat,
          mulliganOpen: false,
          anchors: {
            board: { current: null },
            permanentCenter: () => undefined,
            yourDeck: { current: null },
            oppDeck: { current: null },
            yourHandDock: { current: null },
            oppHandStrip: { current: null },
            yourSecurity: { current: null },
            oppSecurity: { current: null },
          },
          presentationPacing: "sequential",
          onActionRejected: vi.fn<(reason: string) => void>(),
          devProbe: {
            onQueue: (next) => {
              controls = next;
            },
          },
        }),
      { initialProps: { fed: [] as readonly ServerBatch[], state: before } },
    );
    try {
      view.rerender({ fed: batches, state: after });
      await advance(10_000);
      expect(view.result.current.phaseTransitionPending).toBe(false);
      expect(controls?.queue.isIdle()).toBe(true);
      expect(expired).toEqual([]);
    } finally {
      view.unmount();
      await advance(32);
      stop();
    }
  },
);

it("still waits for the owning WarGrowlmon clause before presenting its DP gain", async () => {
  const before = snapshotGameState(createArenaDemoState());
  before.stateVersion = 1;
  const host = before.players[0]!.battleArea[0]!;
  host.topCard.cardId = "EX13-013";
  host.currentDP = 8000;
  const after = snapshotGameState(before);
  after.stateVersion = 2;
  after.players[0]!.battleArea[0]!.currentDP = 11000;
  const trigger = {
    seat: 0,
    sourceCardId: "EX13-013",
    sourceInstanceId: host.topCard.instanceId,
    sourcePermanentId: host.permanentId,
    effectKey: "dp-gain",
    timing: "WhenDigivolving",
    description:
      "[When Digivolving] If this effect didn't delete, this Digimon gains ＜Piercing＞ and +3000 DP for the turn.",
  } as const;
  const batches = [
    singleServerBatch(
      [
        { kind: "effectTriggered", ...trigger },
        { kind: "effectResolved", ...trigger },
      ],
      2,
    ),
  ];
  const view = renderHook(
    ({ fed, state }: { fed: readonly ServerBatch[]; state: GameState }) =>
      useMatchCues({
        batches: fed,
        state,
        snapshots: [
          { stateVersion: 1, state: before },
          { stateVersion: 2, state: after },
        ],
        viewerSeat: 0,
        mulliganOpen: false,
        anchors: {
          board: { current: null },
          permanentCenter: () => ({ x: 120, y: 80 }),
          yourDeck: { current: null },
          oppDeck: { current: null },
          yourHandDock: { current: null },
          oppHandStrip: { current: null },
          yourSecurity: { current: null },
          oppSecurity: { current: null },
        },
        presentationPacing: "sequential",
        onActionRejected: vi.fn<(reason: string) => void>(),
      }),
    { initialProps: { fed: [] as readonly ServerBatch[], state: before } },
  );
  view.rerender({ fed: batches, state: after });
  await advance(16);
  expect(view.result.current.dpPulses.size).toBe(0);
  const seen: string[] = [];
  for (let elapsed = 0; elapsed < 4000; elapsed += 16) {
    if (
      !seen.includes("clause") &&
      view.result.current.notices.some(
        (notice) => notice.body.variant === "effect" && notice.body.cardId === "EX13-013",
      )
    )
      seen.push("clause");
    if (!seen.includes("pulse") && view.result.current.dpPulses.size) seen.push("pulse");
    await advance(16);
  }
  expect(seen).toEqual(["clause", "pulse"]);
  expect(view.result.current.dpPulses.size).toBe(0);
  view.unmount();
});

it.each([0, 1] as const)(
  "Discord 1558122159975567360: viewer %s does not hold the turn start behind King Drasil for Gallantmon's DP expiry",
  async (viewerSeat) => {
    const before = snapshotGameState(createArenaDemoState());
    before.stateVersion = 395;
    before.turnSeat = 1;
    before.phase = Phase.Main;
    const gallantmon = before.players[1]!.battleArea[0]!;
    gallantmon.topCard.cardId = "AD1-008";
    gallantmon.currentDP = 17_000;
    const unsuspended = before.players[0]!.battleArea[0]!.permanentId;
    const ended = snapshotGameState(before);
    ended.stateVersion = 398;
    ended.players[1]!.battleArea[0]!.currentDP = 12_000;
    const after = snapshotGameState(ended);
    after.stateVersion = 404;
    after.turnSeat = 0;
    after.phase = Phase.Main;
    const drasil = {
      seat: 0,
      sourceCardId: "BT13-007",
      sourceInstanceId: "s0-52",
      sourcePermanentId: "perm-3",
      effectKey: "BT13-007/ir-1-0",
      timing: "StartOfYourMainPhase",
      description:
        "[Breeding][Start of Your Main Phase] Reveal the top card of your Digi-Egg deck, then place that card and all of your [Royal Knight] trait Digimon as this Digimon's bottom digivolution cards.",
    } as const;
    // Public order from match c1d0b47b, batches 514..522 (14:17:31 UTC): production v1.18.0
    // held seat 0's Draw banner and draw behind this DP pulse for about 28 seconds.
    const script: ServerEvent[][] = [
      [{ kind: "turnEnded", endingSeat: 1, nextSeat: 0, turnCount: 11 }],
      [{ kind: "phaseChanged", phase: Phase.Active, turnSeat: 0, turnCount: 11 }],
      [{ kind: "cardsMoved", instanceIds: [unsuspended], from: "suspended", to: "unsuspended" }],
      [{ kind: "phaseChanged", phase: Phase.Draw, turnSeat: 0, turnCount: 12 }],
      [{ kind: "phaseChanged", phase: Phase.Breeding, turnSeat: 0, turnCount: 12 }],
      [{ kind: "phaseChanged", phase: Phase.Main, turnSeat: 0, turnCount: 12 }],
      [{ kind: "effectTriggered", ...drasil }],
      [{ kind: "effectResolved", ...drasil }],
    ];
    const versions = [396, 397, 398, 399, 400, 401, 402, 404];
    const batches = script.map((events, index) => singleServerBatch(events, versions[index]!));
    const expired: string[] = [];
    const stop = observeGateExpiry(({ label }) => expired.push(label));
    let controls: PresentationControls | undefined;
    const view = renderHook(
      ({ fed, state }: { fed: readonly ServerBatch[]; state: GameState }) =>
        useMatchCues({
          batches: fed,
          state,
          snapshots: [
            { stateVersion: 395, state: before },
            { stateVersion: 398, state: ended },
            { stateVersion: 404, state: after },
          ],
          viewerSeat,
          mulliganOpen: false,
          anchors: {
            board: { current: null },
            permanentCenter: () => ({ x: 120, y: 80 }),
            yourDeck: { current: null },
            oppDeck: { current: null },
            yourHandDock: { current: null },
            oppHandStrip: { current: null },
            yourSecurity: { current: null },
            oppSecurity: { current: null },
          },
          presentationPacing: "sequential",
          onActionRejected: vi.fn<(reason: string) => void>(),
          devProbe: {
            onQueue: (next) => {
              controls = next;
            },
          },
        }),
      { initialProps: { fed: [] as readonly ServerBatch[], state: before } },
    );
    try {
      view.rerender({ fed: batches, state: after });
      await advance(15_000);
      expect(view.result.current.phaseTransitionPending).toBe(false);
      expect(controls?.queue.isIdle()).toBe(true);
      expect(expired).toEqual([]);
    } finally {
      view.unmount();
      await advance(32);
      stop();
    }
  },
);

it.each([
  { presentationPacing: "current", advancedTurnCount: false },
  { presentationPacing: "current", advancedTurnCount: true },
  { presentationPacing: "sequential", advancedTurnCount: false },
  { presentationPacing: "sequential", advancedTurnCount: true },
] as const)(
  "updates the held hand after a start-of-turn search and discard before drawing ($presentationPacing, counter advanced=$advancedTurnCount)",
  async ({ presentationPacing, advancedTurnCount }) => {
    const before = snapshotGameState(createArenaDemoState());
    before.phase = Phase.End;
    before.turnSeat = 1;
    before.stateVersion = 1;
    const active = snapshotGameState(before);
    active.phase = Phase.Active;
    active.turnSeat = 0;
    active.stateVersion = 2;
    active.turnCount += Number(advancedTurnCount);
    const searched = snapshotGameState(active);
    searched.stateVersion = 3;
    const card = new CardInstance();
    card.instanceId = "searched-card";
    card.cardId = searched.players[0]!.hand[0]!.cardId;
    searched.players[0]!.hand.push(card);
    searched.players[0]!.handCount += 1;
    searched.players[0]!.deckCount -= 1;
    const discarded = snapshotGameState(searched);
    discarded.stateVersion = 4;
    const removed = discarded.players[0]!.hand.shift()!;
    discarded.players[0]!.trash.push(removed);
    discarded.players[0]!.handCount -= 1;
    const drawn = snapshotGameState(discarded);
    drawn.stateVersion = 5;
    drawn.phase = Phase.Draw;
    drawn.turnCount = before.turnCount + 1;
    const turnDraw = new CardInstance();
    turnDraw.instanceId = "turn-draw";
    turnDraw.cardId = card.cardId;
    drawn.players[0]!.hand.push(turnDraw);
    drawn.players[0]!.handCount += 1;
    drawn.players[0]!.deckCount -= 1;
    const states = [before, active, searched, discarded, drawn];
    const batches = [
      singleServerBatch([{ kind: "phaseChanged", phase: Phase.Active, turnSeat: 0, turnCount: active.turnCount }], 2),
      singleServerBatch(
        [
          {
            kind: "cardsMoved",
            from: "deck",
            to: "hand",
            seat: 0,
            instanceIds: [card.instanceId],
            handAddition: "transfer",
          },
        ],
        3,
      ),
      singleServerBatch([{ kind: "cardsMoved", from: "various", to: "trash", instanceIds: [removed.instanceId] }], 4),
      singleServerBatch([{ kind: "phaseChanged", phase: Phase.Draw, turnSeat: 0, turnCount: drawn.turnCount }], 5),
    ];
    const anchors: MatchCueAnchors = {
      board: { current: null },
      yourDeck: { current: null },
      oppDeck: { current: null },
      yourHandDock: { current: null },
      oppHandStrip: { current: null },
      yourSecurity: { current: null },
      oppSecurity: { current: null },
    };
    const { result, rerender } = renderHook(
      ({ state, count }: { state: GameState; count: number }) =>
        useMatchCues({
          state,
          batches: batches.slice(0, count),
          snapshots: states.slice(0, count + 1).map((entry) => ({ stateVersion: entry.stateVersion, state: entry })),
          viewerSeat: 0,
          mulliganOpen: false,
          presentationPacing,
          anchors,
          onActionRejected() {},
        }),
      { initialProps: { state: before, count: 0 } },
    );
    await advance(0);
    rerender({ state: active, count: 1 });
    await advance(2000);
    rerender({ state: searched, count: 2 });
    await advance(2000);
    expect(result.current.heldDrawState?.state.players[0]!.hand.map((entry) => entry.instanceId)).toContain(
      card.instanceId,
    );
    rerender({ state: discarded, count: 3 });
    await advance(2000);
    expect(result.current.heldDrawState?.state.players[0]!.hand.map((entry) => entry.instanceId)).toEqual(
      discarded.players[0]!.hand.map((entry) => entry.instanceId),
    );
    expect(result.current.heldDrawState?.state.players[0]!.handCount).toBe(discarded.players[0]!.handCount);
    rerender({ state: drawn, count: 4 });
    expect(result.current.heldDrawState?.state.players[0]!.hand.map((entry) => entry.instanceId)).not.toContain(
      "turn-draw",
    );
    await advance(2000);
    expect(result.current.heldDrawState).toBeUndefined();
  },
);

it("finishes a newly projected on-play keyword before the next breeding ribbon without expiring gates", async () => {
  const before = snapshotGameState(createArenaDemoState());
  before.stateVersion = 20;
  before.phase = Phase.Main;
  before.turnSeat = 1;
  const played = snapshotGameState(before);
  played.stateVersion = 21;
  const host = played.players[1]!.battleArea[0]!;
  host.topCard.cardId = "BT24-046";
  host.grantedKeywords = [] as never;
  const triggered = snapshotGameState(played);
  triggered.stateVersion = 22;
  triggered.players[1]!.battleArea[0]!.grantedKeywords = ["Jamming"] as never;
  const after = snapshotGameState(triggered);
  after.stateVersion = 27;
  after.phase = Phase.Breeding;
  after.turnSeat = 0;
  after.turnCount += 1;
  const trigger = {
    seat: 1,
    sourceCardId: "BT24-046",
    sourceInstanceId: host.topCard.instanceId,
    sourcePermanentId: host.permanentId,
    effectKey: "BT24-046/ir-6-0",
    timing: "OnPlay",
    description: "[On Play] [When Digivolving] Suspend 1 of your opponent's Digimon.",
  } as const;
  const script: ServerEvent[][] = [
    [{ kind: "effectTriggered", ...trigger }],
    [{ kind: "effectResolved", ...trigger }],
    [{ kind: "turnEnded", endingSeat: 1, nextSeat: 0, turnCount: before.turnCount }],
    [{ kind: "phaseChanged", phase: Phase.Active, turnSeat: 0, turnCount: before.turnCount }],
    [{ kind: "phaseChanged", phase: Phase.Draw, turnSeat: 0, turnCount: after.turnCount }],
    [{ kind: "phaseChanged", phase: Phase.Breeding, turnSeat: 0, turnCount: after.turnCount }],
  ];
  const batches = script.map((events, index) => singleServerBatch(events, index + 21));
  const expired: string[] = [];
  const stop = observeGateExpiry(({ label }) => expired.push(label));
  let controls: PresentationControls | undefined;
  const view = renderHook(
    ({ fed, state }: { fed: readonly ServerBatch[]; state: GameState }) =>
      useMatchCues({
        batches: fed,
        state,
        snapshots: [
          { stateVersion: 21, state: played },
          { stateVersion: 22, state: triggered },
          { stateVersion: 27, state: after },
        ],
        viewerSeat: 0,
        mulliganOpen: false,
        anchors: {
          board: { current: null },
          permanentCenter: () => ({ x: 120, y: 80 }),
          yourDeck: { current: null },
          oppDeck: { current: null },
          yourHandDock: { current: null },
          oppHandStrip: { current: null },
          yourSecurity: { current: null },
          oppSecurity: { current: null },
        },
        presentationPacing: "sequential",
        onActionRejected: vi.fn<(reason: string) => void>(),
        devProbe: {
          onQueue: (next) => {
            controls = next;
          },
        },
      }),
    { initialProps: { fed: [] as readonly ServerBatch[], state: played } },
  );
  try {
    view.rerender({ fed: batches, state: after });
    await advance(8000);
    expect(expired).toEqual([]);
    expect(controls?.queue.isIdle()).toBe(true);
    expect(view.result.current.phaseTransitionPending).toBe(false);
  } finally {
    view.unmount();
    stop();
  }
});

it("presents both retained keyword gains on the same permanent before settling", async () => {
  const before = snapshotGameState(createArenaDemoState());
  before.stateVersion = 1;
  before.players[0]!.battleArea[0]!.grantedKeywords = [] as never;
  const first = snapshotGameState(before);
  first.stateVersion = 2;
  first.players[0]!.battleArea[0]!.grantedKeywords = ["Jamming"] as never;
  const second = snapshotGameState(first);
  second.stateVersion = 3;
  second.players[0]!.battleArea[0]!.grantedKeywords = ["Jamming", "Blocker"] as never;
  const queue = createAnimationQueue();
  const gate = createPresentationGate();
  const restrictionsByPermanentRef = { current: null as Map<string, FreezeFlags> | null };
  const freezePulseKeyRef = { current: 0 };
  const view = renderHook(
    ({ state }: { state: GameState }) => {
      const [pulses, setFreezePulses] = useState<ReadonlyMap<string, FreezePulse>>(new Map());
      useRestrictionPulses({
        state,
        queue,
        restrictionsByPermanentRef,
        freezePulseKeyRef,
        causingEffectGateRef: { current: gate },
        setFreezePulses,
        snapshots: [
          { stateVersion: 2, state: first },
          { stateVersion: 3, state: second },
        ],
        contextOfRevision: (stateVersion) => ({ gate, origin: { batchId: `gain-${stateVersion}`, stateVersion } }),
      });
      return pulses;
    },
    { initialProps: { state: before } },
  );
  try {
    view.rerender({ state: second });
    act(() => gate.release());
    await advance(32);
    expect(view.result.current.get(before.players[0]!.battleArea[0]!.permanentId)?.key).toBe(1);
    await advance(TIMINGS.statusPulse);
    expect(view.result.current.get(before.players[0]!.battleArea[0]!.permanentId)?.key).toBe(2);
    await advance(TIMINGS.statusPulse);
    expect(queue.isIdle()).toBe(true);
  } finally {
    view.unmount();
    queue.clear();
  }
});
