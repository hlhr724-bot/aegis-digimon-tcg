// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createAnimationQueue } from "../../animationQueue";
import { waitForHandSourceClock } from "./handSourceClock";

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

function paintedHand() {
  vi.useFakeTimers();
  const focus = document.createElement("div");
  focus.className = "game-hand-source-focus";
  focus.dataset.activationKey = "2";
  const face = document.createElement("div");
  face.className = "game-hand-source-focus__scale";
  focus.append(face);
  document.body.append(focus);
  let clock = 250;
  Object.defineProperty(face, "getAnimations", {
    value: () => [
      {
        animationName: "battle-hand-focus-scale",
        playState: "running",
        get currentTime() {
          return clock;
        },
      },
    ],
  });
  const queue = createAnimationQueue();
  let reading = false;
  queue.enqueue({
    id: "hand",
    track: "source",
    async run(context) {
      await waitForHandSourceClock(2, 500, context);
      reading = true;
    },
  });
  return {
    queue,
    focus,
    setClock(value: number) {
      clock = value;
    },
    get reading() {
      return reading;
    },
  };
}

it("waits through the painted 250ms hold when the queue clock leads React", async () => {
  const cue = paintedHand();
  await vi.advanceTimersByTimeAsync(100);
  expect(cue.reading).toBe(false);
  cue.setClock(499);
  await vi.advanceTimersByTimeAsync(16);
  expect(cue.reading).toBe(false);
  cue.setClock(500);
  await vi.advanceTimersByTimeAsync(16);
  expect(cue.reading).toBe(true);
  expect(cue.queue.isIdle()).toBe(true);
});

it.each(["cancel", "skip", "drain", "source-left"])("releases the painted wait on %s", async (action) => {
  const cue = paintedHand();
  await vi.advanceTimersByTimeAsync(16);
  if (action === "cancel") cue.queue.clear();
  else if (action === "skip") cue.queue.skip();
  else if (action === "drain") cue.queue.setMode("drain");
  else cue.focus.remove();
  await vi.advanceTimersByTimeAsync(16);
  expect(cue.queue.isIdle()).toBe(true);
});

it("finishes hand preparation when the browser keeps an animation clock stalled", async () => {
  const cue = paintedHand();
  await vi.advanceTimersByTimeAsync(1000);
  expect(cue.reading).toBe(true);
  expect(cue.queue.isIdle()).toBe(true);
});
