/* Ambient cursor trail: a canvas overlay that sheds a few slowly-tumbling
   triangular motes along the pointer path, plus a faint halo that eases toward
   the cursor. Purely decorative — never receives pointer events and never
   affects layout.

   It disables itself on coarse pointers (touch) and when the user asks for
   reduced motion, and it parks the animation loop once the field is empty so an
   idle client costs nothing. */

import { useEffect, useRef } from "react";
import { motionPreference } from "@/design/motion/motionPreference";

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  tint: number;
  angle: number;
  spin: number;
}

const MAX_MOTES = 70;
const MOTES_PER_PIXEL = 0.055;
const MOTES_PER_MOVE = 2;
const HALO_EASE = 0.14;
const DRAG = 0.96;

type Rgb = [number, number, number];

const FALLBACK_ACCENT: Rgb = [192, 38, 122];
const FALLBACK_GLOW: Rgb = [129, 89, 201];

function parseColor(raw: string, fallback: Rgb): Rgb {
  const value = raw.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const digits = hex[1]!;
    const full = digits.length === 3 ? digits.replace(/./g, (d) => d + d) : digits;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
  }
  const fn = /^rgba?\(([^)]+)\)$/i.exec(value);
  if (fn) {
    const parts = fn[1]!
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
      return [parts[0]!, parts[1]!, parts[2]!];
    }
  }
  return fallback;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

export function CursorParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === "undefined" || !window.matchMedia) return;

    const coarse = window.matchMedia("(pointer: coarse)");
    if (coarse.matches || motionPreference.isReduced()) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const motes: Mote[] = [];
    const halo = { x: -999, y: -999, tx: -999, ty: -999, alpha: 0 };
    let accent = FALLBACK_ACCENT;
    let glow = FALLBACK_GLOW;
    let frame = 0;
    let width = 0;
    let height = 0;

    const readPalette = () => {
      const style = getComputedStyle(document.documentElement);
      accent = parseColor(style.getPropertyValue("--ds-accent"), FALLBACK_ACCENT);
      glow = parseColor(style.getPropertyValue("--ds-ink-accent"), FALLBACK_GLOW);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const emit = (x: number, y: number, count: number, spread: number) => {
      for (let i = 0; i < count && motes.length < MAX_MOTES; i += 1) {
        const heading = Math.random() * Math.PI * 2;
        const speed = Math.random() * spread;
        const maxLife = 700 + Math.random() * 700;
        motes.push({
          x: x + (Math.random() - 0.5) * 10,
          y: y + (Math.random() - 0.5) * 10,
          vx: Math.cos(heading) * speed,
          vy: Math.sin(heading) * speed - 0.08,
          life: maxLife,
          maxLife,
          size: 3.4 + Math.random() * 3.6,
          tint: Math.random(),
          angle: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 0.02,
        });
      }
    };

    /* An equilateral triangle centred on the origin, drawn in the current transform. */
    const tracePath = (radius: number) => {
      ctx.beginPath();
      for (let corner = 0; corner < 3; corner += 1) {
        const a = -Math.PI / 2 + (corner * Math.PI * 2) / 3;
        const px = Math.cos(a) * radius;
        const py = Math.sin(a) * radius;
        if (corner === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };

    let last = 0;
    const step = (now: number) => {
      const dt = last === 0 ? 16 : Math.min(now - last, 48);
      last = now;

      ctx.clearRect(0, 0, width, height);

      halo.x += (halo.tx - halo.x) * HALO_EASE;
      halo.y += (halo.ty - halo.y) * HALO_EASE;

      if (halo.alpha > 0.01) {
        const radius = 34;
        const ring = ctx.createRadialGradient(halo.x, halo.y, 0, halo.x, halo.y, radius);
        ring.addColorStop(0, `rgba(${accent.join(",")},${0.07 * halo.alpha})`);
        ring.addColorStop(1, `rgba(${accent.join(",")},0)`);
        ctx.fillStyle = ring;
        ctx.beginPath();
        ctx.arc(halo.x, halo.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = motes.length - 1; i >= 0; i -= 1) {
        const m = motes[i]!;
        m.life -= dt;
        if (m.life <= 0) {
          motes.splice(i, 1);
          continue;
        }
        const step16 = dt / 16;
        const t = m.life / m.maxLife;
        m.x += m.vx * step16;
        m.y += m.vy * step16;
        m.vx *= DRAG;
        m.vy = m.vy * DRAG - 0.008 * step16;
        m.angle += m.spin * step16;

        /* Fade in over the first sliver of life so nothing pops into view. */
        const fade = Math.min(1, (1 - t) * 8) * t;
        const [r, g, b] = mix(accent, glow, m.tint);

        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.rotate(m.angle);
        tracePath(m.size * (0.7 + t * 0.5));
        ctx.fillStyle = `rgba(${r},${g},${b},${0.16 * fade})`;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.34 * fade})`;
        ctx.stroke();
        ctx.restore();
      }

      if (motes.length === 0 && halo.alpha < 0.01) {
        frame = 0;
        last = 0;
        ctx.clearRect(0, 0, width, height);
        return;
      }
      frame = requestAnimationFrame(step);
    };

    const wake = () => {
      if (frame === 0) frame = requestAnimationFrame(step);
    };

    let prevX = 0;
    let prevY = 0;
    let seeded = false;

    const onMove = (e: PointerEvent) => {
      const { clientX: x, clientY: y } = e;
      if (!seeded) {
        seeded = true;
        prevX = x;
        prevY = y;
        halo.x = x;
        halo.y = y;
      }
      halo.tx = x;
      halo.ty = y;
      halo.alpha = 1;
      const dx = x - prevX;
      const dy = y - prevY;
      const distance = Math.hypot(dx, dy);
      prevX = x;
      prevY = y;
      emit(x, y, Math.min(MOTES_PER_MOVE, Math.round(distance * MOTES_PER_PIXEL)), 0.35);
      wake();
    };

    const onDown = (e: PointerEvent) => {
      emit(e.clientX, e.clientY, 6, 1.1);
      wake();
    };

    const onLeave = () => {
      halo.alpha = 0;
    };

    const onVisibility = () => {
      if (document.hidden) {
        motes.length = 0;
        halo.alpha = 0;
      }
    };

    readPalette();
    resize();

    const themeObserver = new MutationObserver(readPalette);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-interface-theme"],
    });

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      themeObserver.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas ref={canvasRef} aria-hidden style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999 }} />
  );
}
