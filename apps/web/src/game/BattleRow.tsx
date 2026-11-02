import { useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icons } from "../design/icons";
import { useTranslation } from "../i18n";
import "./style/cardSlots.css";

/** Horizontal overhang of a 1.4:1 card after a 90° turn, plus room for its outline and shadow. */
export function suspendedCardEdgeClearance(cardWidth: number): number {
  return Math.ceil(cardWidth * 0.2) + 8;
}

/** Keep the row's existing arena layout; controls live outside its clipping area. */
export function BattleRow({
  children,
  edgeClearance = 0,
  cardWidth,
  emptySlotCount,
  emptyLabel,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  edgeClearance?: number;
  cardWidth?: number;
  /** An animated parent supplies the final slot layout before measuring card motion. */
  emptySlotCount?: number;
  emptyLabel?: ReactNode;
}) {
  const { t } = useTranslation();
  const rowRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false, x: 0, y: 0, end: 0 });
  const [emptySlots, setEmptySlots] = useState(0);
  const measureRef = useRef<() => void>(undefined);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => measureRef.current?.());
    return () => cancelAnimationFrame(frame);
  });
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    function measure() {
      const rect = row!.getBoundingClientRect();
      if (cardWidth !== undefined && emptySlotCount === undefined) {
        const style = getComputedStyle(row!);
        const gap = Number.parseFloat(style.columnGap) || 0;
        const cards = [...row!.children].filter((child) => child.hasAttribute("data-field-key"));
        const occupied = cards.reduce((width, card) => {
          const cardStyle = getComputedStyle(card);
          // Read layout width, so an entrance, hover or attack animation cannot move the slots.
          return (
            width +
            (card as HTMLElement).offsetWidth +
            (Number.parseFloat(cardStyle.marginLeft) || 0) +
            (Number.parseFloat(cardStyle.marginRight) || 0)
          );
        }, 0);
        const spacers = edgeClearance > 0 ? 2 : 0;
        const available =
          row!.clientWidth -
          (Number.parseFloat(style.paddingLeft) || 0) -
          (Number.parseFloat(style.paddingRight) || 0) -
          edgeClearance * 2 -
          occupied -
          gap * Math.max(0, cards.length + spacers - 1);
        const capacity = Math.floor(
          (available + (cards.length + spacers === 0 ? gap : 0)) / (Math.max(44, cardWidth) + gap),
        );
        // Five is a visual guide, never a limit on how many permanents can be played.
        setEmptySlots(Math.max(cards.length === 0 ? 1 : 0, Math.min(5 - cards.length, capacity)));
      }
      const zones = row!.closest(".game-battle-zones");
      const field = zones && getComputedStyle(zones).overflowY === "auto" ? zones : row!.closest(".game-field");
      const fieldRect = field?.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      // Controls are portalled outside the scroller. Keep them within the
      // visible field when a short portrait screen scrolls its two players.
      const visible = !fieldRect || (center - 22 >= fieldRect.top && center + 22 <= fieldRect.bottom);
      const next = {
        left: visible && row!.scrollLeft > 1,
        right: visible && row!.scrollWidth - row!.clientWidth - row!.scrollLeft > 1,
        x: rect.left,
        y: rect.top + rect.height / 2,
        end: rect.right,
      };
      setEdges((previous) =>
        Object.keys(next).every((key) => previous[key as keyof typeof next] === next[key as keyof typeof next])
          ? previous
          : next,
      );
    }
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    const observeChildren = () => {
      observer?.disconnect();
      observer?.observe(row);
      for (const child of row.children) observer?.observe(child);
      measure();
    };
    // Set up once rather than on every render: a crowded board re-rendered every
    // lane's observers and listeners on each state change. Cards entering or
    // leaving re-observe the children; any size change re-measures.
    const childObserver = typeof MutationObserver === "undefined" ? undefined : new MutationObserver(observeChildren);
    childObserver?.observe(row, { childList: true });
    observeChildren();
    measureRef.current = measure;
    row.addEventListener("scroll", measure, { passive: true });
    // The classic row animates suspension margins, which ResizeObserver cannot see.
    row.addEventListener("transitionend", measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      observer?.disconnect();
      childObserver?.disconnect();
      measureRef.current = undefined;
      row.removeEventListener("scroll", measure);
      row.removeEventListener("transitionend", measure);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [cardWidth, edgeClearance, emptySlotCount]);

  function scroll(direction: number) {
    const row = rowRef.current;
    if (!row) return;
    row.scrollBy({
      left: direction * row.clientWidth * 0.7,
      // A paging button immediately reveals its destination. Native swipes
      // retain their momentum, independently of the card regrouping animation.
      behavior: "instant",
    });
  }

  return (
    <>
      <div
        {...props}
        ref={rowRef}
        data-card-slots={cardWidth !== undefined || undefined}
        style={{
          ...props.style,
          ...(cardWidth === undefined ? {} : ({ "--field-slot-width": `${cardWidth}px` } as CSSProperties)),
        }}
      >
        {edgeClearance > 0 ? (
          <span
            className="game-battle-row__turn-clearance"
            aria-hidden
            style={{ flex: `0 0 ${edgeClearance}px`, width: edgeClearance, alignSelf: "stretch" }}
          />
        ) : null}
        {children}
        {Array.from({ length: emptySlotCount ?? emptySlots }, (_, index) => (
          <div key={`empty-slot-${index}`} className="game-field-card-slot" aria-hidden={emptyLabel ? undefined : true}>
            <span className="game-field-card-slot__shape" aria-hidden="true" />
            {index === Math.floor((emptySlotCount ?? emptySlots) / 2) && emptyLabel ? (
              <span className="game-field-card-slot__label">{emptyLabel}</span>
            ) : null}
          </div>
        ))}
        {edgeClearance > 0 ? (
          <span
            className="game-battle-row__turn-clearance"
            aria-hidden
            style={{ flex: `0 0 ${edgeClearance}px`, width: edgeClearance, alignSelf: "stretch" }}
          />
        ) : null}
      </div>
      {createPortal(
        <>
          {edges.left && (
            <button
              type="button"
              className="game-battle-scroll-arrow"
              aria-label={`${props["aria-label"]}: ${t("game.fieldScrollLeft")}`}
              style={{ left: edges.x + 4, top: edges.y }}
              onClick={() => scroll(-1)}
            >
              <Icons.ChevronLeft size={22} />
            </button>
          )}
          {edges.right && (
            <button
              type="button"
              className="game-battle-scroll-arrow"
              aria-label={`${props["aria-label"]}: ${t("game.fieldScrollRight")}`}
              style={{ left: edges.end - 40, top: edges.y }}
              onClick={() => scroll(1)}
            >
              <Icons.ChevronRight size={22} />
            </button>
          )}
        </>,
        document.getElementById("aegis-stage") ?? document.body,
      )}
    </>
  );
}
