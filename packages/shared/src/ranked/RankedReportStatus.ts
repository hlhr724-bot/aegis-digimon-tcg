export const RankedReportStatus = {
  PENDING: { name: "PENDING", value: "pending", isRuling: false, voidsGame: false },
  CONFIRMED: { name: "CONFIRMED", value: "confirmed", isRuling: true, voidsGame: true },
  REJECTED: { name: "REJECTED", value: "rejected", isRuling: true, voidsGame: false },
} as const;

type RankedReportStatusEntry = (typeof RankedReportStatus)[keyof typeof RankedReportStatus];
type RankedReportRulingEntry = Extract<RankedReportStatusEntry, { readonly isRuling: true }>;

export type RankedReportStatus = RankedReportStatusEntry["value"];
export type RankedReportRuling = RankedReportRulingEntry["value"];

export const RANKED_REPORT_RULINGS: readonly RankedReportRuling[] = Object.values(RankedReportStatus)
  .filter((entry): entry is RankedReportRulingEntry => entry.isRuling)
  .map(({ value }) => value);
