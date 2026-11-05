import type { AnimationStepContext } from "./animationQueue";
import { freezeComputedStyleTree } from "./freezeComputedStyleTree";
import { ARENA_3D_LIVE_ATTRIBUTE, isInsideLiveArena3d } from "@/game/arena3d/isInsideLiveArena3d";
import { waitForPaintedAnimation } from "./paintedAnimationClock";
import { TIMINGS } from "./timings";
import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

export interface FieldShatterFace {
  /** Centre in board coordinates; dimensions before the face's planar rotation. */
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  permanentId?: string;
  /** A detached, inert copy of the printed face at departure, including fallback art. */
  clone?: HTMLElement;
  /** Upright frozen field stack, aligned to this face, for a return to a deck. */
  stackClone?: HTMLElement;
  /** Frozen stack with its individual face/source/link orientations intact. */
  handStackClone?: HTMLElement;
}

const departures = new WeakMap<HTMLElement, Map<string, FieldShatterFace>>();
const recentCaptures = new WeakMap<HTMLElement, { face: FieldShatterFace; capturedAt: number }>();
const RECENT_CAPTURE_REUSE_MS = 1000;

function copyFieldShatterFace(face: FieldShatterFace): FieldShatterFace {
  return {
    ...face,
    clone: face.clone?.cloneNode(true) as HTMLElement | undefined,
    stackClone: face.stackClone?.cloneNode(true) as HTMLElement | undefined,
    handStackClone: face.handStackClone?.cloneNode(true) as HTMLElement | undefined,
  };
}

function captureDepartureFace(permanent: HTMLElement, board: HTMLElement, includeStack: boolean) {
  return isInsideLiveArena3d(board)
    ? measureFieldShatterFace(permanent, board)
    : captureFieldShatterFace(permanent, board, includeStack);
}

function takeRecentCapture(element: HTMLElement): FieldShatterFace | undefined {
  const recent = recentCaptures.get(element);
  recentCaptures.delete(element);
  return recent && performance.now() - recent.capturedAt < RECENT_CAPTURE_REUSE_MS
    ? copyFieldShatterFace(recent.face)
    : undefined;
}

/** Capture before DOM removal; late image loading, resizing and scrolling are included. */
export function useFieldShatterOrigin(
  permanentId: string,
  instanceId: string,
  refCb?: (element: HTMLDivElement | null) => void,
) {
  const live = useRef<HTMLDivElement | null>(null);
  const callback = useRef(refCb);
  callback.current = refCb;
  // A grouped row changes its aliases without replacing the physical face.
  useLayoutEffect(() => {
    refCb?.(live.current);
    return () => refCb?.(null);
  }, [refCb]);
  return useCallback(
    (element: HTMLDivElement | null) => {
      const previous = live.current;
      if (!element && previous?.isConnected) {
        const board = previous.closest<HTMLElement>(`.game-board:not([${ARENA_3D_LIVE_ATTRIBUTE}])`);
        const face = board && (takeRecentCapture(previous) ?? captureDepartureFace(previous, board, true));
        if (board && face) {
          const saved = departures.get(board) ?? new Map<string, FieldShatterFace>();
          departures.set(board, saved);
          saved.set(permanentId, face);
          saved.set(instanceId, face);
          while (saved.size > 64) saved.delete(saved.keys().next().value!);
        }
      }
      live.current = element;
      callback.current?.(element);
    },
    [permanentId, instanceId],
  );
}

export function takeFieldShatterOrigin(board: HTMLElement, id: string): FieldShatterFace | undefined {
  const saved = departures.get(board),
    face = saved?.get(id);
  if (face) for (const [key, value] of saved!) if (value === face) saved!.delete(key);
  return face;
}

/** Resolve the live physical face before using its last measured or detached origin. */
export function resolveFieldDepartureFace({
  id,
  board,
  elements,
  cached,
  includeStack = false,
}: {
  id: string;
  board: HTMLElement | null;
  elements: Readonly<Record<string, HTMLElement | null>>;
  cached: FieldShatterFace | undefined;
  includeStack?: boolean;
}): FieldShatterFace | undefined {
  // A surviving group member owns its live face even when its last measurement
  // still names the representative that just left. Instance ids use that alias
  // only when they have no directly registered permanent.
  const direct = elements[id];
  const element = direct?.isConnected ? direct : elements[cached?.permanentId ?? id];
  if (element?.isConnected && board) {
    const face = captureDepartureFace(element, board, includeStack);
    if (face) recentCaptures.set(element, { face: copyFieldShatterFace(face), capturedAt: performance.now() });
    return face ?? cached;
  }
  return board ? (takeFieldShatterOrigin(board, id) ?? cached) : cached;
}

export function useFieldShatterOrigins(boardRef: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const board = boardRef.current;
    return () => {
      if (board) departures.delete(board);
    };
  }, [boardRef]);
}

/** Measure the drawn face, including suspension and any parent layout scale. */
export function measureFieldShatterFace(permanent: HTMLElement, board: HTMLElement): FieldShatterFace | undefined {
  const face = permanent.querySelector<HTMLElement>(".game-card-enter > [data-state]");
  if (!face) return;
  const rect = face.getBoundingClientRect(),
    boardRect = board.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const style = getComputedStyle(face);
  let width = parseFloat(style.width),
    height = parseFloat(style.height),
    angle = 0;
  if (style.boxSizing !== "border-box") {
    width +=
      parseFloat(style.borderLeftWidth) +
      parseFloat(style.borderRightWidth) +
      parseFloat(style.paddingLeft) +
      parseFloat(style.paddingRight);
    height +=
      parseFloat(style.borderTopWidth) +
      parseFloat(style.borderBottomWidth) +
      parseFloat(style.paddingTop) +
      parseFloat(style.paddingBottom);
  }
  for (let element: HTMLElement | null = face; element && element !== board; element = element.parentElement) {
    const computed = getComputedStyle(element);
    const rotation = computed.rotate;
    if (rotation !== "none") angle += parseFloat(rotation.split(" ").at(-1)!);
    if (computed.transform !== "none") {
      const matrix = new DOMMatrixReadOnly(computed.transform);
      angle += (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
    }
  }
  const radians = (angle * Math.PI) / 180;
  const scale = rect.width / (Math.abs(Math.cos(radians)) * width + Math.abs(Math.sin(radians)) * height);
  return {
    x: rect.left + rect.width / 2 - boardRect.left - board.clientLeft + board.scrollLeft,
    y: rect.top + rect.height / 2 - boardRect.top - board.clientTop + board.scrollTop,
    width: width * scale,
    height: height * scale,
    angle,
    permanentId: permanent.dataset.permanentId,
  };
}

const FROZEN_FIELD_REMOVED_ATTRIBUTES = ["id", "tabindex", "data-drop"];

/** Freeze one tree; the face and both stack orientations copy its already frozen declarations. */
function freezeFieldTree(original: HTMLElement) {
  return freezeComputedStyleTree(original, FROZEN_FIELD_REMOVED_ATTRIBUTES);
}

/** All 41 fragments share this already loaded physical face. */
export function captureFieldShatterFace(
  permanent: HTMLElement,
  board: HTMLElement,
  includeStack = false,
): FieldShatterFace | undefined {
  const pose = measureFieldShatterFace(permanent, board);
  const face = permanent.querySelector<HTMLElement>(".game-card-enter > [data-state]");
  if (!pose || !face) return;
  const frozen = freezeFieldTree(includeStack ? permanent : face);
  const clone = includeStack
    ? (frozen.querySelector(".game-card-enter > [data-state]")!.cloneNode(true) as HTMLElement)
    : frozen;
  for (const element of [clone, ...clone.querySelectorAll("[data-state]")]) element.removeAttribute("data-state");
  const handStack = includeStack ? (frozen.cloneNode(true) as HTMLElement) : undefined;
  const faceStyle = getComputedStyle(face);
  const localWidth =
    parseFloat(faceStyle.width) +
    (faceStyle.boxSizing === "border-box"
      ? 0
      : parseFloat(faceStyle.borderLeftWidth) +
        parseFloat(faceStyle.borderRightWidth) +
        parseFloat(faceStyle.paddingLeft) +
        parseFloat(faceStyle.paddingRight));
  // Preserve descendant pixels, then scale the complete printed face as one plane.
  Object.assign(clone.style, {
    position: "absolute",
    inset: "0 auto auto 0",
    margin: "0",
    rotate: "none",
    transform: `scale(${pose.width / localWidth})`,
    transformOrigin: "0 0",
    translate: "none",
    scale: "none",
    pointerEvents: "none",
  });
  clone.inert = true;
  clone.setAttribute("aria-hidden", "true");
  return {
    ...pose,
    clone,
    ...(includeStack
      ? {
          stackClone: captureFieldStack(permanent, face, pose, localWidth, true, frozen),
          handStackClone: captureFieldStack(permanent, face, pose, localWidth, false, handStack!),
        }
      : {}),
  };
}

/** Keep local child pixels, then scale the complete upright pile as one physical plane. */
function captureFieldStack(
  permanent: HTMLElement,
  face: HTMLElement,
  pose: FieldShatterFace,
  localWidth: number,
  upright: boolean,
  clone: HTMLElement,
) {
  for (const element of [clone, ...clone.querySelectorAll("[data-permanent-id]")])
    element.removeAttribute("data-permanent-id");
  const card = clone.querySelector<HTMLElement>(".game-card-enter > [data-state]")!;
  let x = localWidth / 2,
    y = parseFloat(getComputedStyle(face).height) / 2;
  for (
    let element: HTMLElement | null = face;
    element && element !== permanent;
    element = element.offsetParent as HTMLElement | null
  ) {
    x += element.offsetLeft;
    y += element.offsetTop;
  }
  // Upright deck snapshots collapse the face's entrance transform. Hand snapshots
  // preserve local transforms, so only ancestor/permanent scale belongs on their root.
  let scale = pose.width / localWidth;
  if (!upright) {
    scale = 1;
    for (
      let element: HTMLElement | null = permanent;
      element && !element.classList.contains("game-board");
      element = element.parentElement
    ) {
      const style = getComputedStyle(element);
      if (style.scale !== "none") scale *= parseFloat(style.scale);
      if (style.transform !== "none") {
        const matrix = new DOMMatrixReadOnly(style.transform);
        scale *= Math.hypot(matrix.a, matrix.b);
      }
    }
  }
  const rootRect = permanent.getBoundingClientRect();
  const faceRect = face.getBoundingClientRect();
  for (const element of upright ? [clone, card, card.parentElement!] : [clone]) {
    element.style.rotate = "none";
    element.style.translate = "none";
    element.style.scale = "none";
    element.style.transform = "none";
  }
  Object.assign(clone.style, {
    position: "absolute",
    inset: "auto",
    left: `${upright ? pose.width / 2 - x * scale : pose.width / 2 + rootRect.left - faceRect.left - faceRect.width / 2}px`,
    top: `${upright ? pose.height / 2 - y * scale : pose.height / 2 + rootRect.top - faceRect.top - faceRect.height / 2}px`,
    margin: "0",
    visibility: "visible",
    opacity: "1",
    transform: `scale(${scale})`,
    transformOrigin: "0 0",
    pointerEvents: "none",
  });
  card.dataset.deckReturnFace = "true";
  // Every branch except the printed face disappears on arrival at the deck.
  let branch: Element = card;
  while (branch !== clone) {
    for (const sibling of branch.parentElement!.children) {
      if (sibling !== branch) sibling.setAttribute("data-deck-return-extra", "true");
    }
    branch = branch.parentElement!;
  }
  // TokenInfo is field chrome; the first face child is the displayed image/fallback.
  for (const child of [...card.children].slice(1)) child.setAttribute("data-deck-return-extra", "true");
  clone.inert = true;
  clone.setAttribute("aria-hidden", "true");
  return clone;
}

export { CARD_FRACTURE as FIELD_FRACTURE } from "./cardShatter";

/** Retain the actual painted finish even when React mounts after the queue's clock starts. */
export async function waitForFieldShatterClock(
  board: HTMLElement | null,
  key: number,
  context: AnimationStepContext,
  light = false,
) {
  await waitForPaintedAnimation(
    () => board?.querySelector(`[data-field-shatter="${key}"]`),
    light ? "battle-particle-clock" : "battle-field-shatter",
    light ? TIMINGS.cardBurst : TIMINGS.deletionBurst,
    context,
  );
}
