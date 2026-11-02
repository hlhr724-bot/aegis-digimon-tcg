import { useMemo, useState } from "react";
import type { Seat } from "@aegis/shared/schema/enums";
import { Button, Dialog, Switch } from "@/design/primitives";
import { setFieldReferenceVisible } from "@/design/fieldReference/setFieldReferenceVisible";
import { useFieldReferenceVisible } from "@/design/fieldReference/useFieldReferenceVisible";
import { useTranslation } from "@/i18n/useTranslation";
import type { LogTurnGroup } from "@/game/log/LogEntry";
import type { SeatNames } from "@/game/log/SeatNames";
import type { SeatAvatars } from "@/game/log/SeatAvatars";
import { filterMatchLog } from "@/game/log/filterMatchLog";
import { PlayLogSearchField } from "@/game/log/PlayLogSearchField";
import { PlayLogTurnGroup } from "@/game/log/PlayLogTurnGroup";
import { usePlayLogAutoScroll } from "@/game/log/usePlayLogAutoScroll";

type Props = {
  turns: readonly LogTurnGroup[];
  viewerSeat?: Seat;
  playerNames: SeatNames;
  playerAvatars?: SeatAvatars;
  onClose: () => void;
  onOpenCard?: (cardId: string) => void;
};

export function PlayLogSidebar({ turns, viewerSeat, playerNames, playerAvatars, onClose, onOpenCard }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const fieldReferenceVisible = useFieldReferenceVisible();
  const filtered = useMemo(() => filterMatchLog({ turns, query }), [turns, query]);
  const entryCount = turns.reduce(
    (count, turn) => count + turn.phases.reduce((total, phase) => total + phase.entries.length, 0),
    0,
  );
  const matchCount = filtered.reduce(
    (count, turn) => count + turn.phases.reduce((total, phase) => total + phase.entries.length, 0),
    0,
  );
  const filtering = query.trim().length > 0;
  const { listRef, isAtLatest, handleScroll, jumpToLatest } = usePlayLogAutoScroll({ entryCount, filtering });
  return (
    <Dialog className="play-log game-modal__panel" labelledBy="aegis-play-log-title" onClose={onClose}>
      <header className="play-log__header">
        <h2 id="aegis-play-log-title">{t("game.matchLog")}</h2>
        <Button size="sm" variant="ghost" aria-label={t("feed.closeLog")} data-arena-cancel onClick={onClose}>
          {t("common.close")}
        </Button>
      </header>
      <div className="play-log__setting">
        <Switch
          checked={fieldReferenceVisible}
          label={t("feed.showFieldReferences")}
          onChange={setFieldReferenceVisible}
        />
      </div>
      <PlayLogSearchField query={query} onChange={setQuery} />
      <div className="play-log__list" ref={listRef} onScroll={handleScroll}>
        {matchCount === 0 ? (
          <p className="play-log__empty">{t(filtering ? "feed.noMatches" : "feed.noHistory")}</p>
        ) : null}
        {filtered.map((turn, index) => (
          <PlayLogTurnGroup
            key={`${turn.turnCount}:${turn.turnSeat}:${index}`}
            turn={turn}
            viewerSeat={viewerSeat}
            playerNames={playerNames}
            playerAvatars={playerAvatars}
            highlight={query}
            onOpenCard={onOpenCard}
          />
        ))}
      </div>
      {!isAtLatest && !filtering ? (
        <button className="play-log__jump" type="button" onClick={jumpToLatest}>
          {t("feed.jumpToLatest")}
        </button>
      ) : null}
    </Dialog>
  );
}
