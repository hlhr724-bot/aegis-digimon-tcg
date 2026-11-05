import { useContext, useLayoutEffect, useRef } from "react";
import { arrivalLightParticles, paintParticleLight } from "./particleLightCanvas";
import { PARTICLE_LIGHT_MS } from "./particleLight";
import type { BurstPalette } from "./showcases";
import { mountIndependentParticleLight, type ParticleLightOwner } from "./independentParticleLight";
import { ParticleLightScopeContext } from "./ParticleLightScope";
import { getParticleLightCanvasSize } from "@/game/getParticleLightCanvasSize";
import { motionPreference } from "@/design/motion/motionPreference";
import { isInsideLiveArena3d } from "@/game/arena3d/isInsideLiveArena3d";
import { scheduleIdleTask } from "@/game/scheduleIdleTask";

const INDEPENDENT_LIGHT_MOUNT_TIMEOUT_MS = 150;

const ARENA_3D_HIDDEN_BURST_SELECTOR =
  ".game-delete-burst, .arena-3d-field .game-permanent, .arena-3d-field .game-breeding-slot";

/** The CSS clock owns delay/seek/pause; landing groups share the arrival clock. */
export function ParticleLight({
  palette,
  owner,
  landing = false,
}: {
  palette: BurstPalette;
  owner?: ParticleLightOwner;
  landing?: boolean;
}) {
  const register = useContext(ParticleLightScopeContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const canvas = canvasRef.current!,
      clock = clockRef.current!;
    if (typeof clock.getAnimations !== "function") return;
    if (owner) {
      let release: (() => void) | undefined;
      const cancelMount = scheduleIdleTask(() => {
        release = mountIndependentParticleLight(canvas, clock, palette, owner, register);
      }, INDEPENDENT_LIGHT_MOUNT_TIMEOUT_MS);
      return () => {
        cancelMount();
        release?.();
      };
    }
    if (canvas.closest(ARENA_3D_HIDDEN_BURST_SELECTOR) && isInsideLiveArena3d(canvas)) return;
    let frame = 0,
      animation: Animation | undefined,
      previousAge: number | undefined;
    function size(width: number, height: number) {
      const dimensions = getParticleLightCanvasSize({ width, height, pixelRatio: window.devicePixelRatio });
      if (canvas.width !== dimensions.width) canvas.width = dimensions.width;
      if (canvas.height !== dimensions.height) canvas.height = dimensions.height;
    }
    function paint() {
      animation ??= clock
        .getAnimations()
        .find((entry) => "animationName" in entry && entry.animationName === "battle-particle-clock");
      const age = Number(animation?.currentTime ?? 0) - Number(animation?.effect?.getTiming().delay ?? 0);
      const paintedAge = motionPreference.isReduced() ? PARTICLE_LIGHT_MS : age;
      if (previousAge !== paintedAge) {
        paintParticleLight(canvas, paintedAge, palette, landing ? arrivalLightParticles : undefined);
        previousAge = paintedAge;
      }
      if (
        !motionPreference.isReduced() &&
        animation &&
        animation.playState !== "finished" &&
        animation.playState !== "idle"
      )
        frame = requestAnimationFrame(paint);
    }
    function restart() {
      cancelAnimationFrame(frame);
      animation = undefined;
      previousAge = undefined;
      paint();
    }
    const resize = new ResizeObserver((entries) => {
      const box = entries.at(-1)?.contentRect;
      size(box?.width ?? canvas.clientWidth, box?.height ?? canvas.clientHeight);
      restart();
    });
    resize.observe(canvas);
    const unsubscribeMotion = motionPreference.subscribe(restart);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      unsubscribeMotion();
    };
  }, [palette.base, palette.edge, owner, register, landing]);
  return (
    <>
      <span ref={clockRef} className="battle-burst__clock" />
      <canvas
        ref={canvasRef}
        className="battle-burst__particles"
        data-emitters={landing ? 10 : 6}
        data-capacity={landing ? 495 : 305}
        data-landing={landing ? "true" : undefined}
      />
    </>
  );
}
