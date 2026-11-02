import type { TournamentGameTicket } from "@aegis/shared/tournaments/TournamentGameTicket";
import { TournamentMatchActions } from "@/tournaments/TournamentMatchActions";
import { Alert, Badge, Panel, type BadgeTone } from "../design/primitives";
import { TournamentBotPortrait } from "@/tournaments/TournamentBotPortrait";
import { useTranslation } from "../i18n";
import { useCountdown } from "./hooks";
import { countdownLevelKey, pairingReasonKey, matchStateKey } from "./labels";
import type { ParticipantView, SeriesScoreView } from "@aegis/shared";
import type { LegacyTournamentMatch, TournamentDetail } from "./types";

/** The player's open bracket row, or undefined when they have none in this event. */
function findMyMatch(
  matches: readonly LegacyTournamentMatch[],
  accountId: string | undefined,
): LegacyTournamentMatch | undefined {
  if (!accountId) return undefined;
  const mine = matches.filter((match) => match.player0AccountId === accountId || match.player1AccountId === accountId);
  return mine.find((match) => match.status !== "finished" && match.status !== "bye") ?? mine[mine.length - 1];
}

export function MyMatchPanel({
  detail,
  accountId,
  series: providedSeries,
  onJoinGame,
  onChanged,
}: {
  detail: TournamentDetail;
  accountId: string | undefined;
  series?: SeriesScoreView;
  onJoinGame?: (ticket: TournamentGameTicket) => void;
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const match = findMyMatch(detail.matches, accountId);
  const series = providedSeries ?? detail.series?.find((row) => row.matchId === match?.id);
  const joinDeadlineAt = series?.joinDeadlineAt ?? null;
  const countdown = useCountdown(joinDeadlineAt);
  const winsRequired = detail.rules?.match.winsRequired ?? (detail.bestOf === 3 ? 2 : 1);

  if (!match) {
    return (
      <Panel className="tournaments-my-match">
        <h3>{t("tournaments.myMatch.title")}</h3>
        <p>{t("tournaments.myMatch.none")}</p>
      </Panel>
    );
  }

  const ownSeat = match.player0AccountId === accountId ? 0 : 1;
  const opponentSeat = ownSeat === 0 ? 1 : 0;
  const opponentAccountId = opponentSeat === 0 ? match.player0AccountId : match.player1AccountId;
  const opponentParticipantId = series?.participantIds?.[opponentSeat];
  const opponent = detail.participants.find(
    (participant) =>
      participant.id === opponentParticipantId ||
      (participant.accountId === opponentAccountId && opponentAccountId !== null),
  );
  const own = detail.participants.find((participant) => participant.accountId === accountId);
  const opponentName = getOpponentName({ match, opponent, opponentAccountId, t });
  const showActions = Boolean(onJoinGame) && match.status === "pending" && series?.status !== "resolved";

  return (
    <Panel className="tournaments-my-match">
      <div className="tournaments-my-match__head">
        <h3>{t("tournaments.myMatch.title")}</h3>
        <span className="tournaments-my-match__table">
          {t("tournaments.myMatch.roundTable", { round: match.round, table: match.position + 1 })}
        </span>
      </div>
      <div className="tournaments-versus">
        <div className="tournaments-versus__side" data-own>
          <span className="tournaments-versus__avatar" aria-hidden="true">
            {(own?.displayName ?? "?").slice(0, 1).toUpperCase()}
          </span>
          <span className="tournaments-versus__name">{own?.displayName ?? t("tournaments.myMatch.you")}</span>
          <Badge tone="primary">{t("tournaments.myMatch.you")}</Badge>
        </div>
        <span className="tournaments-versus__score">
          {series
            ? `${ownSeat === 0 ? series.wins0 : series.wins1} - ${ownSeat === 0 ? series.wins1 : series.wins0}`
            : "–"}
        </span>
        <div className="tournaments-versus__side" data-bot={opponent?.kind === "bot" || undefined}>
          {opponent?.kind === "bot" ? (
            <TournamentBotPortrait size="large" />
          ) : (
            <span className="tournaments-versus__avatar" aria-hidden="true">
              {opponentName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="tournaments-versus__name">{opponentName}</span>
          {opponent?.kind === "bot" ? <Badge>{t("tournaments.participant.bot")}</Badge> : null}
        </div>
      </div>
      <dl>
        {pairingReasonKey(series?.pairingReason) ? (
          <>
            <dt>{t("tournaments.myMatch.pairing")}</dt>
            <dd>
              <Badge tone="neutral">{t(pairingReasonKey(series?.pairingReason)!)}</Badge>
            </dd>
          </>
        ) : null}

        <dt>{t("tournaments.myMatch.presence")}</dt>
        <dd>{series ? t(matchStateKey(series.status)) : t("tournaments.myMatch.presencePending")}</dd>

        {series ? null : (
          <>
            <dt>{t("tournaments.myMatch.score")}</dt>
            <dd>{t("tournaments.myMatch.scorePending", { wins: winsRequired })}</dd>
          </>
        )}

        <dt>{t("tournaments.myMatch.joinDeadline")}</dt>
        <dd>
          <Badge tone={getCountdownTone(countdown.level)}>{t(countdownLevelKey(countdown.level))}</Badge>
          {joinDeadlineAt === null ? null : <span className="tournaments-my-match__clock">{countdown.text}</span>}
        </dd>
      </dl>
      {showActions && onJoinGame ? (
        <div className="tournaments-my-match__bar">
          <span className="tournaments-my-match__summary">
            {t("tournaments.myMatch.versus", { opponent: opponentName })}
          </span>
          <TournamentMatchActions
            key={match.id}
            tournamentId={detail.id}
            matchId={match.id}
            seriesId={series?.seriesId ?? null}
            onJoinGame={onJoinGame}
            onChanged={onChanged}
          />
        </div>
      ) : null}
      {!detail.series ? (
        <Alert tone="info" title={t("tournaments.myMatch.pendingTitle")}>
          {t("tournaments.myMatch.pendingBody")}
        </Alert>
      ) : null}
    </Panel>
  );
}

type OpponentNameParams = {
  match: LegacyTournamentMatch;
  opponent: ParticipantView | undefined;
  opponentAccountId: string | null;
  t: ReturnType<typeof useTranslation>["t"];
};

function getOpponentName({ match, opponent, opponentAccountId, t }: OpponentNameParams): string {
  if (match.status === "bye") {
    return t("tournaments.myMatch.bye");
  }
  return opponent?.displayName ?? opponentAccountId ?? t("tournaments.myMatch.opponentUnknown");
}

function getCountdownTone(level: ReturnType<typeof useCountdown>["level"]): BadgeTone {
  if (level === "expired" || level === "warning_1m") {
    return "danger";
  }
  if (level === "none") {
    return "neutral";
  }
  return "warning";
}
