import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
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
import { SimulationSelect } from "@/screens/deckSimulation/SimulationSelect";
import { WinRateBand } from "@/screens/deckSimulation/WinRateBand";
import { Icons } from "@/design/icons";
import { ReplayViewer, useReplayFile } from "@/replays/ReplayViewer";
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
  const viewer = useReplayFile();
  const [replayFailed, setReplayFailed] = useState(false);
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

  const watch = async (index: number) => {
    if (jobId === undefined) return;
    setReplayFailed(false);
    try {
      await viewer.open(await matchupApi.replayFile(jobId, index));
    } catch {
      setReplayFailed(true);
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

  const finished = job !== undefined && isFinished(job);
  const progress = job === undefined || job.requestedGames === 0 ? 0 : job.completedGames / job.requestedGames;
  const notices: string[] =
    job === undefined
      ? []
      : [
          job.invalidGames > 0 ? t("deckMatchup.invalid", { count: job.invalidGames }) : undefined,
          job.status === MatchupJobStatus.TIMED_OUT.value
            ? t("deckMatchup.timedOut", { done: job.completedGames })
            : undefined,
          job.status === MatchupJobStatus.FAILED.value ? t("deckMatchup.error.failed") : undefined,
          job.status === MatchupJobStatus.CANCELLED.value
            ? t("deckMatchup.cancelled", { done: job.completedGames })
            : undefined,
        ].filter((notice): notice is string => notice !== undefined);

  return (
    <section className="deck-sim deck-matchup" aria-label={t("deckMatchup.title")}>
      <div className="deck-stat-label">{t("deckMatchup.title")}</div>
      <div className="deck-sim__controls">
        <SimulationSelect
          wrapperClassName="deck-sim__grow"
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
        </SimulationSelect>
        <SimulationSelect
          wrapperClassName="deck-matchup__games"
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
        </SimulationSelect>
        {running ? (
          <button type="button" className="deck-sim-button" onClick={() => void cancel()}>
            <Icons.X size={14} />
            {t("deckMatchup.cancel")}
          </button>
        ) : (
          <button
            type="button"
            className="deck-sim-button"
            data-variant="primary"
            disabled={!deckReady}
            onClick={() => void start()}
          >
            <Icons.Play size={14} />
            {t("deckMatchup.run")}
          </button>
        )}
      </div>
      {community ? (
        <CommunityOpponentPicker selected={communityDeckIds} disabled={running} onChange={setCommunityDeckIds} />
      ) : null}
      {error === undefined ? null : (
        <p className="deck-sim__alert" role="alert">
          {t(error)}
        </p>
      )}
      {job === undefined ? null : (
        <div className="deck-matchup__result" aria-live="polite">
          {running ? (
            <div className="deck-matchup__progress">
              <p>
                {job.status === MatchupJobStatus.QUEUED.value
                  ? t("deckMatchup.queued")
                  : t("deckMatchup.running", { done: job.completedGames, total: job.requestedGames })}
              </p>
              <div className="deck-matchup__progress-track" aria-hidden="true">
                <span style={{ width: percent(progress) }} />
              </div>
            </div>
          ) : null}
          {job.score !== null && job.interval !== null ? (
            <div className="deck-matchup__summary" data-final={finished}>
              <div className="deck-matchup__headline">
                <div
                  className="deck-matchup__score"
                  role="group"
                  aria-label={t("deckMatchup.score", { score: percent(job.score) })}
                >
                  <span className="deck-matchup__score-label">{t("deckMatchup.table.score")}</span>
                  <span className="deck-matchup__score-value">{percent(job.score)}</span>
                </div>
                <p className="deck-matchup__record">
                  {t("deckMatchup.record", { wins: job.wins, losses: job.losses, draws: job.draws })}
                </p>
              </div>
              <WinRateBand score={job.score} interval={job.interval} />
              <p className="deck-sim__hint">
                {t("deckMatchup.interval", { low: percent(job.interval[0]), high: percent(job.interval[1]) })}
              </p>
            </div>
          ) : null}
          {notices.map((notice) => (
            <p key={notice} className="deck-sim__notice">
              <Icons.CircleAlert size={14} />
              {notice}
            </p>
          ))}
          {job.opponents.length > 1 ? <MatchupOpponentTable opponents={job.opponents} /> : null}
          {job.samples.length > 0 ? (
            <div className="deck-matchup__samples">
              <div className="deck-sim__subhead">{t("deckMatchup.samples")}</div>
              <ul aria-label={t("deckMatchup.samples")}>
                {job.samples.map((sample) => (
                  <li key={sample.index} className="deck-matchup__sample">
                    <span className="deck-matchup__result-badge" data-result={sample.result}>
                      {t(`deckMatchup.result.${sample.result}`)}
                    </span>
                    <span className="deck-matchup__sample-text">
                      <span className="deck-matchup__sample-title">
                        {job.opponents.length > 1
                          ? t("deckMatchup.sampleTitleAgainst", {
                              index: sample.index + 1,
                              opponent: job.opponents[sample.opponentIndex]?.name ?? "",
                            })
                          : t("deckMatchup.sampleTitle", { index: sample.index + 1 })}
                      </span>
                      <span className="deck-matchup__sample-detail">
                        {t("deckMatchup.sampleDetail", {
                          turns: sample.turns,
                          order: t(sample.wentFirst ? "deckOdds.goingFirst" : "deckOdds.goingSecond"),
                        })}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="deck-sim-button"
                      data-size="small"
                      aria-label={t("deckMatchup.watchGame", { index: sample.index + 1 })}
                      disabled={viewer.loading}
                      onClick={() => void watch(sample.index)}
                    >
                      <Icons.PlayCircle size={14} />
                      {t("deckMatchup.watchShort")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
      {replayFailed || viewer.error !== undefined ? (
        <p className="deck-sim__alert" role="alert">
          {t("deckMatchup.replayUnavailable")}
        </p>
      ) : null}
      <p className="deck-sim__note">{t("deckMatchup.note")}</p>
      {viewer.replay === undefined
        ? null
        : createPortal(
            <div className="deck-matchup__viewer" role="dialog" aria-modal="true" aria-label={t("deckMatchup.watch")}>
              <ReplayViewer replay={viewer.replay} onClose={viewer.close} />
            </div>,
            document.body,
          )}
    </section>
  );
}
