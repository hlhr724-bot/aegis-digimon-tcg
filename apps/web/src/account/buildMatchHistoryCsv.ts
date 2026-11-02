import type { MatchHistoryExportRecord } from "@aegis/shared/replays/MatchHistoryExport";

const COLUMNS = ["finished_at", "mode", "result", "reason", "opponent", "opponent_kind", "deck", "match_id"] as const;
const SPREADSHEET_FORMULA_START = /^[=+\-@\t\r]/;

function csvField(value: string): string {
  const safe = SPREADSHEET_FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function buildMatchHistoryCsv(matches: readonly MatchHistoryExportRecord[]): string {
  const rows = matches.map((match) =>
    [
      new Date(match.finishedAt).toISOString(),
      match.mode,
      match.result,
      match.reason,
      match.opponentName,
      match.opponentKind,
      match.deckName ?? "",
      match.id,
    ]
      .map(csvField)
      .join(","),
  );
  return [COLUMNS.join(","), ...rows].join("\r\n") + "\r\n";
}
