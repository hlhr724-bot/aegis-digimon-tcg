import { useLayoutEffect, useState, type CSSProperties } from "react";
import { useMediaQuery } from "../../../design/useMediaQuery";
import { permanentVisualElement } from "../../screen/dropZones";

const SOURCE_GAP_PX = 8;
const VIEWPORT_GUTTER_PX = 16;
/** Room for the question, eight lines of clause and the three answer buttons. */
const MINIMUM_PROMPT_SPACE_PX = 400;

export type SourceClearPlacement = {
  /** The tallest the panel may grow while docked at the bottom without reaching the source card. */
  space: number;
};

/**
 * How tall a phone activation prompt may be so that it does not cover the card that asks.
 * The panel keeps its bottom dock and only its height is capped. When the room under the
 * card could not show the question, a readable clause and the answers, the usual placement
 * stays, and "View board" or the drag handle reveal the card.
 */
export function sourceClearPlacement({
  source,
  viewportHeight,
}: {
  source: { bottom: number };
  viewportHeight: number;
}): SourceClearPlacement | undefined {
  const bottomLimit = viewportHeight - VIEWPORT_GUTTER_PX;
  const space = bottomLimit - (source.bottom + SOURCE_GAP_PX);
  if (space >= MINIMUM_PROMPT_SPACE_PX) {
    return { space };
  }
  return undefined;
}

function sourceRect(sourcePermanentId: string): DOMRect | undefined {
  const permanent = Array.from(document.querySelectorAll<HTMLElement>("[data-drop][data-id]")).find(
    (node) => node.dataset.id === sourcePermanentId,
  );
  if (!permanent) return undefined;
  const bounds = permanentVisualElement(permanent).getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return undefined;
  if (bounds.bottom <= 0 || bounds.top >= window.innerHeight) return undefined;
  return bounds;
}

/**
 * Keeps a phone activation prompt clear of its source permanent, following the card while
 * the board settles. Returns the panel attributes and custom properties to apply.
 */
export function useSourceClearPlacement(sourcePermanentId: string | undefined, enabled: boolean) {
  const mobile = useMediaQuery("(width < 768px), (height < 520px) and (orientation: landscape)");
  const [placement, setPlacement] = useState<SourceClearPlacement & { source: string }>();
  const active = mobile && enabled && sourcePermanentId !== undefined;
  useLayoutEffect(() => {
    setPlacement(undefined);
    if (!active) return;
    const sourceId = sourcePermanentId!;
    let frame = 0;
    let previous = "";
    function measure() {
      frame = requestAnimationFrame(measure);
      const rect = sourceRect(sourceId);
      const next = rect ? sourceClearPlacement({ source: rect, viewportHeight: window.innerHeight }) : undefined;
      const key = next ? `${Math.round(next.space)}` : "";
      if (key === previous) return;
      previous = key;
      setPlacement(next ? { ...next, source: sourceId } : undefined);
    }
    measure();
    return () => cancelAnimationFrame(frame);
  }, [active, sourcePermanentId]);
  if (!active || placement?.source !== sourcePermanentId) return undefined;
  return {
    "data-source-clear": "below",
    style: {
      "--effect-prompt-source-space": `${Math.floor(placement.space)}px`,
    } as CSSProperties,
  };
}
