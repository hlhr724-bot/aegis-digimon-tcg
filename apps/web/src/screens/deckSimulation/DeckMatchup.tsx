import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { VALIDATED_FAMOUS_DECKS, type CommunityDeckSummary } from "@aegis/shared";
import type { MatchupJob, MatchupOpponentResult } from "@aegis/shared/deckSimulation/MatchupJob";
import { MatchupJobStatus } from "@aegis/shared/deckSimulation/MatchupJobStatus";
import { COMMUNITY_MATCHUP_LIMITS } from "@aegis/shared/deckSimulation/COMMUNITY_MATCHUP_LIMITS";
import { MATCHUP_GAME_COUNTS } from "@aegis/shared/deckSimulation/MATCHUP_GAME_COUNTS";
import { matchupDeckKey } from "@aegis/shared/deckSimulation/matchupDeckKey";
import type { SavedMatchupResult } from "@aegis/shared/deckSimulation/SavedMatchupResult";
import { AccountApiError } from "@/account/client";
import { Icons } from "@/design/icons";
import type { TranslationKey } from "@/i18n/translationTypes";
import { useTranslation } from "@/i18n/useTranslation";
import { ReplayViewer, useReplayFile } from "@/replays/ReplayViewer";
import { CommunityOpponentPicker } from "@/screens/deckSimulation/CommunityOpponentPicker";
import { famousDeckCoverCard } from "@/screens/deckSimulation/famousDeckCoverCard";
import { FamousOpponentPicker } from "@/screens/deckSimulation/FamousOpponentPicker";
import { matchupApi, type MatchupOpponentChoice } from "@/screens/deckSimulation/matchupApi";
import type { MatchupDeckArt } from "@/screens/deckSimulation/MatchupDeckArt";
import { MatchupOpponentSource } from "@/screens/deckSimulation/MatchupOpponentSource";
import { MatchupResults } from "@/screens/deckSimulation/MatchupResults";
import { usePolling } from "@/tournaments/hooks";
import "@/screens/deckBuilder.css";

interface DeckMatchupProps {
  deckId: string;
  mainDeck: readonly string[];
  eggDeck: readonly string[];
  format: string | undefined;
  art: MatchupDeckArt;
}

const POLL_MS = 1500;
const DEFAULT_FAMOUS_DECK = VALIDATED_FAMOUS_DECKS[0]?.deckId ?? "";
const SOURCES = Object.values(MatchupOpponentSource);

const REQUEST_ERRORS: Record<string, TranslationKey> = {
  invalid_deck: "deckMatchup.error.invalidDeck",
  invalid_opponent: "deckMatchup.error.invalidOpponent",
};

function errorKey(error: unknown): TranslationKey {
  if (error instanceof AccountApiError) {
    if (error.status === 401) return "deckMatchup.error.signIn";
    if (error.status === 409) return "deckMatchup.error.inProgress";
    if (error.status === 400) return REQUEST_ERRORS[error.code ?? ""] ?? "deckMatchup.error.failed";
    if (error.status === 429 || error.status === 503) return "deckMatchup.error.busy";
  }
  return "deckMatchup.error.failed";
}

function isFinished(job: MatchupJob): boolean {
  return Object.values(MatchupJobStatus).find((entry) => entry.value === job.status)?.isFinished ?? true;
}

type StartedOpponents = { source: MatchupOpponentSource; famousDeckId: string };

export function DeckMatchup({ deckId, mainDeck, eggDeck, format, art }: DeckMatchupProps) {
  const { t, locale } = useTranslation();
  const [source, setSource] = useState<MatchupOpponentSource>(MatchupOpponentSource.COMMUNITY.value);
  const [famousDeckId, setFamousDeckId] = useState(DEFAULT_FAMOUS_DECK);
  const [communityDeckIds, setCommunityDeckIds] = useState<string[]>([]);
  const [communityGames, setCommunityGames] = useState<number>(COMMUNITY_MATCHUP_LIMITS.gamesPerOpponent[0]);
  const [singleGames, setSingleGames] = useState<number>(MATCHUP_GAME_COUNTS[1]);
  const [seenCommunityDecks, setSeenCommunityDecks] = useState<ReadonlyMap<string, CommunityDeckSummary>>(new Map());
  const [started, setStarted] = useState<StartedOpponents | undefined>();
  const [job, setJob] = useState<MatchupJob | undefined>();
  const [error, setError] = useState<TranslationKey | undefined>();
  const [saved, setSaved] = useState<SavedMatchupResult | undefined>();
  const viewer = useReplayFile();
  const [replayFailed, setReplayFailed] = useState(false);
  const community = source === MatchupOpponentSource.COMMUNITY.value;
  const games = community ? communityGames : singleGames;
  const gameChoices: readonly number[] = community ? COMMUNITY_MATCHUP_LIMITS.gamesPerOpponent : MATCHUP_GAME_COUNTS;
  const running = job !== undefined && !isFinished(job);
  const opponentCount =
    communityDeckIds.length === 0 ? COMMUNITY_MATCHUP_LIMITS.defaultOpponents : communityDeckIds.length;

  const rememberCommunityDecks = useCallback((decks: readonly CommunityDeckSummary[]) => {
    setSeenCommunityDecks((current) => new Map([...current, ...decks.map((deck) => [deck.id, deck] as const)]));
  }, []);

  useEffect(() => {
    let active = true;
    matchupApi
      .latest(deckId)
      .then((result) => {
        if (active) setSaved(result);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [deckId]);

  const shownJob = job ?? saved?.job;
  const savedIsStale = saved !== undefined && saved.deckKey !== matchupDeckKey({ mainDeck, eggDeck });
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
      source === MatchupOpponentSource.MIRROR.value
        ? { mirror: true }
        : community
          ? { community: communityDeckIds.length === 0 ? {} : { deckIds: communityDeckIds } }
          : { famousDeckId };
    try {
      const created = await matchupApi.start({
        deck: { mainDeck: [...mainDeck], eggDeck: [...eggDeck] },
        opponent: choice,
        games,
        format,
        deckId,
      });
      setStarted({ source, famousDeckId });
      setJob(created);
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

  const watch = async (index: number) => {
    if (jobId === undefined) return;
    setReplayFailed(false);
    try {
      await viewer.open(await matchupApi.replayFile(jobId, index));
    } catch {
      setReplayFailed(true);
    }
  };

  const artFor = (opponent: MatchupOpponentResult): MatchupDeckArt => {
    if (opponent.coverCardId !== undefined || opponent.colors !== undefined) {
      return { coverCardId: opponent.coverCardId, color: opponent.colors?.[0] ?? "" };
    }
    const communityDeck =
      opponent.communityDeckId === undefined ? undefined : seenCommunityDecks.get(opponent.communityDeckId);
    if (communityDeck)
      return { coverCardId: communityDeck.coverCardId ?? undefined, color: communityDeck.colors[0] ?? "" };
    const famous =
      started?.source === MatchupOpponentSource.FAMOUS.value
        ? VALIDATED_FAMOUS_DECKS.find((deck) => deck.deckId === started.famousDeckId)
        : undefined;
    if (famous) return { coverCardId: famousDeckCoverCard(famous), color: famous.colors[0] ?? "" };
    return art;
  };

  return (
    <div className="deck-matchup">
      <section className="deck-matchup__step" aria-labelledby="deck-matchup-opponents">
        <h3 id="deck-matchup-opponents" className="deck-matchup__step-title">
          <span className="deck-matchup__step-number" aria-hidden="true">
            1
          </span>
          {t("deckMatchup.step.opponents")}
        </h3>
        <div className="deck-segmented deck-matchup__sources" role="group" aria-label={t("deckMatchup.sources")}>
          {SOURCES.map((entry) => (
            <button
              key={entry.value}
              type="button"
              aria-pressed={source === entry.value}
              disabled={running}
              onClick={() => setSource(entry.value)}
            >
              {t(`deckMatchup.source.${entry.value}`)}
            </button>
          ))}
        </div>
        {community ? (
          <CommunityOpponentPicker
            selected={communityDeckIds}
            disabled={running}
            onChange={setCommunityDeckIds}
            onDecksLoaded={rememberCommunityDecks}
          />
        ) : null}
        {source === MatchupOpponentSource.FAMOUS.value ? (
          <FamousOpponentPicker selected={famousDeckId} disabled={running} onChange={setFamousDeckId} />
        ) : null}
        {source === MatchupOpponentSource.MIRROR.value ? (
          <div className="deck-matchup__mirror">
            <Icons.Bot size={20} aria-hidden="true" />
            <div>
              <p className="deck-matchup__mirror-title">{t("deckMatchup.mirror.title")}</p>
              <p className="deck-sim__hint">{t("deckMatchup.mirror.body")}</p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="deck-matchup__step" aria-labelledby="deck-matchup-games">
        <h3 id="deck-matchup-games" className="deck-matchup__step-title">
          <span className="deck-matchup__step-number" aria-hidden="true">
            2
          </span>
          {t("deckMatchup.step.games")}
        </h3>
        <div className="deck-matchup__run">
          <div className="deck-segmented deck-matchup__games" role="group" aria-label={t("deckMatchup.step.games")}>
            {gameChoices.map((count) => (
              <button
                key={count}
                type="button"
                aria-pressed={games === count}
                disabled={running}
                onClick={() => (community ? setCommunityGames : setSingleGames)(count)}
              >
                {t(community ? "deckMatchup.gamesEach" : "deckMatchup.gameCount", { count })}
              </button>
            ))}
          </div>
          {running ? (
            <button type="button" className="deck-sim-button" onClick={() => void cancel()}>
              <Icons.X size={14} />
              {t("deckMatchup.cancel")}
            </button>
          ) : (
            <button type="button" className="deck-sim-button" data-variant="primary" onClick={() => void start()}>
              <Icons.Play size={14} />
              {t(shownJob === undefined ? "deckMatchup.run" : "deckMatchup.runAgain")}
            </button>
          )}
        </div>
        <p className="deck-sim__hint">
          {community ? `${t("deckMatchup.games.total", { total: games * opponentCount, count: games })} ` : ""}
          {t("deckMatchup.games.hint")}
        </p>
        {error === undefined ? null : (
          <p className="deck-sim__alert" role="alert">
            {t(error)}
          </p>
        )}
      </section>

      {shownJob === undefined ? null : (
        <section className="deck-matchup__step" aria-labelledby="deck-matchup-results">
          <h3 id="deck-matchup-results" className="deck-matchup__step-title">
            <span className="deck-matchup__step-number" aria-hidden="true">
              3
            </span>
            {t(job === undefined ? "deckMatchup.saved.title" : "deckMatchup.step.results")}
          </h3>
          {job === undefined && saved !== undefined ? (
            <div className="deck-matchup__saved">
              <p className="deck-sim__hint">
                {t("deckMatchup.saved.when", {
                  date: new Date(saved.savedAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }),
                })}
              </p>
              {savedIsStale ? (
                <p className="deck-sim__notice">
                  <Icons.CircleAlert size={14} />
                  {t("deckMatchup.saved.stale")}
                </p>
              ) : null}
            </div>
          ) : null}
          <MatchupResults
            job={shownJob}
            running={running}
            watchDisabled={viewer.loading}
            artFor={artFor}
            onWatch={(index) => void watch(index)}
          />
          {replayFailed || viewer.error !== undefined ? (
            <p className="deck-sim__alert" role="alert">
              {t("deckMatchup.replayUnavailable")}
            </p>
          ) : null}
        </section>
      )}

      <p className="deck-sim__note">{t("deckMatchup.note")}</p>
      {viewer.replay === undefined
        ? null
        : createPortal(
            <div className="deck-matchup__viewer" role="dialog" aria-modal="true" aria-label={t("deckMatchup.watch")}>
              <ReplayViewer replay={viewer.replay} onClose={viewer.close} />
            </div>,
            document.body,
          )}
    </div>
  );
}
