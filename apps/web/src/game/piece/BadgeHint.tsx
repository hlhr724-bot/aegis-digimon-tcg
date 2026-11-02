import "@/game/piece/BadgeHint.css";
import { useCallback, useEffect, useRef, useState, type HTMLAttributes, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";

export interface BadgeHintText {
  title: string;
  description: string;
  link?: { label: string; href: string };
}

const HINT_WIDTH_PX = 240;
const VIEWPORT_MARGIN_PX = 8;
const ANCHOR_GAP_PX = 8;
const HOVER_CLOSE_DELAY_MS = 150;

/** Only one explanation is open on the board at a time. */
let closeOpenHint: (() => void) | undefined;

/**
 * A field badge that explains itself while a mouse hovers it, or when tapped, which
 * is the only way a phone can reach the explanation. The explanation stays open
 * while the mouse moves onto it, so its rule link can be clicked. The badge stays out of the tab order and the
 * accessibility tree: the permanent's own accessible name already speaks every
 * state its badges show. The tap is kept from reaching the permanent, so reading a
 * badge never selects, drags or attacks with the card under it, except for a touch
 * while the permanent is the thing to tap (a target, a pick, an attacker).
 */
export function BadgeHint({
  hint,
  children,
  ...rest
}: { hint: BadgeHintText; children: ReactNode } & Omit<
  HTMLAttributes<HTMLSpanElement>,
  "onClick" | "onPointerDown" | "onPointerEnter" | "onPointerLeave"
>) {
  const badgeRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);
  const tapPassesToCard = useRef(false);
  const lastPointerType = useRef("");
  const closeTimer = useRef<number | undefined>(undefined);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const cancelClose = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = undefined;
  }, []);
  const close = useCallback(() => {
    cancelClose();
    setAnchor(null);
    if (closeOpenHint === close) closeOpenHint = undefined;
  }, [cancelClose]);
  const open = useCallback(() => {
    cancelClose();
    if (closeOpenHint !== close) closeOpenHint?.();
    closeOpenHint = close;
    setAnchor(badgeRef.current?.getBoundingClientRect() ?? null);
  }, [cancelClose, close]);
  // A mouse crossing the gap between the badge and its explanation must not close it.
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(close, HOVER_CLOSE_DELAY_MS);
  }, [cancelClose, close]);

  useEffect(() => {
    if (!anchor) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (!(target && (badgeRef.current?.contains(target) || popoverRef.current?.contains(target)))) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [anchor, close]);

  useEffect(() => close, [close]);

  return (
    <span
      {...rest}
      ref={badgeRef}
      data-badge-hint=""
      data-hint-open={anchor ? "" : undefined}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") open();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") scheduleClose();
      }}
      onPointerDown={(event) => {
        lastPointerType.current = event.pointerType;
        // fieldBadges.css already lets a finger through on `(pointer: coarse)`
        // screens; a phone whose primary pointer reads as fine (a stylus, a paired
        // mouse) still delivers the touch here, so decide from the touch itself.
        tapPassesToCard.current =
          event.pointerType !== "mouse" && !!event.currentTarget.closest(".game-permanent[data-tap-target]");
        if (!tapPassesToCard.current) event.stopPropagation();
      }}
      onClick={(event) => {
        if (tapPassesToCard.current) {
          tapPassesToCard.current = false;
          return;
        }
        event.stopPropagation();
        // Hover already opened it for a mouse; a click must not toggle it shut under the pointer.
        if (lastPointerType.current === "mouse") {
          open();
          return;
        }
        if (anchor) close();
        else open();
      }}
    >
      {children}
      {anchor
        ? createPortal(
            <BadgeHintPopover
              ref={popoverRef}
              anchor={anchor}
              hint={hint}
              onPointerEnter={cancelClose}
              onPointerLeave={scheduleClose}
            />,
            document.body,
          )
        : null}
    </span>
  );
}

/** Above the badge when there is room, below it otherwise, and never past the screen's edges. */
function BadgeHintPopover({
  ref,
  anchor,
  hint,
  onPointerEnter,
  onPointerLeave,
}: {
  ref: Ref<HTMLSpanElement>;
  anchor: DOMRect;
  hint: BadgeHintText;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const width = Math.min(HINT_WIDTH_PX, viewportWidth - VIEWPORT_MARGIN_PX * 2);
  const center = anchor.left + anchor.width / 2;
  const left = Math.min(Math.max(center - width / 2, VIEWPORT_MARGIN_PX), viewportWidth - width - VIEWPORT_MARGIN_PX);
  const above = anchor.top > window.innerHeight / 3;
  return (
    <span
      ref={ref}
      className="game-badge-hint"
      role="tooltip"
      onPointerEnter={(event) => event.pointerType === "mouse" && onPointerEnter()}
      onPointerLeave={(event) => event.pointerType === "mouse" && onPointerLeave()}
      data-placement={above ? "above" : "below"}
      style={{
        left,
        width,
        top: above ? anchor.top - ANCHOR_GAP_PX : anchor.bottom + ANCHOR_GAP_PX,
      }}
      // A portal still bubbles React events through the badge to the card.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <strong>{hint.title}</strong>
      <span>{hint.description}</span>
      {hint.link ? (
        <a className="game-badge-hint__link" href={hint.link.href} target="_blank" rel="noopener noreferrer">
          {hint.link.label}
        </a>
      ) : null}
    </span>
  );
}
