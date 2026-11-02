import type { ParticipantView, PhaseView, RoundView, SeriesScoreView } from "@aegis/shared";
import type { CSSProperties } from "react";
import { Badge } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { TournamentBotPortrait } from "@/tournaments/TournamentBotPortrait";
import { pairingReasonKey, topCutRoundKey } from "@/tournaments/labels";

type Params = {
  phase: PhaseView;
  participants: readonly ParticipantView[];
  accountId?: string;
};

type Seat = 0 | 1;

export function TournamentBracket({ phase, participants, accountId }: Params) {
  const { t } = useTranslation();
  const ownParticipantId = participants.find(
    (participant) => accountId !== undefined && participant.accountId === accountId,
  )?.id;
  const champion = findChampion({ phase, participants });

  function findSeatParticipant(match: SeriesScoreView, seat: Seat): ParticipantView | undefined {
    const reference = getSeatReference(match, seat);
    if (!reference) {
      return undefined;
    }
    return participants.find((participant) => participant.id === reference || participant.accountId === reference);
  }

  function isOwnMatch(match: SeriesScoreView): boolean {
    if (!ownParticipantId) {
      return false;
    }
    return ([0, 1] as const).some((seat) => findSeatParticipant(match, seat)?.id === ownParticipantId);
  }

  function renderSeat(match: SeriesScoreView, seat: Seat) {
    const participant = findSeatParticipant(match, seat);
    const reference = getSeatReference(match, seat);
    const isBot = participant?.kind === "bot";
    const isOwn = participant !== undefined && participant.id === ownParticipantId;
    const name = participant?.displayName ?? reference ?? t("tournaments.topCut.emptySeat");
    return (
      <div className="tournaments-tree__seat" data-empty={!reference || undefined} data-bot={isBot || undefined}>
        {isBot ? (
          <TournamentBotPortrait size="small" />
        ) : (
          <span className="tournaments-tree__avatar" aria-hidden="true">
            {getSeatMark({ reference, name })}
          </span>
        )}
        <span
          className={
            isWinner(match, seat)
              ? "tournaments-bracket__seat tournaments-bracket__seat--winner"
              : "tournaments-bracket__seat"
          }
        >
          {name}
        </span>
        {isOwn ? <Badge tone="primary">{t("tournaments.myMatch.you")}</Badge> : null}
        {isBot ? <Badge>{t("tournaments.participant.bot")}</Badge> : null}
        <span className="tournaments-tree__wins">{seat === 0 ? match.wins0 : match.wins1}</span>
      </div>
    );
  }

  return (
    <div className="tournaments-tree" style={{ "--tree-rounds": phase.rounds.length + 1 } as CSSProperties}>
      <ol className="tournaments-tree__rounds">
        {phase.rounds.map((round, roundIndex) => (
          <li
            key={round.number}
            className="tournaments-bracket__round tournaments-tree__round"
            data-first={roundIndex === 0 || undefined}
          >
            <h4>{t(topCutRoundKey(round.number, phase.plannedRounds), { round: round.number })}</h4>
            <div className="tournaments-tree__slots">
              {groupInPairs(round.matches).map((pair) => (
                <ul
                  key={pair[0]!.matchId}
                  className="tournaments-tree__pair"
                  data-joined={pair.length === 2 || undefined}
                >
                  {pair.map((match) => (
                    <li
                      key={match.matchId}
                      className="tournaments-bracket__match"
                      data-mine={isOwnMatch(match) || undefined}
                    >
                      <div className="tournaments-tree__card">
                        {renderSeat(match, 0)}
                        {renderSeat(match, 1)}
                        {isFinalRound({ round, phase }) && match.seriesDeadlineAt === null ? (
                          <Badge tone="warning">{t("tournaments.topCut.untimed")}</Badge>
                        ) : null}
                        {pairingReasonKey(match.pairingReason) ? (
                          <Badge tone="neutral">{t(pairingReasonKey(match.pairingReason)!)}</Badge>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          </li>
        ))}
        <li className="tournaments-tree__round tournaments-tree__round--champion">
          <h4>{t("tournaments.bracket.champion")}</h4>
          <div className="tournaments-tree__slots">
            <div className="tournaments-tree__champion" data-decided={champion ? true : undefined}>
              <span aria-hidden="true">
                <Icons.Trophy size={22} />
              </span>
              <span>{champion?.displayName ?? t("tournaments.topCut.emptySeat")}</span>
            </div>
          </div>
        </li>
      </ol>
    </div>
  );
}

function getSeatReference(match: SeriesScoreView, seat: Seat): string | null {
  return match.participantIds?.[seat] ?? (seat === 0 ? match.participant0Id : match.participant1Id);
}

function isWinner(match: SeriesScoreView, seat: Seat): boolean {
  if (match.winnerSeat !== undefined && match.winnerSeat !== null) {
    return match.winnerSeat === seat;
  }
  const reference = seat === 0 ? match.participant0Id : match.participant1Id;
  return match.winnerParticipantId !== null && match.winnerParticipantId === reference;
}

function isFinalRound({ round, phase }: { round: RoundView; phase: PhaseView }): boolean {
  return phase.plannedRounds !== null && round.number >= phase.plannedRounds;
}

function groupInPairs(matches: readonly SeriesScoreView[]): SeriesScoreView[][] {
  const pairs: SeriesScoreView[][] = [];
  for (let index = 0; index < matches.length; index += 2) {
    pairs.push(matches.slice(index, index + 2));
  }
  return pairs;
}

function getSeatMark({ reference, name }: { reference: string | null; name: string }): string {
  if (!reference) {
    return "?";
  }
  return name.slice(0, 1).toUpperCase();
}

function findChampion({
  phase,
  participants,
}: {
  phase: PhaseView;
  participants: readonly ParticipantView[];
}): ParticipantView | undefined {
  const finalRound = phase.rounds.at(-1);
  if (!finalRound || !isFinalRound({ round: finalRound, phase }) || finalRound.matches.length !== 1) {
    return undefined;
  }
  const final = finalRound.matches[0]!;
  const winningSeat = ([0, 1] as const).find((seat) => isWinner(final, seat));
  if (winningSeat === undefined) {
    return undefined;
  }
  const reference = getSeatReference(final, winningSeat);
  return participants.find((participant) => participant.id === reference || participant.accountId === reference);
}
