import { RankedReportStatus } from "@aegis/shared/ranked/RankedReportStatus";
import type { BadgeTone } from "@/design/primitives";

export function getRankedReportStatusTone(status: RankedReportStatus): BadgeTone {
  if (status === RankedReportStatus.CONFIRMED.value) {
    return "success";
  }
  if (status === RankedReportStatus.REJECTED.value) {
    return "neutral";
  }
  return "warning";
}
