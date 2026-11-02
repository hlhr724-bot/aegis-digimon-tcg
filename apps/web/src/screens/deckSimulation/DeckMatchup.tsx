import { useCallback, useState } from "react";
import { VALIDATED_FAMOUS_DECKS } from "@aegis/shared";
import type { MatchupJob } from "@aegis/shared/deckSimulation/MatchupJob";
import { MatchupJobStatus } from "@aegis/shared/deckSimulation/MatchupJobStatus";
import { MATCHUP_GAME_COUNTS, type MatchupGameCount } from "@aegis/shared/deckSimulation/MATCHUP_GAME_COUNTS";
import { AccountApiError } from "@/account/client";
import type { TranslationKey } from "@/i18n/translationTypes";
import { useTranslation } from "@/i18n/useTranslation";
import { expand, MAIN_TARGET, total, type CountMap } from "@/screens/deckCounts";
import { matchupApi, type MatchupOpponentChoice } from "@/screens/deckSimulation/matchupApi";
import { usePolling } from "@/tournaments/hooks";
import "@/screens/deckBuilder.css";

interface DeckMatchupProps {
  main: CountMap;
  egg: CountMap;
  format: string;
}

const MIRROR = "mirror";
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
  const [games, setGames] = useState<MatchupGameCount>(MATCHUP_GAME_COUNTS[1]);
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
    const choice: MatchupOpponentChoice = opponent === MIRROR ? { mirror: true } : { famousDeckId: opponent };
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
          onChange={(event) => setGames(Number(event.target.value) as MatchupGameCount)}
        >
          {MATCHUP_GAME_COUNTS.map((count) => (
            <option key={count} value={count}>
              {t("deckMatchup.gameCount", { count })}
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
      </div>
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
          {job.samples.length > 0 ? (
            <ul className="deck-draw-odds__sensitivity" aria-label={t("deckMatchup.samples")}>
              {job.samples.map((sample) => (
                <li key={sample.index}>
                  {t("deckMatchup.sample", {
                    index: sample.index + 1,
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
