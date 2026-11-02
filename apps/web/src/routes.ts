import type { Screen } from "./design/primitives";
import { isTournamentTab } from "@/tournaments/isTournamentTab";
import { TournamentTab } from "@/tournaments/TournamentTab";
import type { LobbyMode } from "@/screens/LobbyMode";
import { CollectionTab } from "@/screens/CollectionTab";

export type TournamentRoute =
  | { kind: "catalog" }
  | { kind: "create" }
  | { kind: "detail"; id: string; tab?: TournamentTab }
  | { kind: "createCircuit" }
  | { kind: "circuit"; id: string };

export interface AppRoute {
  screen: Screen;
  profile?: boolean;
  avatarMenuRequest?: number;
  settingsSectionId?: string;
  /** Shared replay links and the public replay list open the replays screen; `/replays` itself redirects to the profile. */
  replayId?: string;
  publicReplays?: boolean;
  tournament?: TournamentRoute;
  /** The public deck open on the community screen; absent on the browse list. */
  communityDeckId?: string;
  communityMeta?: boolean;
  /** The report open on the admin triage or the reporter's own feedback screen. */
  feedbackId?: number;
  roadmapItemId?: number;
  matchSettings?: boolean;
  rankedQueue?: boolean;
  lobbyMode?: LobbyMode;
  collectionTab?: CollectionTab;
}

export const SCREEN_PATHS: Record<Screen, string> = {
  friends: "/friends",
  feedback: "/admin/feedback",
  myFeedback: "/feedback",
  notifications: "/notifications",
  home: "/",
  booster: "/booster",
  login: "/login",
  lobby: "/play",
  story: "/play/story",
  learn: "/learn",
  rules: "/learn/rules",
  watch: "/play/rooms",
  deck: "/decks",
  collection: "/collection",
  community: "/community",
  roadmap: "/roadmap",
  tournaments: "/tournaments",
  ranked: "/ranked",
  settings: "/settings",
  releases: "/whats-new",
  replays: "/replays",
  privacy: "/privacy",
  game: "/play/game",
};

export function routeFromPathname(pathname: string): AppRoute | undefined {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (/^\/(?:booster|dev\/pack-opening)$/i.test(normalized)) {
    return { screen: "booster" };
  }
  if (normalized === "/admin/feedback") return { screen: "feedback" };
  const triagedFeedback = /^\/admin\/feedback\/(\d{1,9})$/.exec(normalized)?.[1];
  if (triagedFeedback) return { screen: "feedback", feedbackId: Number(triagedFeedback) };
  if (normalized === "/friends") return { screen: "friends" };
  if (normalized === "/notifications") return { screen: "notifications" };
  if (normalized === "/feedback") return { screen: "myFeedback" };
  const ownFeedback = /^\/feedback\/(\d{1,9})$/.exec(normalized)?.[1];
  if (ownFeedback) return { screen: "myFeedback", feedbackId: Number(ownFeedback) };
  if (normalized === "/") return { screen: "home" };
  if (normalized === "/login") return { screen: "login" };
  if (normalized === "/play/story") return { screen: "story" };
  if (normalized === "/ranked") return { screen: "ranked" };
  if (normalized === "/play/ranked") return { screen: "lobby", rankedQueue: true, matchSettings: true };
  if (normalized === "/learn") return { screen: "learn" };
  if (normalized === "/learn/rules") return { screen: "rules" };
  if (normalized === "/play") return { screen: "lobby" };
  if (normalized === "/play/game") return { screen: "game" };
  if (normalized === "/play/rooms" || normalized === "/play/watch") return { screen: "watch" };
  if (normalized === "/decks") return { screen: "deck" };
  if (normalized === "/collection") return { screen: "collection" };
  if (normalized === "/collection/boosters") {
    return { screen: "collection", collectionTab: CollectionTab.BOOSTERS.value };
  }
  if (normalized === "/community") return { screen: "community" };
  if (normalized === "/community/meta") return { screen: "community", communityMeta: true };
  if (normalized === "/tournaments") {
    return { screen: "tournaments", tournament: { kind: "catalog" } };
  }
  if (normalized === "/tournaments/new") {
    return { screen: "tournaments", tournament: { kind: "create" } };
  }
  if (normalized === "/tournaments/circuits/new") {
    return { screen: "tournaments", tournament: { kind: "createCircuit" } };
  }
  const circuitId = /^\/tournaments\/circuits\/([^/]+)$/.exec(normalized)?.[1];
  if (circuitId) {
    return { screen: "tournaments", tournament: { kind: "circuit", id: safeDecode(circuitId) } };
  }
  const tournamentId = /^\/tournaments\/([^/]+)$/.exec(normalized)?.[1];
  if (tournamentId) {
    return { screen: "tournaments", tournament: { kind: "detail", id: safeDecode(tournamentId) } };
  }
  const tournamentTab = /^\/tournaments\/([^/]+)\/([^/]+)$/.exec(normalized);
  if (tournamentTab && isTournamentTab(tournamentTab[2]) && tournamentTab[2] !== TournamentTab.OVERVIEW.value) {
    return {
      screen: "tournaments",
      tournament: { kind: "detail", id: safeDecode(tournamentTab[1]!), tab: tournamentTab[2] },
    };
  }
  if (normalized === "/roadmap") return { screen: "roadmap" };
  const roadmapItem = /^\/roadmap\/(\d{1,9})$/.exec(normalized)?.[1];
  if (roadmapItem) return { screen: "roadmap", roadmapItemId: Number(roadmapItem) };
  const communityDeck = /^\/community\/decks\/([^/]+)$/.exec(normalized)?.[1];
  if (communityDeck) return { screen: "community", communityDeckId: safeDecode(communityDeck) };
  // The profile used to split into tabs and the replays screen had its own library; old links land on the profile.
  if (["/profile", "/profile/replays", "/profile/customize", "/replays"].includes(normalized))
    return { screen: "settings", profile: true };
  if (normalized === "/replays/public") return { screen: "replays", publicReplays: true };
  const replayId = /^\/replays\/([^/]+)$/.exec(normalized)?.[1];
  if (replayId) return { screen: "replays", replayId: safeDecode(replayId) };
  if (normalized === "/settings") return { screen: "settings" };
  if (normalized === "/whats-new") return { screen: "releases" };
  if (normalized === "/privacy") return { screen: "privacy" };
  return undefined;
}

export function pathForRoute(route: AppRoute): string {
  if (route.screen === "lobby" && route.rankedQueue) return "/play/ranked";
  if (route.screen === "settings" && route.profile) return "/profile";
  if (route.screen === "replays" && route.publicReplays) return "/replays/public";
  if (route.screen === "replays") return route.replayId ? `/replays/${encodeURIComponent(route.replayId)}` : "/profile";
  if (route.screen === "community" && route.communityDeckId)
    return `/community/decks/${encodeURIComponent(route.communityDeckId)}`;
  if (route.screen === "collection" && route.collectionTab === CollectionTab.BOOSTERS.value) {
    return "/collection/boosters";
  }
  if (route.screen === "community" && route.communityMeta) {
    return "/community/meta";
  }
  if (route.screen === "roadmap" && route.roadmapItemId !== undefined) return `/roadmap/${route.roadmapItemId}`;
  if ((route.screen === "feedback" || route.screen === "myFeedback") && route.feedbackId !== undefined)
    return `${SCREEN_PATHS[route.screen]}/${route.feedbackId}`;
  if (route.screen !== "tournaments") return SCREEN_PATHS[route.screen];
  if (route.tournament?.kind === "create") return "/tournaments/new";
  if (route.tournament?.kind === "createCircuit") return "/tournaments/circuits/new";
  if (route.tournament?.kind === "circuit") return `/tournaments/circuits/${encodeURIComponent(route.tournament.id)}`;
  if (route.tournament?.kind === "detail") {
    return getTournamentDetailPath(route.tournament);
  }
  return SCREEN_PATHS.tournaments;
}

function getTournamentDetailPath({ id, tab }: { id: string; tab?: TournamentTab }): string {
  const base = `/tournaments/${encodeURIComponent(id)}`;
  if (!tab || tab === TournamentTab.OVERVIEW.value) {
    return base;
  }
  return `${base}/${tab}`;
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
