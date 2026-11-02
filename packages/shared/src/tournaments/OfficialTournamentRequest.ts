import type { FeedbackStatus } from "#shared/feedback/FeedbackStatus";

export const OFFICIAL_TOURNAMENT_REQUEST_MESSAGE_MAX = 1000;

export type OfficialTournamentRequest = {
  id: number;
  status: FeedbackStatus;
  message: string | null;
  finalReply: string | null;
  createdAt: number;
};
