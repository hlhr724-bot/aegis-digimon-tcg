import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Seat } from "@aegis/shared/schema/enums";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { CardLinkedText } from "@/game/cardLinks";
import type { LogEntry } from "@/game/log/LogEntry";
import type { SeatAvatars } from "@/game/log/SeatAvatars";
import type { SeatNames } from "@/game/log/SeatNames";
import { LogActorAvatar } from "@/game/log/LogActorAvatar";
import { MemoryBadge } from "@/game/log/MemoryBadge";
import { getLogEntrySeat } from "@/game/log/getLogEntrySeat";
import { useDraggableWindow } from "@/game/chat/useDraggableWindow";

const VISIBLE_ENTRIES = 8;

type Props = {
  entries: readonly LogEntry[];
  viewerSeat?: Seat;
  playerNames: SeatNames;
  playerAvatars?: SeatAvatars;
  onExpand: () => void;
  onOpenCard?: (cardId: string) => void;
};

export function FixedMatchLog({ entries, viewerSeat, playerNames, playerAvatars, onExpand, onOpenCard }: Props) {
  const { t } = useTranslation();
  const list = useRef<HTMLOListElement>(null);
  const panel = useRef<HTMLElement>(null);
  const { position, handleProps } = useDraggableWindow(panel);
  const recent = entries.slice(-VISIBLE_ENTRIES);
  const newestId = recent.at(-1)?.id;
  useLayoutEffect(() => {
    if (list.current) {
      list.current.scrollTop = list.current.scrollHeight;
    }
  }, [newestId]);
  return createPortal(
    <section
      ref={panel}
      data-arena-surface
      className="fixed-match-log"
      aria-label={t("game.matchLog")}
      data-testid="fixed-match-log"
      data-moved={position ? true : undefined}
      style={position ? { left: position.left, top: position.top } : undefined}
    >
      <header className="fixed-match-log__header" title={t("game.matchLogDrag")} {...handleProps}>
        <span>{t("game.matchLog")}</span>
        <button type="button" onClick={onExpand} aria-label={t("game.matchLogExpand")} title={t("game.matchLogExpand")}>
          <Icons.Maximize size={14} />
        </button>
      </header>
      {recent.length === 0 ? (
        <p className="fixed-match-log__empty">{t("feed.noHistory")}</p>
      ) : (
        <ol className="fixed-match-log__list" ref={list}>
          {recent.map((entry) => (
            <li key={entry.id} className="play-log__line" data-kind={entry.kind}>
              <LogActorAvatar
                seat={getLogEntrySeat({ entry, viewerSeat })}
                playerNames={playerNames}
                playerAvatars={playerAvatars}
                size={16}
              />
              <p>
                <CardLinkedText text={entry.text} cardIds={entry.cardIds} onOpenCard={onOpenCard} />
                {entry.memory ? <MemoryBadge memory={entry.memory} /> : null}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>,
    document.body,
  );
}
