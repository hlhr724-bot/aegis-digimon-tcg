import { Badge, Panel } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import { matchStatusKey } from "@/tournaments/labels";
import { isTournamentSeriesLive } from "@/tournaments/isTournamentSeriesLive";
import type { TournamentSpectateTarget } from "@/tournaments/TournamentSpectateTarget";
import { TournamentWatchButton } from "@/tournaments/TournamentWatchButton";
import type { TournamentDetail } from "@/tournaments/types";

type Props = {
  detail: Pick<TournamentDetail, "matches" | "series" | "participants"> &
    Partial<Pick<TournamentDetail, "id" | "canSpectate">>;
  onWatchMatch?: (target: TournamentSpectateTarget) => void;
};

export function TournamentMatchHistory({ detail, onWatchMatch }: Props) {
  const { t } = useTranslation();
  return (
    <Panel>
      <h3>{t("tournaments.detail.matches")}</h3>
      {detail.matches.length === 0 ? (
        <p>{t("tournaments.detail.noMatches")}</p>
      ) : (
        <ul className="tournaments-matches">
          {detail.matches.map((match) => {
            const series = detail.series?.find((entry) => entry.matchId === match.id);
            const names = ([0, 1] as const).map((seat) => {
              const participantId = series?.participantIds?.[seat];
              const accountId = seat === 0 ? match.player0AccountId : match.player1AccountId;
              return (
                detail.participants.find(
                  (participant) =>
                    participant.id === participantId || (accountId !== null && participant.accountId === accountId),
                )?.displayName ??
                (match.status === "bye" ? t("tournaments.myMatch.bye") : t("tournaments.myMatch.opponentUnknown"))
              );
            });
            const winnerId =
              series?.winnerSeat === 0 || series?.winnerSeat === 1
                ? series.participantIds?.[series.winnerSeat]
                : undefined;
            const winnerAccountId = series?.winnerParticipantId ?? match.winnerAccountId;
            const live = isTournamentSeriesLive(series);
            const winner = detail.participants.find(
              (participant) =>
                participant.id === winnerId || (winnerAccountId !== null && participant.accountId === winnerAccountId),
            );
            return (
              <li key={match.id}>
                <span>{t("tournaments.pairings.table", { round: match.round, table: match.position + 1 })}</span>
                <span className="tournaments-match-players">
                  {names[0]} · {names[1]}
                </span>
                {series ? (
                  <span>
                    {series.wins0} - {series.wins1}
                  </span>
                ) : null}
                {live ? (
                  <Badge tone="danger">{t("tournaments.spectators.live")}</Badge>
                ) : (
                  <Badge>{t(matchStatusKey(match.status))}</Badge>
                )}
                {winner ? <strong>{t("tournaments.history.winner", { player: winner.displayName })}</strong> : null}
                {live && detail.id && detail.canSpectate && onWatchMatch ? (
                  <TournamentWatchButton
                    target={{ tournamentId: detail.id, matchId: match.id }}
                    players={`${names[0]} · ${names[1]}`}
                    onWatch={onWatchMatch}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
