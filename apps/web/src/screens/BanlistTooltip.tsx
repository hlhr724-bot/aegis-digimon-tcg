import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { useRef, useState } from "react";
import { Tooltip } from "radix-ui";
import { banlistAsOf, BANNED_PAIRS, bannedPairViolations } from "@aegis/shared";
import { Icons } from "../design/icons";
import { useTranslation } from "../i18n";

const scrollDistances: Record<string, number> = { ArrowDown: 64, ArrowUp: -64, PageDown: 240, PageUp: -240 };
const pairCardIds = BANNED_PAIRS.flatMap((pair) => [pair.cardId, ...pair.conflictsWith]);

/** The date shown by the selector is the same snapshot used by deck validation. */
export function BanlistTooltip({ date, label }: { date: string; label: string }) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const entries = Object.values(banlistAsOf(date))
    .filter((entry) => entry.status !== "banned_pair")
    .sort((a, b) => a.cardId.localeCompare(b.cardId, undefined, { numeric: true }));
  const pairs = bannedPairViolations(pairCardIds, date);
  const cardName = (id: string) => `${id} · ${getCardName(id)}`;
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root open={open} onOpenChange={setOpen}>
        <Tooltip.Trigger
          asChild
          // Keep the trigger clickable on touch devices; Radix's default click dismisses tooltips.
          onPointerDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.preventDefault();
            setOpen((previous) => !previous);
          }}
          onKeyDown={(event) => {
            const distance = scrollDistances[event.key];
            if (open && distance !== undefined) {
              event.preventDefault();
              content.current?.scrollBy({ top: distance });
            }
          }}
        >
          <button type="button" className="banlist-tooltip-trigger" ref={trigger}>
            {label} <Icons.Info size={13} />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="banlist-tooltip"
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            ref={content}
            onPointerDownOutside={(event) => {
              // A second tap on the trigger toggles the tooltip instead of reopening it.
              if (trigger.current?.contains(event.detail.originalEvent.target as Node)) event.preventDefault();
            }}
          >
            <strong className="banlist-tooltip__title">{t("deckFormat.banlistTitle", { date })}</strong>
            {entries.length === 0 && pairs.length === 0 ? <p>{t("deckFormat.banlistEmpty")}</p> : null}
            {entries.length > 0 ? (
              <ul className="banlist-tooltip__cards">
                {entries.map((entry) => (
                  <li key={entry.cardId}>
                    <span>{cardName(entry.cardId)}</span>
                    <span className="banlist-tooltip__restriction">
                      {t(entry.status === "banned" ? "deckFormat.banlistBanned" : "deckFormat.banlistLimited", {
                        count: entry.count,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {pairs.length > 0 ? (
              <>
                <strong className="banlist-tooltip__title">{t("deckFormat.banlistPairs")}</strong>
                <ul className="banlist-tooltip__pairs">
                  {pairs.map(([a, b]) => (
                    <li key={`${a}-${b}`}>
                      <span>{cardName(a)}</span>
                      <span aria-hidden="true">↔</span>
                      <span>{cardName(b)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <Tooltip.Arrow className="banlist-tooltip__arrow" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
