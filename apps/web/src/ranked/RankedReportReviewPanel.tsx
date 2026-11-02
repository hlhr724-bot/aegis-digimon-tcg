import { useState } from "react";
import type { RankedAdminReport } from "@aegis/shared/ranked/RankedContracts";
import { RankedReportStatus, type RankedReportRuling } from "@aegis/shared/ranked/RankedReportStatus";
import { accountApi, request } from "@/account/client";
import { useTranslation } from "@/i18n/useTranslation";
import { Button } from "@/design/primitives";
import { useRankedRequest } from "@/ranked/useRankedRequest";

const REVIEW_PATH = "/account/admin/ranked/reports";

export function RankedReportReviewPanel() {
  const { t, locale } = useTranslation();
  const { data, error, refresh } = useRankedRequest<RankedAdminReport[]>(REVIEW_PATH);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);
  async function submitRuling(reportId: string, ruling: RankedReportRuling) {
    setBusyId(reportId);
    setActionError(false);
    try {
      await request(`${REVIEW_PATH}/${reportId}/ruling`, { method: "POST", body: JSON.stringify({ ruling }) });
      refresh();
    } catch {
      setActionError(true);
    } finally {
      setBusyId(null);
    }
  }
  const time = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });
  return (
    <section className="ranked-reports__review" aria-label={t("ranked.report.review")}>
      <h2>{t("ranked.report.review")}</h2>
      {error || actionError ? <p role="alert">{t("ranked.report.reviewError")}</p> : null}
      {!data && !error ? <p role="status">{t("common.loading")}</p> : null}
      {data?.length === 0 ? <p className="ranked-empty">{t("ranked.report.reviewEmpty")}</p> : null}
      {data?.map((report) => (
        <article className="ranked-report" key={report.id}>
          <div className="ranked-report__summary">
            <h3>
              {t("ranked.report.reviewGame", {
                reporter: report.reporterName,
                opponent: report.opponentName,
                season: report.seasonId,
                format: report.format,
              })}
            </h3>
            <p className="ranked-report__meta">
              {t("ranked.report.turnLabel", { turn: report.turn })} · {time.format(report.createdAt)}
            </p>
            <p className="ranked-report__description">{report.description}</p>
            {report.hasReplay ? (
              <a href={`${accountApi.base}${REVIEW_PATH}/${report.id}/replay`} target="_blank" rel="noreferrer">
                {t("ranked.report.replay")}
              </a>
            ) : (
              <p>{t("ranked.report.noReplay")}</p>
            )}
          </div>
          <div className="ranked-report__actions">
            <Button
              variant="danger"
              disabled={busyId !== null}
              onClick={() => void submitRuling(report.id, RankedReportStatus.CONFIRMED.value)}
            >
              {t("ranked.report.confirm")}
            </Button>
            <Button
              variant="secondary"
              disabled={busyId !== null}
              onClick={() => void submitRuling(report.id, RankedReportStatus.REJECTED.value)}
            >
              {t("ranked.report.reject")}
            </Button>
          </div>
        </article>
      ))}
    </section>
  );
}
