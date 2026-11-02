import { useCallback, useState } from "react";
import { VALIDATED_FAMOUS_DECKS } from "@aegis/shared";
import type { MatchupJob } from "@aegis/shared/deckSimulation/MatchupJob";
import { MatchupJobStatus } from "@aegis/shared/deckSimulation/MatchupJobStatus";
import { COMMUNITY_MATCHUP_LIMITS } from "@aegis/shared/deckSimulation/COMMUNITY_MATCHUP_LIMITS";
import { MATCHUP_GAME_COUNTS } from "@aegis/shared/deckSimulation/MATCHUP_GAME_COUNTS";
import { AccountApiError } from "@/account/client";
import type { TranslationKey } from "@/i18n/translationTypes";
import { useTranslation } from "@/i18n/useTranslation";
import { expand, MAIN_TARGET, total, type CountMap } from "@/screens/deckCounts";
import { CommunityOpponentPicker } from "@/screens/deckSimulation/CommunityOpponentPicker";
import { matchupApi, type MatchupOpponentChoice } from "@/screens/deckSimulation/matchupApi";
import { MatchupOpponentTable } from "@/screens/deckSimulation/MatchupOpponentTable";
import { usePolling } from "@/tournaments/hooks";
import "@/screens/deckBuilder.css";

interface DeckMatchupProps {
  main: CountMap;
  egg: CountMap;
  format: string;
}

const MIRROR = "mirror";
const COMMUNITY = "community";
const POLL_MS = 1500;

function errorKey(error: unknown): TranslationKey {
  if (error instanceof AccountApiError) {
    if (error.status === 401) return "deckMatchup.error.signIn";
    if (error.status === 409) return "deckMatchup.error.inProgress";
    if (error.status === 400) return "deckMatchup.error.invalid";
    if (error.status === 429 || error.status === 503) return "deckMatchup.error.busy";
  }
  return "deckMatchup.error.failed";
}

function isFinished(job: MatchupJob): boolean {
  return Object.values(MatchupJobStatus).find((entry) => entry.value === job.status)?.isFinished ?? true;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

export function DeckMatchup({ main, egg, format }: DeckMatchupProps) {
  const { t } = useTranslation();
  const [opponent, setOpponent] = useState(MIRROR);
  const [singleGames, setSingleGames] = useState<number>(MATCHUP_GAME_COUNTS[1]);
  const [communityGames, setCommunityGames] = useState<number>(COMMUNITY_MATCHUP_LIMITS.gamesPerOpponent[0]);
  const [communityDeckIds, setCommunityDeckIds] = useState<string[]>([]);
  const community = opponent === COMMUNITY;
  const games = community ? communityGames : singleGames;
  const gameChoices: readonly number[] = community ? COMMUNITY_MATCHUP_LIMITS.gamesPerOpponent : MATCHUP_GAME_COUNTS;
  const [job, setJob] = useState<MatchupJob | undefined>();
  const [error, setError] = useState<TranslationKey | undefined>();
  const running = job !== undefined && !isFinished(job);
  const deckReady = total(main) === MAIN_TARGET;

  const jobId = job?.id;
  const refresh = useCallback(async () => {
    if (jobId === undefined) return;
    try {
      setJob(await matchupApi.get(jobId));
    } catch (failure) {
      setError(errorKey(failure));
      setJob(undefined);
    }
  }, [jobId]);
  usePolling(refresh, POLL_MS, running);

  const start = async () => {
    setError(undefined);
    const choice: MatchupOpponentChoice =
      opponent === MIRROR
        ? { mirror: true }
        : community
          ? { community: communityDeckIds.length === 0 ? {} : { deckIds: communityDeckIds } }
          : { famousDeckId: opponent };
    try {
      setJob(
        await matchupApi.start({
          deck: { mainDeck: expand(main), eggDeck: expand(egg) },
          opponent: choice,
          games,
          format,
        }),
      );
    } catch (failure) {
      setError(errorKey(failure));
    }
  };

  const cancel = async () => {
    if (jobId === undefined) return;
    try {
      setJob(await matchupApi.cancel(jobId));
    } catch (failure) {
      setError(errorKey(failure));
    }
  };

  return (
    <section className="deck-matchup" aria-label={t("deckMatchup.title")}>
      <div className="deck-stat-label">{t("deckMatchup.title")}</div>
      <div className="deck-draw-odds__controls">
        <select
          className="deck-draw-odds__picker"
          aria-label={t("deckMatchup.opponent")}
          value={opponent}
          disabled={running}
          onChange={(event) => setOpponent(event.target.value)}
        >
          <option value={MIRROR}>{t("deckMatchup.mirror")}</option>
          <option value={COMMUNITY}>{t("deckMatchup.community.option")}</option>
          {VALIDATED_FAMOUS_DECKS.map((deck) => (
            <option key={deck.deckId} value={deck.deckId}>
              {deck.name} · {deck.block}
            </option>
          ))}
        </select>
        <select
          className="deck-draw-odds__picker deck-matchup__games"
          aria-label={t("deckMatchup.games")}
          value={games}
          disabled={running}
          onChange={(event) => (community ? setCommunityGames : setSingleGames)(Number(event.target.value))}
        >
          {gameChoices.map((count) => (
            <option key={count} value={count}>
              {t(community ? "deckMatchup.gamesEach" : "deckMatchup.gameCount", { count })}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="deck-draw-odds__toggle"
          disabled={running || !deckReady}
          onClick={() => void start()}
        >
          {t("deckMatchup.run")}
        </button>
        {running ? (
          <button type="button" className="deck-draw-odds__toggle" onClick={() => void cancel()}>
            {t("deckMatchup.cancel")}
          </button>
        ) : null}
      </div>
      {community ? (
        <CommunityOpponentPicker selected={communityDeckIds} disabled={running} onChange={setCommunityDeckIds} />
      ) : null}
      {error === undefined ? null : (
        <p className="deck-draw-odds__hint" role="alert">
          {t(error)}
        </p>
      )}
      {job === undefined ? null : (
        <div className="deck-matchup__result" aria-live="polite">
          {job.status === MatchupJobStatus.QUEUED.value ? <p>{t("deckMatchup.queued")}</p> : null}
          {job.status === MatchupJobStatus.RUNNING.value ? (
            <p>{t("deckMatchup.running", { done: job.completedGames, total: job.requestedGames })}</p>
          ) : null}
          {job.score !== null && job.interval !== null ? (
            <>
              <p className="deck-matchup__score">
                {t("deckMatchup.score", { score: percent(job.score) })}
                <span>
                  {t("deckMatchup.interval", { low: percent(job.interval[0]), high: percent(job.interval[1]) })}
                </span>
              </p>
              <div
                className="deck-matchup__band"
                role="img"
                aria-label={t("deckMatchup.interval", {
                  low: percent(job.interval[0]),
                  high: percent(job.interval[1]),
                })}
              >
                <span
                  className="deck-matchup__band-range"
                  style={{ left: percent(job.interval[0]), width: percent(job.interval[1] - job.interval[0]) }}
                />
                <span className="deck-matchup__band-point" style={{ left: percent(job.score) }} />
              </div>
              <p>{t("deckMatchup.record", { wins: job.wins, losses: job.losses, draws: job.draws })}</p>
            </>
          ) : null}
          {job.invalidGames > 0 ? <p>{t("deckMatchup.invalid", { count: job.invalidGames })}</p> : null}
          {job.status === MatchupJobStatus.TIMED_OUT.value ? (
            <p>{t("deckMatchup.timedOut", { done: job.completedGames })}</p>
          ) : null}
          {job.status === MatchupJobStatus.FAILED.value ? <p>{t("deckMatchup.error.failed")}</p> : null}
          {job.status === MatchupJobStatus.CANCELLED.value ? (
            <p>{t("deckMatchup.cancelled", { done: job.completedGames })}</p>
          ) : null}
          {job.opponents.length > 1 ? <MatchupOpponentTable opponents={job.opponents} /> : null}
          {job.samples.length > 0 ? (
            <ul className="deck-draw-odds__sensitivity" aria-label={t("deckMatchup.samples")}>
              {job.samples.map((sample) => (
                <li key={sample.index}>
                  {t(job.opponents.length > 1 ? "deckMatchup.sampleAgainst" : "deckMatchup.sample", {
                    index: sample.index + 1,
                    opponent: job.opponents[sample.opponentIndex]?.name ?? "",
                    result: t(`deckMatchup.result.${sample.result}`),
                    turns: sample.turns,
                    order: t(sample.wentFirst ? "deckOdds.goingFirst" : "deckOdds.goingSecond"),
                  })}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
      <p className="deck-draw-odds__note">{t("deckMatchup.note")}</p>
    </section>
  );
}
