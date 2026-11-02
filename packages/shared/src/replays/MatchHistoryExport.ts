import type { MatchHistoryRecord } from "#shared/replays";

export type MatchHistoryExportRecord = Pick<
  MatchHistoryRecord,
  "id" | "mode" | "opponentName" | "opponentKind" | "result" | "reason" | "finishedAt" | "deckName"
>;

export type MatchHistoryExport = {
  exportedAt: number;
  matches: MatchHistoryExportRecord[];
};
