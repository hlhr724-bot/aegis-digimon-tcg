import { describe, expect, it, vi } from "vitest";
import { createAnimationQueue } from "../../animationQueue";
import { createPresentationGate } from "../presentationGate";
import { enqueueSecurityDestructions } from "./securityDestructions";

describe("effect-caused security destruction", () => {
  it("waits for the source effect's toast before breaking the security stack", async () => {
    const queue = createAnimationQueue();
    const effectAnnounced = createPresentationGate();
    const setSecurityBreak = vi.fn<(value: unknown) => void>();
    const setSecurityClash = vi.fn<(value: unknown) => void>();
    const noop = () => {};
    enqueueSecurityDestructions({
      fresh: [
        { kind: "cardsMoved", from: "security", to: "trash", seat: 1, instanceIds: ["top"], cardIds: ["BT1-020"] },
      ],
      viewerSeat: 0,
      replayingHistory: false,
      queue,
      sidePanelLookupRef: { current: { cardId: () => undefined, seat: () => undefined } },
      securityClashKeyRef: { current: 0 },
      pendingDestructionsRef: { current: 0 },
      setSecurityBreak,
      setSecurityHitSeat: noop,
      setSecurityClash,
      setPendingRevealKey: noop,
      securityCountOf: () => 5,
      holdSecurityCard: noop,
      releaseSecurityCard: noop,
      releaseSecurityCardWhenIdle: noop,
      releaseSecurityPresentation: noop,
      causingEffectGate: effectAnnounced,
      enqueue: (step) => queue.enqueue(step),
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(setSecurityBreak).not.toHaveBeenCalled();
    expect(setSecurityClash).not.toHaveBeenCalled();
    effectAnnounced.release();
    await vi.waitFor(() => expect(setSecurityBreak).toHaveBeenCalled());
    queue.clear();
  });
});

it("#5409: a DNA card arrival completes before its effect trashes security", async () => {
  const landing = createPresentationGate();
  const order: string[] = [];
  const cancelled: string[] = [];
  const queue = createAnimationQueue({
    onStep: (event) => {
      if (event.cancelled) cancelled.push(event.step.id);
    },
  });
  queue.enqueue({
    id: "zone-change-dna",
    track: "centerStage",
    async run(context) {
      await landing.opened;
      if (!context.cancelled) order.push("arrival");
    },
  });
  const noop = () => {};
  const setSecurityBreak = vi.fn<(value: unknown) => void>(() => {
    order.push("shield");
  });
  try {
    enqueueSecurityDestructions({
      fresh: [
        { kind: "cardsMoved", from: "security", to: "trash", seat: 1, instanceIds: ["top"], cardIds: ["BT1-020"] },
      ],
      viewerSeat: 0,
      replayingHistory: false,
      causingEffectGate: null,
      queue,
      sidePanelLookupRef: { current: { cardId: () => undefined, seat: () => undefined } },
      securityClashKeyRef: { current: 0 },
      pendingDestructionsRef: { current: 0 },
      setSecurityBreak,
      setSecurityHitSeat: noop,
      setSecurityClash: noop,
      setPendingRevealKey: noop,
      securityCountOf: () => 5,
      holdSecurityCard: noop,
      releaseSecurityCard: noop,
      releaseSecurityCardWhenIdle: noop,
      releaseSecurityPresentation: noop,
      enqueue: (step) => queue.enqueue(step),
    });
    landing.release();
    await vi.waitFor(() => expect(setSecurityBreak).toHaveBeenCalled());
    expect(order.slice(0, 2)).toEqual(["arrival", "shield"]);
    expect(cancelled).not.toContain("zone-change-dna");
  } finally {
    landing.release();
    queue.clear();
  }
});

it("finishes a completed security check before an effect destroys the next security card", async () => {
  const order: string[] = [];
  const cancelled: string[] = [];
  const queue = createAnimationQueue({
    onStep: (event) => {
      if (event.cancelled) cancelled.push(event.step.id);
    },
  });
  queue.pause();
  for (const id of ["security-clash-outcome-1", "security-presented-1"]) {
    queue.enqueue({
      id,
      track: "centerStage",
      skippable: false,
      run() {
        order.push(id);
      },
    });
  }
  const noop = () => {};
  enqueueSecurityDestructions({
    fresh: [
      {
        kind: "cardsMoved",
        from: "security",
        to: "trash",
        seat: 1,
        instanceIds: ["next-security"],
        cardIds: ["BT1-009"],
      },
    ],
    viewerSeat: 0,
    replayingHistory: false,
    queue,
    sidePanelLookupRef: { current: { cardId: () => undefined, seat: () => undefined } },
    securityClashKeyRef: { current: 1 },
    pendingDestructionsRef: { current: 0 },
    setSecurityBreak: noop,
    setSecurityHitSeat: noop,
    setSecurityClash: () => {
      order.push("destruction");
    },
    setPendingRevealKey: noop,
    securityCountOf: () => 4,
    holdSecurityCard: noop,
    releaseSecurityCard: noop,
    releaseSecurityCardWhenIdle: noop,
    releaseSecurityPresentation: noop,
    causingEffectGate: null,
    enqueue: (step) => queue.enqueue(step),
  });
  queue.setMode("replay");
  queue.resume();
  await queue.idle();
  expect(cancelled).toEqual([]);
  expect(order.slice(0, 3)).toEqual(["security-clash-outcome-1", "security-presented-1", "destruction"]);
});
