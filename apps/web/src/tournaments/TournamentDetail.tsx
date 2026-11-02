import { TournamentRuntimeControls } from "@/tournaments/TournamentRuntimeControls";
import type { TournamentCategory } from "@aegis/shared/tournaments/TournamentCategory";
import { TournamentCategoryBadge } from "@/tournaments/TournamentCategoryBadge";
import { TournamentCategorySwitch } from "@/tournaments/TournamentCategorySwitch";
import { isCheckInOpen } from "@/tournaments/isCheckInOpen";
import { serverNow } from "@/tournaments/serverClock";
import { TournamentMatchHistory } from "@/tournaments/TournamentMatchHistory";
import { deckFormatLabel } from "@/screens/deckFormatLabel";
import type { TournamentGameTicket } from "@aegis/shared/tournaments/TournamentGameTicket";
import { TournamentPairingControls } from "@/tournaments/TournamentPairingControls";
import { TournamentSpectatingPanel } from "@/tournaments/TournamentSpectatingPanel";
import { TournamentSpectatorControls } from "@/tournaments/TournamentSpectatorControls";
import type { TournamentSpectateTarget } from "@/tournaments/TournamentSpectateTarget";
import { TournamentDiscordSwitch } from "@/tournaments/TournamentDiscordSwitch";
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { Icons } from "@/design/icons";
import type { TranslationKey } from "@/i18n/translationTypes";
import { pathForRoute } from "@/routes";
import { getTournamentBracketSpectating } from "@/tournaments/getTournamentBracketSpectating";
import { TournamentBracket } from "@/tournaments/TournamentBracket";
import { TournamentBotPortrait } from "@/tournaments/TournamentBotPortrait";
import { TournamentTab } from "@/tournaments/TournamentTab";
import { TournamentReportButton } from "@/tournaments/TournamentReportButton";
import { TournamentCopyLinkButton } from "@/tournaments/TournamentCopyLinkButton";
import { TournamentCrumb } from "@/tournaments/TournamentCrumb";
import { TournamentScheduleTimeline } from "@/tournaments/TournamentScheduleTimeline";
import { isTournamentClosed } from "@/tournaments/isTournamentClosed";
import { Alert, Badge, Button, Panel } from "../design/primitives";
import type { DeckListing } from "../game/decks";
import { useTranslation } from "../i18n";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { tournamentApi, type ApiError } from "./client";
import { entryActions } from "./entry";
import { describeTournamentError } from "@/tournaments/describeTournamentError";
import { getTournamentEntryView } from "@/tournaments/getTournamentEntryView";
import { TournamentActionError } from "@/tournaments/TournamentActionError";
import { TournamentEntryCard } from "@/tournaments/TournamentEntryCard";
import { TournamentEntryProgress } from "@/tournaments/TournamentEntryProgress";
import { TournamentEntrySummary } from "@/tournaments/TournamentEntrySummary";
import { TournamentEntryView } from "@/tournaments/TournamentEntryView";
import { TournamentSignupFlow } from "@/tournaments/TournamentSignupFlow";
import { ownParticipant } from "@/tournaments/ownParticipant";
import { TournamentCloseCheckIn } from "@/tournaments/TournamentCloseCheckIn";
import { usePolledRequest } from "./hooks";
import { banlistModeKey, participantStatusKey, restrictionKey, statusKey, structureKey, windowKey } from "./labels";
import { MyMatchPanel } from "./MyMatchPanel";
import { TopCutBracket } from "./TopCutBracket";
import type { TournamentDetail as TournamentDetailPayload, TournamentWindows } from "./types";

const DETAIL_POLL_MS = 5_000;

export function TournamentDetail({
  onDecks = () => undefined,
  id,
  accountId,
  accountIsAdmin = false,
  decks,
  onBack,
  onJoinGame,
  onWatchMatch,
  onMyTournaments,
  tab: requestedTabProp,
  onTabChange,
}: {
  id: string;
  tab?: TournamentTab;
  onTabChange?: (tab: TournamentTab) => void;
  accountId: string | undefined;
  accountDisplayName?: string;
  accountIsAdmin?: boolean;
  decks: readonly DeckListing[];
  onBack: () => void;
  onDecks?: () => void;
  onJoinGame?: (ticket: TournamentGameTicket) => void;
  onWatchMatch?: (target: TournamentSpectateTarget) => void;
  onMyTournaments?: () => void;
}) {
  const { t } = useTranslation();
  const getCardName = useTranslatedCardName();
  const [detail, setDetail] = useState<TournamentDetailPayload>();
  const [loadError, setLoadError] = useState<ApiError>();
  const [actionError, setActionError] = useState<ApiError>();
  const [busy, setBusy] = useState(false);
  const [signingUp, setSigningUp] = useState(false);
  const [localTab, setLocalTab] = useState<TournamentTab>(TournamentTab.OVERVIEW.value);
  const requestedTab = requestedTabProp ?? (onTabChange ? TournamentTab.OVERVIEW.value : localTab);

  const load = useCallback((signal: AbortSignal) => tournamentApi.detail(id, signal), [id]);
  const apply = useCallback((result: Awaited<ReturnType<typeof tournamentApi.detail>>) => {
    if (result.ok) {
      setDetail(result.value);
      setLoadError(undefined);
    } else setLoadError(result.error);
  }, []);
  const { refresh } = usePolledRequest(load, apply, DETAIL_POLL_MS);

  useEffect(() => {
    setSigningUp(false);
  }, [id]);

  const finishSignUp = useCallback(async () => {
    await refresh();
    setSigningUp(false);
  }, [refresh]);

  const run = async (action: () => Promise<{ ok: boolean; error?: ApiError }>) => {
    setBusy(true);
    setActionError(undefined);
    const result = await action();
    setBusy(false);
    if (!result.ok && result.error) setActionError(result.error);
    void refresh();
  };

  if (loadError && !detail) {
    return (
      <Panel className="tournaments-detail">
        <Alert tone="danger" title={t("tournaments.error.load")}>
          {describeTournamentError({ error: loadError, t })}
        </Alert>
        <Button variant="secondary" onClick={onBack}>
          {t("tournaments.back")}
        </Button>
      </Panel>
    );
  }
  if (!detail)
    return (
      <Panel className="tournaments-detail">
        <p role="status">{t("common.loading")}</p>
      </Panel>
    );

  const isOrganizer = accountId !== undefined && detail.createdBy === accountId;
  const canOrganize = isOrganizer || accountIsAdmin;
  const own = ownParticipant({ participants: detail.participants, accountId });
  const isActiveParticipant = own !== undefined && own.status !== "dropped" && own.status !== "disqualified";
  const actions = entryActions({ detail, own, signedIn: accountId !== undefined });
  const banlistLabel =
    detail.banlistPolicy.mode === "as_of_set"
      ? t("tournaments.banlist.asOfSet", { set: detail.banlistPolicy.setId })
      : t(banlistModeKey(detail.banlistPolicy));
  const isElimination = detail.structure === "single_elimination";
  const eliminationPhase = detail.phases?.find((phase) => phase.kind === "single_elimination");
  const visibleTabs = Object.values(TournamentTab).filter((entry) => !entry.organizerOnly || canOrganize);
  const activeTab = visibleTabs.some((entry) => entry.value === requestedTab)
    ? requestedTab
    : TournamentTab.OVERVIEW.value;
  const botCount = detail.participants.filter((participant) => participant.kind === "bot").length;

  function selectTab(event: MouseEvent<HTMLAnchorElement>, tab: TournamentTab) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    if (onTabChange) {
      onTabChange(tab);
      return;
    }
    setLocalTab(tab);
  }

  const bracketPanel = eliminationPhase ? (
    <Panel className="tournaments-bracket">
      <h3>{t("tournaments.bracket.title")}</h3>
      <TournamentBracket
        phase={eliminationPhase}
        participants={detail.participants}
        accountId={accountId}
        spectating={getTournamentBracketSpectating({ detail, onWatchMatch })}
      />
    </Panel>
  ) : null;

  const formatPanel = (
    <Panel>
      <h3>{t("tournaments.detail.format")}</h3>
      <dl>
        <dt>{t("tournaments.create.structure")}</dt>
        <dd>{t(structureKey(detail.structure))}</dd>
        <dt>{t("tournaments.detail.cardPool")}</dt>
        <dd>{deckFormatLabel(detail.format ?? "standard", t)}</dd>
        <dt>{t("tournaments.create.bestOf")}</dt>
        <dd>{t("tournaments.bestOf", { count: detail.bestOf })}</dd>
        <dt>{t("tournaments.create.banlist")}</dt>
        <dd>{banlistLabel}</dd>
      </dl>
      <div className="tournaments-badges">
        {detail.topCutEnabled ? <Badge tone="success">{t("tournaments.badge.topCut")}</Badge> : null}
        {detail.allowBots ? <Badge tone="warning">{t("tournaments.badge.bots")}</Badge> : null}
      </div>
    </Panel>
  );

  const schedulePanel = (
    <Panel>
      <h3>{t("tournaments.detail.schedule")}</h3>
      <TournamentScheduleTimeline startsAt={detail.startsAt} windows={detail.windows} />
      <dl className="tournaments-detail__kv">
        <dt>{t("tournaments.slotsLabel")}</dt>
        <dd>{t("tournaments.slots", { registered: detail.registeredCount, max: detail.maxPlayers })}</dd>
        {botCount > 0 ? (
          <>
            <dt>{t("tournaments.detail.participants")}</dt>
            <dd>
              {t("tournaments.detail.field", {
                humans: detail.participants.length - botCount,
                bots: botCount,
              })}
            </dd>
          </>
        ) : null}
      </dl>
      {(detail.status === "draft" || detail.status === "registration" || detail.status === "check_in") &&
      (detail.windows?.checkInOpensAt ?? null) === null ? (
        <p className="tournaments-note">{t("tournaments.detail.windowsPending")}</p>
      ) : null}
    </Panel>
  );

  const entryView = getTournamentEntryView({
    signedIn: accountId !== undefined,
    signingUp,
    actions,
    checkInOpen: isCheckInOpen({ status: detail.status, windows: detail.windows, now: serverNow() }),
    tournamentStatus: detail.status,
    entryStatus: own?.status ?? detail.myEntry?.status,
  });
  const actionAlert = actionError ? <TournamentActionError error={actionError} /> : null;
  const checkIn = () => void run(() => tournamentApi.checkIn(detail.id));
  const drop = () => void run(() => tournamentApi.drop(detail.id));

  const entryPanel =
    entryView.showsProgress || entryView.value === TournamentEntryView.SIGNUP.value ? (
      <TournamentEntrySummary detail={detail} own={own} />
    ) : (
      <TournamentEntryCard
        detail={detail}
        own={own}
        view={entryView}
        actions={actions}
        decks={decks}
        busy={busy}
        error={actionAlert}
        onSignUp={() => {
          setActionError(undefined);
          setSigningUp(true);
        }}
        onDrop={drop}
        onDeckChanged={refresh}
        onDecks={onDecks}
      />
    );

  const entryProgress = entryView.showsProgress ? (
    <TournamentEntryProgress
      detail={detail}
      view={entryView}
      decks={decks}
      busy={busy}
      canDrop={actions.drop}
      canChangeDeck={own?.status === "registered" || own?.status === "checked_in"}
      error={actionAlert}
      onCheckIn={checkIn}
      onDrop={drop}
      onDeckChanged={refresh}
      onDecks={onDecks}
      onMyTournaments={onMyTournaments}
    />
  ) : null;

  const playersPanel = (
    <Panel>
      <h3>{t("tournaments.detail.participants")}</h3>
      {detail.participants.length === 0 ? (
        <p>{t("tournaments.detail.noParticipants")}</p>
      ) : (
        <ul className="tournaments-participants">
          {detail.participants.map((participant) => (
            <li key={participant.id} data-bot={participant.kind === "bot" || undefined}>
              {participant.kind === "bot" ? (
                <TournamentBotPortrait size="small" />
              ) : (
                <span className="tournaments-participants__avatar" aria-hidden="true">
                  {participant.displayName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span>{participant.displayName}</span>
              {participant.kind === "bot" ? <Badge tone="warning">{t("tournaments.participant.bot")}</Badge> : null}
              {participant.botStyle ? (
                <Badge>{t(`tournaments.botStyle.${participant.botStyle}` as TranslationKey)}</Badge>
              ) : null}
              <Badge>{t(participantStatusKey(participant.status))}</Badge>
              {participant.seed !== null ? <span className="tournaments-seed">#{participant.seed}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );

  const banlistPanel = (
    <Panel>
      <h3>{t("tournaments.detail.banlist")}</h3>
      {detail.banlistPolicy.mode === "none" ? (
        <p>{t("tournaments.detail.banlistNone")}</p>
      ) : detail.banlistCards.length === 0 ? (
        <p>{t("tournaments.detail.banlistEmpty")}</p>
      ) : (
        <ul className="tournaments-banlist">
          {detail.banlistCards.map((card) => (
            <li key={card.cardId}>
              <span className="tournaments-banlist__name">{getCardName(card.cardId)}</span>
              <span className="tournaments-banlist__id">{card.cardId}</span>
              <Badge tone={card.status === "banned" ? "danger" : "warning"}>{t(restrictionKey(card.status))}</Badge>
              <span className="tournaments-banlist__copies">
                {t("tournaments.detail.copies", { count: card.allowedCopies })}
              </span>
              {card.pairPartnerIds?.length ? (
                <span className="tournaments-banlist__pair">
                  {t("tournaments.detail.pairWith", { cards: card.pairPartnerIds.map(getCardName).join(", ") })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );

  const standingsPanel = (
    <Panel>
      <h3>{t("tournaments.detail.standings")}</h3>
      {detail.standings?.length ? (
        <ol className="tournaments-standings">
          {detail.standings.map((row) => (
            <li key={row.participantId}>
              <span>#{row.rank}</span>
              <span>
                {detail.participants.find((p) => p.id === row.participantId)?.displayName ?? row.participantId}
              </span>
              <span>{t("tournaments.detail.points", { points: row.points })}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p>{t("tournaments.detail.standingsPending")}</p>
      )}
    </Panel>
  );

  return (
    <div className="tournaments-detail">
      <header className="tournaments-detail__head">
        <TournamentCrumb onBack={onBack} />
        <div className="tournaments-detail__title-row">
          <div className="tournaments-detail__title">
            <h1>{detail.name}</h1>
            <Badge tone={isTournamentClosed(detail) ? "neutral" : "success"}>{t(statusKey(detail.status))}</Badge>
          </div>
          <div className="tournaments-detail__head-actions">
            <TournamentCopyLinkButton tournamentId={detail.id} />
            {detail.discordUrl ? (
              <a
                className="aegis-button aegis-button--secondary aegis-button--sm"
                href={detail.discordUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icons.Discord size={16} aria-hidden="true" />
                {t("tournaments.detail.openDiscord")}
              </a>
            ) : null}
            <TournamentReportButton
              tournamentId={detail.id}
              tournamentName={detail.name}
              organizerId={detail.createdBy}
              accountId={accountId}
            />
          </div>
        </div>
        <div className="tournaments-detail__facts">
          <TournamentCategoryBadge category={detail.category} />
          <span>
            <Icons.Calendar size={14} aria-hidden="true" />
            {formatStart(detail.startsAt)}
          </span>
          <span>
            <Icons.LayoutGrid size={14} aria-hidden="true" />
            {t(structureKey(detail.structure))}
            {detail.topCutEnabled ? ` + ${t("tournaments.badge.topCut")}` : ""}
          </span>
          <span>
            <Icons.Swords size={14} aria-hidden="true" />
            {t("tournaments.bestOf", { count: detail.bestOf })}
          </span>
          <span>
            <Icons.Users size={14} aria-hidden="true" />
            {t("tournaments.slots", { registered: detail.registeredCount, max: detail.maxPlayers })}
          </span>
        </div>
        {detail.description ? <p className="tournaments-description">{detail.description}</p> : null}
      </header>

      <nav className="tournaments-detail__tabs" aria-label={t("tournaments.tabs.label")}>
        {visibleTabs.map((entry) => (
          <a
            key={entry.value}
            href={pathForRoute({
              screen: "tournaments",
              tournament: { kind: "detail", id: detail.id, tab: entry.value },
            })}
            aria-current={entry.value === activeTab ? "page" : undefined}
            onClick={(event) => selectTab(event, entry.value)}
          >
            {t(getTabLabelKey({ tab: entry.value, isElimination }))}
          </a>
        ))}
      </nav>

      {activeTab === TournamentTab.OVERVIEW.value ? (
        <div
          className="tournaments-detail__layout"
          data-entry-first={
            entryView.value === TournamentEntryView.OPEN.value ||
            entryView.value === TournamentEntryView.SIGNED_OUT.value ||
            undefined
          }
        >
          <div className="tournaments-detail__main">
            {entryView.value === TournamentEntryView.SIGNUP.value ? (
              <TournamentSignupFlow
                key={detail.id}
                detail={detail}
                decks={decks}
                onDecks={onDecks}
                onCancel={() => setSigningUp(false)}
                onRegistered={finishSignUp}
              />
            ) : (
              <>
                {entryProgress}
                <MyMatchPanel detail={detail} accountId={accountId} onJoinGame={onJoinGame} onChanged={refresh} />
                {isElimination ? bracketPanel : <TournamentMatchHistory detail={detail} onWatchMatch={onWatchMatch} />}
                {isElimination ? null : (
                  <TopCutBracket detail={detail} accountId={accountId} onWatchMatch={onWatchMatch} />
                )}
              </>
            )}
          </div>
          <aside className="tournaments-detail__rail">
            {entryPanel}
            {schedulePanel}
            <TournamentSpectatingPanel detail={detail} isActiveParticipant={isActiveParticipant} />
            {formatPanel}
          </aside>
        </div>
      ) : null}

      {activeTab === TournamentTab.BRACKET.value ? (
        <div className="tournaments-detail__stack">
          {isElimination ? bracketPanel : null}
          {isElimination ? null : <TopCutBracket detail={detail} accountId={accountId} onWatchMatch={onWatchMatch} />}
          <TournamentMatchHistory detail={detail} onWatchMatch={onWatchMatch} />
          {isElimination ? null : standingsPanel}
        </div>
      ) : null}

      {activeTab === TournamentTab.PLAYERS.value ? (
        <div className="tournaments-detail__stack">{playersPanel}</div>
      ) : null}

      {activeTab === TournamentTab.RULES.value ? (
        <div className="tournaments-detail__layout">
          <div className="tournaments-detail__main">{banlistPanel}</div>
          <aside className="tournaments-detail__rail">{formatPanel}</aside>
        </div>
      ) : null}

      {activeTab === TournamentTab.ORGANIZE.value ? (
        <div className="tournaments-detail__stack">
          <TournamentRuntimeControls detail={detail} onChanged={refresh} />
          <OrganizerControls
            id={detail.id}
            status={detail.status}
            canManage={isOrganizer}
            isAdmin={accountIsAdmin}
            discordAnnounce={detail.discordAnnounce === true}
            category={detail.category}
            checkInOpen={isCheckInOpen({ status: detail.status, windows: detail.windows, now: serverNow() })}
            structure={detail.structure}
            allowBots={detail.allowBots}
            checkedIn={detail.participants.filter((participant) => participant.status === "checked_in").length}
            waiting={detail.participants.filter((participant) => participant.status === "registered").length}
            onChanged={refresh}
            onDeleted={onBack}
          />
          {isOrganizer && detail.status === "running" ? (
            <TournamentPairingControls detail={detail} onChanged={refresh} />
          ) : null}
          {canOrganize && detail.status !== "finished" && detail.status !== "cancelled" ? (
            <TournamentSpectatorControls id={detail.id} onChanged={refresh} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatStart(startsAt: number): string {
  return new Date(startsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function getTabLabelKey({ tab, isElimination }: { tab: TournamentTab; isElimination: boolean }): TranslationKey {
  if (tab === TournamentTab.BRACKET.value && !isElimination) {
    return "tournaments.tab.rounds";
  }
  return `tournaments.tab.${tab}` as TranslationKey;
}

function OrganizerControls({
  id,
  status,
  canManage,
  isAdmin,
  discordAnnounce,
  category,
  checkInOpen,
  structure,
  allowBots,
  checkedIn,
  waiting,
  onChanged,
  onDeleted,
}: {
  id: string;
  status: TournamentDetailPayload["status"];
  canManage: boolean;
  isAdmin: boolean;
  discordAnnounce: boolean;
  category?: TournamentCategory;
  checkInOpen: boolean;
  structure: TournamentDetailPayload["structure"];
  allowBots: boolean;
  checkedIn: number;
  waiting: number;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const [windows, setWindows] = useState<Partial<TournamentWindows>>({});
  const [error, setError] = useState<ApiError>();
  const [saved, setSaved] = useState<TournamentWindows>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // The server refuses to delete a started event, so the button only shows while it can succeed.
  const deletable = status === "draft" || status === "registration" || status === "check_in";
  const schedulable = deletable;

  if (!(canManage && schedulable) && !isAdmin && !deletable && !error) {
    return null;
  }

  const field = (key: keyof TournamentWindows) => (
    <div className="aegis-field" key={key}>
      <label className="aegis-field__label" htmlFor={`window-${key}`}>
        {t(windowKey(key))}
      </label>
      <input
        id={`window-${key}`}
        className="aegis-field__control"
        type="datetime-local"
        onChange={(event) =>
          setWindows((current) => ({
            ...current,
            [key]: event.target.value ? new Date(event.target.value).getTime() : null,
          }))
        }
      />
    </div>
  );

  return (
    <Panel className="tournaments-organizer">
      <h3>{t(canManage ? "tournaments.detail.organizer" : "tournaments.detail.adminControls")}</h3>
      {canManage && schedulable ? (
        <section className="tournaments-organizer__section">
          <h4>{t("tournaments.detail.schedule")}</h4>
          <div className="tournaments-organizer__fields">
            {(["registrationClosesAt", "checkInOpensAt", "checkInClosesAt"] as const).map(field)}
          </div>
          <div className="tournaments-detail__actions">
            <Button
              onClick={() =>
                void tournamentApi.setWindows(id, windows).then((result) => {
                  if (result.ok) {
                    setSaved(result.value);
                    setError(undefined);
                    onChanged();
                  } else setError(result.error);
                })
              }
            >
              {t("tournaments.detail.saveWindows")}
            </Button>
          </div>
          {saved ? <p role="status">{t("tournaments.detail.windowsSaved")}</p> : null}
          {checkInOpen ? (
            <TournamentCloseCheckIn
              id={id}
              structure={structure}
              allowBots={allowBots}
              checkedIn={checkedIn}
              waiting={waiting}
              onClosed={() => {
                setError(undefined);
                onChanged();
              }}
              onError={setError}
            />
          ) : null}
        </section>
      ) : null}
      {isAdmin ? (
        <section className="tournaments-organizer__section">
          <TournamentCategorySwitch id={id} category={category} onChanged={onChanged} />
          <TournamentDiscordSwitch id={id} announce={discordAnnounce} onChanged={onChanged} />
        </section>
      ) : null}
      {error ? (
        <Alert tone="danger" title={t("tournaments.error.action")}>
          {describeTournamentError({ error, t })}
        </Alert>
      ) : null}
      {deletable ? (
        <div className="tournaments-organizer__danger">
          {confirmingDelete ? (
            <>
              <p className="tournaments-note">{t("tournaments.detail.deleteConfirm")}</p>
              <div className="tournaments-detail__actions">
                <Button
                  variant="danger"
                  onClick={() =>
                    void tournamentApi.remove(id).then((result) => {
                      if (result.ok) {
                        onDeleted();
                        return;
                      }
                      setError(result.error);
                      setConfirmingDelete(false);
                    })
                  }
                >
                  {t("tournaments.detail.deleteConfirmYes")}
                </Button>
                <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </>
          ) : (
            <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
              {t("tournaments.detail.delete")}
            </Button>
          )}
        </div>
      ) : null}
    </Panel>
  );
}
