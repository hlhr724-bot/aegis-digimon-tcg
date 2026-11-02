import { isTournamentGameTicket } from "@aegis/shared/tournaments/isTournamentGameTicket";
import type { TournamentRoundStartMode } from "@aegis/shared/tournaments/TournamentRoundStartMode";
import type { TournamentOwnDeck } from "@aegis/shared/tournaments/TournamentOwnDeck";
/* The tournament HTTP surface, following the `accountApi` pattern in ../account/client.
   Three differences: every response feeds the server clock with the round trip it was measured
   over, failures are returned as typed values instead of thrown strings (the reason code IS the
   message the UI must render), and every call accepts an `AbortSignal` so a screen can invalidate
   its in-flight requests on unmount. */

import type { TournamentCategory } from "@aegis/shared/tournaments/TournamentCategory";
import type { TournamentGameTicket } from "@aegis/shared/tournaments/TournamentGameTicket";
import type { TournamentSpectatorPolicy } from "@aegis/shared/tournaments/TournamentSpectatorPolicy";
import type { TournamentSpectatorSettings } from "@aegis/shared/tournaments/TournamentSpectatorSettings";
import { accountApi } from "../account/client";
import { observeResponseDate, observeServerTime } from "./serverClock";
import type {
  DeckViolation,
  TournamentDetail,
  TournamentListing,
  TournamentValidationError,
  TournamentWindows,
} from "./types";
import type { CreateTournamentInput } from "@aegis/shared";
import type {
  CreateTournamentCircuitInput,
  TournamentCircuitLeaderboard,
  TournamentCircuitSummary,
  TournamentCircuitView,
} from "@aegis/shared/tournaments/circuits/TournamentCircuitContracts";

export type ApiError = {
  status: number;
  /** The server's `error` field: a `ParticipantFailure`, a bare message, or "invalid tournament". */
  code: string;
  reasons?: TournamentValidationError[];
  violations?: DeckViolation[];
};

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError };

async function send<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const sentAt = Date.now();
  let response: Response;
  try {
    response = await fetch(`${accountApi.base}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    // An abort lands here too; the caller's ordering guard is what distinguishes them, and
    // neither ever reaches the clock.
    return { ok: false, error: { status: 0, code: "network_error" } };
  }
  observeResponseDate(response, sentAt);

  const body = await readJson(response);
  if (body && typeof body === "object" && "serverNow" in body && typeof body.serverNow === "number") {
    // A millisecond field needs no granularity correction, unlike the whole-second `Date` header.
    observeServerTime({ serverEpochMs: body.serverNow, sentAt, receivedAt: Date.now(), granularityMs: 0 });
  }
  if (!response.ok) {
    const failure = body as
      | { error?: string; reasons?: TournamentValidationError[]; violations?: DeckViolation[] }
      | undefined;
    return {
      ok: false,
      error: {
        status: response.status,
        code: failure?.error ?? String(response.status),
        reasons: failure?.reasons,
        violations: failure?.violations,
      },
    };
  }
  return { ok: true, value: body as T };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export const tournamentApi = {
  changeDeck: (id: string, savedDeckId: string) =>
    send<TournamentOwnDeck>(`/tournaments/${encodeURIComponent(id)}/own-deck`, {
      method: "POST",
      body: JSON.stringify({ savedDeckId }),
    }),
  setRoundStartMode: (id: string, mode: TournamentRoundStartMode) =>
    send<unknown>(`/tournaments/${encodeURIComponent(id)}/round-start-mode`, {
      method: "POST",
      body: JSON.stringify({ mode }),
    }),
  startNextRound: (id: string) =>
    send<unknown>(`/tournaments/${encodeURIComponent(id)}/next-round`, { method: "POST", body: "{}" }),
  cancel: (id: string, reason: string, commandId: string) =>
    send<unknown>(`/tournaments/${encodeURIComponent(id)}/arbitration/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason, commandId }),
    }),
  swapPairings: (
    id: string,
    input: {
      firstMatchId: string;
      firstSeat: 0 | 1;
      secondMatchId: string;
      secondSeat: 0 | 1;
      reason: string;
      commandId: string;
    },
  ) =>
    send<unknown>(`/tournaments/${encodeURIComponent(id)}/arbitration/pairings/swap`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  markPresent: (tournamentId: string, matchId: string) =>
    send<unknown>(`/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/present`, {
      method: "POST",
      body: "{}",
    }),
  authorizeGame: async (seriesId: string): Promise<ApiResult<TournamentGameTicket>> => {
    const result = await send<unknown>(`/series/${encodeURIComponent(seriesId)}/authorize-game`, {
      method: "POST",
      body: "{}",
    });
    if (!result.ok) {
      return result;
    }
    if (!isTournamentGameTicket(result.value)) {
      return { ok: false, error: { status: 200, code: "invalid_response" } };
    }
    return { ok: true, value: result.value };
  },
  list: (signal?: AbortSignal) => send<TournamentListing[]>("/tournaments", { signal }),
  detail: (id: string, signal?: AbortSignal) =>
    send<TournamentDetail>(`/tournaments/${encodeURIComponent(id)}`, { signal }),
  create: (input: CreateTournamentInput & { block?: string }) =>
    send<TournamentDetail>("/tournaments", { method: "POST", body: JSON.stringify(input) }),
  register: (id: string, savedDeckId: string, password?: string) =>
    send<unknown>(`/tournaments/${encodeURIComponent(id)}/participants`, {
      method: "POST",
      body: JSON.stringify({ savedDeckId, password }),
    }),
  checkIn: (id: string) =>
    send<unknown>(`/tournaments/${encodeURIComponent(id)}/check-in`, { method: "POST", body: "{}" }),
  drop: (id: string) => send<unknown>(`/tournaments/${encodeURIComponent(id)}/drop`, { method: "POST", body: "{}" }),
  setWindows: (id: string, windows: Partial<TournamentWindows>) =>
    send<TournamentWindows>(`/tournaments/${encodeURIComponent(id)}/windows`, {
      method: "POST",
      body: JSON.stringify(windows),
    }),
  closeCheckIn: (id: string) =>
    send<unknown>(`/tournaments/${encodeURIComponent(id)}/close-check-in`, { method: "POST", body: "{}" }),
  setCategory: (id: string, category: TournamentCategory) =>
    send<{ category: TournamentCategory }>(`/tournaments/${encodeURIComponent(id)}/category`, {
      method: "POST",
      body: JSON.stringify({ category }),
    }),
  setDiscordAnnounce: (id: string, announce: boolean) =>
    send<{ discordAnnounce: boolean }>(`/tournaments/${encodeURIComponent(id)}/discord`, {
      method: "POST",
      body: JSON.stringify({ announce }),
    }),
  remove: (id: string) => send<unknown>(`/tournaments/${encodeURIComponent(id)}`, { method: "DELETE" }),
  spectatorSettings: (id: string, signal?: AbortSignal) =>
    send<TournamentSpectatorSettings>(`/tournaments/${encodeURIComponent(id)}/spectators`, { signal }),
  setSpectatorPolicy: (id: string, policy: TournamentSpectatorPolicy) =>
    send<TournamentSpectatorSettings>(`/tournaments/${encodeURIComponent(id)}/spectators/policy`, {
      method: "PUT",
      body: JSON.stringify({ policy }),
    }),
  addSpectator: (id: string, displayName: string) =>
    send<TournamentSpectatorSettings>(`/tournaments/${encodeURIComponent(id)}/spectators`, {
      method: "POST",
      body: JSON.stringify({ displayName }),
    }),
  removeSpectator: (id: string, accountId: string) =>
    send<TournamentSpectatorSettings>(
      `/tournaments/${encodeURIComponent(id)}/spectators/${encodeURIComponent(accountId)}`,
      { method: "DELETE" },
    ),
  circuits: (signal?: AbortSignal) => send<{ items: TournamentCircuitSummary[] }>("/tournament-circuits", { signal }),
  circuit: (id: string, signal?: AbortSignal) =>
    send<TournamentCircuitView>(`/tournament-circuits/${encodeURIComponent(id)}`, { signal }),
  circuitLeaderboard: (id: string, page: number, signal?: AbortSignal) =>
    send<TournamentCircuitLeaderboard>(`/tournament-circuits/${encodeURIComponent(id)}/leaderboard?page=${page}`, {
      signal,
    }),
  createCircuit: (input: CreateTournamentCircuitInput) =>
    send<TournamentCircuitView>("/tournament-circuits", { method: "POST", body: JSON.stringify(input) }),
  cancelCircuit: (id: string) =>
    send<TournamentCircuitView>(`/tournament-circuits/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      body: "{}",
    }),
};
