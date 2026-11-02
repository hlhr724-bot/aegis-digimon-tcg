import { isClosedFeedbackStatus } from "@aegis/shared/feedback/isClosedFeedbackStatus";
import { MAX_FEEDBACK_REOPEN_COMMENT } from "@aegis/shared/feedback/limits";
import { type OwnFeedbackReport } from "@aegis/shared/feedback/types";
import { useEffect, useId, useRef, useState } from "react";
import { Alert, Badge, Button } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { BugReportApiError, ownFeedbackApi } from "@/bugs/client";
import { FEEDBACK_PROGRESS_STEPS, FEEDBACK_STATUS_TONE } from "@/bugs/feedbackStatus";
import { progressStep } from "@/bugs/progressStep";
import "@/bugs/myFeedback.css";

export function MyFeedbackPanel({
  signedIn,
  focusId,
  onSignIn,
  onSendFeedback,
}: {
  signedIn: boolean;
  /** A report to open and scroll to, e.g. from a notification. */
  focusId?: number;
  onSignIn: () => void;
  onSendFeedback: () => void;
}) {
  const { t } = useTranslation();
  const sendFeedback = (
    <Button variant="secondary" icon={Icons.Megaphone} onClick={onSendFeedback}>
      {t("bugReport.button")}
    </Button>
  );
  const content = signedIn ? (
    <OwnFeedbackList focusId={focusId} />
  ) : (
    <Alert tone="info" title={t("myFeedback.signInTitle")}>
      <p>{t("myFeedback.signInCopy")}</p>
      <Button size="sm" onClick={onSignIn}>
        {t("nav.signIn")}
      </Button>
    </Alert>
  );
  return (
    <div className="my-feedback-panel">
      <header className="my-feedback-header">
        <p>{t("myFeedback.subtitle")}</p>
        {sendFeedback}
      </header>
      {content}
    </div>
  );
}

function OwnFeedbackList({ focusId }: { focusId?: number }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<OwnFeedbackReport[]>();
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const [confirmedBugs, setConfirmedBugs] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void ownFeedbackApi
      .list(undefined, controller.signal)
      .then((page) => {
        setItems((current) => merge(page.items, current ?? []));
        setNextBefore(page.nextBefore);
        setConfirmedBugs(page.confirmedBugs);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  // Read fresh even when the report is already listed: the notification means it just changed.
  useEffect(() => {
    if (focusId === undefined) return;
    const controller = new AbortController();
    setExpanded((current) => new Set(current).add(focusId));
    void ownFeedbackApi
      .read(focusId, controller.signal)
      .then((report) => setItems((current) => merge([report], current ?? [])))
      .catch((failure: unknown) => {
        if (!(failure instanceof BugReportApiError && failure.status === 404)) return;
        setExpanded((current) => {
          const next = new Set(current);
          next.delete(focusId);
          return next;
        });
      });
    return () => controller.abort();
  }, [focusId]);

  const loadMore = async () => {
    if (nextBefore === null) return;
    setLoading(true);
    try {
      const page = await ownFeedbackApi.list(nextBefore);
      setItems((current) => merge(current ?? [], page.items));
      setNextBefore(page.nextBefore);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id: number) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  if (failed && !items?.length) return <Alert tone="warning" title={t("myFeedback.failed")} />;
  if (!items) return <p role="status">{t("common.loading")}</p>;
  if (!items.length) return <p className="my-feedback-empty">{t("myFeedback.empty")}</p>;

  return (
    <>
      <p className="my-feedback-points">
        <strong>{t("myFeedback.points", { count: confirmedBugs })}</strong>
        <span>{t("myFeedback.pointsHint")}</span>
      </p>
      <ul className="my-feedback-list">
        {items.map((report) => (
          <li key={report.id}>
            <OwnFeedbackCard
              report={report}
              expanded={expanded.has(report.id)}
              focused={report.id === focusId}
              onToggle={() => toggle(report.id)}
              onUpdate={(updated) => setItems((current) => merge([updated], current ?? []))}
            />
          </li>
        ))}
      </ul>
      {nextBefore !== null ? (
        <Button variant="secondary" disabled={loading} onClick={() => void loadMore()}>
          {t("myFeedback.loadMore")}
        </Button>
      ) : null}
    </>
  );
}

/** Newer copies of a report replace older ones; the list stays newest first. */
function merge(preferred: OwnFeedbackReport[], rest: OwnFeedbackReport[]): OwnFeedbackReport[] {
  const byId = new Map(rest.map((report) => [report.id, report]));
  for (const report of preferred) byId.set(report.id, report);
  return [...byId.values()].sort((left, right) => right.id - left.id);
}

function OwnFeedbackCard({
  report,
  expanded,
  focused,
  onToggle,
  onUpdate,
}: {
  report: OwnFeedbackReport;
  expanded: boolean;
  focused: boolean;
  onToggle: () => void;
  onUpdate: (report: OwnFeedbackReport) => void;
}) {
  const { t, locale } = useTranslation();
  const article = useRef<HTMLElement>(null);
  const bodyId = `my-feedback-${report.id}`;
  const date = (at: number) => new Date(at).toLocaleDateString(locale, { dateStyle: "medium" });
  const current = progressStep(report.status);
  const currentIndex = FEEDBACK_PROGRESS_STEPS.indexOf(current);
  const closed = isClosedFeedbackStatus(report.status);
  const reopened = report.history.some((entry) => entry.byReporter);
  const canReopen = report.reopenDeadline !== null && report.reopenDeadline > Date.now();
  // The team's latest closing move, which is what the reply belongs to.
  const answer = [...report.history]
    .reverse()
    .find((entry) => !entry.byReporter && entry.from !== null && isClosedFeedbackStatus(entry.to));

  // scrollIntoView would also scroll the fixed app shell and push the nav off screen, so only the
  // page's own scroll container moves.
  useEffect(() => {
    const card = article.current;
    const page = card?.closest(".my-feedback-page");
    if (!focused || !card || !page) return;
    const offset = card.getBoundingClientRect().top - page.getBoundingClientRect().top;
    page.scrollBy?.({ top: offset - 16, behavior: "smooth" });
  }, [focused]);

  return (
    <article ref={article} className="my-feedback-card" data-focused={focused || undefined}>
      <header className="my-feedback-card__header">
        <div className="my-feedback-card__title">
          <h2>{report.summary}</h2>
          <p>
            <span className="my-feedback-card__id">#{report.id}</span> · {t(`bugReport.kind.${report.kind}`)} ·{" "}
            {t("myFeedback.created", { date: date(report.createdAt) })}
          </p>
        </div>
        <span className="my-feedback-card__badges">
          {report.confirmedBug ? <Badge tone="success">{t("myFeedback.confirmedBug")}</Badge> : null}
          <Badge tone={FEEDBACK_STATUS_TONE[report.status]}>{t(`feedback.status.${report.status}`)}</Badge>
        </span>
        <button
          className="my-feedback-card__toggle"
          aria-expanded={expanded}
          aria-controls={bodyId}
          aria-label={t(expanded ? "myFeedback.collapse" : "myFeedback.expand", { summary: report.summary })}
          onClick={onToggle}
        >
          <Icons.ChevronDown size={18} />
        </button>
      </header>

      <ol className="my-feedback-progress" aria-label={t("myFeedback.progress")}>
        {FEEDBACK_PROGRESS_STEPS.map((step, index) => (
          <li
            key={step}
            data-state={index < currentIndex ? "done" : index === currentIndex ? "current" : "todo"}
            aria-current={index === currentIndex ? "step" : undefined}
          >
            <span className="my-feedback-progress__dot" />
            <span>{t(`myFeedback.step.${step}`)}</span>
          </li>
        ))}
      </ol>

      {expanded ? (
        <div id={bodyId} className="my-feedback-card__body">
          <section>
            <h3>{t("myFeedback.yourReport")}</h3>
            <p className="my-feedback-card__description">{report.description}</p>
          </section>
          {report.finalReply ? (
            <section className="my-feedback-reply" data-previous={!closed || undefined}>
              <h3>{t(closed ? "myFeedback.reply" : "myFeedback.previousReply")}</h3>
              <p>{report.finalReply}</p>
              {report.duplicateOfId !== null ? (
                <p className="my-feedback-reply__meta">{t("myFeedback.duplicateOf", { id: report.duplicateOfId })}</p>
              ) : null}
              {answer ? (
                <p className="my-feedback-reply__meta">
                  {t(`feedback.status.${answer.to}`)} · {date(answer.at)}
                </p>
              ) : null}
            </section>
          ) : (
            <p className="my-feedback-card__pending">{t("myFeedback.noReplyYet")}</p>
          )}
          {reopened && !closed ? <p className="my-feedback-card__pending">{t("myFeedback.reopenedNote")}</p> : null}
          {canReopen ? <ReopenForm report={report} onReopened={onUpdate} /> : null}
          <section>
            <h3>{t("myFeedback.history")}</h3>
            <ol className="my-feedback-history">
              {report.history.map((entry, index) => (
                <li key={index}>
                  <time dateTime={new Date(entry.at).toISOString()}>{date(entry.at)}</time> ·{" "}
                  {entry.from === null
                    ? t("myFeedback.step.new")
                    : entry.byReporter
                      ? t("myFeedback.historyReopened", { comment: entry.comment ?? "" })
                      : t(`feedback.status.${entry.to}`)}
                </li>
              ))}
            </ol>
          </section>
        </div>
      ) : null}
    </article>
  );
}

const REOPEN_FAILURES = [
  "empty_comment",
  "comment_too_long",
  "not_closed",
  "already_reopened",
  "reopen_window_closed",
] as const;
type ReopenFailure = (typeof REOPEN_FAILURES)[number];

function ReopenForm({
  report,
  onReopened,
}: {
  report: OwnFeedbackReport;
  onReopened: (report: OwnFeedbackReport) => void;
}) {
  const { t, locale } = useTranslation();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<ReopenFailure | "generic">();
  const deadline = new Date(report.reopenDeadline!).toLocaleDateString(locale, { dateStyle: "medium" });

  if (!open) {
    return (
      <div className="my-feedback-reopen">
        <Button variant="secondary" icon={Icons.RotateCcw} onClick={() => setOpen(true)}>
          {t("myFeedback.reopen")}
        </Button>
        <p>{t("myFeedback.reopenHint", { date: deadline })}</p>
      </div>
    );
  }

  const submit = async () => {
    setSending(true);
    setFailure(undefined);
    try {
      onReopened(await ownFeedbackApi.reopen(report.id, comment));
    } catch (error) {
      const code = error instanceof BugReportApiError ? error.code : undefined;
      setFailure(REOPEN_FAILURES.includes(code as ReopenFailure) ? (code as ReopenFailure) : "generic");
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      className="my-feedback-reopen my-feedback-reopen--open"
      onSubmit={(event) => {
        event.preventDefault();
        if (comment.trim() && !sending) void submit();
      }}
    >
      <label htmlFor={fieldId}>{t("myFeedback.reopenLabel")}</label>
      <textarea
        id={fieldId}
        rows={3}
        value={comment}
        maxLength={MAX_FEEDBACK_REOPEN_COMMENT}
        aria-describedby={`${fieldId}-count`}
        onChange={(event) => setComment(event.target.value)}
      />
      <small id={`${fieldId}-count`}>
        {comment.length} / {MAX_FEEDBACK_REOPEN_COMMENT}
      </small>
      {failure ? <Alert tone="danger" title={t(`myFeedback.reopenFailure.${failure}`)} /> : null}
      <div className="my-feedback-reopen__actions">
        <Button type="submit" disabled={!comment.trim() || sending}>
          {sending ? t("myFeedback.reopenSending") : t("myFeedback.reopenSubmit")}
        </Button>
        <Button
          variant="ghost"
          disabled={sending}
          onClick={() => {
            setOpen(false);
            setFailure(undefined);
          }}
        >
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
