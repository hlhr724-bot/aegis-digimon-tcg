import type { ParticipantView, StandingsRow } from "@aegis/shared";
import { useTranslation } from "@/i18n/useTranslation";

type TournamentStandingsTableParams = {
  standings: readonly StandingsRow[];
  participants: readonly ParticipantView[];
};

export function TournamentStandingsTable({ standings, participants }: TournamentStandingsTableParams) {
  const { t, locale } = useTranslation();
  const percent = new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

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
              <th scope="col">{t("tournaments.standings.matchWinRate")}</th>
              <th scope="col">{t("tournaments.standings.opponentMatchWinRate")}</th>
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
                <td>{percent.format(row.matchWinRate)}</td>
                <td>{percent.format(row.opponentMatchWinRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tournaments-note">{t("tournaments.standings.tiebreakNote")}</p>
    </>
  );
}
