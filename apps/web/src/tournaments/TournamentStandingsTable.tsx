import type { ParticipantView, StandingsRow, TournamentRules } from "@aegis/shared";
import { TournamentTiebreaker } from "@aegis/shared/tournaments/TournamentTiebreaker";
import { useTranslation } from "@/i18n/useTranslation";
import { eventTiebreakers } from "@/tournaments/eventTiebreakers";
import { tiebreakerColumnKey } from "@/tournaments/tiebreakerColumnKey";
import { tiebreakerLabelKey } from "@/tournaments/tiebreakerLabelKey";

type TournamentStandingsTableParams = {
  standings: readonly StandingsRow[];
  participants: readonly ParticipantView[];
  rules?: TournamentRules | null;
};

type ColumnValue = { kind: "rate" | "count"; read: (row: StandingsRow) => number | undefined };

const COLUMN_VALUES: Partial<Record<TournamentTiebreaker, ColumnValue>> = {
  [TournamentTiebreaker.MATCH_WIN_RATE.value]: { kind: "rate", read: (row) => row.matchWinRate },
  [TournamentTiebreaker.OPPONENT_MATCH_WIN_RATE.value]: { kind: "rate", read: (row) => row.opponentMatchWinRate },
  [TournamentTiebreaker.OPPONENT_OPPONENT_MATCH_WIN_RATE.value]: {
    kind: "rate",
    read: (row) => row.opponentOpponentMatchWinRate,
  },
  [TournamentTiebreaker.GAME_WIN_RATE.value]: { kind: "rate", read: (row) => row.gameWinRate },
  [TournamentTiebreaker.GAME_DIFFERENCE.value]: { kind: "count", read: (row) => row.gameDifference },
  [TournamentTiebreaker.OPPONENT_POINTS.value]: { kind: "count", read: (row) => row.opponentPoints },
  [TournamentTiebreaker.DEFEATED_OPPONENT_POINTS.value]: { kind: "count", read: (row) => row.defeatedOpponentPoints },
};

const LEGACY_COLUMNS: TournamentTiebreaker[] = [
  TournamentTiebreaker.MATCH_WIN_RATE.value,
  TournamentTiebreaker.OPPONENT_MATCH_WIN_RATE.value,
];

export function TournamentStandingsTable({ standings, participants, rules }: TournamentStandingsTableParams) {
  const { t, locale } = useTranslation();
  const percent = new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const tiebreakers = eventTiebreakers(rules);
  const columns = (tiebreakers.length > 0 ? tiebreakers : LEGACY_COLUMNS).filter(
    (tiebreaker) => COLUMN_VALUES[tiebreaker] !== undefined,
  );
  const order = tiebreakers.map((tiebreaker) => t(tiebreakerLabelKey(tiebreaker))).join(" → ");

  function formatValue(tiebreaker: TournamentTiebreaker, row: StandingsRow): string {
    const column = COLUMN_VALUES[tiebreaker]!;
    const value = column.read(row);
    if (value === undefined) return "—";
    return column.kind === "rate" ? percent.format(value) : String(value);
  }

  return (
    <>
      <div className="tournaments-standings-scroll">
        <table className="tournaments-standings-table">
          <thead>
            <tr>
              <th scope="col">{t("tournaments.standings.rank")}</th>
              <th scope="col">{t("tournaments.standings.player")}</th>
              <th scope="col">{t("tournaments.standings.points")}</th>
              <th scope="col">{t("tournaments.standings.record")}</th>
              {columns.map((tiebreaker) => (
                <th key={tiebreaker} scope="col" title={t(tiebreakerLabelKey(tiebreaker))}>
                  {t(tiebreakerColumnKey(tiebreaker))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {standings.map((row) => (
              <tr key={row.participantId}>
                <td>#{row.rank}</td>
                <th scope="row">
                  {participants.find((participant) => participant.id === row.participantId)?.displayName ??
                    row.participantId}
                </th>
                <td>{row.points}</td>
                <td>
                  {`${row.wins}-${row.losses}-${row.draws}`}
                  {row.byes > 0 ? (
                    <small className="tournaments-standings-table__byes">
                      {t("tournaments.standings.byes", { count: row.byes })}
                    </small>
                  ) : null}
                </td>
                {columns.map((tiebreaker) => (
                  <td key={tiebreaker}>{formatValue(tiebreaker, row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tournaments-note">
        {tiebreakers.length > 0
          ? t("tournaments.standings.tiebreakOrder", { order })
          : t("tournaments.standings.tiebreakNote")}
      </p>
    </>
  );
}
