import { RANKED_REPORT_RULINGS, type RankedReportRuling } from "#shared/ranked/RankedReportStatus";

export function isRankedReportRuling(value: unknown): value is RankedReportRuling {
  return typeof value === "string" && RANKED_REPORT_RULINGS.some((ruling) => ruling === value);
}
