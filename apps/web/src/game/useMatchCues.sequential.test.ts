// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DecisionRequest, GameState, ServerEvent } from "@aegis/shared";
import { useMatchCues, type MatchCueAnchors } from "./useMatchCues";
import { singleServerBatch, type ServerBatch } from "../net/serverBatches";
import type { PresentationPacing, PresentationStepEvent } from "./presentationProbe";
import {
  activePacing,
  DEFAULT_PACING,
  EFFECT_SPEEDS,
  EFFECT_SPEED_SCALE,
  PACING_BY_STYLE,
  setBasePacing,
  setEffectSpeed,
} from "./pacing";
import { TIMINGS } from "./timings";
import { observeGateExpiry, type GateExpiry } from "@/game/match/presentationGate";

vi.mock("../design/sound", () => ({ playSound: vi.fn<(kind: string) => void>() }));

const VIEWER = 0;

const BOARD = {
  players: [
    {
      battleArea: [
        { permanentId: "perm-a", topCard: { instanceId: "src-a", cardId: "AD1-002" }, stack: [], currentDP: 12000 },
        { permanentId: "perm-b", topCard: { instanceId: "src-b", cardId: "BT18-015" }, stack: [], currentDP: 5000 },
      ],
      trash: [],
      hand: [],
      handCount: 5,
    },
    { battleArea: [], trash: [], hand: [], handCount: 5 },
  ],
} as unknown as GameState;

function triggered(
  sourceCardId: string,
  sourceInstanceId: string,
  effectKey: string,
): Extract<ServerEvent, { kind: "effectTriggered" }> {
  return {
    kind: "effectTriggered",
    seat: 0,
    sourceCardId,
    sourceInstanceId,
    effectKey,
    description: "[Your Turn] When one of your other Digimon digivolves, <Draw 1>.",
    timing: "whenOneOfYoursDigivolves",
  };
}

function resolved(sourceCardId: string, sourceInstanceId: string, effectKey: string): ServerEvent {
  return { ...triggered(sourceCardId, sourceInstanceId, effectKey), kind: "effectResolved" } as ServerEvent;
}

function draw(instanceId: string): ServerEvent {
  return { kind: "cardsMoved", from: "deck", to: "hand", instanceIds: [instanceId], seat: 0 };
}

/** Two effects, each closed by the server in three batches, as the live room does. */
const CHAIN: readonly (readonly ServerEvent[])[] = [
  [triggered("AD1-002", "src-a", "a/draw")],
  [draw("drawn-a")],
  [resolved("AD1-002", "src-a", "a/draw")],
  [triggered("BT18-015", "src-b", "b/draw")],
  [draw("drawn-b")],
  [resolved("BT18-015", "src-b", "b/draw")],
];

function geometry(): MatchCueAnchors {
  const board = document.createElement("div");
  const deck = document.createElement("div");
  const hand = document.createElement("div");
  vi.spyOn(board, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600));
  vi.spyOn(deck, "getBoundingClientRect").mockReturnValue(new DOMRect(600, 400, 80, 100));
  vi.spyOn(hand, "getBoundingClientRect").mockReturnValue(new DOMRect(200, 500, 300, 80));
  return {
    board: { current: board },
    permanentCenter: () => ({ x: 120, y: 80 }),
    yourDeck: { current: deck },
    oppDeck: { current: deck },
    yourHandDock: { current: hand },
    oppHandStrip: { current: hand },
    yourSecurity: { current: null },
    oppSecurity: { current: null },
  };
}

interface ChainProps {
  fed: readonly ServerBatch[];
  decision?: { stateVersion: number };
}

function renderChain(presentationPacing: PresentationPacing) {
  const anchors = geometry();
  let version = 0;
  let batches: readonly ServerBatch[] = [];
  const view = renderHook(
    ({ fed, decision }: ChainProps) =>
      useMatchCues({
        batches: fed,
        state: BOARD,
        viewerSeat: VIEWER,
        mulliganOpen: false,
        anchors,
        onActionRejected: vi.fn<(reason: string) => void>(),
        presentationPacing,
        decisionPending: decision !== undefined,
        decisionStateVersion: decision?.stateVersion,
      }),
    { initialProps: { fed: batches } as ChainProps },
  );
  return {
    ...view,
    /** Every batch of the chain lands in one render, the way a 13 ms server burst does. */
    feedChain(chain: readonly (readonly ServerEvent[])[] = CHAIN) {
      for (const events of chain) batches = [...batches, singleServerBatch(events, (version += 1))];
      view.rerender({ fed: batches });
    },
    /** The server asks the viewer something, raised at the revision the chain closed with. */
    askViewer() {
      view.rerender({ fed: batches, decision: { stateVersion: version } });
    },
  };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

type View = Pick<ReturnType<typeof renderChain>, "result">;

const effectClauses = (view: View) => view.result.current.notices.filter((notice) => notice.body.variant === "effect");
const clauseShown = (view: View, cardId: string) =>
  effectClauses(view).some((notice) => notice.body.variant === "effect" && notice.body.cardId === cardId);
const sourceLit = (view: View, cardId: string) =>
  view.result.current.effectSources.some((source) => source.cardId === cardId);

interface Timeline {
  firstClauseA?: number;
  firstFlight?: number;
  flightsDoneAfterA?: number;
  sourceLitB?: number;
  mostClausesAtOnce: number;
}

/** Samples the screen every 16 ms and records when each beat first shows. */
async function recordTimeline(view: View, totalMs: number): Promise<Timeline> {
  const timeline: Timeline = { mostClausesAtOnce: 0 };
  let flightSeen = false;
  for (let elapsed = 0; elapsed <= totalMs; elapsed += 16) {
    timeline.mostClausesAtOnce = Math.max(timeline.mostClausesAtOnce, effectClauses(view).length);
    if (timeline.firstClauseA === undefined && clauseShown(view, "AD1-002")) timeline.firstClauseA = elapsed;
    const flying = view.result.current.drawFlights.length > 0;
    if (flying && timeline.firstFlight === undefined) timeline.firstFlight = elapsed;
    if (flying) flightSeen = true;
    if (flightSeen && !flying && timeline.flightsDoneAfterA === undefined) timeline.flightsDoneAfterA = elapsed;
    if (timeline.sourceLitB === undefined && sourceLit(view, "BT18-015")) timeline.sourceLitB = elapsed;
    await advance(16);
  }
  return timeline;
}

beforeEach(() => {
  vi.useFakeTimers();
  setBasePacing(PACING_BY_STYLE.sequential);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setBasePacing(DEFAULT_PACING);
  setEffectSpeed("normal");
});

describe("sequential pacing plays one effect at a time", () => {
  it.each(EFFECT_SPEEDS)(
    "keeps field focus readable and starts results within the reference pace at %s speed",
    async (speed) => {
      setBasePacing(PACING_BY_STYLE.stacked);
      setEffectSpeed(speed);
      const view = renderChain("sequential");
      await advance(0);
      view.feedChain([
        ...CHAIN,
        [triggered("AD1-002", "src-a", "a/memory")],
        [{ kind: "memoryChanged", from: 0, to: 1, reason: "effect" }],
        [resolved("AD1-002", "src-a", "a/memory")],
      ]);

      const active = new Map<number, number>();
      const durations: number[] = [];
      let mostNotices = 0;
      let firstSourceAt: number | undefined;
      let firstDrawAt: number | undefined;
      for (let elapsed = 0; elapsed <= 12_000; elapsed += 16) {
        mostNotices = Math.max(mostNotices, view.result.current.narration.size);
        const focused = view.result.current.effectSources.filter(
          (source) => source.linked !== true && source.site.zone === "field",
        );
        const keys = new Set(focused.map((source) => source.key));
        if (focused.length > 0) firstSourceAt ??= elapsed;
        if (view.result.current.drawFlights.length > 0) firstDrawAt ??= elapsed;
        for (const source of focused) if (!active.has(source.key)) active.set(source.key, elapsed);
        for (const [key, started] of active) {
          if (keys.has(key)) continue;
          durations.push(elapsed - started);
          active.delete(key);
        }
        await advance(16);
      }

      expect(durations).toHaveLength(3);
      expect(mostNotices).toBe(3);
      const readableFocus = Math.round(TIMINGS.effectSourceHold * EFFECT_SPEED_SCALE[speed]);
      for (const duration of durations) expect(duration).toBeGreaterThanOrEqual(readableFocus - 32);
      expect(firstSourceAt).toBeDefined();
      expect(firstDrawAt).toBeDefined();
      const leadIn = firstDrawAt! - firstSourceAt!;
      expect(leadIn).toBeGreaterThanOrEqual(readableFocus - 32);
      expect(leadIn).toBeLessThanOrEqual(1000 * EFFECT_SPEED_SCALE[speed] + 32);
    },
  );

  it("flies an effect's draw only once its clause has been read for its announce beat", async () => {
    const view = renderChain("sequential");
    await advance(0);
    view.feedChain();
    const timeline = await recordTimeline(view, 4000);

    expect(timeline.firstClauseA).toBeDefined();
    expect(timeline.firstFlight).toBeDefined();
    expect(timeline.firstFlight! - timeline.firstClauseA!).toBeGreaterThanOrEqual(activePacing().announceMs);
  });

  it("reads the announce beat when the effect plays, so a tuned value applies without remounting", async () => {
    const view = renderChain("sequential");
    await advance(0);
    setBasePacing({ ...DEFAULT_PACING, announceMs: 2000 });
    view.feedChain();
    const timeline = await recordTimeline(view, 5000);

    expect(timeline.firstFlight! - timeline.firstClauseA!).toBeGreaterThanOrEqual(2000);
  });

  it("lights the next effect only after the previous effect's results have settled", async () => {
    const view = renderChain("sequential");
    await advance(0);
    view.feedChain();
    const timeline = await recordTimeline(view, 8000);

    expect(timeline.flightsDoneAfterA).toBeDefined();
    expect(timeline.sourceLitB).toBeDefined();
    expect(timeline.sourceLitB! - timeline.flightsDoneAfterA!).toBeGreaterThanOrEqual(activePacing().settleMs);
  });

  it("never shows two effect clauses at once", async () => {
    const view = renderChain("sequential");
    await advance(0);
    view.feedChain();
    const timeline = await recordTimeline(view, 8000);

    expect(clauseShown(view, "BT18-015")).toBe(true);
    expect(timeline.mostClausesAtOnce).toBe(1);
  });

  it("collapses the whole sequence when the viewer fast-forwards", async () => {
    const view = renderChain("sequential");
    await advance(0);
    view.feedChain();
    await advance(32);
    expect(view.result.current.presentedStateVersion).toBeDefined();

    act(() => view.result.current.skipAnimations());
    await advance(200);

    expect(view.result.current.presentedStateVersion).toBeUndefined();
    expect(view.result.current.drawFlights).toHaveLength(0);
    expect(view.result.current.decisionAnimationsPending).toBe(false);
  });

  it("keeps a prompt raised after the chain closed until the last effect has settled", async () => {
    // Beats long enough that the chain outlasts the play lead-in budget.
    setBasePacing({ ...DEFAULT_PACING, sourceHoldMs: 720, announceMs: 1100, settleMs: 700 });
    const view = renderChain("sequential");
    await advance(0);
    view.feedChain();
    view.askViewer();
    // Past the play lead-in budget, which would otherwise hand the prompt the board early.
    await advance(4500);
    expect(view.result.current.decisionAnimationsPending).toBe(true);
    expect(view.result.current.presentedStateVersion).toBeDefined();

    await advance(3000);
    expect(view.result.current.decisionAnimationsPending).toBe(false);
  });
});

describe("resumed effect results", () => {
  it("Discord 1557926494536466514: timed Engage resumes before its security check without an expired clause gate", async () => {
    const anchors = geometry();
    const state = { ...BOARD, matchTimer: true } as GameState;
    const view = renderHook(
      ({ fed, question }: { fed: readonly ServerBatch[]; question: boolean }) =>
        useMatchCues({
          batches: fed,
          state,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors,
          onActionRejected: () => {},
          presentationPacing: "sequential",
          decisionPending: question,
          decisionSourceCardId: question ? "AD1-002" : undefined,
        }),
      { initialProps: { fed: [] as readonly ServerBatch[], question: false } },
    );
    await advance(0);
    const first = singleServerBatch([triggered("AD1-002", "src-a", "engage")], 1);
    view.rerender({ fed: [first], question: true });
    await advance(1000);
    const attack: ServerEvent = {
      kind: "attackDeclared",
      seat: 0,
      attackerPermanentId: "perm-a",
      attackerCardId: "AD1-002",
      target: { kind: "player" },
    };
    const reveal: ServerEvent = {
      kind: "securityRevealed",
      seat: 1,
      revealedCardId: "BT1-010",
      attackerPermanentId: "perm-a",
      attackerDP: 12000,
      securityCardDP: 3000,
      hasSecurityEffect: false,
      isDigimon: true,
      securityCountBefore: 4,
    };
    const check: ServerEvent = { kind: "securityChecked", seat: 1, revealedCardId: "BT1-010", resolution: "battle" };
    view.rerender({
      fed: [
        first,
        singleServerBatch([attack], 2),
        singleServerBatch([reveal], 3),
        singleServerBatch([check, resolved("AD1-002", "src-a", "engage")], 4),
      ],
      question: false,
    });
    await advance(0);
    expect(view.result.current.attackAwaitingCause).toBe(true);
    expect(view.result.current.securityBreak).toBeNull();
    await advance(TIMINGS.effectAnnounce + activePacing().resumeAnnounceMs + 100);
    expect(view.result.current.attackAwaitingCause).toBe(false);
    expect(view.result.current.securityBreak !== null || view.result.current.securityClash !== null).toBe(true);
    await advance(10_000);
    expect(view.result.current.securityRevealPending).toBe(false);
  });
  it.each([true, false])(
    "GitHub #5422: a would-leave prompt does not play its draw over the security reveal (timer: %s)",
    async (matchTimer) => {
      const anchors = geometry();
      const state = { ...BOARD, matchTimer } as GameState;
      const steps: { id: string; phase: string; version?: number; skipping: boolean }[] = [];
      const devProbe = {
        onStep: (event: PresentationStepEvent) =>
          steps.push({
            id: event.step.id,
            phase: event.phase,
            version: event.batch?.stateVersion,
            skipping: event.skipping,
          }),
      };
      const view = renderHook(
        ({ fed, question }: { fed: readonly ServerBatch[]; question: boolean }) =>
          useMatchCues({
            batches: fed,
            state,
            viewerSeat: VIEWER,
            mulliganOpen: false,
            anchors,
            onActionRejected: () => {},
            presentationPacing: "sequential",
            decisionPending: question,
            decisionSourceCardId: question ? "BT13-040" : undefined,
            devProbe,
          }),
        { initialProps: { fed: [] as readonly ServerBatch[], question: false } },
      );
      await advance(0);
      const attack: ServerEvent = {
        kind: "attackDeclared",
        seat: 0,
        attackerPermanentId: "perm-a",
        attackerCardId: "BT13-040",
        target: { kind: "player" },
      };
      const reveal: ServerEvent = {
        kind: "securityRevealed",
        seat: 1,
        revealedCardId: "EX13-035",
        attackerPermanentId: "perm-a",
        attackerDP: 10000,
        securityCardDP: 13000,
        hasSecurityEffect: false,
        isDigimon: true,
        securityCountBefore: 4,
      };
      const wouldLeave: ServerEvent = {
        kind: "effectTriggered",
        seat: 0,
        sourceCardId: "BT13-040",
        sourceInstanceId: "src-a",
        sourcePermanentId: "perm-a",
        effectKey: "replacement/80",
        description: "[All Turns] When this Digimon would leave the battle area, ＜Draw 1＞.",
        timing: "wouldLeavePlay",
      } as ServerEvent;
      view.rerender({
        fed: [
          singleServerBatch([attack], 1),
          singleServerBatch([reveal], 2),
          singleServerBatch([wouldLeave, draw("magnamon-draw")], 3),
        ],
        question: true,
      });
      await advance(10_000);
      // The battle hold ends on a poll after the question has taken the board, so its own
      // finish is bookkeeping rather than the end of what the viewer sees.
      const securityEnd = steps.reduce(
        (last, step, index) =>
          step.phase === "finished" &&
          step.id.startsWith("security-") &&
          !step.id.startsWith("security-clash-hold-") &&
          step.version === 2
            ? index
            : last,
        -1,
      );
      const early = steps
        .slice(0, Math.max(securityEnd, 0))
        .filter((step) => step.phase === "finished" && step.version === 3 && !step.id.startsWith("security-"))
        .map((step) => step.id);
      expect(securityEnd).toBeGreaterThanOrEqual(0);
      expect(early).toEqual([]);
      const handOver = steps.findIndex((step) => step.phase === "started" && step.id.startsWith("security-decision-"));
      const drawShown = steps.findIndex((step) => step.phase === "started" && step.id.startsWith("draw-presentation-"));
      expect(handOver).toBeGreaterThanOrEqual(0);
      expect(drawShown).toBeGreaterThan(handOver);
      // A match timer no longer fast-forwards anything: every beat plays at its own length.
      expect(steps.filter((step) => step.skipping).map((step) => step.id)).toEqual([]);
    },
  );
  it.each([true, false])(
    "Discord game-speed report: a check closed without a battle leaves the stage (timer: %s)",
    async (matchTimer) => {
      const anchors = geometry();
      const state = { ...BOARD, matchTimer } as GameState;
      const view = renderHook(
        ({ fed, question }: { fed: readonly ServerBatch[]; question: boolean }) =>
          useMatchCues({
            batches: fed,
            state,
            viewerSeat: VIEWER,
            mulliganOpen: false,
            anchors,
            onActionRejected: () => {},
            presentationPacing: "sequential",
            decisionPending: question,
            decisionSourceCardId: question ? "BT20-083" : undefined,
          }),
        { initialProps: { fed: [] as readonly ServerBatch[], question: false } },
      );
      await advance(0);
      const attack: ServerEvent = {
        kind: "attackDeclared",
        seat: 1,
        attackerPermanentId: "perm-x",
        attackerCardId: "BT26-048",
        target: { kind: "player" },
      };
      const reveal: ServerEvent = {
        kind: "securityRevealed",
        seat: 0,
        revealedCardId: "BT23-054",
        attackerPermanentId: "perm-x",
        attackerDP: 24000,
        securityCardDP: 7000,
        hasSecurityEffect: false,
        isDigimon: true,
        securityCountBefore: 2,
      };
      // A removal reaction asks the defender a question before the battle, and its answer
      // deletes the attacker, so the check closes with the revealed card trashed unfought.
      const opened = [singleServerBatch([attack], 1), singleServerBatch([reveal], 2)];
      view.rerender({ fed: opened, question: true });
      // The question must not cost the viewer the reveal itself.
      await advance(TIMINGS.securityArm + TIMINGS.shieldBreak + TIMINGS.securityBreakHold + 100);
      expect(view.result.current.securityClash?.revealed.cardId).toBe("BT23-054");
      // In match 2e2a3231 the answer, and so the close, came 11 s after the reveal.
      await advance(3_000);
      const attackerDeleted: ServerEvent = {
        kind: "cardsMoved",
        from: "battleArea",
        to: "trash",
        instanceIds: ["opp-x"],
        deletedPermanents: [
          { permanentId: "perm-x", instanceId: "opp-x", cardId: "BT26-048", artId: "BT26-048", seat: 1 },
        ],
      } as ServerEvent;
      const closed: ServerEvent = {
        kind: "securityChecked",
        seat: 0,
        artId: "BT23-054",
        revealedCardId: "BT23-054",
        resolution: "trashed",
      };
      view.rerender({
        fed: [
          ...opened,
          singleServerBatch([attackerDeleted], 3),
          singleServerBatch([closed], 4),
          singleServerBatch([{ kind: "attackEnded", seat: 1, attackerPermanentId: "perm-x" } as ServerEvent], 5),
        ],
        question: false,
      });
      await advance(10_000);
      expect(view.result.current.securityClash).toBeNull();
    },
  );
  it("expires a previous copy's toast while the new copy waits for target confirmation", async () => {
    setBasePacing(PACING_BY_STYLE.stacked);
    const anchors = geometry();
    const board = {
      ...BOARD,
      players: [
        {
          ...BOARD.players[0]!,
          battleArea: BOARD.players[0]!.battleArea.map((permanent) => ({
            ...permanent,
            topCard: { ...permanent.topCard, cardId: "AD1-002" },
          })),
        },
        BOARD.players[1]!,
      ],
    } as unknown as GameState;
    const target: DecisionRequest = {
      decisionId: "second-targets",
      seat: 0,
      kind: "chooseTargets",
      promptText: "Choose targets",
      sourceCardId: "AD1-002",
      sourceInstanceId: "src-b",
      sourcePermanentId: "perm-b",
      options: { effectKey: "b/draw", min: 1, max: 1 },
    };
    const view = renderHook(
      ({ fed, question }: { fed: readonly ServerBatch[]; question?: DecisionRequest | undefined }) =>
        useMatchCues({
          batches: fed,
          state: board,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors,
          onActionRejected: () => {},
          presentationPacing: "sequential",
          decisionPending: Boolean(question),
          decisionSourceCardId: question?.sourceCardId,
          targetDecision: question,
        }),
      { initialProps: { fed: [] as readonly ServerBatch[], question: undefined as DecisionRequest | undefined } },
    );
    const first = singleServerBatch([triggered("AD1-002", "src-a", "a/draw")], 1);
    view.rerender({ fed: [first], question: undefined });
    await advance(1000);
    const original = [...view.result.current.narration.keys()][0];
    const second = singleServerBatch(
      [
        resolved("AD1-002", "src-a", "a/draw"),
        { ...triggered("AD1-002", "src-b", "b/draw"), sourcePermanentId: "perm-b" },
      ],
      2,
    );
    view.rerender({ fed: [first, second], question: target });
    await advance(12_000);
    expect([...view.result.current.narration.keys()]).toEqual([]);
    const result = singleServerBatch([draw("second-draw"), resolved("AD1-002", "src-b", "b/draw")], 3);
    view.rerender({ fed: [first, second, result], question: undefined });
    await advance(0);
    expect(
      view.result.current.notices.map((notice) => notice.body.variant === "effect" && notice.body.sourceInstanceId),
    ).toEqual(["src-b"]);
    expect([...view.result.current.narration.keys()][0]).not.toBe(original);
    await advance(activePacing().resumeAnnounceMs + 16);
    expect(view.result.current.drawFlights).toHaveLength(1);
  });

  it("lets an accepted clause expire during the next decision without replaying it on answer", async () => {
    setBasePacing(PACING_BY_STYLE.stacked);
    const anchors = geometry();
    const first = singleServerBatch([triggered("AD1-002", "src-a", "a/draw")], 1);
    const view = renderHook(
      ({ fed, question }: { fed: readonly ServerBatch[]; question: boolean }) =>
        useMatchCues({
          batches: fed,
          state: BOARD,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors,
          onActionRejected: () => {},
          presentationPacing: "sequential",
          decisionPending: question,
          decisionSourceCardId: question ? "BT18-015" : undefined,
        }),
      { initialProps: { fed: [] as readonly ServerBatch[], question: false } },
    );
    view.rerender({ fed: [first], question: false });
    await advance(1000);
    const original = [...view.result.current.narration.values()][0];
    expect(original?.notice).toBeDefined();
    view.rerender({ fed: [first], question: true });
    await advance(12_000);
    expect([...view.result.current.narration.values()].map((item) => item.id)).not.toContain(original!.id);
    view.rerender({ fed: [first], question: false });
    await advance(100);
    expect(clauseShown(view, "AD1-002")).toBe(false);
    await advance(12_000);
    expect(clauseShown(view, "AD1-002")).toBe(false);
  });
  it("uses a finite resume beat when its clause stayed on screen", async () => {
    setBasePacing(PACING_BY_STYLE.stacked);
    const anchors = geometry();
    const view = renderHook(
      ({ fed, question }: { fed: readonly ServerBatch[]; question: boolean }) =>
        useMatchCues({
          batches: fed,
          state: BOARD,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors,
          onActionRejected: vi.fn<(reason: string) => void>(),
          presentationPacing: "sequential",
          decisionPending: question,
          decisionSourceCardId: question ? "AD1-002" : undefined,
        }),
      { initialProps: { fed: [] as readonly ServerBatch[], question: false } },
    );
    const first = singleServerBatch([triggered("AD1-002", "src-a", "a/draw")], 1);
    view.rerender({ fed: [first], question: true });
    await advance(1800);
    expect(clauseShown(view, "AD1-002")).toBe(true);
    const results = singleServerBatch([draw("drawn-a"), resolved("AD1-002", "src-a", "a/draw")], 2);
    view.rerender({ fed: [first, results], question: false });
    await advance(activePacing().resumeAnnounceMs + 16);
    expect(view.result.current.drawFlights).toHaveLength(1);
  });

  it("keeps the accepted clause through follow-up questions before presenting their results", async () => {
    setBasePacing(PACING_BY_STYLE.stacked);
    const anchors = geometry();
    const view = renderHook(
      ({ fed, question }: { fed: readonly ServerBatch[]; question: boolean }) =>
        useMatchCues({
          batches: fed,
          state: BOARD,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors,
          onActionRejected: vi.fn<(reason: string) => void>(),
          presentationPacing: "sequential",
          decisionPending: question,
          decisionSourceCardId: question ? "AD1-002" : undefined,
        }),
      { initialProps: { fed: [] as readonly ServerBatch[], question: false } },
    );
    const first = singleServerBatch([triggered("AD1-002", "src-a", "a/draw")], 1);
    view.rerender({ fed: [first], question: true });
    await advance(1800);
    const firstAnswer = singleServerBatch([draw("first-draw")], 2);
    // The answer immediately asks again; its dialog keeps the already-read clause.
    view.rerender({ fed: [first, firstAnswer], question: true });
    await advance(activePacing().resumeAnnounceMs + 16);
    expect(view.result.current.drawFlights).toHaveLength(1);
    await advance(1500);
    expect(view.result.current.decisionAnimationsPending).toBe(false);

    const finalAnswer = singleServerBatch([draw("final-draw"), resolved("AD1-002", "src-a", "a/draw")], 3);
    view.rerender({ fed: [first, firstAnswer, finalAnswer], question: false });
    expect(clauseShown(view, "AD1-002")).toBe(true);
    await advance(activePacing().resumeAnnounceMs + 16);
    expect(view.result.current.drawFlights).toHaveLength(1);
  });
});

describe("sequential pacing through a security check", () => {
  it("restores Asuna's Security toast as the same occurrence after a dialog", async () => {
    setBasePacing(PACING_BY_STYLE.stacked);
    const state = {
      ...BOARD,
      players: [
        {
          ...BOARD.players[0]!,
          battleArea: [{ permanentId: "perm-a", topCard: { instanceId: "asuna", cardId: "BT24-088" }, stack: [] }],
        },
        BOARD.players[1]!,
      ],
    } as unknown as GameState;
    const security: Extract<ServerEvent, { kind: "effectTriggered" }> = {
      kind: "effectTriggered",
      seat: 0,
      sourceCardId: "BT24-088",
      sourceInstanceId: "asuna",
      effectKey: "BT24-088/ir-26-0",
      timing: "Security",
      duringSecurityCheck: true,
      description: "[Security] Play this card without paying the cost.",
    };
    const batches = [
      singleServerBatch(
        [
          {
            kind: "securityRevealed",
            seat: 0,
            revealedCardId: "BT24-088",
            attackerPermanentId: "attacker",
            hasSecurityEffect: true,
            isDigimon: false,
          },
          security,
        ],
        1,
      ),
      singleServerBatch(
        [
          { kind: "cardPlayed", seat: 0, cardId: "BT24-088", instanceId: "asuna", permanentId: "perm-a" },
          { kind: "cardsMoved", from: "various", to: "battleArea", instanceIds: ["asuna"] },
        ],
        2,
      ),
      singleServerBatch(
        [
          {
            kind: "effectResolved",
            seat: 0,
            sourceCardId: "BT24-088",
            sourceInstanceId: "asuna",
            sourcePermanentId: "perm-a",
            effectKey: security.effectKey,
            timing: "Security",
            description: security.description,
          },
        ],
        3,
      ),
      singleServerBatch([{ kind: "securityChecked", seat: 0, revealedCardId: "BT24-088", resolution: "effect" }], 4),
    ];
    const anchors = geometry();
    const shield = document.createElement("div");
    vi.spyOn(shield, "getBoundingClientRect").mockReturnValue(new DOMRect(650, 420, 80, 100));
    anchors.yourSecurity = { current: shield };
    const view = renderHook(
      ({ fed }: { fed: readonly ServerBatch[] }) =>
        useMatchCues({
          batches: fed,
          state,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors,
          onActionRejected: () => {},
          presentationPacing: "sequential",
        }),
      { initialProps: { fed: [] as readonly ServerBatch[] } },
    );
    await advance(0);
    for (let count = 1; count <= batches.length; count++) {
      view.rerender({ fed: batches.slice(0, count) });
      await advance(16);
    }
    for (let elapsed = 0; elapsed < 12_000 && !clauseShown(view, "BT24-088"); elapsed += 16) await advance(16);
    const original = [...view.result.current.narration.values()].find(
      (item) => item.notice?.body.variant === "effect" && item.notice.body.cardId === "BT24-088",
    );
    expect(original).toBeDefined();
    await advance(400);
    expect(clauseShown(view, "BT24-088")).toBe(true);
    const restored = [...view.result.current.narration.values()].filter(
      (item) => item.notice?.body.variant === "effect" && item.notice.body.cardId === "BT24-088",
    );
    expect(restored).toHaveLength(1);
    expect(restored[0]?.id).toBe(original?.id);
    expect(restored[0]?.notice).toBe(original?.notice);
  });

  it("reads a security-played On Play clause before its same-batch cost panel and draws", async () => {
    setBasePacing(PACING_BY_STYLE.stacked);
    const state = {
      ...BOARD,
      players: [{ ...BOARD.players[0]!, trash: [{ instanceId: "discard", cardId: "BT1-009" }] }, BOARD.players[1]!],
    } as unknown as GameState;
    const security: ServerEvent = {
      ...triggered("AD1-002", "src-a", "a/security"),
      timing: "Security",
      description: "[Security] Play this card without paying the cost.",
      duringSecurityCheck: true,
    };
    const onPlay: ServerEvent = {
      ...triggered("AD1-002", "src-a", "a/onPlay"),
      timing: "OnPlay",
      description: "[On Play] By trashing 1 card from your hand, draw 1 card.",
      duringSecurityCheck: true,
    };
    const batches = [
      singleServerBatch(
        [
          {
            kind: "securityRevealed",
            seat: 0,
            revealedCardId: "AD1-002",
            attackerPermanentId: "attacker",
            hasSecurityEffect: true,
          },
        ],
        1,
      ),
      singleServerBatch([security], 2),
      singleServerBatch(
        [
          {
            kind: "cardPlayed",
            seat: 0,
            cardId: "AD1-002",
            instanceId: "src-a",
            permanentId: "perm-a",
            fromZone: "security",
          },
        ],
        3,
      ),
      singleServerBatch([{ ...security, kind: "effectResolved" } as ServerEvent], 4),
      singleServerBatch([onPlay, { kind: "cardsMoved", instanceIds: ["discard"], from: "various", to: "trash" }], 5),
      singleServerBatch([draw("drawn-a")], 6),
      singleServerBatch([{ ...onPlay, kind: "effectResolved" } as ServerEvent], 7),
      singleServerBatch([{ kind: "securityChecked", seat: 0, revealedCardId: "AD1-002", resolution: "effect" }], 8),
    ];
    const anchors = geometry();
    const view = renderHook(
      ({ fed }: { fed: readonly ServerBatch[] }) =>
        useMatchCues({
          batches: fed,
          state,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors,
          onActionRejected: vi.fn<(reason: string) => void>(),
          presentationPacing: "sequential",
        }),
      { initialProps: { fed: [] as readonly ServerBatch[] } },
    );
    await advance(0);
    view.rerender({ fed: batches });
    let clauseAt: number | undefined;
    let drawAt: number | undefined;
    for (let elapsed = 0; elapsed <= 12_000; elapsed += 16) {
      if (effectClauses(view).some((notice) => notice.body.variant === "effect" && notice.body.timing === "OnPlay"))
        clauseAt ??= elapsed;
      if (view.result.current.drawFlights.length > 0) drawAt ??= elapsed;
      await advance(16);
    }
    expect(clauseAt).toBeDefined();
    expect(drawAt).toBeDefined();
    // Samples are 16 ms apart; the clause and its draw can land between frames.
    expect(drawAt! - clauseAt!).toBeGreaterThanOrEqual(activePacing().announceMs - 16);
    expect(view.result.current.decisionAnimationsPending).toBe(false);
  });

  const ATTACK: ServerEvent = {
    kind: "attackDeclared",
    seat: 0,
    attackerPermanentId: "perm-a",
    attackerCardId: "AD1-002",
    target: { kind: "player" },
  };
  const REVEAL: ServerEvent = {
    kind: "securityRevealed",
    seat: 1,
    revealedCardId: "BT4-093",
    attackerPermanentId: "perm-a",
    hasSecurityEffect: true,
  };
  const SECURITY_EFFECT: ServerEvent = {
    kind: "effectTriggered",
    seat: 1,
    sourceCardId: "BT4-093",
    effectKey: "BT4-093/security",
    description: "[Security] <Draw 1>.",
    timing: "Security",
  };
  const OPPONENT_DRAW: ServerEvent = {
    kind: "cardsMoved",
    from: "deck",
    to: "hand",
    instanceIds: ["drawn-s"],
    seat: 1,
  };
  const CHECKED: ServerEvent = { kind: "securityChecked", seat: 1, revealedCardId: "BT4-093", resolution: "effect" };

  const WHEN_ATTACKING = { description: "[When Attacking] <Draw 1>.", timing: "whenAttacking" };
  const attackTrigger = (sourceCardId: string, sourceInstanceId: string): ServerEvent => ({
    ...triggered(sourceCardId, sourceInstanceId, `${sourceCardId}/attack`),
    ...WHEN_ATTACKING,
  });

  /**
   * Four effects, then the check they preceded, whose card has a [Security] effect of its
   * own: the server closes all of it in one burst, as in the effects lab's nested scenario.
   * The dock reads the [Security] clause only when it docks, while the later [When Attacking]
   * clauses are still queued behind the first.
   */
  const ATTACK_CHAIN: readonly (readonly ServerEvent[])[] = [
    [ATTACK],
    ...CHAIN,
    ...["AD1-002", "BT18-015"].flatMap((cardId, index) => {
      const instanceId = index === 0 ? "src-a" : "src-b";
      const trigger = attackTrigger(cardId, instanceId);
      return [[trigger], [draw(`drawn-attack-${index}`)], [{ ...trigger, kind: "effectResolved" } as ServerEvent]];
    }),
    [REVEAL, SECURITY_EFFECT],
    [OPPONENT_DRAW],
    [{ ...SECURITY_EFFECT, kind: "effectResolved" } as ServerEvent],
    [CHECKED],
  ];

  function renderAttackChain() {
    const anchors = geometry();
    const view = renderHook(
      ({ fed }: { fed: readonly ServerBatch[] }) =>
        useMatchCues({
          batches: fed,
          state: BOARD,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors,
          onActionRejected: vi.fn<(reason: string) => void>(),
          presentationPacing: "sequential",
        }),
      { initialProps: { fed: [] as readonly ServerBatch[] } },
    );
    return {
      ...view,
      feed() {
        view.rerender({ fed: ATTACK_CHAIN.map((events, index) => singleServerBatch(events, index + 1)) });
      },
    };
  }

  // A gate that runs out its ceiling fails the test on its own (test/setupGateExpiry.ts).
  it("reads each clause in server order, and breaks the shield only after the effects before it", async () => {
    const view = renderAttackChain();
    await advance(0);
    view.feed();
    const firstSeen = new Map<string, number>();
    const mark = (name: string, seen: boolean, at: number) => {
      if (seen && !firstSeen.has(name)) firstSeen.set(name, at);
    };
    for (let elapsed = 0; elapsed <= 20_000; elapsed += 16) {
      const clauses = effectClauses(view);
      for (const notice of clauses)
        if (notice.body.variant === "effect") mark(`${notice.body.cardId} ${notice.body.timing ?? ""}`, true, elapsed);
      mark("break", view.result.current.securityBreak !== null, elapsed);
      await advance(16);
    }

    const order = [...firstSeen.entries()].sort(([, a], [, b]) => a - b).map(([name]) => name);
    expect(order).toEqual([
      "AD1-002 whenOneOfYoursDigivolves",
      "BT18-015 whenOneOfYoursDigivolves",
      "AD1-002 whenAttacking",
      "BT18-015 whenAttacking",
      "break",
      "BT4-093 Security",
    ]);
    expect(view.result.current.decisionAnimationsPending).toBe(false);
  });
});

describe("an Option an attack effect uses, in the same burst as the security check", () => {
  // Follow-up to feedback #29 (LM-068 Black Sabbath used from the trash): the check's shield
  // break replaced the centre-stage track and dropped the Option's showcase. Its clause was
  // never read, so the deletion and the effect unit waited out their gate ceilings.
  it("reads the Option's clause and plays its deletion before the shield breaks", async () => {
    const state = {
      ...BOARD,
      players: [
        {
          ...BOARD.players[0]!,
          battleArea: [{ permanentId: "punkmon", topCard: { instanceId: "punk", cardId: "EX11-049" }, stack: [] }],
        },
        {
          ...BOARD.players[1]!,
          battleArea: [{ permanentId: "groundramon", topCard: { instanceId: "ground", cardId: "BT1-020" }, stack: [] }],
        },
      ],
    } as unknown as GameState;
    const watcher: Extract<ServerEvent, { kind: "effectTriggered" }> = {
      kind: "effectTriggered",
      seat: 0,
      sourceCardId: "LM-068",
      sourceInstanceId: "sabbath",
      effectKey: "subtrigger/14/whenAttacking",
      description: "When attacking: HeavyMetaldramon",
      timing: "whenAttacking",
    };
    const option: Extract<ServerEvent, { kind: "effectTriggered" }> = {
      kind: "effectTriggered",
      seat: 0,
      sourceCardId: "LM-068",
      sourceInstanceId: "sabbath",
      effectKey: "LM-068/ir-25-0",
      description:
        "[Main] Delete 1 of your opponent's Digimon with a level as high as the number of cards in your hand or higher.",
      timing: "OnUseOption",
    };
    const asked: readonly (readonly ServerEvent[])[] = [
      [
        {
          kind: "attackDeclared",
          seat: 0,
          attackerPermanentId: "punkmon",
          attackerCardId: "EX11-049",
          target: { kind: "player" },
        },
      ],
      [watcher],
    ];
    const answered: readonly (readonly ServerEvent[])[] = [
      [
        { kind: "memoryChanged", from: 3, to: 0, reason: "useOption" },
        { kind: "cardPlayed", instanceId: "sabbath", fromZone: "trash", seat: 0, cardId: "LM-068" },
        option,
      ],
      [
        {
          kind: "cardsMoved",
          instanceIds: ["ground"],
          from: "battleArea",
          to: "trash",
          deletedPermanents: [{ permanentId: "groundramon", instanceId: "ground", cardId: "BT1-020", seat: 1 }],
        },
      ],
      [{ ...option, kind: "effectResolved" } as ServerEvent],
      [{ kind: "cardsMoved", instanceIds: ["sabbath"], from: "various", to: "trash", optionUsed: true }],
      [{ ...watcher, kind: "effectResolved" } as ServerEvent],
      [
        {
          kind: "securityRevealed",
          seat: 1,
          revealedCardId: "BT1-027",
          attackerPermanentId: "punkmon",
          securityCardDP: 4000,
          attackerDP: 8000,
          securityCountBefore: 4,
          hasSecurityEffect: false,
          isDigimon: true,
        },
      ],
      [
        {
          kind: "securityChecked",
          seat: 1,
          revealedCardId: "BT1-027",
          resolution: "battle",
          battle: { securityDigimonDeleted: true, attackerDeleted: false, attackerDP: 8000, securityCardDP: 4000 },
        },
      ],
      [{ kind: "attackEnded", seat: 0, attackerPermanentId: "punkmon" }],
    ];
    const anchors = geometry();
    const view = renderHook(
      ({ fed }: { fed: readonly ServerBatch[] }) =>
        useMatchCues({
          batches: fed,
          state,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors,
          onActionRejected: vi.fn<(reason: string) => void>(),
          presentationPacing: "sequential",
        }),
      { initialProps: { fed: [] as readonly ServerBatch[] } },
    );
    await advance(0);
    const batches = asked.map((events, index) => singleServerBatch(events, index + 1));
    view.rerender({ fed: batches });
    await advance(4000);
    view.rerender({
      fed: [...batches, ...answered.map((events, index) => singleServerBatch(events, asked.length + index + 1))],
    });
    let clauseAt: number | undefined;
    let burstAt: number | undefined;
    let breakAt: number | undefined;
    for (let elapsed = 0; elapsed <= 15_000; elapsed += 16) {
      if (
        effectClauses(view).some((notice) => notice.body.variant === "effect" && notice.body.timing === "OnUseOption")
      )
        clauseAt ??= elapsed;
      if (view.result.current.deleteBursts.length > 0) burstAt ??= elapsed;
      if (view.result.current.securityBreak !== null) breakAt ??= elapsed;
      await advance(16);
    }
    expect(clauseAt).toBeDefined();
    expect(burstAt).toBeDefined();
    expect(breakAt).toBeDefined();
    expect(clauseAt!).toBeLessThan(burstAt!);
    expect(burstAt!).toBeLessThan(breakAt!);
    expect(view.result.current.decisionAnimationsPending).toBe(false);
  });
});

describe("current pacing keeps its own order", () => {
  it("lets the second effect's source light up while the first effect's results still play", async () => {
    const view = renderChain("current");
    await advance(0);
    view.feedChain();
    const timeline = await recordTimeline(view, 8000);

    expect(timeline.sourceLitB).toBeDefined();
    expect(timeline.firstFlight! - timeline.firstClauseA!).toBeLessThan(activePacing().announceMs);
    expect(timeline.sourceLitB! - (timeline.flightsDoneAfterA ?? Infinity)).toBeLessThan(activePacing().settleMs);
  });
});

// Rules 11-1-3 and 11-1-4: [When Attacking] effects resolve before the battle. Shoutmon X7
// (AD1-006) attacks with Starmons (BT10-029) under it, in arena-discord-x7-digixros-zones.
describe("a [When Attacking] clause plays before the battle that follows it", () => {
  const ATTACKER = "perm-x7";
  const DEFENDER = "perm-omnimon";
  const ATTACK_BOARD = {
    players: [
      {
        battleArea: [
          { permanentId: ATTACKER, topCard: { instanceId: "src-x7", cardId: "AD1-006" }, stack: [], currentDP: 13000 },
        ],
        trash: [],
        hand: [],
        handCount: 5,
      },
      {
        battleArea: [
          {
            permanentId: DEFENDER,
            topCard: { instanceId: "src-omni", cardId: "BT1-084" },
            stack: [],
            currentDP: 15000,
          },
        ],
        trash: [],
        hand: [],
        handCount: 5,
      },
    ],
  } as unknown as GameState;
  const attack: ServerEvent = {
    kind: "attackDeclared",
    seat: 0,
    attackerPermanentId: ATTACKER,
    attackerCardId: "AD1-006",
    target: { kind: "permanent", permanentId: DEFENDER },
    targetCardId: "BT1-084",
  };
  const starmons = {
    seat: 0 as const,
    sourceCardId: "BT10-029",
    sourceInstanceId: "src-starmons",
    sourcePermanentId: ATTACKER,
    effectKey: "BT10-029/ir-12-0",
    description: "[When Attacking] If this Digimon has [Shoutmon] in its name, <Draw 1>.",
    timing: "WhenAttacking",
  };
  const clause: ServerEvent[] = [
    { kind: "effectTriggered", ...starmons },
    draw("starmons-draw"),
    { kind: "effectResolved", ...starmons },
  ];
  const battle: ServerEvent[] = [
    {
      kind: "battleCompared",
      attackerPermanentId: ATTACKER,
      defenderPermanentId: DEFENDER,
      loserPermanentIds: [ATTACKER],
    },
    { kind: "combatResolved", seat: 0, attackerPermanentId: ATTACKER, deletedPermanentIds: [ATTACKER] },
    { kind: "attackEnded", seat: 0, attackerPermanentId: ATTACKER },
  ];

  it.each([
    ["in the battle's batch", [[attack], [...clause, ...battle]]],
    ["in batches of its own", [[attack], ...clause.map((event) => [event]), battle]],
  ] as const)("settles Starmons' clause before the field clash starts (%s)", async (_shape, chain) => {
    let elapsed = 0;
    let settledAt: number | undefined;
    const devProbe = {
      onStep: (event: PresentationStepEvent) => {
        if (event.step.id.startsWith("effect-unit-settle-") && event.phase === "finished") settledAt ??= elapsed;
      },
    };
    const anchors = geometry();
    const view = renderHook(
      ({ fed }: { fed: readonly ServerBatch[] }) =>
        useMatchCues({
          batches: fed,
          state: ATTACK_BOARD,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors,
          onActionRejected: () => {},
          presentationPacing: "sequential",
          devProbe,
        }),
      { initialProps: { fed: [] as readonly ServerBatch[] } },
    );
    await advance(0);
    view.rerender({ fed: chain.map((events, index) => singleServerBatch(events, index + 1)) });
    let clauseAt: number | undefined;
    let clashAt: number | undefined;
    for (; elapsed <= 20_000; elapsed += 16) {
      if (clauseShown(view, "BT10-029")) clauseAt ??= elapsed;
      if (view.result.current.fieldClash !== null) clashAt ??= elapsed;
      await advance(16);
    }
    expect(clauseAt).toBeDefined();
    expect(settledAt).toBeDefined();
    expect(clashAt).toBeDefined();
    expect(clauseAt!).toBeLessThan(clashAt!);
    expect(settledAt!).toBeLessThanOrEqual(clashAt!);
  });
});

it.each(["sequential", "current"] as const)(
  "groups discarded sources delivered in separate React renders with %s pacing",
  async (pacing) => {
    const view = renderChain(pacing);
    await advance(0);
    view.feedChain([[triggered("AD1-002", "src-a", "a/sources")]]);
    await advance(2000);
    for (let index = 1; index <= 3; index += 1) {
      view.feedChain([
        [
          {
            kind: "cardsMoved",
            from: "various",
            to: "trash",
            seat: 1,
            instanceIds: [`source-${index}`],
            cardIds: ["BT1-009"],
            trashedSources: { permanentId: `host-${index}`, hostCardId: "BT1-018", sourceCardId: "AD1-002" },
          },
        ],
      ]);
      let panels: NonNullable<ReturnType<typeof useMatchCues>["sidePanels"]> = [];
      for (let elapsed = 0; elapsed < 8000; elapsed += 16) {
        await advance(16);
        panels = view.result.current.sidePanels.filter((panel) => panel.titleKey === "panel.trashedDigivolutionCards");
        if (panels.some((panel) => panel.cards.length === index)) break;
      }
      expect(panels).toHaveLength(1);
      expect(panels[0]?.cards).toHaveLength(index);
    }
  },
);

describe("recovery following an evolution draw", () => {
  it("keeps recovery behind its clause while the preceding draw waits for its card art", async () => {
    setBasePacing(PACING_BY_STYLE.stacked);
    const root = document.createElement("div");
    root.dataset.drawPresentationKey = "1";
    root.dataset.drawReady = "false";
    document.body.append(root);
    const steps: { id: string; phase: string; at: number }[] = [];
    const expiries: GateExpiry[] = [];
    const stopObserving = observeGateExpiry((expiry) => expiries.push(expiry));
    const anchors = geometry();
    const recovery: ServerEvent = {
      ...triggered("AD1-002", "src-a", "a/recovery"),
      timing: "WhenDigivolving",
      description: "[When Digivolving] <Recovery +1 (Deck)>.",
    };
    const view = renderHook(
      ({ fed }: ChainProps) =>
        useMatchCues({
          batches: fed,
          state: BOARD,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors,
          onActionRejected: () => {},
          presentationPacing: "sequential",
          devProbe: {
            onStep(event) {
              steps.push({ id: event.step.id, phase: event.phase, at: Date.now() });
            },
          },
        }),
      { initialProps: { fed: [] as readonly ServerBatch[] } },
    );
    try {
      await advance(0);
      view.rerender({
        fed: [
          singleServerBatch([draw("evolution-draw")], 1),
          singleServerBatch([recovery], 2),
          singleServerBatch([{ kind: "securityRecovered", seat: 0, amount: 1 }], 3),
          singleServerBatch([{ ...recovery, kind: "effectResolved" } as ServerEvent], 4),
        ],
      });
      await advance(5000);
      expect(clauseShown(view, "AD1-002")).toBe(false);
      expect(view.result.current.securityFlights.size).toBe(0);
      await advance(7000);
      expect(expiries).toEqual([]);
      const drawFinished = steps.find((step) => step.id === "draw-flight-1" && step.phase === "finished");
      const clauseRead = steps.find((step) => step.id === "effect-unit-announce-1" && step.phase === "finished");
      expect(drawFinished).toBeDefined();
      expect(clauseRead).toBeDefined();
      expect(clauseRead!.at).toBeGreaterThan(drawFinished!.at);
      const recoveryFinished = steps.find(
        (step) => step.id === "security-gain-flight-0-1" && step.phase === "finished",
      );
      expect(recoveryFinished).toBeDefined();
      expect(recoveryFinished!.at).toBeGreaterThan(clauseRead!.at);
      expect(view.result.current.decisionAnimationsPending).toBe(false);
    } finally {
      stopObserving();
      root.remove();
    }
  });
});

it("settles parent result receipts before a nested replacement announcement", async () => {
  setBasePacing(PACING_BY_STYLE.stacked);
  const view = renderChain("sequential");
  await advance(0);
  view.feedChain([
    [triggered("AD1-002", "src-a", "a/delete")],
    [{ ...triggered("BT18-015", "src-b", "b/replacement"), timing: "wouldLeavePlay" }],
    [resolved("BT18-015", "src-b", "b/replacement")],
    [
      {
        kind: "cardsMoved",
        from: "battleArea",
        to: "trash",
        instanceIds: ["src-b"],
        deletedPermanents: [{ permanentId: "perm-b", instanceId: "src-b", cardId: "BT18-015", seat: 0 }],
      },
    ],
    [resolved("AD1-002", "src-a", "a/delete")],
  ]);
  await advance(4000);
  expect(view.result.current.decisionAnimationsPending).toBe(false);
});

it.each(["current", "sequential"] as const)(
  "orders a same-batch discard continuation, flight and nested reaction with %s pacing",
  async (presentationPacing) => {
    const anchors = geometry();
    const trash = document.createElement("div");
    trash.className = "game-utility-slot--opp-trash";
    vi.spyOn(trash, "getBoundingClientRect").mockReturnValue(new DOMRect(700, 100, 80, 100));
    anchors.board.current!.append(trash);
    const expiries: GateExpiry[] = [];
    const stop = observeGateExpiry((expiry) => expiries.push(expiry));
    const first = { ...triggered("EX14-054", "src-a", "barbamon/play"), timing: "OnPlay" };
    const reaction = {
      ...triggered("EX14-054", "src-a", "barbamon/discard"),
      timing: "whenHandTrashed",
      description:
        "[All Turns] [Once Per Turn] When your opponent's hand is trashed from, you may delete all of their lowest level Digimon.",
    };
    const passage = "Then, your opponent trashes 1 card in their hand.";
    const steps: { id: string; phase: string; at: number }[] = [];
    const view = renderHook(
      ({ fed }: ChainProps) =>
        useMatchCues({
          batches: fed,
          state: BOARD,
          viewerSeat: 0,
          mulliganOpen: false,
          anchors,
          onActionRejected: () => {},
          presentationPacing,
          devProbe: {
            onStep(event) {
              steps.push({ id: event.step.id, phase: event.phase, at: Date.now() });
            },
          },
        }),
      { initialProps: { fed: [] as readonly ServerBatch[] } },
    );
    try {
      await advance(0);
      view.rerender({
        fed: [
          singleServerBatch(
            [
              first,
              {
                kind: "effectClauseAdvanced",
                seat: 0,
                sourceCardId: "EX14-054",
                sourceInstanceId: "src-a",
                timing: "OnPlay",
                clause: passage,
              },
              {
                kind: "cardsMoved",
                from: "hand",
                to: "trash",
                seat: 1,
                instanceIds: ["discard"],
                cardIds: ["BT1-009"],
              },
              reaction,
              { ...reaction, kind: "effectResolved" },
              { ...first, kind: "effectResolved" },
            ],
            1,
          ),
        ],
      });
      const parentNoticeIds = new Set<string>();
      let continuationAt: number | undefined;
      let flightAt: number | undefined;
      let flightDoneAt: number | undefined;
      let reactionAt: number | undefined;
      for (let elapsed = 0; elapsed < 12000; elapsed += 16) {
        const notices = view.result.current.notices;
        for (const notice of notices) {
          if (notice.body.variant === "effect" && notice.body.effectKey !== reaction.effectKey) {
            parentNoticeIds.add(notice.id);
          }
        }
        if (notices.some(({ body }) => body.variant === "effect" && body.effectTextPart === passage)) {
          continuationAt ??= elapsed;
        }
        if (view.result.current.drawFlights.some((flight) => flight.handTrash)) {
          flightAt ??= elapsed;
        } else if (flightAt !== undefined) {
          flightDoneAt ??= elapsed;
        }
        if (notices.some(({ body }) => body.variant === "effect" && body.effectKey === reaction.effectKey)) {
          reactionAt ??= elapsed;
        }
        await advance(16);
      }
      expect(parentNoticeIds.size).toBe(1);
      expect(continuationAt).toBeDefined();
      expect(flightAt).toBeGreaterThanOrEqual(continuationAt!);
      expect(flightDoneAt).toBeDefined();
      expect(reactionAt).toBeGreaterThanOrEqual(flightDoneAt!);
      expect(expiries).toEqual([]);
      expect(steps.some((step) => step.id.startsWith("hand-trash-") && step.phase === "finished")).toBe(true);
      expect(view.result.current.decisionAnimationsPending).toBe(false);
    } finally {
      stop();
    }
  },
);

it.each(["dp", "restriction"] as const)(
  "finishes a resumed effect's %s pulse when its state patch precedes target confirmation",
  async (change) => {
    setBasePacing(PACING_BY_STYLE.stacked);
    const anchors = geometry();
    const baseline = structuredClone(BOARD);
    baseline.stateVersion = 0;
    const unchanged = structuredClone(baseline);
    unchanged.stateVersion = 1;
    const changed = structuredClone(baseline);
    changed.stateVersion = 2;
    if (change === "dp") {
      changed.players[0]!.battleArea[1]!.currentDP = 8000;
    } else {
      changed.players[0]!.battleArea[1]!.cannotAttack = true;
    }
    const expired: GateExpiry[] = [];
    const stop = observeGateExpiry((expiry) => expired.push(expiry));
    const steps: PresentationStepEvent[] = [];
    const view = renderHook(
      ({ state, fed, question }: { state: GameState; fed: readonly ServerBatch[]; question: boolean }) =>
        useMatchCues({
          batches: fed,
          state,
          viewerSeat: VIEWER,
          mulliganOpen: false,
          anchors,
          onActionRejected: () => {},
          presentationPacing: "sequential",
          decisionPending: question,
          decisionSourceCardId: question ? "AD1-002" : undefined,
          devProbe: { onStep: (step) => steps.push(step) },
        }),
      { initialProps: { state: baseline, fed: [] as readonly ServerBatch[], question: false } },
    );
    try {
      const first = singleServerBatch([triggered("AD1-002", "src-a", "targeted-effect")], 1);
      view.rerender({ state: unchanged, fed: [first], question: true });
      await advance(4000);
      expect(view.result.current.decisionAnimationsPending).toBe(false);
      view.rerender({ state: changed, fed: [first], question: false });
      await advance(16);
      const results = singleServerBatch(
        [
          { kind: "effectTargetsSelected", seat: 0, sourcePermanentId: "perm-a", targetPermanentIds: ["perm-b"] },
          resolved("AD1-002", "src-a", "targeted-effect"),
        ],
        2,
      );
      view.rerender({ state: changed, fed: [first, results], question: false });
      await advance(3000);
      const prefix = change === "dp" ? "dp-pulse-" : "freeze-pulse-";
      expect(steps.some((step) => step.step.id.startsWith(prefix) && step.phase === "finished")).toBe(true);
      expect(steps.some((step) => step.step.id === "effect-unit-resettle-1" && step.phase === "finished")).toBe(true);
      await advance(7000);
      expect(expired).toEqual([]);
      expect(view.result.current.dpPulses.size).toBe(0);
      expect(view.result.current.freezePulses.size).toBe(0);
      expect(view.result.current.decisionAnimationsPending).toBe(false);
    } finally {
      stop();
    }
  },
);
