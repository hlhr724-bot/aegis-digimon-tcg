import type { SeriesScoreView } from "@aegis/shared";

export function isTournamentSeriesLive(series: Pick<SeriesScoreView, "status"> | undefined): boolean {
  return series?.status === "playing" || series?.status === "overtime";
}
