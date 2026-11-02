import type { AnimationStep, AnimationStepContext } from "./animationQueue";
import { PARTICLE_LIGHT_MS } from "./particleLight";
import { paintParticleLight } from "./particleLightCanvas";
import { waitForPaintedAnimation } from "./paintedAnimationClock";
import type { BurstPalette } from "./showcases";
import type { RegisterParticleLight } from "./ParticleLightScope";
import { getParticleLightCanvasSize } from "@/game/getParticleLightCanvasSize";
import { motionPreference } from "@/design/motion/motionPreference";

/** Local presentation ownership, never part of the server's scene payload. */
export interface ParticleLightOwner {
  id: string;
  context: AnimationStepContext;
  enqueue: (step: AnimationStep) => void;
}

/** Keep a fracture's light alive independently of its fading card and scene. */
export function mountIndependentParticleLight(
  anchor: HTMLElement,
  sourceClock: HTMLElement,
  palette: BurstPalette,
  owner: ParticleLightOwner,
  register?: RegisterParticleLight,
) {
  if (
    motionPreference.isReduced() ||
    owner.context.cancelled ||
    owner.context.skipping ||
    owner.context.mode !== "live"
  ) {
    return;
  }
  const sourceAnimation = sourceClock
    .getAnimations()
    .find((entry) => "animationName" in entry && entry.animationName === "battle-particle-clock");
  if (!sourceAnimation) return;
  const source: Animation = sourceAnimation;
  const host = document.createElement("span"),
    clock = document.createElement("span"),
    canvas = document.createElement("canvas");
  host.className = "battle-independent-light";
  host.dataset.lightId = owner.id;
  host.setAttribute("aria-hidden", "true");
  host.style.zIndex = getComputedStyle(anchor.closest(".battle-clash") ?? anchor).zIndex;
  clock.className = "battle-burst__clock";
  const delay = Number(source.effect?.getTiming().delay ?? 0);
  clock.style.animationDelay = `${delay}ms`;
  clock.style.animationDuration = `${PARTICLE_LIGHT_MS}ms`;
  canvas.className = "battle-burst__particles";
  canvas.dataset.emitters = "6";
  canvas.dataset.capacity = "305";
  host.append(clock, canvas);
  document.body.append(host);
  const ownAnimation = clock.getAnimations()[0];
  if (!ownAnimation) {
    host.remove();
    return;
  }
  const animation: Animation = ownAnimation;
  let active = true,
    frame = 0,
    previousAge: number | undefined;
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  function dispose() {
    if (!active) return;
    active = false;
    cancelAnimationFrame(frame);
    unsubscribeMotion();
    owner.context.signal?.removeEventListener("abort", dispose);
    resize.disconnect();
    window.removeEventListener("resize", size);
    unregister?.();
    host.remove();
    finish();
  }
  function size() {
    // The positioned frame is stable while its artwork reveals, shakes and exits.
    // After the scene leaves, retain that last position for the remaining light.
    if (!anchor.isConnected) return;
    const rect = anchor.getBoundingClientRect();
    Object.assign(canvas.style, {
      inset: "auto",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    const { width, height } = getParticleLightCanvasSize({
      width: rect.width,
      height: rect.height,
      pixelRatio: window.devicePixelRatio,
    });
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      previousAge = undefined;
    }
  }
  function sync() {
    if (!sourceClock.isConnected || source.playState === "idle") return;
    animation.playbackRate = source.playbackRate;
    if (source.playState === "paused" || source.startTime === null) {
      animation.pause();
      animation.currentTime = source.currentTime;
    } else {
      if (animation.playState === "paused") animation.play();
      if (typeof source.startTime === "number") animation.startTime = source.startTime;
      else animation.currentTime = source.currentTime;
    }
  }
  function paint() {
    if (!active) return;
    sync();
    const age = Number(animation.currentTime ?? 0) - delay;
    if (age !== previousAge) {
      paintParticleLight(canvas, age, palette);
      previousAge = age;
    }
    if (age >= PARTICLE_LIGHT_MS) dispose();
    else frame = requestAnimationFrame(paint);
  }
  const unsubscribeMotion = motionPreference.subscribe(() => {
    if (motionPreference.isReduced()) {
      dispose();
    }
  });
  owner.context.signal?.addEventListener("abort", dispose, { once: true });
  const resize = new ResizeObserver(size);
  const unregister = register?.(dispose);
  resize.observe(anchor);
  window.addEventListener("resize", size);
  size();
  paint();
  owner.enqueue({
    id: owner.id,
    track: owner.id,
    replace: true,
    holdsBoard: false,
    blocksDecision: false,
    onDiscard: dispose,
    async run(context) {
      try {
        if (context.cancelled || context.skipping || context.mode !== "live") return;
        await Promise.race([context.wait(delay + PARTICLE_LIGHT_MS), finished]);
        if (active) await waitForPaintedAnimation(() => host, "battle-particle-clock", PARTICLE_LIGHT_MS, context);
      } finally {
        dispose();
      }
    },
  });
  return () => {
    // A source removed before its departure never emits. A completed departure
    // leaves its decorative tail owned by the queue, including clear/skip/unmount.
    sync();
    if (Number(animation.currentTime ?? 0) - delay < 0) dispose();
  };
}
