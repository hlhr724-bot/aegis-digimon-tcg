import type { AccountRole } from "@aegis/shared/account/AccountRole";
import type { SpectatorAccess } from "@aegis/shared/account/SpectatorAccess";
import type { UsedDeck } from "@aegis/shared/decks/UsedDeck";
import type { CardImageLanguage } from "@aegis/shared/cards/CardImageLanguage";
import type { DeckListing } from "../game/decks";
import { dominantColor } from "../game/decks";
import type {
  AvatarChoice,
  AvatarSource,
  MatchHistoryFilter,
  MatchHistoryPage,
  MatchHistorySummary,
  PlaytestMembership,
} from "@aegis/shared";
import type { DigimonWorldAvatarId } from "./avatars";
import type { MatchHistoryExport } from "@aegis/shared/replays/MatchHistoryExport";

// The match overlay imports this module, so it must also load where `location` is absent (Node tests).
const fallbackHost = typeof location === "undefined" ? "localhost" : location.hostname;
const apiBase = (import.meta.env.VITE_AEGIS_API_URL ?? `http://${fallbackHost}:2567`).replace(/^ws/, "http");

export type RemoteAccount = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  avatarId: DigimonWorldAvatarId | null;
  avatarSource: AvatarSource;
  roles: AccountRole[];
  isAdmin: boolean;
  /** Sent by `/auth/me` and the Discord avatar refresh; other account responses omit it. */
  discordLinked?: boolean;
};
export type AccountPreferences = {
  cardImageLanguage?: CardImageLanguage;
  autoHatch?: boolean;
  groupIdenticalTamers?: boolean;
  darkMode?: boolean;
  locale?: string;
  sleeve?: string;
  eggSleeve?: string;
  deckShare?: number;
  deckView?: "grid" | "list";
  deckSort?: string;
  profileStats?: boolean;
  profileTrophies?: boolean;
  shareProfileStats?: boolean;
  shareDeckAfterMatch?: boolean;
  listLiveMatches?: boolean;
  spectatorAccess?: SpectatorAccess;
  hideIdentityFromSpectators?: boolean;
  favoriteDeckIds?: string[];
};
export type AccountProfile = {
  account: RemoteAccount;
  stats: {
    rankedWins: number;
    rankedLosses: number;
    rankedDraws: number;
    rankedDodges: number;
    tournamentWins: number;
    tournamentLosses: number;
    tournamentDraws: number;
    tournamentsPlayed: number;
    tournamentsWon: number;
  };
  decks: Array<{
    snapshotId: string;
    deckId: string | null;
    deckName: string;
    mainDeck: string[];
    eggDeck: string[];
    wins: number;
    losses: number;
    draws: number;
    matches: number;
  }>;
  summary: MatchHistorySummary;
};

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string; availableAt?: number };
    throw new AccountApiError(response.status, body.error, body.availableAt);
  }
  return response.json() as Promise<T>;
}

export class AccountApiError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
    readonly availableAt?: number,
  ) {
    super(code ?? String(status));
  }
}

export const accountApi = {
  base: apiBase,
  me: () => request<RemoteAccount | null>("/auth/me"),
  profile: () => request<AccountProfile>("/account/profile"),
  playtest: () => request<PlaytestMembership>("/account/playtest"),
  setPlaytest: (member: boolean) =>
    request<PlaytestMembership>("/account/playtest", { method: "PUT", body: JSON.stringify({ member }) }),
  matches: ({
    page,
    limit,
    result,
    mode,
    opponent,
    deckId,
    deckWindow,
  }: { page: number; limit: number } & MatchHistoryFilter) =>
    request<MatchHistoryPage>(
      `/account/matches?${new URLSearchParams({
        page: String(page),
        limit: String(limit),
        ...(result ? { result } : {}),
        ...(mode ? { mode } : {}),
        ...(opponent ? { opponent } : {}),
        ...(deckId ? { deckId } : {}),
        ...(deckWindow ? { deckWindow } : {}),
      })}`,
    ),
  matchHistoryExport: () => request<MatchHistoryExport>("/account/matches/export"),
  updateProfile: (changes: { displayName: string; avatarId: AvatarChoice }) =>
    request<RemoteAccount>("/account/profile", { method: "PUT", body: JSON.stringify(changes) }),
  updateAvatar: (avatarId: AvatarChoice) =>
    request<RemoteAccount>("/account/profile/avatar", { method: "PUT", body: JSON.stringify({ avatarId }) }),
  refreshDiscordAvatar: () => request<RemoteAccount>("/account/avatar/discord", { method: "POST" }),
  uploadAvatarImage: (image: Blob) =>
    request<RemoteAccount>("/account/profile/avatar/image", {
      method: "PUT",
      body: image,
      headers: { "Content-Type": image.type },
    }),
  clearAvatarImage: () => request<RemoteAccount>("/account/profile/avatar/image", { method: "DELETE" }),
  updateDisplayName: (displayName: string) =>
    request<RemoteAccount>("/account/profile/display-name", { method: "PUT", body: JSON.stringify({ displayName }) }),
  preferences: () => request<AccountPreferences>("/account/preferences"),
  updatePreferences: (changes: AccountPreferences) =>
    request<AccountPreferences>("/account/preferences", { method: "PUT", body: JSON.stringify(changes) }),
  magicLink: (email: string, turnstileToken?: string) =>
    request<{ ok: true }>("/auth/magic-link", { method: "POST", body: JSON.stringify({ email, turnstileToken }) }),
  logout: () => fetch(`${apiBase}/auth/logout`, { method: "POST", credentials: "include" }),
  decks: async (): Promise<DeckListing[]> =>
    (
      await request<
        Array<{
          id: string;
          name: string;
          mainDeck: string[];
          eggDeck: string[];
          mainDeckArts?: string[];
          eggDeckArts?: string[];
          coverCardId?: string;
          sleeveId?: string;
          eggSleeveId?: string;
          format?: import("@aegis/shared").DeckFormat;
          updatedAt?: number;
        }>
      >("/account/decks")
    ).map((deck) => ({ ...deck, color: dominantColor([...deck.mainDeck, ...deck.eggDeck]), blurb: "deck.blurbSaved" })),
  matchOwnDeck: (matchId: string) => request<UsedDeck>(`/account/matches/${encodeURIComponent(matchId)}/own-deck`),
  matchOpponentDeck: (matchId: string) =>
    request<UsedDeck>(`/account/matches/${encodeURIComponent(matchId)}/opponent-deck`),
  saveDeck: (deck: DeckListing) =>
    request(`/account/decks/${encodeURIComponent(deck.id)}`, {
      method: "PUT",
      body: JSON.stringify({
        name: deck.name,
        mainDeck: deck.mainDeck,
        eggDeck: deck.eggDeck,
        mainDeckArts: deck.mainDeckArts,
        eggDeckArts: deck.eggDeckArts,
        coverCardId: deck.coverCardId,
        sleeveId: deck.sleeveId ?? null,
        eggSleeveId: deck.eggSleeveId ?? null,
        format: deck.format ?? "standard",
      }),
    }),
  deleteDeck: async (id: string): Promise<void> => {
    // The api answers 204 with no body, so the JSON-parsing request helper does not fit here.
    const response = await fetch(`${apiBase}/account/decks/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok && response.status !== 404) throw new AccountApiError(response.status);
  },
};
