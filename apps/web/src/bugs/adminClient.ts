import type {
  FeedbackStatus,
  FeedbackStatusChange,
  FeedbackTriageUpdate,
  PlaytestMember,
  PlaytestStudy,
} from "@aegis/shared";
import { accountApi } from "../account/client";
import { BugReportApiError, type BugReportDraft, type FeedbackKind } from "./client";

export type FeedbackRecord = {
  id: number;
  report: BugReportDraft & {
    reporterName?: string;
    clientRevision?: string;
    userAgent?: string;
    serverRevision?: string;
    publicVersion?: string;
    tournamentId?: string;
  };
  createdAt: number;
  githubStatus: "pending" | "sent" | "failed" | "disabled";
  githubNumber: number | null;
  githubUrl: string | null;
  status: FeedbackStatus;
  finalReply: string | null;
  internalNote: string | null;
  duplicateOfId: number | null;
  revision: number;
  hasReporterAccount: boolean;
  reopenedAt: number | null;
  confirmedBug: boolean;
};

export type FeedbackDetail = FeedbackRecord & {
  history: (FeedbackStatusChange & { actorName: string | null })[];
  /** The reporter's confirmed-bug points; null for an anonymous report. */
  reporterConfirmedBugs: number | null;
};

export type FeedbackFilter = {
  status?: FeedbackStatus;
  /** Reports their reporter reopened that are still open. Exclusive with `status`. */
  reopened?: boolean;
  kind?: FeedbackKind;
  search?: string;
};

export type FeedbackPage = {
  items: FeedbackRecord[];
  nextBefore: number | null;
  counts: Record<FeedbackStatus, number>;
  reopenedCount: number;
};

/** Another admin saved first; `current` is what they saved. */
export class FeedbackConflictError extends Error {
  constructor(readonly current: FeedbackDetail) {
    super("stale_revision");
  }
}

async function read<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new BugReportApiError(response.status, body.error);
  }
  return response.json() as Promise<T>;
}

export async function listFeedback(
  filter: FeedbackFilter & { before?: number } = {},
  signal?: AbortSignal,
): Promise<FeedbackPage> {
  const query = new URLSearchParams();
  if (filter.status) query.set("status", filter.status);
  if (filter.reopened) query.set("reopened", "1");
  if (filter.kind) query.set("kind", filter.kind);
  if (filter.search) query.set("q", filter.search);
  if (filter.before !== undefined) query.set("before", String(filter.before));
  const suffix = query.toString() ? `?${query}` : "";
  return read(
    await fetch(`${accountApi.base}/account/admin/feedback${suffix}`, {
      credentials: "include",
      cache: "no-store",
      signal,
    }),
  );
}

export async function getFeedback(id: number, signal?: AbortSignal): Promise<FeedbackDetail> {
  return read(
    await fetch(`${accountApi.base}/account/admin/feedback/${id}`, {
      credentials: "include",
      cache: "no-store",
      signal,
    }),
  );
}

export async function triageFeedback(id: number, update: FeedbackTriageUpdate): Promise<FeedbackDetail> {
  const response = await fetch(`${accountApi.base}/account/admin/feedback/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
  if (response.status === 409) {
    const body = (await response.json()) as { current: FeedbackDetail };
    throw new FeedbackConflictError(body.current);
  }
  return read(response);
}

export async function listPlaytestMembers(signal?: AbortSignal): Promise<{ members: PlaytestMember[] }> {
  return read(
    await fetch(`${accountApi.base}/account/admin/playtest/members`, {
      credentials: "include",
      cache: "no-store",
      signal,
    }),
  );
}

export async function listStudies(signal?: AbortSignal): Promise<{ open: PlaytestStudy[]; past: PlaytestStudy[] }> {
  return read(
    await fetch(`${accountApi.base}/account/admin/playtest/studies`, {
      credentials: "include",
      cache: "no-store",
      signal,
    }),
  );
}

export async function createStudy(input: {
  title: string;
  blurb: string;
  link: string;
  closesAt: number;
}): Promise<{ study: PlaytestStudy; notified: number }> {
  return read(
    await fetch(`${accountApi.base}/account/admin/playtest/studies`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}
