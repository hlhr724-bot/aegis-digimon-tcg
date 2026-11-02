import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import type { AnimationQueue, AnimationStepContext } from "./animationQueue";
import { motionPreference } from "@/design/motion/motionPreference";

export const BREEDING_TRANSFER_MS = 200;
const OUT_CUBIC = "cubic-bezier(0.333333, 1, 0.666667, 1)";

interface Origin {
  face: DOMRect;
  bounds: DOMRect;
  clone: HTMLElement;
}

const origins = new WeakMap<HTMLElement, Map<string, Origin>>();

function remember(board: HTMLElement, permanent: HTMLElement, permanentId: string) {
  const face = permanent.querySelector<HTMLElement>(".game-card-enter > [data-state]");
  if (!face) return;
  const saved = origins.get(board) ?? new Map<string, Origin>();
  origins.set(board, saved);
  saved.set(permanentId, {
    face: face.getBoundingClientRect(),
    bounds: permanent.getBoundingClientRect(),
    clone: snapshot(permanent),
  });
  while (saved.size > 4) saved.delete(saved.keys().next().value!);
}

/** Ref detachment runs before removal, so even a late scroll or completed entrance is measured. */
export function useBreedingTransferOrigin(permanentId: string | undefined) {
  const live = useRef<HTMLElement | null>(null);
  return useCallback(
    (element: HTMLDivElement | null) => {
      const previous = live.current;
      if (!element && previous?.isConnected && permanentId) {
        const board = previous.closest<HTMLElement>(".game-board");
        if (board) remember(board, previous, permanentId);
      }
      live.current = element;
    },
    [permanentId],
  );
}

/** Freeze the drawn stack, including its responsive styles, before a state patch removes it. */
function snapshot(element: HTMLElement): HTMLElement {
  const clone = element.cloneNode(true) as HTMLElement;
  const originals = [element, ...element.querySelectorAll<HTMLElement>("*")];
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
  originals.forEach((original, index) => {
    const copy = copies[index]!;
    const style = getComputedStyle(original);
    for (let propertyIndex = 0; propertyIndex < style.length; propertyIndex++) {
      const property = style.item(propertyIndex);
      copy.style.setProperty(property, style.getPropertyValue(property));
    }
    copy.style.animation = "none";
    copy.style.transition = "none";
    copy.removeAttribute("id");
    copy.removeAttribute("data-permanent-id");
    copy.removeAttribute("data-drop");
    copy.removeAttribute("tabindex");
  });
  clone.inert = true;
  clone.setAttribute("aria-hidden", "true");
  clone.style.pointerEvents = "none";
  return clone;
}

/** Release board-owned snapshots when its renderer unmounts. Capture itself happens at ref detachment. */
export function useBreedingTransferOrigins(boardRef: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const board = boardRef.current;
    return () => {
      if (board) origins.delete(board);
    };
  }, [boardRef]);
}

/** Move the existing stack to the actual destination, with no play burst or synthetic landing. */
export async function runBreedingTransfer(
  permanentId: string,
  queue: AnimationQueue,
  context: AnimationStepContext,
  handOver: () => void,
) {
  if (context.mode !== "live" || context.cancelled || context.skipping) return;
  const board =
    typeof document === "undefined" ? null : document.querySelector<HTMLElement>(".aegis-arena .game-board");
  const source = board && origins.get(board)?.get(permanentId);
  const target =
    board &&
    [...board.querySelectorAll<HTMLElement>(".game-battle-row .game-permanent")].find(
      (element) => element.dataset.permanentId === permanentId,
    );
  const face = target?.querySelector<HTMLElement>(".game-card-enter > [data-state]");
  if (!source || !board || !face || !source.face.width || typeof source.clone.animate !== "function") {
    await context.wait(BREEDING_TRANSFER_MS);
    handOver();
    return;
  }
  origins.get(board)?.delete(permanentId);
  if (motionPreference.isReduced()) {
    handOver();
    return;
  }
  // React's burst state commits after this step starts. Suppress its entrance before
  // measuring, and hide the destination while the physical stack travels to it.
  target!.querySelector(".game-card-enter")?.classList.add("game-card-enter--quiet");
  const visibility = target!.style.visibility;
  target!.style.visibility = "hidden";
  const to = face.getBoundingClientRect();
  const boardRect = board.getBoundingClientRect();
  const x = source.face.left + source.face.width / 2;
  const y = source.face.top + source.face.height / 2;
  const clone = source.clone;
  clone.dataset.breedingTransfer = permanentId;
  Object.assign(clone.style, {
    position: "absolute",
    left: `${source.bounds.left - boardRect.left}px`,
    top: `${source.bounds.top - boardRect.top}px`,
    margin: "0",
    transform: "none",
    translate: "none",
    rotate: "none",
    visibility: "visible",
    zIndex: "75",
    transformOrigin: `${x - source.bounds.left}px ${y - source.bounds.top}px`,
  });
  board.append(clone);
  const animation = clone.animate(
    [
      { transform: "translate(0px, 0px) scale(1)" },
      {
        transform: `translate(${to.left + to.width / 2 - x}px, ${to.top + to.height / 2 - y}px) scale(${to.width / source.face.width})`,
      },
    ],
    { duration: BREEDING_TRANSFER_MS, easing: OUT_CUBIC, fill: "both" },
  );
  let frame = 0;
  function sync() {
    if (Number(animation.currentTime ?? 0) >= BREEDING_TRANSFER_MS) return;
    if (context.paused ?? queue.isPaused()) animation.pause();
    else {
      animation.playbackRate = queue.getRate();
      if (animation.playState === "paused") animation.play();
    }
    frame = requestAnimationFrame(sync);
  }
  sync();
  try {
    await context.wait(BREEDING_TRANSFER_MS);
    for (let poll = 0; poll < 14 && !context.cancelled && !context.skipping && context.mode === "live"; poll++) {
      const done = Number(animation.currentTime ?? 0) >= BREEDING_TRANSFER_MS;
      await context.wait(16);
      if (done) break;
    }
    if (target!.style.visibility === "hidden") target!.style.visibility = visibility;
    handOver();
    // Keep the final frame until React has revealed the resting card.
    for (let poll = 0; poll < 14 && !context.cancelled && !context.skipping && context.mode === "live"; poll++) {
      await context.wait(16);
      if (!target!.isConnected || getComputedStyle(target!).visibility !== "hidden") break;
    }
  } finally {
    cancelAnimationFrame(frame);
    animation.cancel();
    clone.remove();
    if (target!.style.visibility === "hidden") target!.style.visibility = visibility;
  }
}
