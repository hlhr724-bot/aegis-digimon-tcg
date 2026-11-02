/* Ambient page backdrop: columns of mirrored 4x4 "bits" glyphs streaming down
   behind every screen except the match, like falling data. Opacity steps
   carry density, and the glyphs take the seven card colors in patches, so
   color reads as regions, not confetti.

   Motion: a reveal on mount, a short brightening around the pointer, and the
   glyphs keep moving like virtual-pet sprites: opacity drifts, each glyph
   swaps between two near-identical frames, and a few churn into new ones
   every few seconds. This deliberately departs from DESIGN.md's "no
   indefinite decorative motion" rule at the product owner's request. It runs
   at a pixel-art 10 fps, stops while the tab is hidden, and never runs under
   prefers-reduced-motion. */

import { useEffect, useRef } from "react";
import { COLORS } from "./theme";
import "./PixelBackdrop.css";
import { motionPreference } from "@/design/motion/motionPreference";

const PITCH = 22;
const CELL = 16;
const BIT = CELL / 4;
const SHADES = [0.22, 0.36, 0.54, 0.74];
const REVEAL_MS = 1400;
const POINTER_RADIUS = 110;
const POINTER_FADE_MS = 600;
const FRAME_MS = 100;
const CHURN_MS = 2600;
const CHURN_SHARE = 0.06;

/* The gameplay colors, used here as decoration only; they never signal state. */
const CARD_INKS = [COLORS.Red, COLORS.Blue, COLORS.Yellow, COLORS.Green, COLORS.Purple, COLORS.Black, COLORS.White].map(
  (color) => color.base,
);

interface Cell {
  x: number;
  y: number;
  shade: number;
  delay: number;
  seed: number;
  tint: number;
  index: number;
}

function hash(column: number, row: number, salt: number): number {
  let value = column * 374761393 + row * 668265263 + salt * 2147483647;
  value = (value ^ (value >>> 13)) * 1274126177;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

/* Each column carries one stream: a bright head fading up into a tail. Density
   is 0..1 for the normalized row position v (0 top, 1 bottom). */
function streamDensity(column: number, v: number): number {
  const head = hash(column, 0, 7) * 1.4 - 0.2;
  const length = 0.15 + hash(column, 0, 11) * 0.45;
  return v < head && v > head - length ? 0.25 + 0.7 * (1 - (head - v) / length) : 0.02;
}

function buildCells(width: number, height: number): Cell[] {
  const columns = Math.ceil(width / PITCH) + 1;
  const rows = Math.ceil(height / PITCH) + 1;
  const cells: Cell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const v = row / rows;
      const weight = streamDensity(column, v);
      if (hash(column, row, 1) >= weight) continue;
      cells.push({
        x: column * PITCH,
        y: row * PITCH,
        shade: Math.min(SHADES.length - 1, Math.floor(hash(column, row, 2) * weight * SHADES.length * 1.3)),
        delay: Math.min(1, v * 0.8 + hash(column, row, 3) * 0.2),
        seed: hash(column, row, 4),
        tint: hash(column, row, 6) < 0.75 ? hash(Math.floor(column / 6), Math.floor(row / 4), 5) : hash(column, row, 5),
        index: row * columns + column,
      });
    }
  }
  return cells;
}

/* Left half of a mirrored 4x4 glyph (8 bits). Sparse draws are topped up so
   every glyph keeps some body. */
function glyphFor(seed: number): number {
  const bits = Math.floor(seed * 256);
  let count = 0;
  for (let bit = 0; bit < 8; bit += 1) if (bits & (1 << bit)) count += 1;
  return count >= 4 ? bits : bits | 0b01101001;
}

/* The second frame flips two bits of the first, so a glyph reads as the same
   sprite moving rather than a new one; a few cells churn to a new glyph. */
function movingGlyph(cell: Cell, now: number): number {
  const epoch = Math.floor(now / CHURN_MS);
  const churned = hash(cell.index, epoch, 8) < CHURN_SHARE;
  const base = glyphFor(churned ? hash(cell.index, epoch, 9) : cell.seed);
  const rate = 1.2 + cell.tint * 1.6;
  const secondFrame = Math.floor((now / 1000) * rate + cell.seed * 2) % 2 === 1;
  const flip = (1 << Math.floor(cell.seed * 8)) | (1 << Math.floor(cell.tint * 8));
  return secondFrame ? base ^ flip : base;
}

function movingShade(cell: Cell, now: number): number {
  const wave = Math.sin(now * 0.0015 * (0.6 + cell.seed) + cell.tint * Math.PI * 2);
  return Math.max(0, Math.min(SHADES.length - 1, cell.shade + Math.round(wave * 1.2)));
}

function drawGlyph(context: CanvasRenderingContext2D, x: number, y: number, glyph: number) {
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 2; column += 1) {
      if (!(glyph & (1 << (row * 2 + column)))) continue;
      context.fillRect(x + column * BIT, y + row * BIT, BIT - 0.5, BIT - 0.5);
      context.fillRect(x + (3 - column) * BIT, y + row * BIT, BIT - 0.5, BIT - 0.5);
    }
  }
}

export function PixelBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const reducedMotion = motionPreference.isReduced();
    const moving = !reducedMotion;
    let cells: Cell[] = [];
    let frame = 0;
    let lastFrame = 0;
    let revealStart = reducedMotion ? -Infinity : performance.now();
    let pointer: { x: number; y: number; at: number } | null = null;
    let width = 0;
    let height = 0;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      ({ width, height } = canvas.getBoundingClientRect());
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      cells = buildCells(width, height);
      schedule();
    };

    const draw = (now: number) => {
      frame = 0;
      const revealProgress = (now - revealStart) / REVEAL_MS;
      const revealing = revealProgress < 1.3;
      const pointerStrength = pointer ? Math.max(0, 1 - (now - pointer.at) / POINTER_FADE_MS) : 0;
      if (moving && !revealing && pointerStrength === 0 && now - lastFrame < FRAME_MS) {
        schedule();
        return;
      }
      lastFrame = now;
      context.clearRect(0, 0, width, height);

      for (const cell of cells) {
        const appear = Math.min(1, Math.max(0, (revealProgress - cell.delay) * 4));
        if (appear <= 0) continue;
        let shade = moving ? movingShade(cell, now) : cell.shade;
        if (pointer && pointerStrength > 0) {
          const distance = Math.hypot(cell.x + CELL / 2 - pointer.x, cell.y + CELL / 2 - pointer.y);
          if (distance < POINTER_RADIUS) {
            shade = Math.min(
              SHADES.length - 1,
              shade + Math.round(2 * pointerStrength * (1 - distance / POINTER_RADIUS)),
            );
          }
        }
        context.fillStyle = CARD_INKS[Math.floor(cell.tint * CARD_INKS.length)]!;
        context.globalAlpha = SHADES[shade]! * appear;
        drawGlyph(context, cell.x, cell.y, moving ? movingGlyph(cell, now) : glyphFor(cell.seed));
      }
      context.globalAlpha = 1;

      if (revealing || pointerStrength > 0 || moving) schedule();
    };

    function schedule() {
      if (!frame) frame = requestAnimationFrame(draw);
    }

    const onPointerMove = (event: PointerEvent) => {
      if (reducedMotion || event.pointerType !== "mouse") return;
      pointer = { x: event.clientX, y: event.clientY, at: performance.now() };
      schedule();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    resize();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      revealStart = -Infinity;
    };
  }, []);

  return <canvas ref={canvasRef} className="aegis-pixel-backdrop" aria-hidden="true" />;
}
