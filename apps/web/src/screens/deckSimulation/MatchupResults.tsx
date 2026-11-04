import type { MatchupJob, MatchupOpponentResult } from "@aegis/shared/deckSimulation/MatchupJob";
import { MatchupJobStatus } from "@aegis/shared/deckSimulation/MatchupJobStatus";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import type { MatchupDeckArt } from "@/screens/deckSimulation/MatchupDeckArt";
import { MatchupOpponentList } from "@/screens/deckSimulation/MatchupOpponentList";
import { MatchupVerdict } from "@/screens/deckSimulation/MatchupVerdict";
import { verdictForInterval } from "@/screens/deckSimulation/verdictForInterval";
import { WinRateBand } from "@/screens/deckSimulation/WinRateBand";

interface MatchupResultsProps {
  job: MatchupJob;
  running: boolean;
  watchDisabled: boolean;
  artFor: (opponent: MatchupOpponentResult) => MatchupDeckArt;
  onWatch: (index: number) => void;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

export function MatchupResults({ job, running, watchDisabled, artFor, onWatch }: MatchupResultsProps) {
  const { t } = useTranslation();
  const progress = job.requestedGames === 0 ? 0 : job.completedGames / job.requestedGames;
  const verdict = job.interval === null ? undefined : verdictForInterval(job.interval);
  const notices = [
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
      {job.score !== null && job.interval !== null && verdict !== undefined ? (
        <div className="deck-matchup__summary" data-final={!running} data-verdict={verdict}>
          <div
            className="deck-matchup__score"
            role="group"
            aria-label={t("deckMatchup.score", { score: percent(job.score) })}
          >
            <span className="deck-matchup__score-value">{percent(job.score)}</span>
            <span className="deck-matchup__score-label">{t("deckMatchup.winRate")}</span>
          </div>
          <div className="deck-matchup__explain">
            <p className="deck-matchup__verdict">{t(`deckMatchup.verdict.${verdict}`)}</p>
            <p>{t("deckMatchup.record", { wins: job.wins, losses: job.losses, draws: job.draws })}</p>
            <WinRateBand score={job.score} interval={job.interval} />
            <p className="deck-sim__hint">
              {t("deckMatchup.interval", { low: percent(job.interval[0]), high: percent(job.interval[1]) })}
              {verdict === MatchupVerdict.CLOSE.value ? ` ${t("deckMatchup.closeAdvice")}` : ""}
            </p>
          </div>
        </div>
      ) : null}
      {notices.map((notice) => (
        <p key={notice} className="deck-sim__notice">
          <Icons.CircleAlert size={14} />
          {notice}
        </p>
      ))}
      {job.opponents.length > 1 ? <MatchupOpponentList opponents={job.opponents} artFor={artFor} /> : null}
      {job.samples.length > 0 ? (
        <section className="deck-matchup__samples" aria-labelledby="deck-matchup-samples-title">
          <h4 id="deck-matchup-samples-title" className="deck-sim__subhead">
            {t("deckMatchup.samples")}
          </h4>
          <p className="deck-sim__hint">{t("deckMatchup.samplesHint")}</p>
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
                  disabled={watchDisabled}
                  onClick={() => onWatch(sample.index)}
                >
                  <Icons.PlayCircle size={14} />
                  {t("deckMatchup.watchShort")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
