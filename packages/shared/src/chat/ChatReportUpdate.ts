import type { ChatReportStatus } from "#shared/chat/ChatReportStatus";

export const CHAT_REPORT_CHANNEL = "chatReport";

export type ChatReportUpdate = { status: ChatReportStatus };
