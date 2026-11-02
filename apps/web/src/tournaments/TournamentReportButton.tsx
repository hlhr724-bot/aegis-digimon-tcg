import "@/tournaments/tournamentReportButton.css";
import { useId, useState } from "react";
import {
  TOURNAMENT_REPORT_DETAILS_MAX,
  type TournamentReportInput,
} from "@aegis/shared/tournaments/TournamentReportInput";
import { TournamentReportReason } from "@aegis/shared/tournaments/TournamentReportReason";
import { AccountApiError } from "@/account/client";
import { Icons } from "@/design/icons";
import { Alert, Button, Dialog } from "@/design/primitives";
import type { TranslationKey } from "@/i18n/translationTypes";
import { useTranslation } from "@/i18n/useTranslation";
import { tournamentReportApi } from "@/tournaments/tournamentReportApi";

type Props = {
  tournamentId: string;
  tournamentName: string;
  organizerId: string | null;
  accountId: string | undefined;
};

type DialogProps = {
  tournamentId: string;
  tournamentName: string;
  onReported: () => void;
  onClose: () => void;
};

const ERROR_KEYS: Partial<Record<number, TranslationKey>> = {
  403: "tournaments.report.errorOwn",
  404: "tournaments.report.errorGone",
  429: "community.report.errorTooMany",
};

export function TournamentReportButton({ tournamentId, tournamentName, organizerId, accountId }: Props) {
  const { t } = useTranslation();
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);

  if (accountId === undefined || accountId === organizerId) {
    return null;
  }
  if (reported) {
    return (
      <span className="tournament-report__done" role="status">
        <Icons.Flag size={14} />
        {t("tournaments.report.done")}
      </span>
    );
  }
  return (
    <>
      <Button variant="ghost" size="sm" icon={Icons.Flag} onClick={() => setReporting(true)}>
        {t("tournaments.report.open")}
      </Button>
      {reporting ? (
        <TournamentReportDialog
          tournamentId={tournamentId}
          tournamentName={tournamentName}
          onClose={() => setReporting(false)}
          onReported={() => {
            setReporting(false);
            setReported(true);
          }}
        />
      ) : null}
    </>
  );
}

function TournamentReportDialog({ tournamentId, tournamentName, onReported, onClose }: DialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const reasonName = useId();
  const detailsId = useId();
  const [reason, setReason] = useState<TournamentReportReason>(TournamentReportReason.OFFENSIVE_CONTENT.value);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<TranslationKey>();

  const submit = () => {
    setSubmitting(true);
    setError(undefined);
    const input: TournamentReportInput = details.trim() ? { reason, details } : { reason };
    void tournamentReportApi
      .report(tournamentId, input)
      .then(onReported)
      .catch((failure: unknown) => {
        const known = failure instanceof AccountApiError ? ERROR_KEYS[failure.status] : undefined;
        setError(known ?? "community.report.errorGeneric");
        setSubmitting(false);
      });
  };

  return (
    <Dialog className="tournament-report" labelledBy={titleId} onClose={onClose} closeOnBackdrop={!details}>
      <header className="aegis-dialog__header">
        <span className="tournament-report__title">
          <Icons.Flag size={20} />
          <h2 id={titleId}>{t("community.report.title", { name: tournamentName })}</h2>
        </span>
        <p>{t("tournaments.report.body")}</p>
      </header>

      <fieldset className="tournament-report__reasons">
        <legend className="aegis-field__label">{t("community.report.reasonLabel")}</legend>
        {Object.values(TournamentReportReason).map((option) => (
          <label key={option.value} className="tournament-report__reason">
            <input
              type="radio"
              name={reasonName}
              value={option.value}
              checked={reason === option.value}
              onChange={() => setReason(option.value)}
            />
            <span>{t(option.labelKey)}</span>
          </label>
        ))}
      </fieldset>

      <div className="aegis-field">
        <label className="aegis-field__label" htmlFor={detailsId}>
          {t("community.report.detailsLabel")}
        </label>
        <textarea
          id={detailsId}
          className="aegis-field__control"
          rows={3}
          maxLength={TOURNAMENT_REPORT_DETAILS_MAX}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
        />
        <span className="aegis-field__message">
          {details.length}/{TOURNAMENT_REPORT_DETAILS_MAX}
        </span>
      </div>

      {error ? <Alert tone="danger">{t(error)}</Alert> : null}

      <footer className="tournament-report__actions">
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button onClick={submit} disabled={submitting}>
          {t(submitting ? "community.report.sending" : "community.report.send")}
        </Button>
      </footer>
    </Dialog>
  );
}
