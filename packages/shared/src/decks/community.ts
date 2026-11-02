export const COMMUNITY_DECK_NAME_MAX = 40;
export const COMMUNITY_GUIDE_MAX = 5000;
export const COMMUNITY_PAGE_SIZE = 24;

export const COMMUNITY_SORTS = ["top", "new"] as const;
export type CommunitySort = (typeof COMMUNITY_SORTS)[number];

export const COMMUNITY_PERIODS = ["week", "month", "all"] as const;
export type CommunityPeriod = (typeof COMMUNITY_PERIODS)[number];

/** `hidden` is set by moderation, never by the owner, and only a moderator lifts it. */
export type CommunityPublicationStatus = "public" | "hidden";

export interface CommunityDeckAuthor {
  id: string;
  displayName: string;
}

export interface CommunityDeckSummary {
  id: string;
  name: string;
  author: CommunityDeckAuthor;
  colors: string[];
  coverCardId: string | null;
  likeCount: number;
  copyCount: number;
  likedByMe: boolean;
  hasGuide: boolean;
  legal: boolean;
  publishedAt: number;
  updatedAt: number;
}

export interface CommunityDeck extends CommunityDeckSummary {
  guide: string | null;
  /** Always `public` for players; only moderators can open a hidden deck. */
  status: CommunityPublicationStatus;
  mainDeck: string[];
  eggDeck: string[];
  mainDeckArts: string[];
  eggDeckArts: string[];
  moderation?: CommunityModeration;
}

export interface CommunityDeckPage {
  decks: CommunityDeckSummary[];
  hasMore: boolean;
}

/** One of the viewer's own saved decks that is public or hidden, keyed back to the saved deck. */
export interface CommunityPublication {
  id: string;
  sourceDeckId: string;
  name: string;
  likeCount: number;
  /** The saved deck changed after it was published, so the public copy is behind. */
  outdated: boolean;
  status: CommunityPublicationStatus;
  moderation?: CommunityModeration;
}

export interface CommunityLikeResult {
  liked: boolean;
  likeCount: number;
}

export type CommunityPublishError = "deck_not_found" | "deck_not_legal" | "name_not_allowed" | "deck_hidden";

export const COMMUNITY_REPORT_REASONS = ["offensive_name", "inappropriate_content", "spam", "other"] as const;
export type CommunityReportReason = (typeof COMMUNITY_REPORT_REASONS)[number];
export const COMMUNITY_REPORT_DETAILS_MAX = 500;

export interface CommunityReportInput {
  reason: CommunityReportReason;
  details?: string;
}

/** One open report on a public deck, as a moderator sees it. */
export interface CommunityDeckReport {
  reason: CommunityReportReason;
  details: string | null;
  reporterName: string | null;
  createdAt: number;
}

/** A deck with reports a moderator has not handled yet, for the moderation queue. */
export interface ReportedCommunityDeck {
  id: string;
  name: string;
  authorName: string;
  status: CommunityPublicationStatus;
  openReports: number;
  lastReportedAt: number | null;
  reviewRequestedAt: number | null;
  reviewNote: string | null;
}

export const COMMUNITY_MODERATION_ACTIONS = ["hide", "restore", "decline_review"] as const;
export type CommunityModerationAction = (typeof COMMUNITY_MODERATION_ACTIONS)[number];
export const COMMUNITY_MODERATION_NOTE_MAX = 500;

export type CommunityModerationInput =
  | { action: "hide"; reason: CommunityReportReason; note?: string }
  | { action: "restore" }
  | { action: "decline_review"; note?: string };

export interface CommunityModeration {
  reason: CommunityReportReason | null;
  note: string | null;
  hiddenAt: number | null;
  reviewRequestedAt: number | null;
  reviewNote: string | null;
}

export interface CommunityReviewInput {
  note?: string;
}

export type CommunityReviewError =
  | "deck_not_found"
  | "deck_not_hidden"
  | "review_pending"
  | "deck_not_legal"
  | "name_not_allowed";

export type CommunityGuideError = "deck_not_found" | "guide_too_long" | "guide_not_allowed" | "invalid_guide";
