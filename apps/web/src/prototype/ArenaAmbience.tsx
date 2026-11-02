/* Pixel shards that drift up through the board, echoing the logo's data
   fragments. Purely decorative: no pointer events, stops for reduced motion
   and while the tab is hidden. */

import { useEffect, useRef } from "react";
import { motionPreference } from "@/design/motion/motionPreference";

interface Shard {
  x: number;
  y: number;
  size: number;
  speed: number;
  drift: number;
  phase: number;
  color: string;
}

const SHARD_COUNT = 46;
const SHARD_TOKENS = ["--ds-accent", "--ds-ink-accent", "--ds-rim-ready", "--ds-ink-accent"];
const RARE_TOKEN = "--ds-rim-attention";

function readColors() {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim() || "#78aaff";
  return { common: SHARD_TOKENS.map(token), rare: token(RARE_TOKEN) };
}

export function ArenaAmbience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    if (motionPreference.isReduced()) return;

    let width = 0;
    let height = 0;
    let frame = 0;
    let last = 0;
    let colors = readColors();

    const spawn = (anywhere: boolean): Shard => ({
      x: Math.random() * width,
      y: anywhere ? Math.random() * height : height + 10,
      size: 2 + Math.random() * 4,
      speed: 6 + Math.random() * 14,
      drift: (Math.random() - 0.5) * 6,
      phase: Math.random() * Math.PI * 2,
      color: Math.random() < 0.06 ? colors.rare : colors.common[Math.floor(Math.random() * colors.common.length)]!,
    });

    let shards: Shard[] = [];

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      shards = Array.from({ length: SHARD_COUNT }, () => spawn(true));
    };

    const tick = (now: number) => {
      const seconds = last === 0 ? 0.016 : Math.min((now - last) / 1000, 0.05);
      last = now;
      context.clearRect(0, 0, width, height);
      shards.forEach((shard, index) => {
        shard.y -= shard.speed * seconds;
        shard.x += shard.drift * seconds;
        shard.phase += seconds * 1.4;
        if (shard.y < -10) shards[index] = spawn(false);
        const fadeIn = Math.min(1, (height - shard.y) / 120);
        const fadeOut = Math.min(1, shard.y / 160);
        context.globalAlpha = Math.max(0, Math.min(fadeIn, fadeOut)) * (0.35 + 0.3 * Math.sin(shard.phase));
        context.fillStyle = shard.color;
        context.fillRect(shard.x, shard.y, shard.size, shard.size);
      });
      context.globalAlpha = 1;
      frame = requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      cancelAnimationFrame(frame);
      last = 0;
      if (!document.hidden) frame = requestAnimationFrame(tick);
    };

    const onThemeChange = () => {
      colors = readColors();
    };

    resize();
    frame = requestAnimationFrame(tick);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const themeObserver = new MutationObserver(onThemeChange);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 size-full" />;
}
