import { useId, useState } from "react";
import type { RankedReportOverview, RankedReportableGame } from "@aegis/shared/ranked/RankedContracts";
import { MAX_RANKED_REPORT_DESCRIPTION, MAX_RANKED_REPORT_TURN } from "@aegis/shared/ranked/rankedReportLimits";
import { AccountApiError, request } from "@/account/client";
import { useTranslation } from "@/i18n/useTranslation";
import type { TranslationKey } from "@/i18n/translationTypes";
import { Badge, Button, Field } from "@/design/primitives";
import { useRankedRequest } from "@/ranked/useRankedRequest";
import { RankedReportReviewPanel } from "@/ranked/RankedReportReviewPanel";
import { getRankedReportStatusTone } from "@/ranked/getRankedReportStatusTone";
import { formatRatingChange } from "@/ranked/formatRatingChange";

type Props = { signedIn: boolean; canJudge: boolean };
type FormProps = { game: RankedReportableGame; onDone: (sent: boolean) => void };

const KNOWN_ERRORS = [
  "ranked_report_not_loser",
  "ranked_report_window_closed",
  "ranked_report_duplicate",
  "ranked_report_limit_reached",
  "ranked_report_season_finalized",
  "ranked_report_game_voided",
  "ranked_report_not_found",
] as const;

export function RankedReportsPanel({ signedIn, canJudge }: Props) {
  const { t, locale } = useTranslation();
  const { data, error, refresh } = useRankedRequest<RankedReportOverview>(signedIn ? "/ranked/reports" : null);
  const [openPairId, setOpenPairId] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  if (!signedIn) {
    return <p>{t("ranked.season.signIn")}</p>;
  }
  const time = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });
  return (
    <section className="ranked-reports" aria-label={t("ranked.season.reports")}>
      <p className="ranked-reports__intro">{t("ranked.report.intro")}</p>
      {error ? (
        <p role="alert">
          {t("ranked.season.error")}{" "}
          <Button variant="secondary" onClick={refresh}>
            {t("ranked.season.retry")}
          </Button>
        </p>
      ) : null}
      {!data && !error ? <p role="status">{t("common.loading")}</p> : null}
      {sent ? <p role="status">{t("ranked.report.sent")}</p> : null}
      {data ? (
        <>
          <div className="ranked-reports__quota">
            <p>{t("ranked.report.quota", { used: data.used, limit: data.limit })}</p>
            <progress max={data.limit} value={data.used} aria-hidden="true" />
          </div>
          <h2>{t("ranked.report.reportable")}</h2>
          {data.reportable.length === 0 ? <p className="ranked-empty">{t("ranked.report.noneReportable")}</p> : null}
          {data.reportable.map((game) => (
            <article className="ranked-report" key={game.pairId}>
              <div className="ranked-report__summary">
                <h3>{t("ranked.report.game", { opponent: game.opponentName, format: game.format })}</h3>
                <p className="ranked-report__meta">
                  {t("ranked.report.deadline", { time: time.format(game.reportDeadline) })}
                </p>
                {game.remainingReports === 0 ? <p>{t("ranked.report.noneLeft")}</p> : null}
              </div>
              {openPairId === game.pairId ? (
                <RankedReportForm
                  game={game}
                  onDone={(wasSent) => {
                    setOpenPairId(null);
                    setSent(wasSent);
                    refresh();
                  }}
                />
              ) : (
                <Button
                  variant="secondary"
                  disabled={game.remainingReports === 0}
                  onClick={() => {
                    setSent(false);
                    setOpenPairId(game.pairId);
                  }}
                >
                  {t("ranked.report.start")}
                </Button>
              )}
            </article>
          ))}
          <h2>{t("ranked.report.mine")}</h2>
          {data.reports.length === 0 ? <p className="ranked-empty">{t("ranked.report.noReports")}</p> : null}
          {data.reports.map((report) => (
            <article className="ranked-report" key={report.id}>
              <div className="ranked-report__summary">
                <h3>{t("ranked.report.game", { opponent: report.opponentName, format: report.format })}</h3>
                <p className="ranked-report__meta">
                  {t("ranked.report.turnLabel", { turn: report.turn })} · {time.format(report.createdAt)}
                </p>
                <p className="ranked-report__description">{report.description}</p>
                {report.ratingChange !== null ? (
                  <p>{t("ranked.report.ratingChange", { change: formatRatingChange(report.ratingChange) })}</p>
                ) : null}
              </div>
              <Badge tone={getRankedReportStatusTone(report.status)}>
                {t(`ranked.report.status.${report.status}`)}
              </Badge>
            </article>
          ))}
        </>
      ) : null}
      {canJudge ? <RankedReportReviewPanel /> : null}
    </section>
  );
}

function RankedReportForm({ game, onDone }: FormProps) {
  const { t } = useTranslation();
  const descriptionId = useId();
  const [turn, setTurn] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  async function submitReport() {
    setBusy(true);
    setErrorKey(null);
    try {
      await request("/ranked/reports", {
        method: "POST",
        body: JSON.stringify({ pairId: game.pairId, turn: Number(turn), description: description.trim() }),
      });
      onDone(true);
    } catch (error) {
      setErrorKey(getReportErrorKey(error));
    } finally {
      setBusy(false);
    }
  }
  const turnNumber = Number(turn);
  const valid =
    turn !== "" &&
    Number.isSafeInteger(turnNumber) &&
    turnNumber >= 0 &&
    turnNumber <= MAX_RANKED_REPORT_TURN &&
    description.trim().length > 0;
  return (
    <form
      className="ranked-report__form"
      onSubmit={(event) => {
        event.preventDefault();
        void submitReport();
      }}
    >
      <Field
        label={t("ranked.report.turn")}
        hint={t("ranked.report.turnHint")}
        type="number"
        inputMode="numeric"
        min={0}
        max={MAX_RANKED_REPORT_TURN}
        step={1}
        required
        value={turn}
        onChange={(event) => setTurn(event.target.value)}
      />
      <div className="aegis-field">
        <label className="aegis-field__label" htmlFor={descriptionId}>
          {t("ranked.report.description")}
        </label>
        <textarea
          id={descriptionId}
          className="aegis-field__control"
          rows={4}
          required
          maxLength={MAX_RANKED_REPORT_DESCRIPTION}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      {errorKey ? <p role="alert">{t(errorKey)}</p> : null}
      <div className="ranked-report__actions">
        <Button variant="secondary" type="button" disabled={busy} onClick={() => onDone(false)}>
          {t("ranked.report.cancel")}
        </Button>
        <Button type="submit" disabled={busy || !valid}>
          {t("ranked.report.submit")}
        </Button>
      </div>
    </form>
  );
}

function getReportErrorKey(error: unknown): TranslationKey {
  const code = error instanceof AccountApiError ? error.code : undefined;
  const known = KNOWN_ERRORS.find((entry) => entry === code);
  if (known) {
    return `ranked.report.error.${known}`;
  }
  return "ranked.report.error.generic";
}
