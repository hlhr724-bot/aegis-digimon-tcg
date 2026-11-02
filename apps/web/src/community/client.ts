import type { DeckFormat } from "@aegis/shared/deckFormat";
import type { CommunityRandomResult } from "@aegis/shared/decks/CommunityRandomResult";
import type {
  CommunityDeck,
  CommunityDeckPage,
  CommunityDeckReport,
  CommunityLikeResult,
  CommunityModerationInput,
  CommunityPeriod,
  CommunityPublication,
  CommunityPublicationStatus,
  CommunityReportInput,
  CommunityReviewInput,
  CommunitySort,
  ReportedCommunityDeck,
} from "@aegis/shared";
import { AccountApiError, accountApi, request } from "../account/client";

export type CommunityBrowseQuery = {
  sort: CommunitySort;
  period: CommunityPeriod;
  colors: readonly string[];
  search: string;
  page: number;
};

/** For the endpoints that answer 204 with no body, which the JSON helper cannot parse. */
async function send(path: string, method: string, payload?: unknown): Promise<void> {
  const response = await fetch(`${accountApi.base}${path}`, {
    method,
    credentials: "include",
    ...(payload === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new AccountApiError(response.status, body.error);
  }
}

export const communityApi = {
  randomDeck: ({ format, betaAllowed }: { format: DeckFormat; betaAllowed: boolean }) =>
    request<CommunityRandomResult>(
      `/community/decks/random?${new URLSearchParams({ format, beta: String(betaAllowed) })}`,
    ),
  browse: (query: CommunityBrowseQuery) => {
    const params = new URLSearchParams({ sort: query.sort, period: query.period, page: String(query.page) });
    if (query.search.trim()) params.set("q", query.search.trim());
    if (query.colors.length > 0) params.set("colors", query.colors.join(","));
    return request<CommunityDeckPage>(`/community/decks?${params}`);
  },
  deck: (id: string) => request<CommunityDeck>(`/community/decks/${encodeURIComponent(id)}`),
  updateGuide: (id: string, guide: string | null) =>
    request<{ guide: string | null }>(`/community/decks/${encodeURIComponent(id)}/guide`, {
      method: "PUT",
      body: JSON.stringify({ guide }),
    }),
  setLike: (id: string, liked: boolean) =>
    request<CommunityLikeResult>(`/community/decks/${encodeURIComponent(id)}/like`, {
      method: liked ? "PUT" : "DELETE",
    }),
  recordCopy: (id: string) => send(`/community/decks/${encodeURIComponent(id)}/copies`, "POST"),
  publications: () => request<CommunityPublication[]>("/community/publications"),
  publish: (deckId: string) =>
    request<CommunityPublication>(`/community/publications/${encodeURIComponent(deckId)}`, { method: "PUT" }),
  unpublish: (deckId: string) => send(`/community/publications/${encodeURIComponent(deckId)}`, "DELETE"),
  report: (id: string, input: CommunityReportInput) =>
    send(`/community/decks/${encodeURIComponent(id)}/reports`, "POST", input),
  requestReview: (deckId: string, input: CommunityReviewInput) =>
    request<CommunityPublication>(`/community/publications/${encodeURIComponent(deckId)}/review`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  moderate: (id: string, input: CommunityModerationInput) =>
    request<{ status: CommunityPublicationStatus | "unpublished" }>(
      `/account/admin/community/decks/${encodeURIComponent(id)}/moderation`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  reportedDecks: async () =>
    (await request<{ decks: ReportedCommunityDeck[] }>("/account/admin/community/reports")).decks,
  openReports: async (id: string) =>
    (
      await request<{ reports: CommunityDeckReport[] }>(
        `/account/admin/community/decks/${encodeURIComponent(id)}/reports`,
      )
    ).reports,
  dismissReports: (id: string) =>
    request<{ dismissed: number }>(`/account/admin/community/decks/${encodeURIComponent(id)}/reports/dismiss`, {
      method: "POST",
    }),
};
