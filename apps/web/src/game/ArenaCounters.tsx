import { memo } from "react";
import { createPortal } from "react-dom";
import { usePileCountsShown } from "../design/pileCounts";
import { useTranslation } from "../i18n";
import { Side } from "./side";
import { useAnchoredTooltip } from "./useAnchoredTooltip";
import "./arenaControls.css";

export const ArenaCounters = memo(function ArenaCounters({
  side,
  eggs,
  hand,
  deck,
  trash,
}: {
  side: Side;
  eggs: number;
  hand: number;
  deck: number;
  trash: number;
}) {
  const { t } = useTranslation();
  const shown = usePileCountsShown();
  const { tooltipId, open, show, closeSoon, cancelClose } = useAnchoredTooltip({
    preferAbove: side === Side.Viewer,
  });
  const counters = [
    {
      id: "eggs",
      count: eggs,
      label: `${t("game.pile.eggs")} · ${eggs}`,
      tooltip: t("game.counter.eggs", { count: eggs }),
      path: "M12 2.5c-3.2 0-7 7.4-7 12a7 7 0 0 0 14 0c0-4.6-3.8-12-7-12Z M8.5 14l3.5-2.5 3.5 2.5-3.5 4Z",
    },
    {
      id: "hand",
      count: hand,
      label: t("game.handCount", { count: hand }),
      tooltip: t("game.counter.hand", { count: hand }),
      path: "m3 7 4-1 4 14-4 1Z M9 3h6v16H9 M17 6l4 1-4 14-3-1 M11 7h2",
    },
    {
      id: "deck",
      count: deck,
      label: `${t("game.pile.deck")} · ${deck}`,
      tooltip: t("game.counter.deck", { count: deck }),
      path: "M7 3h12v15H7Z M4 6v15h12 M10 7h6 M10 10h6 M10 13h3",
    },
    {
      id: "trash",
      count: trash,
      label: `${t("game.pile.trash")} · ${trash}`,
      tooltip: t("game.counter.trash", { count: trash }),
      path: "M6 3h12v14H6Z M9 6h6 M9 9h4 M3 17h6l2 3h2l2-3h6v5H3Z",
    },
  ];
  const groupLabel = t(side === "you" ? "game.you" : "game.opponent");
  // Hidden counters stay readable to screen readers. The opponent's hand chip
  // remains as a fallback that CSS reveals only where the card-back fan is hidden.
  const visibleCounters = shown ? counters : counters.filter(({ id }) => side === Side.Opponent && id === "hand");
  const hiddenSummary = shown ? null : (
    <ul className="aegis-sr-only" aria-label={groupLabel}>
      {counters.map(({ id, tooltip }) => (
        <li key={id}>{tooltip}</li>
      ))}
    </ul>
  );
  if (visibleCounters.length === 0) return hiddenSummary;
  return (
    <>
      {hiddenSummary}
      <div
        className="game-arena-counters"
        data-side={side}
        data-fan-fallback={shown ? undefined : true}
        role="group"
        aria-label={groupLabel}
      >
        {visibleCounters.map(({ id, count, label, tooltip, path }) => (
          <button
            key={id}
            type="button"
            className="game-arena-counter"
            data-counter={id}
            aria-label={tooltip}
            aria-describedby={open?.id === id ? tooltipId : undefined}
            onMouseEnter={(event) => show(id, event.currentTarget)}
            onMouseLeave={closeSoon}
            onFocus={(event) => show(id, event.currentTarget)}
            onBlur={closeSoon}
            onClick={(event) => show(id, event.currentTarget)}
          >
            <span className="game-arena-counter__icon" role="img" aria-label={label}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={path} />
              </svg>
              <strong aria-hidden="true">{count}</strong>
            </span>
          </button>
        ))}
        {open &&
          createPortal(
            <span
              id={tooltipId}
              role="tooltip"
              className="game-anchored-tooltip"
              data-above={open.above}
              style={{ left: open.left, top: open.top }}
              onMouseEnter={cancelClose}
              onMouseLeave={closeSoon}
            >
              {counters.find((counter) => counter.id === open.id)?.tooltip}
            </span>,
            document.body,
          )}
      </div>
    </>
  );
});
