/* Ambient page backdrop: circuit traces in the side gutters, data pulses that
   run along them, and nodes that light up near the pointer. The traces are
   drawn once per resize into an offscreen layer; each frame only composites
   that layer and the moving parts. Reduced motion or the pause toggle leave the
   static traces in place and stop the loop. */

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { motionPreference } from "@/design/motion/motionPreference";

interface Point {
  x: number;
  y: number;
}

interface Trace {
  points: Point[];
  lengths: number[];
  total: number;
}

interface Pulse {
  trace: Trace;
  distance: number;
  speed: number;
}

const CONTENT_MAX_WIDTH = 1180;
const MIN_GUTTER = 72;
const TRACE_SPACING = 64;
const PULSE_TAIL = 42;
const MAX_PULSES = 10;
const PULSE_INTERVAL_MS = 520;
const POINTER_RADIUS = 120;

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function measure(points: Point[]): Trace {
  const lengths = points
    .slice(1)
    .map((point, index) => Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y));
  return { points, lengths, total: lengths.reduce((sum, length) => sum + length, 0) };
}

function pointAt(trace: Trace, distance: number): Point {
  let remaining = Math.max(0, Math.min(distance, trace.total));
  for (let index = 0; index < trace.lengths.length; index += 1) {
    const length = trace.lengths[index]!;
    if (remaining <= length) {
      const from = trace.points[index]!;
      const to = trace.points[index + 1]!;
      const ratio = length === 0 ? 0 : remaining / length;
      return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
    }
    remaining -= length;
  }
  return trace.points[trace.points.length - 1]!;
}

/* Each trace leaves the screen edge and wanders toward the content column in
   horizontal runs joined by 45-degree bends, like a PCB route. */
function buildTraces(width: number, height: number): Trace[] {
  const random = seededRandom(Math.round(width) * 31 + Math.round(height));
  const gutter = (width - CONTENT_MAX_WIDTH) / 2;
  const reach = gutter >= MIN_GUTTER ? gutter - 16 : width * 0.18;
  const traces: Trace[] = [];
  for (const side of [-1, 1] as const) {
    const edge = side === -1 ? 0 : width;
    for (let y = 40 + random() * 30; y < height; y += TRACE_SPACING + random() * 40) {
      const points: Point[] = [{ x: edge, y }];
      let x = edge;
      let currentY = y;
      const runs = 2 + Math.floor(random() * 3);
      for (let run = 0; run < runs; run += 1) {
        const step = (reach / runs) * (0.6 + random() * 0.6);
        x -= side * step;
        points.push({ x, y: currentY });
        if (run < runs - 1) {
          const bend = (random() < 0.5 ? -1 : 1) * (10 + random() * 26);
          x -= side * Math.abs(bend);
          currentY += bend;
          points.push({ x, y: currentY });
        }
      }
      traces.push(measure(points));
    }
  }
  return traces;
}

function readPalette() {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    trace: token("--ds-line-strong", "#aeb5c0"),
    pulse: token("--ds-accent", "#075ff7"),
    node: token("--ds-rim-ready", "#0891b2"),
  };
}

export function CircuitBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [paused, setPaused] = useState(false);
  const [reducedMotion] = useState(motionPreference.isReduced);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const staticLayer = document.createElement("canvas");
    const staticContext = staticLayer.getContext("2d");
    if (!staticContext) return;

    let palette = readPalette();
    let traces: Trace[] = [];
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    const pulses: Pulse[] = [];
    const pointer = { x: -9999, y: -9999 };
    let frame = 0;
    let lastSpawn = 0;
    let lastTime = 0;

    const drawStatic = () => {
      staticLayer.width = canvas.width;
      staticLayer.height = canvas.height;
      staticContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      staticContext.clearRect(0, 0, width, height);
      staticContext.lineWidth = 1;
      staticContext.strokeStyle = palette.trace;
      staticContext.fillStyle = palette.trace;
      staticContext.globalAlpha = 0.45;
      for (const trace of traces) {
        staticContext.beginPath();
        trace.points.forEach((point, index) =>
          index === 0 ? staticContext.moveTo(point.x, point.y) : staticContext.lineTo(point.x, point.y),
        );
        staticContext.stroke();
        const end = trace.points[trace.points.length - 1]!;
        staticContext.beginPath();
        staticContext.arc(end.x, end.y, 2.5, 0, Math.PI * 2);
        staticContext.fill();
      }
      staticContext.globalAlpha = 1;
    };

    const resize = () => {
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      traces = buildTraces(width, height);
      pulses.length = 0;
      drawStatic();
      render(0);
    };

    const drawPulse = (pulse: Pulse) => {
      for (let offset = 0; offset < PULSE_TAIL; offset += 3) {
        const point = pointAt(pulse.trace, pulse.distance - offset);
        context.globalAlpha = (1 - offset / PULSE_TAIL) * 0.85;
        context.beginPath();
        context.arc(point.x, point.y, offset === 0 ? 2.4 : 1.6, 0, Math.PI * 2);
        context.fill();
      }
    };

    const drawPointerGlow = () => {
      context.fillStyle = palette.node;
      for (const trace of traces) {
        for (const point of trace.points) {
          const distance = Math.hypot(point.x - pointer.x, point.y - pointer.y);
          if (distance > POINTER_RADIUS) continue;
          const strength = 1 - distance / POINTER_RADIUS;
          context.globalAlpha = strength * 0.08;
          context.beginPath();
          context.arc(point.x, point.y, 5 * strength + 1.5, 0, Math.PI * 2);
          context.fill();
          context.globalAlpha = strength * 0.4;
          context.beginPath();
          context.arc(point.x, point.y, 2.2, 0, Math.PI * 2);
          context.fill();
        }
      }
    };

    const render = (elapsed: number) => {
      context.globalAlpha = 1;
      context.clearRect(0, 0, width, height);
      context.drawImage(staticLayer, 0, 0, width, height);
      context.fillStyle = palette.pulse;
      for (let index = pulses.length - 1; index >= 0; index -= 1) {
        const pulse = pulses[index]!;
        pulse.distance += (pulse.speed * elapsed) / 1000;
        if (pulse.distance - PULSE_TAIL > pulse.trace.total) {
          pulses.splice(index, 1);
          continue;
        }
        drawPulse(pulse);
      }
      drawPointerGlow();
      context.globalAlpha = 1;
    };

    const tick = (now: number) => {
      const elapsed = lastTime === 0 ? 16 : Math.min(now - lastTime, 48);
      lastTime = now;
      if (now - lastSpawn > PULSE_INTERVAL_MS && pulses.length < MAX_PULSES && traces.length > 0) {
        lastSpawn = now;
        const trace = traces[Math.floor(Math.random() * traces.length)]!;
        pulses.push({ trace, distance: 0, speed: 70 + Math.random() * 90 });
      }
      render(elapsed);
      frame = requestAnimationFrame(tick);
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (frame === 0) render(0);
    };

    const onThemeChange = () => {
      palette = readPalette();
      drawStatic();
      render(0);
    };

    resize();
    const themeObserver = new MutationObserver(onThemeChange);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-interface-theme"],
    });
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    if (!paused && !reducedMotion) frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      frame = 0;
      themeObserver.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [paused, reducedMotion]);

  return (
    <>
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-0" />
      {reducedMotion ? null : (
        <button
          type="button"
          onClick={() => setPaused((value) => !value)}
          aria-label={paused ? "Resume background animation" : "Pause background animation"}
          aria-pressed={paused}
          className="fixed bottom-4 left-4 z-20 inline-flex size-8 items-center justify-center rounded-md border border-border bg-card/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
        >
          {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
        </button>
      )}
    </>
  );
}
