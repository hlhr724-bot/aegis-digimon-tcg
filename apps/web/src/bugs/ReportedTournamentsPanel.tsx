import "@/bugs/reportedTournaments.css";
import { useEffect, useState } from "react";
import type { TournamentReport } from "@aegis/shared/tournaments/TournamentReport";
import { TournamentReportAction } from "@aegis/shared/tournaments/TournamentReportAction";
import { TournamentReportReason } from "@aegis/shared/tournaments/TournamentReportReason";
import { AccountApiError } from "@/account/client";
import { Icons } from "@/design/icons";
import { Alert, Button } from "@/design/primitives";
import { relativeTime } from "@/i18n/relativeTime";
import type { TranslationKey } from "@/i18n/translationTypes";
import { useTranslation } from "@/i18n/useTranslation";
import { pathForRoute } from "@/routes";
import { tournamentReportApi } from "@/tournaments/tournamentReportApi";

type ReportedTournament = {
  tournamentId: string;
  tournamentName: string;
  organizerName: string;
  canDeleteTournament: boolean;
  reports: TournamentReport[];
};

type GroupProps = {
  group: ReportedTournament;
  onResolved: (tournamentId: string) => void;
};

export function ReportedTournamentsPanel() {
  const { t } = useTranslation();
  const [reports, setReports] = useState<TournamentReport[]>([]);

  useEffect(() => {
    let current = true;
    tournamentReportApi
      .listOpen()
      .then((loaded) => {
        if (current) {
          setReports(loaded);
        }
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);

  const groups = groupReportsByTournament(reports);
  if (!groups.length) {
    return null;
  }

  return (
    <details className="reported-tournaments">
      <summary>
        <Icons.Flag size={16} />
        {t("feedback.reportedTournaments.title", { count: groups.length })}
      </summary>
      <ul>
        {groups.map((group) => (
          <ReportedTournamentItem
            key={group.tournamentId}
            group={group}
            onResolved={(tournamentId) =>
              setReports((previous) => previous.filter((report) => report.tournamentId !== tournamentId))
            }
          />
        ))}
      </ul>
    </details>
  );
}

function ReportedTournamentItem({ group, onResolved }: GroupProps) {
  const { t, locale } = useTranslation();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TranslationKey>();
  const firstReport = group.reports[0]!;

  const resolve = (action: TournamentReportAction) => {
    setBusy(true);
    setError(undefined);
    tournamentReportApi
      .resolve(firstReport.id, action)
      .then(() => onResolved(group.tournamentId))
      .catch((failure: unknown) => {
        const started = failure instanceof AccountApiError && failure.status === 409;
        setError(started ? "feedback.reportedTournaments.started" : "feedback.reportedTournaments.failed");
        setConfirmingDelete(false);
        setBusy(false);
      });
  };

  return (
    <li className="reported-tournaments__item">
      <div className="reported-tournaments__head">
        <a
          className="reported-tournaments__name"
          href={pathForRoute({ screen: "tournaments", tournament: { kind: "detail", id: group.tournamentId } })}
        >
          {group.tournamentName}
        </a>
        <span className="reported-tournaments__meta">
          {t("feedback.reportedTournaments.organizer", { name: group.organizerName })} ·{" "}
          {t("feedback.reportedDecks.reports", { count: firstReport.openReportsForTournament })}
        </span>
      </div>
      <ul className="reported-tournaments__reports">
        {group.reports.map((report) => (
          <li key={report.id}>
            <strong>{t(getReasonLabelKey(report.reason))}</strong>
            {report.details ? <p>{report.details}</p> : null}
            <small>
              {report.reporterName ?? t("community.reports.formerPlayer")} ·{" "}
              <time dateTime={new Date(report.createdAt).toISOString()}>
                {relativeTime({ at: report.createdAt, locale })}
              </time>
            </small>
          </li>
        ))}
      </ul>
      {error ? <Alert tone="warning">{t(error)}</Alert> : null}
      {confirmingDelete ? (
        <div className="reported-tournaments__confirm">
          <p>{t("tournaments.detail.deleteConfirm")}</p>
          <div className="reported-tournaments__actions">
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() => resolve(TournamentReportAction.DELETE_TOURNAMENT.value)}
            >
              {t("tournaments.detail.deleteConfirmYes")}
            </Button>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirmingDelete(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="reported-tournaments__actions">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => resolve(TournamentReportAction.DISMISS.value)}
          >
            {t("feedback.reportedTournaments.dismiss")}
          </Button>
          {group.canDeleteTournament ? (
            <Button variant="danger" size="sm" disabled={busy} onClick={() => setConfirmingDelete(true)}>
              {t("feedback.reportedTournaments.delete")}
            </Button>
          ) : (
            <span className="reported-tournaments__hint">{t("feedback.reportedTournaments.started")}</span>
          )}
        </div>
      )}
    </li>
  );
}

function groupReportsByTournament(reports: readonly TournamentReport[]): ReportedTournament[] {
  const groups = new Map<string, ReportedTournament>();
  for (const report of reports) {
    const group = groups.get(report.tournamentId) ?? {
      tournamentId: report.tournamentId,
      tournamentName: report.tournamentName,
      organizerName: report.organizerName,
      canDeleteTournament: report.canDeleteTournament,
      reports: [],
    };
    group.reports.push(report);
    groups.set(report.tournamentId, group);
  }
  return [...groups.values()];
}

function getReasonLabelKey(reason: TournamentReportReason): TranslationKey {
  const entry = Object.values(TournamentReportReason).find((option) => option.value === reason);
  return entry?.labelKey ?? TournamentReportReason.OTHER.labelKey;
}
