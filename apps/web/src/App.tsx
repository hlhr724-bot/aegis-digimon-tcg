import { hasAccountCapability } from "@aegis/shared/account/hasAccountCapability";
import { highestAccountRole } from "@/account/roles/highestAccountRole";
import type { TournamentSpectateTarget } from "@/tournaments/TournamentSpectateTarget";
import { RankedScreen } from "@/ranked/RankedScreen";
import { HomeMatchQueue } from "@/home/HomeMatchQueue";
import { LobbyMode } from "@/screens/LobbyMode";
import type { MatchQueueSelection } from "@aegis/shared/matchmaking/MatchQueueSelection";
import { useRankedConfig } from "@/ranked/useRankedConfig";
import type { TournamentGameTicket } from "@aegis/shared/tournaments/TournamentGameTicket";
import { FriendsDrawer } from "@/messages/FriendsDrawer";
import { FriendsDrawerButton } from "@/messages/FriendsDrawerButton";
import { useQuickChatState } from "@/messages/useQuickChatState";
import { SocialNotice } from "@/social/SocialNotice";
import { SocialContext } from "@/social/SocialContext";
import { useSocialConnection } from "@/social/useSocialConnection";
import { SocialInvites } from "@/social/SocialInvites";
import type { Friend } from "@aegis/shared/friends/Friend";
import { FriendsScreen } from "@/friends/FriendsScreen";
import type { BotSettings } from "@aegis/shared/bot/BotSettings";
import { GameMode } from "@aegis/shared/manual/GameMode";
import { getStoryGuestToken } from "@/story/getStoryGuestToken";
import { LocalScenarioHelp } from "./dev/LocalScenarioHelp";
import { MATCH_TIMER_START_SECONDS } from "@aegis/shared";
import { spectatorCodeFromSearch } from "./roomInvite";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { installAudioLifecycle } from "./design/sound";
import { Stage, TopNav, type PlayerIdentity, type Screen } from "./design/primitives";
import { AegisEmblem } from "./design/AegisLogo";
import { PixelBackdrop } from "./design/PixelBackdrop";
import { colorKey, type ColorName } from "./design/theme";
import {
  copyDeckPreset,
  deckById,
  filterDeckToKnownCards,
  removeDeck,
  upsertDeck,
  type DeckListing,
} from "./game/decks";
import { selectableDecks } from "@/game/selectableDecks";
import { useFamousDecks } from "@/game/useFamousDecks";
import type { AegisJoinOptions } from "./net/types";
import type { SeriesGameTicket } from "./net/useRoom";
import type { PrivateRoom, StartMode } from "./screens/Lobby";
import { loadMatchFormatPreference } from "./screens/matchFormatPreference";
import { loadIdentity, saveIdentity, loadDecks, saveDecks, loadActiveDeckId, saveActiveDeckId } from "./identity";
import { accentForAvatar } from "./guest";
import { applyDarkMode, setDarkMode, useDarkMode } from "./design/darkMode";
import { setDeckEggSleeveId, setDeckSleeveId } from "./design/sleeve";
import { applyTextScale } from "./design/textScale";
import { I18nProvider, useTranslation } from "./i18n";
import { accountApi, type RemoteAccount } from "./account/client";
import { communityApi } from "./community/client";
import { SeriesDeckDialog } from "@/game/overlay/match/SeriesDeckDialog";
import { communityDeckListing } from "./community/communityDeckListing";
import { CommunitySection } from "@/community/CommunitySection";
import { getCommunitySectionRoute } from "@/community/getCommunitySectionRoute";
import { usePreferencesSync } from "./account/usePreferencesSync";
import { setDeckFavorite } from "@/screens/favoriteDecks/setDeckFavorite";
import { CollectionTab } from "@/screens/CollectionTab";
import { LeaveMatchDialog } from "./game/screen/layout/LeaveMatchDialog";
import { PlayerMenu } from "./account/PlayerMenu";
import { MusicMenu } from "@/design/MusicMenu";
import { SOUND_SETTINGS_SECTION_ID } from "@/screens/soundSettingsSectionId";
import { NotificationBell } from "./notifications/NotificationBell";
import { useNotificationInbox } from "./notifications/useNotificationInbox";
import { NotificationsTab } from "./notifications/NotificationsTab";
import { pathForRoute, routeFromPathname, SCREEN_PATHS, type AppRoute } from "./routes";
import { getRulesChapterAnchor } from "@/learn/rules/getRulesChapterAnchor";
import { roomCodeFromSearch } from "./roomInvite";
import { isUiPreviewPath } from "./prototype/routes";
import { SEQUENTIAL_PACING_ENABLED } from "./features";
import { clearReconnectSession, loadReconnectSession } from "./net/reconnectSession";
import { setRoomTicketAccount } from "./net/roomAccount";
import { ClientErrorBoundary } from "@/clientErrors/ClientErrorBoundary";
import { createLazyComponent } from "@/net/createLazyComponent";

const TournamentsScreen = createLazyComponent({
  load: () => import("@/tournaments/TournamentsScreen"),
  pick: (module) => module.TournamentsScreen,
});

const ProfileScreen = createLazyComponent({
  load: () => import("./account/ProfileScreen"),
  pick: (module) => module.ProfileScreen,
});
const ReplaysScreen = createLazyComponent({
  load: () => import("./replays/ReplaysScreen"),
  pick: (module) => module.ReplaysScreen,
});
const PublicReplaysScreen = createLazyComponent({
  load: () => import("./replays/PublicReplaysScreen"),
  pick: (module) => module.PublicReplaysScreen,
});
const FeedbackScreen = createLazyComponent({
  load: () => import("./bugs/FeedbackScreen"),
  pick: (module) => module.FeedbackScreen,
});
const MyFeedbackPanel = createLazyComponent({
  load: () => import("./bugs/MyFeedbackPanel"),
  pick: (module) => module.MyFeedbackPanel,
});
const NotificationsScreen = createLazyComponent({
  load: () => import("./notifications/NotificationsScreen"),
  pick: (module) => module.NotificationsScreen,
});
const PrivacyScreen = createLazyComponent({
  load: () => import("./legal/PrivacyScreen"),
  pick: (module) => module.PrivacyScreen,
});
const Home = createLazyComponent({ load: () => import("./screens/Home"), pick: (module) => module.Home });
const Settings = createLazyComponent({ load: () => import("./screens/Settings"), pick: (module) => module.Settings });
const InterfaceThemeDialog = createLazyComponent({
  load: () => import("./design/InterfaceThemePicker"),
  pick: (module) => module.InterfaceThemeDialog,
});
const BugReportDialog = createLazyComponent({
  load: () => import("./bugs/BugReportDialog"),
  pick: (module) => module.BugReportDialog,
});
const ReleasesScreen = createLazyComponent({
  load: () => import("./releases/ReleasesScreen"),
  pick: (module) => module.ReleasesScreen,
});
const Login = createLazyComponent({ load: () => import("./screens/Login"), pick: (module) => module.Login });
const Lobby = createLazyComponent({ load: () => import("./screens/Lobby"), pick: (module) => module.Lobby });
const WatchScreen = createLazyComponent({
  load: () => import("./screens/WatchScreen"),
  pick: (module) => module.WatchScreen,
});
const Collection = createLazyComponent({
  load: () => import("./screens/Collection"),
  pick: (module) => module.Collection,
});
const DeckBuilder = createLazyComponent({
  load: () => import("./screens/DeckBuilder"),
  pick: (module) => module.DeckBuilder,
});
const CommunityScreen = createLazyComponent({
  load: () => import("./screens/community/CommunityScreen"),
  pick: (module) => module.CommunityScreen,
});
const RoadmapScreen = createLazyComponent({
  load: () => import("@/roadmap/RoadmapScreen"),
  pick: (module) => module.RoadmapScreen,
});
const GameScreen = createLazyComponent({
  load: () => import("./game/GameScreen"),
  pick: (module) => module.GameScreen,
});
const CardEffectsDemo = createLazyComponent({
  load: () => import("./dev/CardEffectsDemo"),
  pick: (module) => module.CardEffectsDemo,
});
const BoardShowcase = createLazyComponent({
  load: () => import("./dev/BoardShowcase"),
  pick: (module) => module.BoardShowcase,
});
const EffectPromptGallery = createLazyComponent({
  load: () => import("./dev/EffectPromptGallery"),
  pick: (module) => module.EffectPromptGallery,
});
const MotionReference = createLazyComponent({
  load: () => import("./dev/MotionReference"),
  pick: (module) => module.MotionReference,
});
const ArenaDemo = createLazyComponent({ load: () => import("./dev/ArenaDemo"), pick: (module) => module.ArenaDemo });
const BadgeLayoutLab = createLazyComponent({
  load: () => import("./dev/BadgeLayoutLab"),
  pick: (module) => module.BadgeLayoutLab,
});
const PackOpening = createLazyComponent({
  load: () => import("@/packOpening/PackOpening"),
  pick: (module) => module.PackOpening,
});
const UiPreview = createLazyComponent({
  load: () => import("./prototype/UiPreview"),
  pick: (module) => module.UiPreview,
});
const MobileComponentsLab = createLazyComponent({
  load: () => import("./dev/MobileComponentsLab"),
  pick: (module) => module.MobileComponentsLab,
});
const LearnScreen = createLazyComponent({
  load: () => import("@/learn/LearnScreen"),
  pick: (module) => module.LearnScreen,
});
const RulesScreen = createLazyComponent({
  load: () => import("@/learn/rules/RulesScreen"),
  pick: (module) => module.RulesScreen,
});
const StoryScreen = createLazyComponent({
  load: () => import("@/story/StoryScreen"),
  pick: (module) => module.StoryScreen,
});

export function isBoardShowcasePath(pathname: string): boolean {
  return /^\/dev\/board\/?$/i.test(pathname);
}

export function isEffectsLabPath(pathname: string): boolean {
  return /^\/dev\/effects-lab\/?$/i.test(pathname);
}

export function isMobileComponentsLabPath(pathname: string): boolean {
  return /^\/dev\/mobile\/?$/i.test(pathname);
}

export function cardEffectsLabCardId(pathname: string): string | undefined {
  const match = /^\/dev\/card-effects\/([^/]+)\/?$/i.exec(pathname);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]).toUpperCase();
  } catch {
    return match[1].toUpperCase();
  }
}

function ScreenFallback() {
  const { t } = useTranslation();
  return (
    <div className="aegis-screen-fallback" role="status" aria-live="polite">
      <span className="aegis-screen-fallback__mark" aria-hidden="true">
        <span className="aegis-loading-mark" />
        <AegisEmblem size={36} />
      </span>
      {t("common.loading")}
    </div>
  );
}

const PROFILE_ROUTE: AppRoute = { screen: "settings", profile: true };

const NAV_SCREENS: Screen[] = [
  "friends",
  "home",
  "booster",
  "lobby",
  "story",
  "learn",
  "rules",
  "watch",
  "deck",
  "community",
  "tournaments",
  "ranked",
  "roadmap",
  "collection",
  "settings",
  "releases",
  "replays",
  "feedback",
  "myFeedback",
  "notifications",
  "privacy",
];

export function withAccountAvatar(player: PlayerIdentity, account: RemoteAccount | null): PlayerIdentity {
  return {
    ...player,
    avatarId: account?.avatarId ?? null,
    avatarUrl: account?.avatarUrl ?? null,
  };
}

export function initialAppRoute({
  pathname,
  invitedRoomCode,
  hasReconnectSession,
  spectatorCode,
}: {
  pathname: string;
  invitedRoomCode: string | undefined;
  hasReconnectSession: boolean;
  spectatorCode?: string;
}): AppRoute {
  if (invitedRoomCode) return { screen: "lobby" };
  if (spectatorCode) return { screen: "watch" };
  const directRoute = routeFromPathname(pathname);
  if (directRoute?.screen === "game" && !hasReconnectSession) return { screen: "lobby" };
  return directRoute ?? { screen: "home" };
}

export function App() {
  useEffect(installAudioLifecycle, []);
  const pathname = window.location.pathname;
  const labCardId = cardEffectsLabCardId(pathname);
  return (
    <I18nProvider>
      <Suspense fallback={<ScreenFallback />}>
        {import.meta.env.DEV && /^\/dev\/effect-prompts\/?$/i.test(pathname) ? (
          <Stage>
            <EffectPromptGallery />
          </Stage>
        ) : import.meta.env.DEV && /^\/dev\/motion-reference\/?$/i.test(pathname) ? (
          <MotionReference />
        ) : /^\/dev\/badges\/?$/i.test(pathname) ? (
          <BadgeLayoutLab />
        ) : labCardId ? (
          <CardEffectsDemo cardId={labCardId} />
        ) : /^\/dev\/arena\/?$/i.test(pathname) ? (
          <Stage>
            <ArenaDemo />
          </Stage>
        ) : isEffectsLabPath(pathname) ? (
          <Stage>
            <LocalScenarioHelp />
          </Stage>
        ) : isBoardShowcasePath(pathname) ? (
          <BoardShowcase />
        ) : /^\/dev\/battle\/?$/i.test(pathname) ? (
          <LocalScenarioHelp />
        ) : isMobileComponentsLabPath(pathname) ? (
          <MobileComponentsLab />
        ) : isUiPreviewPath(pathname) ? (
          <UiPreview />
        ) : (
          <AppShell />
        )}
      </Suspense>
    </I18nProvider>
  );
}

function AppShell() {
  const famousDecks = useFamousDecks();
  if (!famousDecks) {
    return <ScreenFallback />;
  }
  return <LoadedAppShell famousDecks={famousDecks.decks} />;
}

function LoadedAppShell({ famousDecks }: { famousDecks: readonly DeckListing[] }) {
  const [player, setPlayer] = useState<PlayerIdentity>(loadIdentity);
  const [decks, setDecks] = useState<DeckListing[]>(loadDecks);
  const [activeDeckId, setActiveDeckId] = useState<string>(() =>
    loadActiveDeckId(selectableDecks({ personalDecks: loadDecks(), famousDecks })),
  );
  const dark = useDarkMode();
  const setDark = setDarkMode;
  const [account, setAccount] = useState<RemoteAccount | null>();
  const [decksReady, setDecksReady] = useState(false);

  useEffect(() => {
    saveIdentity(player);
  }, [player]);

  useEffect(() => {
    saveDecks(decks);
  }, [decks]);

  useEffect(() => setRoomTicketAccount(!!account), [account]);

  useEffect(() => {
    void (async () => {
      const remoteAccount = await accountApi.me();
      setAccount(remoteAccount);
      setPlayer((current) => withAccountAvatar(current, remoteAccount));
      if (!remoteAccount) {
        setDecksReady(true);
        return;
      }
      const remote = await accountApi.decks();
      const remoteIds = new Set(remote.map((deck) => deck.id));
      const localDecks = loadDecks();
      const localOnly = localDecks.filter((deck) => !remoteIds.has(deck.id)).slice(0, Math.max(0, 100 - remote.length));
      for (const deck of localOnly) await accountApi.saveDeck(deck);
      // Decks saved before the api stored covers come back without one; keep the local choice and backfill it.
      const localCovers = new Map(localDecks.map((deck) => [deck.id, deck.coverCardId]));
      const backfilled = remote
        .filter((deck) => !deck.coverCardId && localCovers.get(deck.id))
        .map((deck) => ({ ...deck, coverCardId: localCovers.get(deck.id) }));
      for (const deck of backfilled) await accountApi.saveDeck(deck);
      setDecks((local) => [...remote, ...backfilled].reduce((all, deck) => upsertDeck(all, deck), local));
      setDecksReady(true);
    })().catch(() => setAccount(null));
  }, []);

  useEffect(() => {
    saveActiveDeckId(activeDeckId);
  }, [activeDeckId]);

  useEffect(applyDarkMode, []);
  useEffect(applyTextScale, []);

  const preferencesReady = usePreferencesSync({ accountId: account?.id, dark, setDark });

  const saveDeck = (deck: DeckListing, setActive: boolean) => {
    const filtered = { ...filterDeckToKnownCards(deck), updatedAt: Date.now() };
    setDecks((ds) => upsertDeck(ds, filtered));
    void accountApi
      .me()
      .then((remoteAccount) => (remoteAccount ? accountApi.saveDeck(filtered) : undefined))
      .catch(() => undefined);
    if (setActive) setActiveDeckId(deck.id);
  };

  async function saveDeckLanguage(deck: DeckListing) {
    const updated = { ...deck, updatedAt: Date.now() };
    if (account) {
      await accountApi.saveDeck(updated);
    }
    setDecks((current) => upsertDeck(current, updated));
  }

  const deleteDeck = (id: string) => {
    const remaining = removeDeck(decks, id);
    setDeckFavorite({ deckId: id, favorite: false });
    setDecks(remaining);
    if (activeDeckId === id) setActiveDeckId(selectableDecks({ personalDecks: remaining, famousDecks })[0]?.id ?? "");
    void accountApi
      .me()
      .then((remoteAccount) => (remoteAccount ? accountApi.deleteDeck(id) : undefined))
      .catch(() => undefined);
  };

  const shared = {
    preferencesReady: account !== undefined && preferencesReady,
    player,
    setPlayer,
    account,
    setAccount,
    decks,
    activeDeckId,
    setActiveDeckId,
    saveDeck,
    deleteDeck,
    decksReady,
    saveDeckLanguage,
    dark,
    setDark,
  };

  return <AegisClient {...shared} />;
}

interface ClientProps {
  decksReady?: boolean;
  saveDeckLanguage?: (deck: DeckListing) => Promise<void>;
  preferencesReady?: boolean;
  player: PlayerIdentity;
  setPlayer: (update: (p: PlayerIdentity) => PlayerIdentity) => void;
  account?: RemoteAccount | null;
  setAccount?: (account: RemoteAccount | null) => void;
  decks: DeckListing[];
  activeDeckId: string;
  setActiveDeckId: (id: string) => void;
  saveDeck: (deck: DeckListing, setActive: boolean) => void;
  deleteDeck: (id: string) => void;
  dark: boolean;
  setDark: (v: boolean) => void;
  initialScreen?: Screen;
}

export function AegisClient(props: ClientProps) {
  const famousDecks = useFamousDecks();
  if (!famousDecks) {
    return <ScreenFallback />;
  }
  return <LoadedAegisClient {...props} famousDecks={famousDecks.decks} />;
}

function LoadedAegisClient({
  famousDecks,
  preferencesReady = true,
  player,
  setPlayer,
  account = null,
  setAccount,
  decks,
  activeDeckId,
  setActiveDeckId,
  saveDeck,
  deleteDeck,
  decksReady = false,
  saveDeckLanguage,
  dark,
  setDark,
  initialScreen,
}: ClientProps & { famousDecks: readonly DeckListing[] }) {
  const quickChat = useQuickChatState({ accountId: account?.id });
  const canJudge = hasAccountCapability({ roles: account?.roles ?? [], capability: "canJudge" });
  const { t } = useTranslation();
  const effectivePlayer = useMemo<PlayerIdentity>(
    () =>
      account
        ? {
            ...player,
            name: account.displayName,
            avatarId: account.avatarId,
            avatarUrl: account.avatarUrl,
          }
        : {
            ...player,
            avatarId: player.guestAvatarId ?? null,
            avatarUrl: null,
          },
    [account, player],
  );
  const [invitedRoomCode, setInvitedRoomCode] = useState(() =>
    initialScreen ? undefined : roomCodeFromSearch(window.location.search),
  );
  const [sharedSpectatorCode] = useState(() =>
    initialScreen ? undefined : spectatorCodeFromSearch(window.location.search),
  );
  const [route, setRoute] = useState<AppRoute>(() => {
    if (initialScreen) return { screen: initialScreen };
    return initialAppRoute({
      pathname: window.location.pathname,
      invitedRoomCode,
      spectatorCode: sharedSpectatorCode,
      hasReconnectSession: loadReconnectSession() !== undefined,
    });
  });
  const [timerOptions, setTimerOptions] = useState(() => ({
    matchTimer: true,
    timerStartSeconds: MATCH_TIMER_START_SECONDS,
    timerRefillSeconds: 60,
  }));
  const [gameMode, setGameMode] = useState<GameMode>(GameMode.AUTOMATIC.value);
  const [allowRollback, setAllowRollback] = useState(false);
  const [requireGuestApproval, setRequireGuestApproval] = useState(false);
  const [bestOf, setBestOf] = useState(loadMatchFormatPreference);
  /** Set between the games of a best-of-three: the next GameScreen takes this seat. */
  const [seriesGame, setSeriesGame] = useState<SeriesGameTicket>();
  const [tournamentGame, setTournamentGame] = useState<TournamentGameTicket>();
  const [spectatedTournamentMatch, setSpectatedTournamentMatch] = useState<TournamentSpectateTarget>();
  const [storyBattleId, setStoryBattleId] = useState<string>();
  const [startMode, setStartMode] = useState<StartMode>("casual");
  const [editingDeck, setEditingDeck] = useState<DeckListing | null>(null);
  // A community deck picked to play with. It lives for this session only and is never saved.
  const [borrowedDeck, setBorrowedDeck] = useState<DeckListing>();
  const [roomCode, setRoomCode] = useState<string>();
  const [spectatorFriendId, setSpectatorFriendId] = useState<string>();
  const [challengeTarget, setChallengeTarget] = useState<Friend>();
  const [queueChallenge, setQueueChallenge] = useState<MatchQueueSelection>();
  const [privateRoom, setPrivateRoom] = useState<PrivateRoom>();
  const [botDeckId, setBotDeckId] = useState<string>();
  const [botSettings, setBotSettings] = useState<BotSettings>();
  const [unlimited, setUnlimited] = useState(false);
  const [deckFormat, setDeckFormat] = useState<import("@aegis/shared").DeckFormat>("standard");
  const [betaBattleMode, setBetaBattleMode] = useState(false);
  const [matchDeckId, setMatchDeckId] = useState<string>();
  const [matchNumber, setMatchNumber] = useState(0);
  const [playerMenuAnchor, setPlayerMenuAnchor] = useState<HTMLElement | null>(null);
  const playerMenuOpen = playerMenuAnchor !== null;
  const [replayViewing, setReplayViewing] = useState(false);
  const [replayCloseRoute, setReplayCloseRoute] = useState<AppRoute>(PROFILE_ROUTE);
  const [themeOpen, setThemeOpen] = useState(false);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [leaveMatchPromptOpen, setLeaveMatchPromptOpen] = useState(false);
  const concedeMatchRef = useRef<(() => void) | undefined>(undefined);
  const leaveMatchRouteRef = useRef<AppRoute | undefined>(undefined);
  const leaveMatchActionRef = useRef<(() => void) | undefined>(undefined);
  const setLeaveForfeitsMatch = useCallback((concede: (() => void) | undefined) => {
    concedeMatchRef.current = concede;
    if (!concede) {
      leaveMatchActionRef.current = undefined;
      setLeaveMatchPromptOpen(false);
    }
  }, []);
  const screen = route.screen;
  const rankedConfig = useRankedConfig();
  useEffect(() => {
    if (screen !== "deck") setEditingDeck(null);
  }, [screen]);

  useEffect(() => {
    if (screen !== "ranked" || rankedConfig?.enabled !== false) return;
    if (!initialScreen) window.history.replaceState(null, "", pathForRoute({ screen: "lobby" }));
    setRoute({ screen: "lobby" });
  }, [screen, rankedConfig, initialScreen]);

  useEffect(() => {
    if (initialScreen) return;
    const expectedPath = pathForRoute(route);
    if (window.location.pathname !== expectedPath) window.history.replaceState(null, "", expectedPath);
  }, []);

  /* Coming back from the Discord round trip lands on /login with a session; there
     is nothing left to sign in to, so the screen hands over to home. */
  useEffect(() => {
    if (initialScreen || !account || screen !== "login") return;
    if (window.location.pathname !== pathForRoute({ screen: "home" })) {
      window.history.replaceState(null, "", pathForRoute({ screen: "home" }));
    }
    setRoute({ screen: "home" });
  }, [account, screen, initialScreen]);

  useEffect(() => {
    if (initialScreen) return;
    const onPopState = () => {
      const nextRoute = routeFromPathname(window.location.pathname);
      const resolvedRoute: AppRoute =
        nextRoute?.screen === "game" && !loadReconnectSession()
          ? { screen: "lobby" }
          : (nextRoute ?? { screen: "home" });
      if (concedeMatchRef.current && resolvedRoute.screen !== "game") {
        leaveMatchActionRef.current = undefined;
        leaveMatchRouteRef.current = resolvedRoute;
        window.history.pushState(null, "", pathForRoute({ screen: "game" }));
        setLeaveMatchPromptOpen(true);
        return;
      }
      const resolvedPath = pathForRoute(resolvedRoute);
      if (window.location.pathname !== resolvedPath) window.history.replaceState(null, "", resolvedPath);
      setRoute(resolvedRoute);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [initialScreen]);

  const confirmLeaveMatch = () => {
    setLeaveMatchPromptOpen(false);
    const action = leaveMatchActionRef.current;
    leaveMatchActionRef.current = undefined;
    concedeMatchRef.current?.();
    const nextRoute = leaveMatchRouteRef.current ?? { screen: "lobby" };
    leaveMatchRouteRef.current = undefined;
    setSeriesGame(undefined);
    setTournamentGame(undefined);
    clearReconnectSession();
    if (action) {
      action();
      return;
    }
    window.history.replaceState(null, "", pathForRoute(nextRoute));
    setRoute(nextRoute);
  };

  const navigate = (nextRoute: AppRoute) => {
    setPlayerMenuAnchor(null);
    if (!initialScreen) {
      const path = pathForRoute(nextRoute);
      if (window.location.pathname !== path) window.history.pushState(null, "", path);
    }
    setRoute(nextRoute);
  };
  const navigateScreen = (nextScreen: Screen) => navigate({ screen: nextScreen });
  const openPublicReplay = (replayId: string) => {
    setReplayCloseRoute(route);
    navigate({ screen: "replays", replayId });
  };

  const startMatch = (
    mode: StartMode,
    code?: string,
    requestedBotDeckId?: string,
    requestedBetaBattleMode?: boolean,
    requestedDeckId?: string | DeckListing,
    requestedUnlimited?: boolean,
    requestedFormat?: import("@aegis/shared").DeckFormat,
    requestedBotSettings?: BotSettings,
    requestedGameMode?: GameMode,
  ) => {
    // A lobby start explicitly requests a new match, even if a page
    // reload left a resumable seat from the previous match in storage.
    clearReconnectSession();
    setSeriesGame(undefined);
    setTournamentGame(undefined);
    setSpectatedTournamentMatch(undefined);
    if (mode !== "private_host" && mode !== "private_guest") setPrivateRoom(undefined);
    setStoryBattleId(undefined);
    setStartMode(mode);
    setSpectatorFriendId(undefined);
    if (requestedGameMode) {
      setGameMode(requestedGameMode);
    }
    setRoomCode(code);
    setBotDeckId(requestedBotDeckId);
    setBotSettings(requestedBotSettings);
    setBetaBattleMode(requestedBetaBattleMode === true);
    setUnlimited(requestedUnlimited === true);
    setDeckFormat(requestedFormat ?? (mode === "unlimited" || requestedUnlimited ? "unlimited" : "standard"));
    if (typeof requestedDeckId === "object") {
      setBorrowedDeck(structuredClone(requestedDeckId));
      setMatchDeckId(requestedDeckId.id);
    } else setMatchDeckId(requestedDeckId);
    navigateScreen("game");
  };

  const resumeMatchFromAnotherDevice = () => {
    setSeriesGame(undefined);
    setTournamentGame(undefined);
    setSpectatedTournamentMatch(undefined);
    setStoryBattleId(undefined);
    setSpectatorFriendId(undefined);
    setRoomCode(undefined);
    setStartMode("casual");
    setMatchNumber((current) => current + 1);
    navigateScreen("game");
  };

  const startLesson = (lessonId: string) => {
    startMatch("bot");
    setStoryBattleId(lessonId);
    setMatchNumber((current) => current + 1);
  };

  const availableDecks = useMemo(() => {
    const selectable = selectableDecks({ personalDecks: decks, famousDecks });
    return borrowedDeck ? [borrowedDeck, ...selectable] : selectable;
  }, [borrowedDeck, decks, famousDecks]);
  const matchDeck = deckById(availableDecks, matchDeckId ?? activeDeckId);
  const matchSleeveId = screen === "game" ? matchDeck?.sleeveId : undefined;
  useEffect(() => setDeckSleeveId(matchSleeveId), [matchSleeveId]);
  const matchEggSleeveId = screen === "game" ? matchDeck?.eggSleeveId : undefined;
  useEffect(() => setDeckEggSleeveId(matchEggSleeveId), [matchEggSleeveId]);
  const identityColor: ColorName = colorKey(player.color);

  const customBotDeck =
    startMode === "bot" && botDeckId?.startsWith("mine:")
      ? decks.find((deck) => deck.id === botDeckId.slice(5))
      : undefined;
  const effectiveGameMode =
    startMode === "bot" || startMode === "ranked" || tournamentGame ? GameMode.AUTOMATIC.value : gameMode;
  const joinOptions = useMemo<AegisJoinOptions>(
    () => ({
      ...timerOptions,
      tournamentGameId: tournamentGame?.gameId,
      tournamentGameToken: tournamentGame?.token,
      ...(effectiveGameMode === GameMode.MANUAL.value ? { matchTimer: false } : {}),
      storyBattleId,
      storyGuestToken: storyBattleId ? getStoryGuestToken() : undefined,
      gameMode: effectiveGameMode,
      allowRollback: effectiveGameMode !== GameMode.MANUAL.value && allowRollback,
      ...(startMode === "private_host" && requireGuestApproval ? { requireApproval: true } : {}),
      bestOf: effectiveGameMode === GameMode.MANUAL.value ? 1 : bestOf,
      format: deckFormat,
      displayName: effectivePlayer.name,
      avatarId: effectivePlayer.avatarId ?? undefined,
      deckId: matchDeck?.id,
      deckName: matchDeck?.name,
      community: matchDeck?.community,
      botDeck: customBotDeck
        ? {
            mainDeck: customBotDeck.mainDeck,
            eggDeck: customBotDeck.eggDeck,
            mainDeckArts: customBotDeck.mainDeckArts,
            eggDeckArts: customBotDeck.eggDeckArts,
          }
        : undefined,
      deck: {
        mainDeck: matchDeck?.mainDeck ?? [],
        eggDeck: matchDeck?.eggDeck ?? [],
        mainDeckArts: matchDeck?.mainDeckArts,
        eggDeckArts: matchDeck?.eggDeckArts,
      },
    }),
    [
      tournamentGame,
      storyBattleId,
      startMode,
      effectivePlayer.name,
      effectivePlayer.avatarId,
      matchDeck,
      timerOptions,
      bestOf,
      customBotDeck,
      deckFormat,
      allowRollback,
      requireGuestApproval,
      effectiveGameMode,
    ],
  );

  const showNav = NAV_SCREENS.includes(screen) && !replayViewing;
  // Kept outside the nav so the count survives a match, where the nav is hidden.
  const inbox = useNotificationInbox(account?.id);
  const social = useSocialConnection({
    accountId: account?.id,
    onNotifications: () => {
      void inbox.load();
    },
    onAccept: (invite) => {
      setChallengeTarget(undefined);
      setInvitedRoomCode(undefined);
      startMatch("private_guest", invite.roomCode);
    },
  });
  function runSocialNavigation(action: () => void) {
    if (concedeMatchRef.current) {
      leaveMatchActionRef.current = action;
      leaveMatchRouteRef.current = undefined;
      setLeaveMatchPromptOpen(true);
      return;
    }
    action();
  }
  const challengeFriend = (friend: Friend) => {
    runSocialNavigation(() => {
      setInvitedRoomCode(undefined);
      setPrivateRoom(undefined);
      setChallengeTarget(friend);
      quickChat.minimize();
      navigateScreen("lobby");
    });
  };
  const inviteCreatedRoom = useCallback(
    (code: string) => {
      if (!challengeTarget) {
        return;
      }
      social.invite(challengeTarget.accountId, code);
      setChallengeTarget(undefined);
    },
    [challengeTarget, social.invite],
  );
  const openOwnFeedback = (feedbackId?: number) => navigate({ screen: "myFeedback", feedbackId });

  const refreshDiscordAvatar = async () => {
    const updated = await accountApi.refreshDiscordAvatar();
    if (account) setAccount?.({ ...account, ...updated });
  };

  return (
    <SocialContext.Provider
      value={{
        ...social,
        quickChat,
        challenge: challengeFriend,
        watch: (friend) => {
          runSocialNavigation(() => {
            quickChat.minimize();
            startMatch("spectator", friend.roomCode);
            setSpectatorFriendId(friend.accountId);
          });
        },
      }}
    >
      <Stage>
        {screen === "game" ? null : <PixelBackdrop />}
        {showNav ? (
          <TopNav
            screen={screen}
            onNav={navigateScreen}
            player={effectivePlayer}
            signedIn={!!account}
            role={highestAccountRole(account?.roles ?? [])}
            onOpenPlayerMenu={(anchor) => setPlayerMenuAnchor(playerMenuOpen ? null : anchor)}
            playerMenuOpen={playerMenuOpen}
            dark={dark}
            onToggleDark={setDark}
            onOpenTheme={() => setThemeOpen(true)}
            onSendFeedback={() => setBugReportOpen(true)}
            music={
              <MusicMenu
                onOpenSoundSettings={() =>
                  navigate({ screen: "settings", settingsSectionId: SOUND_SETTINGS_SECTION_ID })
                }
              />
            }
            friends={account ? <FriendsDrawerButton /> : undefined}
            notifications={
              account ? (
                <NotificationBell
                  inbox={inbox}
                  onOpenFeedback={openOwnFeedback}
                  onViewAll={() => navigateScreen("notifications")}
                />
              ) : undefined
            }
          />
        ) : null}

        <div
          id="aegis-main"
          className={`aegis-screen-region${showNav ? " aegis-screen-region--nav" : ""}${screen === "replays" ? " aegis-screen-region--replays" : ""}${screen === "settings" && route.profile ? " aegis-screen-region--profile" : ""}`}
          tabIndex={-1}
        >
          <ClientErrorBoundary key={screen}>
            <Suspense fallback={<ScreenFallback />}>
              {screen === "home" && (
                <Home
                  accountId={account?.id}
                  decks={decks}
                  activeDeck={matchDeck}
                  activeDeckId={activeDeckId}
                  rankedEnabled={rankedConfig?.enabled === true}
                  onFindMatch={(queue) =>
                    navigate({
                      screen: "lobby",
                      rankedQueue: queue === HomeMatchQueue.RANKED.value,
                      matchSettings: true,
                    })
                  }
                  onPractice={() => navigate({ screen: "lobby", lobbyMode: LobbyMode.PRACTICE.value })}
                  onPrivateMatch={() => navigate({ screen: "lobby", lobbyMode: LobbyMode.PRIVATE.value })}
                  onChangeDeck={() => navigateScreen("lobby")}
                  onWatchLive={(code) => startMatch("spectator", code)}
                  onOpenWatch={() => navigateScreen("watch")}
                  onOpenReplay={openPublicReplay}
                  onOpenPublicReplays={() => navigate({ screen: "replays", publicReplays: true })}
                  onOpenTournament={(id) => navigate({ screen: "tournaments", tournament: { kind: "detail", id } })}
                  onOpenTournaments={() => navigate({ screen: "tournaments", tournament: { kind: "catalog" } })}
                  onCreateTournament={() => navigate({ screen: "tournaments", tournament: { kind: "create" } })}
                  onOpenBooster={() => navigateScreen("booster")}
                  onEditDeck={(deck) => {
                    setEditingDeck(deck);
                    navigateScreen("deck");
                  }}
                  onPlayDeck={(deck) => {
                    setActiveDeckId(deck.id);
                    navigate({ screen: "lobby", matchSettings: true });
                  }}
                  onBuildDeck={() => navigateScreen("deck")}
                  onOpenDecks={() => navigateScreen("deck")}
                  onSignIn={() => navigateScreen("login")}
                  onReportBug={() => setBugReportOpen(true)}
                  onOpenReleases={() => navigateScreen("releases")}
                  onResumeMatch={resumeMatchFromAnotherDevice}
                />
              )}

              {screen === "booster" && (
                <PackOpening
                  onBack={() => navigate({ screen: "collection", collectionTab: CollectionTab.BOOSTERS.value })}
                />
              )}

              {screen === "feedback" && (
                <FeedbackScreen
                  key={account?.id ?? "guest"}
                  isAdmin={account?.isAdmin === true}
                  selectedId={route.feedbackId}
                  onSelect={(feedbackId) => navigate({ screen: "feedback", feedbackId })}
                  onOpenDeck={(communityDeckId) => navigate({ screen: "community", communityDeckId })}
                />
              )}
              {(screen === "notifications" || screen === "myFeedback") && (
                <NotificationsScreen
                  inbox={inbox}
                  tab={screen === "myFeedback" ? NotificationsTab.FEEDBACK.value : NotificationsTab.ALL.value}
                  onTabChange={(tab) =>
                    navigateScreen(tab === NotificationsTab.FEEDBACK.value ? "myFeedback" : "notifications")
                  }
                  onOpenFeedback={openOwnFeedback}
                  feedback={
                    <MyFeedbackPanel
                      key={account?.id ?? "guest"}
                      signedIn={!!account}
                      focusId={route.feedbackId}
                      onSignIn={() => navigateScreen("login")}
                      onSendFeedback={() => setBugReportOpen(true)}
                    />
                  }
                />
              )}
              {screen === "login" && <Login onBack={() => navigateScreen("home")} />}

              {screen === "learn" && (
                <LearnScreen
                  key={account?.id ?? "guest"}
                  signedIn={!!account}
                  onSignIn={() => navigateScreen("login")}
                  onStartLesson={startLesson}
                  onOpenRules={(chapterId) => {
                    navigateScreen("rules");
                    if (chapterId) {
                      window.history.replaceState(
                        null,
                        "",
                        `${SCREEN_PATHS.rules}#${getRulesChapterAnchor(chapterId)}`,
                      );
                    }
                  }}
                />
              )}
              {screen === "rules" && (
                <RulesScreen
                  key={account?.id ?? "guest"}
                  signedIn={!!account}
                  onBack={() => navigateScreen("learn")}
                  onStartLesson={startLesson}
                />
              )}
              {screen === "story" && (
                <StoryScreen
                  key={account?.id ?? "guest"}
                  initialBattleId={storyBattleId}
                  signedIn={!!account}
                  onSignIn={() => navigateScreen("login")}
                  onStart={(battleId) => {
                    startMatch("bot");
                    setStoryBattleId(battleId);
                  }}
                />
              )}
              {screen === "lobby" && (
                <Lobby
                  initialRanked={route.rankedQueue === true}
                  initialMode={route.lobbyMode}
                  player={effectivePlayer}
                  decks={decks}
                  borrowedDeck={borrowedDeck}
                  onUseProviderDeck={(deck) => {
                    setBorrowedDeck(deck);
                    setActiveDeckId(deck.id);
                  }}
                  onBorrowCommunityDeck={(id) => {
                    void communityApi
                      .deck(id)
                      .then((deck) => {
                        const listing = communityDeckListing(deck);
                        setBorrowedDeck(listing);
                        setActiveDeckId(listing.id);
                      })
                      .catch(() => undefined);
                  }}
                  onOpenCommunityDeck={(id) => navigate({ screen: "community", communityDeckId: id })}
                  accountId={account?.id}
                  activeDeckId={activeDeckId}
                  onSelectDeck={setActiveDeckId}
                  onCopyDeck={(preset) => {
                    const copy = copyDeckPreset(preset, decks);
                    saveDeck(copy, true);
                    navigateScreen("deck");
                  }}
                  onEditDeck={(deck) => {
                    setEditingDeck(deck);
                    navigateScreen("deck");
                  }}
                  onNav={navigateScreen}
                  timerOptions={timerOptions}
                  onTimerOptionsChange={setTimerOptions}
                  gameMode={gameMode}
                  onGameModeChange={setGameMode}
                  allowRollback={allowRollback}
                  onAllowRollbackChange={setAllowRollback}
                  requireGuestApproval={requireGuestApproval}
                  onRequireGuestApprovalChange={setRequireGuestApproval}
                  bestOf={bestOf}
                  onBestOfChange={setBestOf}
                  invitedRoomCode={invitedRoomCode}
                  key={challengeTarget?.accountId ?? invitedRoomCode ?? "lobby"}
                  challengeFriendName={challengeTarget?.displayName}
                  onCancelChallenge={() => setChallengeTarget(undefined)}
                  privateRoom={privateRoom}
                  onLeavePrivateRoom={() => setPrivateRoom(undefined)}
                  onStart={startMatch}
                  openMatchSettings={route.matchSettings === true}
                  queueChallenge={queueChallenge}
                  onQueueChallengeHandled={() => setQueueChallenge(undefined)}
                />
              )}

              {screen === "watch" && (
                <WatchScreen
                  initialCode={sharedSpectatorCode}
                  rankedEnabled={rankedConfig?.enabled === true}
                  onWatch={(code) => startMatch("spectator", code)}
                  onNav={navigateScreen}
                  onOpenMatchSettings={() => navigate({ screen: "lobby", matchSettings: true })}
                  onCreateRoom={() => {
                    setInvitedRoomCode(undefined);
                    setPrivateRoom(undefined);
                    setChallengeTarget(undefined);
                    navigate({ screen: "lobby", lobbyMode: LobbyMode.PRIVATE.value });
                  }}
                  onJoinRoom={(code) => {
                    setPrivateRoom(undefined);
                    setChallengeTarget(undefined);
                    setInvitedRoomCode(code);
                    navigateScreen("lobby");
                  }}
                  onChallengeQueue={(selection) => {
                    setInvitedRoomCode(undefined);
                    setPrivateRoom(undefined);
                    setChallengeTarget(undefined);
                    setQueueChallenge(selection);
                    navigate({ screen: "lobby", lobbyMode: LobbyMode.CASUAL.value });
                  }}
                />
              )}

              {screen === "deck" && (
                <DeckBuilder
                  initialEditingDeck={editingDeck}
                  decks={decks}
                  activeDeckId={activeDeckId}
                  onSelectDeck={setActiveDeckId}
                  onSaveDeck={saveDeck}
                  onDeleteDeck={deleteDeck}
                  signedIn={!!account}
                  onNav={(next) => {
                    setEditingDeck(null);
                    navigateScreen(next);
                  }}
                />
              )}

              {screen === "community" && (
                <CommunityScreen
                  deckId={route.communityDeckId}
                  section={route.communityMeta ? CommunitySection.META.value : CommunitySection.DECKS.value}
                  metaAvailable={rankedConfig?.enabled}
                  signedIn={!!account}
                  accountId={account?.id}
                  isAdmin={account?.isAdmin === true}
                  onOpenDeck={(id) => navigate({ screen: "community", communityDeckId: id })}
                  onBack={() => navigate({ screen: "community" })}
                  onSectionChange={(section) => navigate(getCommunitySectionRoute(section))}
                  onOpenRanked={() => navigateScreen("ranked")}
                  onPlay={(deck) => {
                    const listing = communityDeckListing(deck);
                    setBorrowedDeck(listing);
                    setActiveDeckId(listing.id);
                    navigateScreen("lobby");
                  }}
                  onCopy={(deck) => {
                    saveDeck(
                      {
                        ...copyDeckPreset(communityDeckListing(deck), decks),
                        blurb: t("community.byAuthor", { name: deck.author.displayName }),
                      },
                      false,
                    );
                    if (account) void communityApi.recordCopy(deck.id).catch(() => undefined);
                  }}
                />
              )}

              {screen === "ranked" && rankedConfig?.enabled && (
                <RankedScreen
                  player={effectivePlayer}
                  signedIn={Boolean(account)}
                  canJudge={canJudge}
                  onPlay={() => navigate({ screen: "lobby", rankedQueue: true, matchSettings: true })}
                  onNav={navigateScreen}
                />
              )}

              {screen === "tournaments" && (
                <TournamentsScreen
                  decks={decks}
                  onDecks={() => navigate({ screen: "deck" })}
                  view={route.tournament ?? { kind: "catalog" }}
                  onViewChange={(tournament) => navigate({ screen: "tournaments", tournament })}
                  onWatchMatch={(target) => {
                    startMatch("spectator");
                    setSpectatedTournamentMatch(target);
                    setMatchNumber((current) => current + 1);
                  }}
                  onJoinGame={(ticket) => {
                    clearReconnectSession();
                    setSeriesGame(undefined);
                    setSpectatedTournamentMatch(undefined);
                    setTournamentGame(ticket);
                    setStoryBattleId(undefined);
                    setStartMode("casual");
                    setRoomCode(undefined);
                    setBotDeckId(undefined);
                    setBetaBattleMode(false);
                    setUnlimited(false);
                    setDeckFormat("standard");
                    setMatchNumber((current) => current + 1);
                    navigateScreen("game");
                  }}
                />
              )}

              {screen === "roadmap" && (
                <RoadmapScreen
                  itemId={route.roadmapItemId}
                  signedIn={!!account}
                  isAdmin={account?.isAdmin === true}
                  metaAvailable={rankedConfig?.enabled === true}
                  onSignIn={() => navigateScreen("login")}
                  onOpen={(id) => navigate({ screen: "roadmap", roadmapItemId: id })}
                  onSectionChange={(section) => navigate(getCommunitySectionRoute(section))}
                  onSuggest={() => setBugReportOpen(true)}
                />
              )}

              {screen === "friends" && <FriendsScreen signedIn={!!account} onSignIn={() => navigateScreen("login")} />}

              {screen === "collection" && (
                <Collection
                  tab={route.collectionTab ?? CollectionTab.CARDS.value}
                  onTabChange={(collectionTab) => navigate({ screen: "collection", collectionTab })}
                  onOpenBooster={() => navigateScreen("booster")}
                />
              )}

              {screen === "replays" && route.replayId && (
                <ReplaysScreen
                  key={route.replayId}
                  replayId={route.replayId}
                  onCloseLink={() => {
                    navigate(replayCloseRoute);
                    setReplayCloseRoute(PROFILE_ROUTE);
                  }}
                  onViewingChange={setReplayViewing}
                />
              )}

              {screen === "replays" && route.publicReplays && <PublicReplaysScreen onOpen={openPublicReplay} />}

              {screen === "releases" && <ReleasesScreen />}
              {screen === "privacy" && <PrivacyScreen />}

              {screen === "settings" && route.profile && (
                <ProfileScreen
                  onCopyDeck={(deck) => saveDeck(copyDeckPreset(deck, decks), false)}
                  account={account}
                  player={effectivePlayer}
                  onViewingChange={setReplayViewing}
                  onAccountChange={(updated) => setAccount?.({ ...account, ...updated })}
                  onGuestChange={(name, avatarId) =>
                    setPlayer((current) => ({
                      ...current,
                      name,
                      guestAvatarId: avatarId,
                      color: accentForAvatar(avatarId, colorKey(current.color)),
                    }))
                  }
                  onRefreshDiscordAvatar={account?.discordLinked ? refreshDiscordAvatar : undefined}
                  avatarMenuRequest={route.avatarMenuRequest}
                />
              )}
              {screen === "settings" && !route.profile && (
                <Settings
                  decks={decks}
                  decksReady={decksReady}
                  onSaveDeckLanguage={saveDeckLanguage}
                  player={effectivePlayer}
                  account={account}
                  dark={dark}
                  onToggleDark={setDark}
                  initialSectionId={route.settingsSectionId}
                />
              )}

              {screen === "game" && (
                <GameScreen
                  onCopyUsedDeck={(deck) => saveDeck(copyDeckPreset(deck, decks), false)}
                  renderSeriesDeckPicker={(params) => (
                    <SeriesDeckDialog
                      {...params}
                      decks={decks}
                      activeDeckId={matchDeck?.id ?? ""}
                      accountId={account?.id}
                      onCopyDeck={(deck) => saveDeck(copyDeckPreset(deck, decks), false)}
                      onChoose={(deck) => {
                        params.onChoose(deck);
                        if (!availableDecks.some((entry) => entry.id === deck.id)) {
                          setBorrowedDeck(structuredClone(deck));
                        }
                        setMatchDeckId(deck.id);
                      }}
                    />
                  )}
                  autoHatchReady={preferencesReady}
                  key={matchNumber}
                  spectatorFriendId={spectatorFriendId}
                  onPrivateRoomReady={inviteCreatedRoom}
                  joinOptions={joinOptions}
                  identityColor={identityColor}
                  identityAvatarId={effectivePlayer.avatarId}
                  identityAvatarUrl={effectivePlayer.avatarUrl}
                  startMode={startMode}
                  roomCode={roomCode}
                  tournamentMatch={spectatedTournamentMatch}
                  waitForHost={startMode === "private_guest" && privateRoom?.code === roomCode}
                  botDeckId={botDeckId}
                  botSettings={botSettings}
                  betaBattleMode={betaBattleMode}
                  unlimited={unlimited}
                  seriesGame={seriesGame}
                  onSeriesNext={(ticket) => {
                    clearReconnectSession();
                    setSeriesGame(ticket);
                    setMatchNumber((current) => current + 1);
                  }}
                  presentationPacing={SEQUENTIAL_PACING_ENABLED ? "sequential" : "current"}
                  signedIn={!!account}
                  onLeaveForfeitsChange={setLeaveForfeitsMatch}
                  onStartLesson={startLesson}
                  onExit={(next) => {
                    setSeriesGame(undefined);
                    if (spectatedTournamentMatch) {
                      setSpectatedTournamentMatch(undefined);
                      navigate({
                        screen: "tournaments",
                        tournament: { kind: "detail", id: spectatedTournamentMatch.tournamentId },
                      });
                      return;
                    }
                    if (tournamentGame) {
                      setTournamentGame(undefined);
                      navigate({
                        screen: "tournaments",
                        tournament: { kind: "detail", id: tournamentGame.tournamentId },
                      });
                      return;
                    }
                    void import("@/learn/getMatchExitScreen")
                      .then(({ getMatchExitScreen }) => navigateScreen(getMatchExitScreen({ storyBattleId, next })))
                      .catch(() => navigateScreen(next));
                  }}
                  onRematch={(privateRoomCode, roomUnlimited, roomHost, roomFormat, roomGameMode) => {
                    if (tournamentGame) {
                      clearReconnectSession();
                      setTournamentGame(undefined);
                      navigate({
                        screen: "tournaments",
                        tournament: { kind: "detail", id: tournamentGame.tournamentId },
                      });
                      return;
                    }
                    clearReconnectSession();
                    setSeriesGame(undefined);
                    setGameMode(roomGameMode ?? GameMode.AUTOMATIC.value);
                    if (privateRoomCode) {
                      setPrivateRoom({
                        code: privateRoomCode,
                        host: roomHost ?? startMode === "private_host",
                        unlimited: roomUnlimited,
                        format: roomFormat,
                        gameMode: roomGameMode,
                      });
                      navigateScreen("lobby");
                      return;
                    }
                    setMatchNumber((current) => current + 1);
                  }}
                />
              )}
            </Suspense>
          </ClientErrorBoundary>
        </div>

        {playerMenuOpen ? (
          <PlayerMenu
            player={effectivePlayer}
            signedIn={!!account}
            anchor={playerMenuAnchor}
            isAdmin={account?.isAdmin === true}
            onNav={navigateScreen}
            onProfile={() => navigate({ screen: "settings", profile: true })}
            onChangeAvatar={() => navigate({ screen: "settings", profile: true, avatarMenuRequest: Date.now() })}
            onSignOut={
              account
                ? () => {
                    void accountApi.logout().then(() => location.reload());
                  }
                : undefined
            }
            onReportBug={() => setBugReportOpen(true)}
            onClose={() => setPlayerMenuAnchor(null)}
          />
        ) : null}

        {themeOpen ? (
          <ClientErrorBoundary fallback={null}>
            <Suspense fallback={null}>
              <InterfaceThemeDialog dark={dark} onToggleDark={setDark} onClose={() => setThemeOpen(false)} />
            </Suspense>
          </ClientErrorBoundary>
        ) : null}
        {bugReportOpen ? (
          <ClientErrorBoundary fallback={null}>
            <Suspense fallback={null}>
              <BugReportDialog signedIn={!!account} onClose={() => setBugReportOpen(false)} />
            </Suspense>
          </ClientErrorBoundary>
        ) : null}
        {leaveMatchPromptOpen ? (
          <LeaveMatchDialog
            onConfirm={confirmLeaveMatch}
            onClose={() => {
              leaveMatchActionRef.current = undefined;
              setLeaveMatchPromptOpen(false);
            }}
          />
        ) : null}
        <FriendsDrawer />
        <SocialInvites canAccept={screen !== "game"} />
        <SocialNotice />
      </Stage>
    </SocialContext.Provider>
  );
}
