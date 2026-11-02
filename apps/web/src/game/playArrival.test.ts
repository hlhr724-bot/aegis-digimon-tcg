// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Dispatch, SetStateAction } from "react";
import { createAnimationQueue, type AnimationQueue } from "./animationQueue";
import { zoneChangeStep } from "./match/steps/zoneChangeStep";
import { createArrivalPresentation } from "./match/cardReveal";
import { CueTrack } from "./match/enums";
import type { PermanentBurst, ZoneShowcase } from "./showcases";
import { CARD_BURST_PEAK_MS, SHOWCASE_TOTAL_MS, SHOWCASE_OUT_AT_MS, TIMINGS } from "./timings";
import { createPresentationGate, type PresentationGate } from "./match/presentationGate";

function stateCell<T>(initial: T) {
  let current = initial;
  const set: Dispatch<SetStateAction<T>> = (next) => {
    current = typeof next === "function" ? (next as (value: T) => T)(current) : next;
  };
  return { get: () => current, set };
}

function fixture(mode: "live" | "drain" | "replay" = "live") {
  const pending = stateCell<ReadonlySet<string>>(new Set());
  const bursts = stateCell<ReadonlyMap<string, PermanentBurst>>(new Map());
  const showcase = stateCell<ZoneShowcase | null>(null);
  const queue = createAnimationQueue({ mode });
  const trace: { key: number; at: number }[] = [];
  function arrive(
    key = 1,
    options: {
      mine?: boolean;
      track?: string;
      waitFor?: PresentationGate;
      noShowcase?: boolean;
      permanentId?: string;
    } = {},
  ) {
    const presentation = createArrivalPresentation();
    const permanentId = options.permanentId ?? `p-${key}`;
    pending.set((held) => new Set(held).add(permanentId));
    queue.enqueue(
      zoneChangeStep({
        queue,
        presentationBatchRef: { current: { batchId: "accepted", stateVersion: 2 } },
        enqueuePhaseOrderRef: { current: 1 },
        setPendingPermanentIds: pending.set,
        setPermanentBursts: bursts.set,
        setZoneShowcase: (next) => {
          showcase.set(next);
          if (showcase.get()) trace.push({ key: showcase.get()!.key, at: Date.now() });
        },
        key,
        showcase: options.noShowcase
          ? null
          : {
              key,
              cardId: "BT1-010",
              artId: "alternate",
              seat: options.mine ? 0 : 1,
              mine: options.mine ?? false,
              kind: "play",
              color: "Red",
            },
        ...(options.waitFor ? { waitFor: options.waitFor } : {}),
        ...(options.track ? { track: options.track } : {}),
        burst: { key, permanentId, seat: 0, variant: "play", color: "Red", inBreeding: false },
        presentation,
      }),
    );
    return presentation;
  }
  return { pending, bursts, showcase, queue, trace, arrive };
}

const queues: AnimationQueue[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(async () => {
  for (const queue of queues.splice(0)) queue.clear();
  await vi.advanceTimersByTimeAsync(0);
  vi.useRealTimers();
  document.body.replaceChildren();
});
function run(mode: "live" | "drain" | "replay" = "live") {
  const result = fixture(mode);
  queues.push(result.queue);
  return result;
}

describe("public card arrival", () => {
  it.each([1, 2])("holds a late painted exit before releasing the field at %sx playback", async (rate) => {
    const f = run();
    f.queue.setRate(rate);
    const startedAt = Date.now();
    const root = document.createElement("div");
    root.dataset.showcaseKey = "1";
    document.body.append(root);
    root.getAnimations = () => [
      {
        animationName: "battle-showcase-exit",
        get currentTime() {
          return Math.max(0, Date.now() - startedAt - 100) * rate;
        },
        playState: "running",
        playbackRate: rate,
        effect: { getTiming: () => ({ delay: SHOWCASE_OUT_AT_MS }) },
      } as unknown as Animation,
    ];
    const gates = f.arrive();
    await vi.advanceTimersByTimeAsync(SHOWCASE_TOTAL_MS / rate);
    expect(f.showcase.get()?.key).toBe(1);
    expect(f.pending.get().has("p-1")).toBe(true);
    expect(gates.revealed.open).toBe(false);
    await vi.advanceTimersByTimeAsync(99);
    expect(gates.revealed.open).toBe(false);
    await vi.advanceTimersByTimeAsync(17);
    expect(f.showcase.get()).toBeNull();
    expect(f.pending.get().size).toBe(0);
    expect(gates.revealed.open).toBe(true);
    expect(f.bursts.get().has("p-1")).toBe(true);
  });

  it.each([false, true])("reveals the accepted art before the field for mine=%s", async (mine) => {
    const f = run();
    const gates = f.arrive(1, { mine });
    await vi.advanceTimersByTimeAsync(0);
    expect(f.showcase.get()).toMatchObject({ mine, cardId: "BT1-010", artId: "alternate" });
    expect(f.pending.get().has("p-1")).toBe(true);
    expect(gates.revealed.open).toBe(false);
    await vi.advanceTimersByTimeAsync(SHOWCASE_TOTAL_MS - 1);
    expect(f.bursts.get().size).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.showcase.get()).toBeNull();
    expect(f.pending.get().size).toBe(0);
    expect(gates.revealed.open).toBe(true);
    expect(gates.landed.open).toBe(false);
    expect(f.bursts.get().get("p-1")?.variant).toBe("play");
    await vi.advanceTimersByTimeAsync(CARD_BURST_PEAK_MS - 1);
    expect(gates.landed.open).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(gates.landed.open).toBe(true);
    expect(f.queue.hasPendingStep((step) => step.track === "burst-p-1" && step.blocksDecision !== false)).toBe(false);
    await vi.advanceTimersByTimeAsync(TIMINGS.cardBurst - CARD_BURST_PEAK_MS);
    expect(f.bursts.get().size).toBe(0);
  });

  it("serializes simultaneous effect results that run on independent tracks", async () => {
    const f = run();
    const at = Date.now();
    f.arrive(1, { track: "result-1" });
    f.arrive(2, { track: "result-2" });
    await vi.advanceTimersByTimeAsync(0);
    expect(f.showcase.get()?.key).toBe(1);
    await vi.advanceTimersByTimeAsync(SHOWCASE_TOTAL_MS - 1);
    expect(f.showcase.get()?.key).toBe(1);
    expect(f.pending.get().has("p-2")).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.showcase.get()?.key).toBe(2);
    expect(f.bursts.get().has("p-1")).toBe(true);
    await vi.advanceTimersByTimeAsync(SHOWCASE_TOTAL_MS + 16);
    expect(f.showcase.get()).toBeNull();
    expect(f.trace.filter((entry, index) => index === 0 || entry.key !== f.trace[index - 1]?.key)).toEqual([
      { key: 1, at },
      { key: 2, at: at + SHOWCASE_TOTAL_MS },
    ]);
  });

  it("does not reserve the reveal while a result waits for its cause", async () => {
    const f = run();
    const cause = createPresentationGate();
    f.arrive(1, { track: "waiting-result", waitFor: cause });
    f.arrive(2, { track: "ready-result" });
    await vi.advanceTimersByTimeAsync(0);
    expect(f.showcase.get()?.key).toBe(2);
    await vi.advanceTimersByTimeAsync(SHOWCASE_TOTAL_MS);
    expect(f.pending.get().has("p-1")).toBe(true);
    cause.release();
    await vi.advanceTimersByTimeAsync(16);
    expect(f.showcase.get()?.key).toBe(1);
  });

  it("a replacing security cue cancels the reveal and releases the held field", async () => {
    const f = run();
    const gates = f.arrive();
    await vi.advanceTimersByTimeAsync(100);
    f.queue.pause();
    f.queue.enqueue({ id: "security", track: CueTrack.CenterStage, replace: true, run: () => {} });
    await vi.advanceTimersByTimeAsync(0);
    expect(f.showcase.get()).toBeNull();
    expect(f.pending.get().size).toBe(0);
    expect(gates.revealed.open && gates.landed.open).toBe(true);
    f.queue.resume();
    await vi.advanceTimersByTimeAsync(SHOWCASE_TOTAL_MS);
    expect(f.bursts.get().size).toBe(0);
  });

  it("releases handoffs for arrivals discarded before they start", async () => {
    const f = run();
    f.queue.enqueue({ id: "prior", track: CueTrack.CenterStage, run: (ctx) => ctx.wait(1000) });
    const gates = f.arrive();
    f.queue.enqueue({ id: "security", track: CueTrack.CenterStage, replace: true, run: () => {} });
    await vi.advanceTimersByTimeAsync(0);
    expect(gates.revealed.open && gates.landed.open).toBe(true);
    expect(f.pending.get().size).toBe(0);
    expect(f.showcase.get()).toBeNull();
    expect(f.queue.isIdle()).toBe(true);
  });

  it("keeps the reveal and both handoffs frozen during playback pause", async () => {
    const f = run();
    const gates = f.arrive();
    await vi.advanceTimersByTimeAsync(100);
    f.queue.pause();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(gates.revealed.open).toBe(false);
    expect(f.showcase.get()?.key).toBe(1);
    f.queue.resume();
    await vi.advanceTimersByTimeAsync(SHOWCASE_TOTAL_MS - 100 + 16);
    expect(gates.revealed.open).toBe(true);
  });

  it.each(["drain", "replay"] as const)(
    "returns the field without a reveal or stranded handoff in %s",
    async (mode) => {
      const f = run(mode);
      const gates = f.arrive();
      await f.queue.idle();
      expect(f.pending.get().size).toBe(0);
      expect(f.showcase.get()).toBeNull();
      expect(f.bursts.get().size).toBe(0);
      expect(gates.revealed.open && gates.landed.open).toBe(true);
    },
  );

  it("fast-forward clears active/queued reveals and their handoffs", async () => {
    const f = run();
    const one = f.arrive(1, { track: "result-1" });
    const two = f.arrive(2, { track: "result-2" });
    await vi.advanceTimersByTimeAsync(0);
    f.queue.skip();
    await f.queue.idle();
    expect(f.showcase.get()).toBeNull();
    expect(f.pending.get().size).toBe(0);
    expect(one.landed.open && two.landed.open).toBe(true);
  });

  it.each(["clear", "skip"] as const)("%s cleans the non-blocking light after landing", async (action) => {
    const f = run();
    const gates = f.arrive(1, { noShowcase: true });
    await vi.advanceTimersByTimeAsync(CARD_BURST_PEAK_MS);
    expect(gates.landed.open).toBe(true);
    expect(f.bursts.get().size).toBe(1);
    expect(f.queue.hasPendingStep((step) => step.blocksDecision !== false)).toBe(false);
    f.queue[action]();
    await f.queue.idle();
    expect(f.bursts.get().size).toBe(0);
  });

  it("the previous light cannot clean up a newer arrival on the same permanent", async () => {
    const f = run();
    f.arrive(1, { noShowcase: true });
    await vi.advanceTimersByTimeAsync(250);
    f.arrive(2, { noShowcase: true, permanentId: "p-1" });
    await vi.advanceTimersByTimeAsync(TIMINGS.cardBurst - 250);
    expect(f.bursts.get().get("p-1")?.key).toBe(2);
    await vi.advanceTimersByTimeAsync(250);
    expect(f.bursts.get().size).toBe(0);
  });
});
