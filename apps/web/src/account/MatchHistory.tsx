import { ReplayDeckIcons } from "@/replays/ReplayDeckIcons";
import { DeckPerformanceCollection } from "@/account/DeckPerformanceCollection";
import { MatchOwnDeckAction } from "@/account/MatchOwnDeckAction";
import { DeckHistoryStats } from "@/account/DeckHistoryStats";
import { DeckStatsWindow } from "@aegis/shared/decks/DeckStatsWindow";
import { AddFriendButton } from "@/friends/AddFriendButton";
import type { DeckListing } from "@/game/decks";
import { MatchOpponentDeckAction } from "@/account/MatchOpponentDeckAction";
import { useEffect, useRef, useState } from "react";
import {
  MATCH_HISTORY_LIMIT,
  MATCH_MODES,
  MATCH_OPPONENT_SEARCH_MAX,
  MATCH_PAGE_SIZE,
  MATCH_RESULTS,
  type MatchHistoryEntry,
  type MatchHistoryFilter,
  type MatchHistoryPage,
  type MatchWinRate,
  type SavedReplay,
} from "@aegis/shared";
import { Avatar, Button } from "../design/primitives";
import { Icons } from "../design/icons";
import { useTranslation, type TranslationKey } from "../i18n";
import { ExportMatchHistory } from "@/account/ExportMatchHistory";
import { AccountApiError, accountApi } from "./client";
import { ReplaySharing } from "../replays/ReplaySharing";
import { replayApi, replayPath } from "../replays/library";
import { CloudAuthError, subscribeRegisteredReplays, useCloudReplays, withCloudSession } from "../replays/cloud";
import { driveViewLink } from "../replays/cloud/googleDrive";
import { OpenReplayFile } from "./OpenReplayFile";
import {
  localReplayFile,
  localReplaysByMatch,
  markLocalReplaySynced,
  subscribeLocalReplays,
  type LocalReplay,
} from "../replays/local";

type HistoryState = { kind: "loading" } | { kind: "failed" } | { kind: "ready"; page: MatchHistoryPage };
type Notice = { key: TranslationKey; alert: boolean };

const RESULT_LABELS: Record<(typeof MATCH_RESULTS)[number], TranslationKey> = {
  win: "profile.filter.win",
  loss: "profile.filter.loss",
  draw: "profile.filter.draw",
};
const SEARCH_DELAY_MS = 250;

/** The kept match history, a page at a time, with the replay actions for each saved match. */
export function MatchHistory({
  onOpenFile,
  opening,
  openError,
  onReplaysChange,
  onWinRateChange,
  onCopyDeck,
}: {
  onCopyDeck?: (deck: DeckListing) => void;
  onOpenFile: (file: Blob) => void;
  opening: boolean;
  openError?: TranslationKey;
  /** A replay was deleted, so the header totals are stale. */
  onReplaysChange?: () => void;
  onWinRateChange: (rate: MatchWinRate | undefined) => void;
}) {
  const { t } = useTranslation();
  const { provider } = useCloudReplays();
  const [filter, setFilter] = useState<MatchHistoryFilter>({});
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [history, setHistory] = useState<HistoryState>({ kind: "loading" });
  const [decks, setDecks] = useState<Array<{ id: string; name: string }>>([]);
  const [notice, setNotice] = useState<Notice>();
  const [trashOffer, setTrashOffer] = useState<SavedReplay>();
  const [busy, setBusy] = useState(false);
  const card = useRef<HTMLElement>(null);
  const pageChanged = useRef(false);
  const [onDevice, setOnDevice] = useState<Map<string, LocalReplay>>(new Map());

  useEffect(() => {
    const load = () => void localReplaysByMatch().then(setOnDevice);
    load();
    return subscribeLocalReplays(load);
  }, []);

  useEffect(() => {
    const opponent = search.trim() || undefined;
    if (opponent === filter.opponent) return;
    const timer = setTimeout(() => changeFilter({ ...filter, opponent }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search, filter]);

  useEffect(() => {
    let active = true;
    setHistory({ kind: "loading" });
    onWinRateChange(undefined);
    accountApi
      .matches({ page, limit: MATCH_PAGE_SIZE, ...filter })
      .then((next) => {
        if (!active) return;
        const lastPage = Math.max(1, Math.ceil(next.total / next.limit));
        if (page > lastPage) setPage(lastPage);
        else {
          setHistory({ kind: "ready", page: next });
          setDecks(next.decks ?? []);
          onWinRateChange(next.winRate);
        }
      })
      .catch(() => {
        if (active) setHistory({ kind: "failed" });
      });
    return () => {
      active = false;
    };
  }, [filter, page, reload, onWinRateChange]);

  useEffect(() => {
    if (!pageChanged.current) return;
    pageChanged.current = false;
    card.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [page]);

  function changeFilter(next: MatchHistoryFilter) {
    setFilter(next);
    setPage(1);
  }
  function clearFilters() {
    setSearch("");
    changeFilter({});
  }

  function goToPage(next: number) {
    pageChanged.current = true;
    setPage(next);
  }

  function replayRemoved(entry: MatchHistoryEntry, replay: SavedReplay) {
    setHistory((state) =>
      state.kind === "ready"
        ? {
            kind: "ready",
            page: {
              ...state.page,
              matches: state.page.matches.map((match) => (match.id === entry.id ? { ...match, replay: null } : match)),
            },
          }
        : state,
    );
    if (provider) setTrashOffer(replay);
    onReplaysChange?.();
  }

  function replayChanged(matchId: string, replay: SavedReplay) {
    setHistory((state) =>
      state.kind === "ready"
        ? {
            kind: "ready",
            page: {
              ...state.page,
              matches: state.page.matches.map((match) => (match.id === matchId ? { ...match, replay } : match)),
            },
          }
        : state,
    );
    onReplaysChange?.();
  }

  const onRegistered = useRef(replayChanged);
  onRegistered.current = replayChanged;
  useEffect(() => subscribeRegisteredReplays((replay) => onRegistered.current(replay.matchId, replay)), []);

  async function trash(replay: SavedReplay) {
    if (!provider) return;
    setBusy(true);
    setNotice(undefined);
    try {
      await withCloudSession(provider, () => provider.trash(replay.driveFileId));
      setTrashOffer(undefined);
      setNotice({ key: "replay.trashDone", alert: false });
    } catch (cause) {
      setNotice({
        key: cause instanceof CloudAuthError ? "replay.drive.authFailed" : "replay.trashFailed",
        alert: true,
      });
    } finally {
      setBusy(false);
    }
  }

  const ready = history.kind === "ready" ? history.page : undefined;
  const filtered = Boolean(filter.result || filter.mode || filter.opponent || filter.deckId || search.trim());
  const pages = ready ? Math.max(1, Math.ceil(ready.total / ready.limit)) : 1;
  const first = ready && ready.total ? (ready.page - 1) * ready.limit + 1 : 0;
  const last = ready ? first + ready.matches.length - (ready.matches.length ? 1 : 0) : 0;
  return (
    <section ref={card} className="profile-history" aria-labelledby="profile-history-title">
      <header className="profile-history__header">
        <h2 id="profile-history-title">{t("profile.matches")}</h2>
        {ready ? (
          <span className="profile-history__count">
            {t("profile.historyCount", { count: ready.total, limit: MATCH_HISTORY_LIMIT })}
          </span>
        ) : null}
        <OpenReplayFile onOpen={onOpenFile} opening={opening} />
        <ExportMatchHistory onError={() => setNotice({ key: "profile.exportHistoryFailed", alert: true })} />
        <div className="profile-filters">
          <select
            className="profile-filters__mode"
            aria-label={t("profile.filter.deck")}
            value={filter.deckId ?? ""}
            onChange={(event) => changeFilter({ ...filter, deckId: event.target.value || undefined })}
          >
            <option value="">{t("profile.filter.allDecks")}</option>
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
          <div className="profile-filter" role="group" aria-label={t("profile.filter.result")}>
            {([undefined, ...MATCH_RESULTS] as const).map((value) => (
              <button
                key={value ?? "all"}
                type="button"
                aria-pressed={filter.result === value}
                onClick={() => (filter.result === value ? undefined : changeFilter({ ...filter, result: value }))}
              >
                {t(value ? RESULT_LABELS[value] : "profile.filter.all")}
              </button>
            ))}
          </div>
          <select
            className="profile-filters__mode"
            aria-label={t("profile.filter.mode")}
            value={filter.mode ?? ""}
            onChange={(event) =>
              changeFilter({ ...filter, mode: (event.target.value || undefined) as MatchHistoryFilter["mode"] })
            }
          >
            <option value="">{t("profile.filter.allModes")}</option>
            {MATCH_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {t(`replay.mode.${mode}`)}
              </option>
            ))}
          </select>
          <label className="profile-filters__search">
            <Icons.Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={search}
              maxLength={MATCH_OPPONENT_SEARCH_MAX}
              aria-label={t("profile.filter.opponent")}
              placeholder={t("profile.filter.opponent")}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {filtered ? (
            <button type="button" className="profile-filters__clear" onClick={clearFilters}>
              {t("profile.filter.clear")}
            </button>
          ) : null}
        </div>
      </header>
      {!filter.deckId && ready?.deckRecords?.length ? (
        <DeckPerformanceCollection
          records={ready.deckRecords}
          statsWindow={filter.deckWindow ?? DeckStatsWindow.ALL.value}
          onWindowChange={(deckWindow) => changeFilter({ ...filter, deckWindow })}
          onSelect={(deckId) => changeFilter({ ...filter, deckId })}
        />
      ) : null}
      {ready?.deckStats ? (
        <DeckHistoryStats
          key={filter.deckId}
          stats={ready.deckStats}
          details={ready.deckDetails}
          recentResults={ready.recentDeckResults}
          deckName={decks.find((deck) => deck.id === filter.deckId)?.name}
          statsWindow={filter.deckWindow ?? DeckStatsWindow.ALL.value}
          onWindowChange={(deckWindow) => changeFilter({ ...filter, deckWindow })}
        />
      ) : null}
      {openError ? (
        <p className="profile-history__notice" role="alert">
          {t(openError)}
        </p>
      ) : null}
      {trashOffer ? (
        <div className="profile-history__notice profile-history__trash" role="status">
          <p>{t("replay.trashOffer")}</p>
          <Button
            size="sm"
            variant="secondary"
            icon={Icons.Trash}
            disabled={busy}
            onClick={() => void trash(trashOffer)}
          >
            {t("replay.trashConfirm")}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setTrashOffer(undefined)}>
            {t("replay.trashKeep")}
          </Button>
        </div>
      ) : null}
      {notice ? (
        <p className="profile-history__notice" role={notice.alert ? "alert" : "status"}>
          {t(notice.key)}
        </p>
      ) : null}
      {history.kind === "loading" ? (
        <p className="profile-history__state" role="status">
          {t("account.loading")}
        </p>
      ) : null}
      {history.kind === "failed" ? (
        <div className="profile-history__state" role="alert">
          <p>{t("profile.error")}</p>
          <Button size="sm" variant="secondary" onClick={() => setReload((value) => value + 1)}>
            {t("replay.retry")}
          </Button>
        </div>
      ) : null}
      {ready && !ready.matches.length ? (
        <div className="profile-history__state profile-history__empty">
          {filtered ? (
            <>
              <h3>{t("profile.emptyFiltered")}</h3>
              <button type="button" className="profile-filters__clear" onClick={clearFilters}>
                {t("profile.filter.clear")}
              </button>
            </>
          ) : (
            <>
              <h3>{t("profile.empty")}</h3>
              <p>{t("profile.saveHint")}</p>
              <a href="/play">{t("nav.play")}</a>
            </>
          )}
        </div>
      ) : null}
      {ready?.matches.length ? (
        <>
          <div className="profile-matches__head" aria-hidden="true">
            <span>{t("profile.column.result")}</span>
            <span>{t("profile.column.mode")}</span>
            <span>{t("profile.column.opponent")}</span>
            <span>{t("profile.filter.deck")}</span>
            <span>{t("profile.column.date")}</span>
            <span>{t("profile.column.replay")}</span>
          </div>
          <ol className="profile-matches">
            {ready.matches.map((match) => (
              <MatchRow
                key={match.id}
                match={match}
                onCopyDeck={onCopyDeck}
                local={onDevice.get(match.id)}
                sharing={ready.sharing || ready.friendsSharing === true}
                publicSharing={ready.sharing}
                onRemoved={(replay) => replayRemoved(match, replay)}
                onChanged={(replay) => replayChanged(match.id, replay)}
                onFailure={(key) => setNotice({ key, alert: true })}
              />
            ))}
          </ol>
          <footer className="profile-pagination">
            <span>{t("profile.pageRange", { from: first, to: last, total: ready.total })}</span>
            {pages > 1 ? (
              <nav aria-label={t("profile.pagination")}>
                <button type="button" disabled={ready.page <= 1} onClick={() => goToPage(ready.page - 1)}>
                  <Icons.ChevronLeft size={16} aria-hidden="true" />
                  {t("profile.previous")}
                </button>
                {Array.from({ length: pages }, (_, index) => index + 1).map((number) => (
                  <button
                    key={number}
                    type="button"
                    className="profile-pagination__number"
                    aria-label={t("profile.page", { page: number })}
                    aria-current={number === ready.page ? "page" : undefined}
                    onClick={() => (number === ready.page ? undefined : goToPage(number))}
                  >
                    {number}
                  </button>
                ))}
                <button type="button" disabled={ready.page >= pages} onClick={() => goToPage(ready.page + 1)}>
                  {t("profile.next")}
                  <Icons.ChevronRight size={16} aria-hidden="true" />
                </button>
              </nav>
            ) : null}
          </footer>
        </>
      ) : null}
    </section>
  );
}

function MatchRow({
  match,
  local,
  sharing,
  publicSharing,
  onRemoved,
  onChanged,
  onFailure,
  onCopyDeck,
}: {
  onCopyDeck?: (deck: DeckListing) => void;
  match: MatchHistoryEntry;
  /** This browser's copy, shown when the replay never reached Google Drive. */
  local?: LocalReplay;
  sharing: boolean;
  publicSharing?: boolean;
  onRemoved: (replay: SavedReplay) => void;
  onChanged: (replay: SavedReplay) => void;
  onFailure: (key: TranslationKey) => void;
}) {
  const { t, locale } = useTranslation();
  const finished = new Date(match.finishedAt);
  return (
    <li data-result={match.result} data-replay={match.replay || local ? "available" : "missing"}>
      <span className="profile-result" data-result={match.result}>
        {t(`account.result.${match.result}`)}
      </span>
      <span className="profile-matches__mode">{t(`replay.mode.${match.mode}`)}</span>
      <span className="profile-matches__opponent">
        <Avatar name={match.opponentName} avatarId={match.opponentAvatarId} size={32} />
        <span className="profile-matches__opponent-info">
          <strong>{match.opponentName}</strong>
          {match.hasOpponentDeck ? <MatchOpponentDeckAction matchId={match.id} onCopy={onCopyDeck} /> : null}
        </span>
        {match.canAddOpponent ? <AddFriendButton matchId={match.id} /> : null}
      </span>
      <span className="profile-matches__deck" aria-label={t("profile.filter.deck")} title={match.deckName}>
        {match.hasOwnDeck ? (
          <MatchOwnDeckAction matchId={match.id} deckName={match.deckName} onCopy={onCopyDeck} />
        ) : (
          (match.deckName ?? "—")
        )}
      </span>
      <time className="profile-matches__date" dateTime={finished.toISOString()}>
        {finished.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })}
        <span aria-hidden="true"> · </span>
        {finished.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
      </time>
      <div className="profile-matches__replay">
        {match.replay ? (
          <ReplayActions
            replay={match.replay}
            opponent={match.opponentName}
            sharing={sharing}
            publicSharing={publicSharing}
            onRemoved={onRemoved}
            onChanged={onChanged}
            onFailure={onFailure}
          />
        ) : local ? (
          <LocalReplayActions entry={local} opponent={match.opponentName} onSynced={onChanged} onFailure={onFailure} />
        ) : (
          <span className="profile-matches__missing">{t("profile.noReplay")}</span>
        )}
      </div>
    </li>
  );
}

function ReplayActions({
  replay,
  opponent,
  sharing,
  publicSharing,
  onRemoved,
  onChanged,
  onFailure,
}: {
  replay: SavedReplay;
  opponent: string;
  sharing: boolean;
  publicSharing?: boolean;
  onRemoved: (replay: SavedReplay) => void;
  onChanged: (replay: SavedReplay) => void;
  onFailure: (key: TranslationKey) => void;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menu.current?.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);

  async function remove() {
    setRemoving(true);
    try {
      await replayApi.remove(replay.id);
      onRemoved(replay);
    } catch (cause) {
      if (cause instanceof AccountApiError && cause.status === 404) onRemoved(replay);
      else onFailure("replay.libraryError");
    } finally {
      setRemoving(false);
      setConfirming(false);
    }
  }

  if (confirming)
    return (
      <div className="profile-matches__replay profile-matches__confirm">
        <span>{t("replay.deleteConfirm")}</span>
        <Button size="sm" variant="danger" disabled={removing} onClick={() => void remove()}>
          {t("replay.delete")}
        </Button>
        <Button size="sm" variant="ghost" disabled={removing} onClick={() => setConfirming(false)}>
          {t("replay.cancel")}
        </Button>
      </div>
    );
  return (
    <div className="profile-matches__replay">
      <ReplayDeckIcons summary={replay.summary} />
      <a
        className="aegis-button aegis-button--secondary aegis-button--sm profile-watch"
        href={replayPath(replay.id)}
        aria-label={`${t("replay.watchAction")}: ${opponent}`}
      >
        <Icons.Play size={14} aria-hidden="true" />
        {t("replay.watchAction")}
      </a>
      <div ref={menu} className="profile-replay-menu">
        <button
          type="button"
          className="aegis-icon-button"
          aria-label={t("profile.replayMenu")}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Icons.MoreHorizontal size={18} />
        </button>
        {/* Hidden instead of unmounted: the sharing dialog lives inside and must outlive the menu. */}
        <div className="profile-replay-menu__panel" hidden={!menuOpen} onClick={() => setMenuOpen(false)}>
          <a href={driveViewLink(replay.driveFileId)} target="_blank" rel="noreferrer">
            <Icons.ExternalLink size={16} aria-hidden="true" />
            {t("replay.drive.open")}
          </a>
          {sharing ? <ReplaySharing replay={replay} onChange={onChanged} publicSharing={publicSharing} /> : null}
          <button type="button" onClick={() => setConfirming(true)}>
            <Icons.Trash size={16} aria-hidden="true" />
            {t("profile.deleteReplay")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A replay kept only in this browser: it plays here and can still be synced to Google Drive. */
function LocalReplayActions({
  entry,
  opponent,
  onSynced,
  onFailure,
}: {
  entry: LocalReplay;
  opponent: string;
  onSynced: (replay: SavedReplay) => void;
  onFailure: (key: TranslationKey) => void;
}) {
  const { t } = useTranslation();
  const { provider } = useCloudReplays();
  const [syncing, setSyncing] = useState(false);
  const indexId = entry.indexId;

  async function sync() {
    if (!provider || !indexId) return;
    setSyncing(true);
    try {
      const file = localReplayFile(entry);
      const uploaded = await withCloudSession(provider, () => provider.upload(file));
      await markLocalReplaySynced(file, uploaded.id).catch(() => undefined);
      onSynced(await replayApi.registerDrive(indexId, uploaded.id));
    } catch (cause) {
      onFailure(cause instanceof CloudAuthError ? "replay.drive.authFailed" : "replay.drive.failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="profile-matches__replay">
      <ReplayDeckIcons summary={entry.summary} />
      <span className="profile-local-badge" title={t("replay.local.notSynced")}>
        <Icons.Devices size={14} aria-hidden="true" />
        {t("replay.local.badge")}
      </span>
      <a
        className="aegis-button aegis-button--secondary aegis-button--sm profile-watch"
        href={replayPath(entry.matchId)}
        aria-label={`${t("replay.watchAction")}: ${opponent}`}
      >
        <Icons.Play size={14} aria-hidden="true" />
        {t("replay.watchAction")}
      </a>
      {provider && indexId ? (
        <button
          type="button"
          className="aegis-icon-button"
          aria-label={t(syncing ? "replay.local.syncing" : "replay.local.sync")}
          title={t("replay.local.sync")}
          disabled={syncing}
          onClick={() => void sync()}
        >
          <Icons.Cloud size={18} />
        </button>
      ) : null}
    </div>
  );
}
