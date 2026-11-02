import { useEffect, useState } from "react";
import { MatchQueue } from "@aegis/shared/matchmaking/MatchQueue";
import type { MatchQueueCounts } from "@aegis/shared/matchmaking/MatchQueueCounts";
import type { MatchQueueSelection } from "@aegis/shared/matchmaking/MatchQueueSelection";
import { Icons } from "@/design/icons";
import { Badge, Button, Panel } from "@/design/primitives";
import type { Translate } from "@/i18n/translationTypes";
import { useTranslation } from "@/i18n/useTranslation";
import { getMatchQueueTables, type MatchQueueTable } from "@/matchmaking/getMatchQueueTables";
import { deckFormatLabel } from "@/screens/deckFormatLabel";
import "./MatchQueueTables.css";

const VISIBLE_SEATS = 3;

type Props = {
  counts: MatchQueueCounts;
  onChallenge: (selection: MatchQueueSelection) => void;
};

type RowProps = {
  table: MatchQueueTable;
  elapsedSeconds: number;
  onChallenge: (selection: MatchQueueSelection) => void;
};

function useSecondsSince(resetKey: unknown): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    const start = Date.now();
    const interval = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1_000)), 1_000);
    return () => window.clearInterval(interval);
  }, [resetKey]);
  return elapsed;
}

function formatWaitingTime(totalSeconds: number, t: Translate): string {
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return t("matchQueue.waitedHours", { hours, minutes: String(minutes).padStart(2, "0") });
  }
  if (minutes > 0) {
    return t("matchQueue.waitedMinutes", { minutes, seconds: String(seconds).padStart(2, "0") });
  }
  return t("matchQueue.waitedSeconds", { seconds });
}

function getSettingsLabel({ queue, bestOf, matchTimer, allowRollback }: MatchQueueSelection, t: Translate): string {
  if (queue === MatchQueue.MANUAL.value) {
    return t("manual.title");
  }
  return [
    queue === MatchQueue.BETA.value ? t("beta.tag") : undefined,
    t(bestOf === 3 ? "lobby.format.bestOf3" : "lobby.format.bestOf1"),
    t(matchTimer ? "lobby.timer.enabled" : "redesign.play.timerOff"),
    allowRollback ? t("rollback.controls") : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

function MatchQueueTableRow({ table, elapsedSeconds, onChallenge }: RowProps) {
  const { t } = useTranslation();
  const { selection, searching, longestWaitSeconds } = table;
  const hiddenSeats = Math.max(0, searching - VISIBLE_SEATS);
  return (
    <li className="match-queue-table">
      <div className="match-queue-table__seats" role="img" aria-label={t("matchQueue.seats", { count: searching })}>
        {Array.from({ length: Math.min(searching, VISIBLE_SEATS) }, (_, seat) => (
          <span key={seat} className="match-queue-table__seat">
            <Icons.User size={13} />
          </span>
        ))}
        {hiddenSeats > 0 ? <span className="match-queue-table__seat">+{hiddenSeats}</span> : null}
      </div>
      <div className="match-queue-table__rules">
        <Badge>{deckFormatLabel(selection.format, t)}</Badge>
        <span>{getSettingsLabel(selection, t)}</span>
      </div>
      {longestWaitSeconds === undefined ? (
        <span />
      ) : (
        <span className="match-queue-table__wait">
          <Icons.Clock size={14} aria-hidden="true" />
          {formatWaitingTime(longestWaitSeconds + elapsedSeconds, t)}
        </span>
      )}
      <Button variant="secondary" size="sm" icon={Icons.Swords} onClick={() => onChallenge(selection)}>
        {t("matchQueue.challenge")}
      </Button>
    </li>
  );
}

export function MatchQueueTables({ counts, onChallenge }: Props) {
  const { t } = useTranslation();
  const elapsedSeconds = useSecondsSince(counts);
  const tables = getMatchQueueTables({ counts });
  const waiting = tables.reduce((total, table) => total + table.searching, 0);
  return (
    <section className="watch-section match-queue-room" aria-labelledby="match-queue-room-title">
      <header className="watch-header">
        <div className="watch-header__title">
          <h2 id="match-queue-room-title">{t("matchQueue.roomTitle")}</h2>
          {waiting > 0 ? (
            <Badge tone="success" className="match-queue-room__count">
              {t("matchQueue.roomCount", { count: waiting })}
            </Badge>
          ) : null}
        </div>
        <div className="watch-header__row">
          <p>{t("matchQueue.roomSubtitle")}</p>
        </div>
      </header>
      <Panel className="match-queue-room__panel" pad={0}>
        {tables.length === 0 ? (
          <div className="match-queue-room__empty">
            <Icons.Users size={28} aria-hidden="true" />
            <p>{t("matchQueue.roomEmpty")}</p>
          </div>
        ) : (
          <ul className="match-queue-room__tables">
            {tables.map((table) => (
              <MatchQueueTableRow
                key={table.key}
                table={table}
                elapsedSeconds={elapsedSeconds}
                onChallenge={onChallenge}
              />
            ))}
          </ul>
        )}
      </Panel>
    </section>
  );
}
