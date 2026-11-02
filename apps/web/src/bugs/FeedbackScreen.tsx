import { RoadmapPublishPanel } from "@/roadmap/RoadmapPublishPanel";
import { relativeTime } from "@/i18n/relativeTime";
import { FeedbackStatus, FEEDBACK_STATUSES } from "@aegis/shared/feedback/FeedbackStatus";
import { isClosedFeedbackStatus } from "@aegis/shared/feedback/isClosedFeedbackStatus";
import {
  MAX_FEEDBACK_FINAL_REPLY,
  MAX_FEEDBACK_INTERNAL_NOTE,
  MAX_FEEDBACK_SEARCH,
} from "@aegis/shared/feedback/limits";
import { useEffect, useId, useState } from "react";
import { Alert, Badge, Button } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { BugReportApiError, FEEDBACK_KINDS, type FeedbackKind } from "@/bugs/client";
import {
  FeedbackConflictError,
  getFeedback,
  listFeedback,
  triageFeedback,
  type FeedbackDetail,
  type FeedbackFilter,
  type FeedbackPage,
  type FeedbackRecord,
} from "@/bugs/adminClient";
import { FEEDBACK_STATUS_TONE } from "@/bugs/feedbackStatus";
import { AccountRolesPanel } from "@/account/roles/AccountRolesPanel";
import { PlaytestAdminPanel } from "@/bugs/PlaytestAdminPanel";
import { ReportedDecksPanel } from "@/bugs/ReportedDecksPanel";
import { ReportedTournamentsPanel } from "@/bugs/ReportedTournamentsPanel";
import { pathForRoute } from "@/routes";
import "@/bugs/feedbackScreen.css";

const SEARCH_DEBOUNCE_MS = 300;

export function FeedbackScreen({
  isAdmin,
  selectedId,
  onSelect = () => undefined,
  onOpenDeck = () => undefined,
}: {
  isAdmin: boolean;
  selectedId?: number;
  onSelect?: (id: number | undefined) => void;
  /** Opens a reported community deck for moderation. */
  onOpenDeck?: (deckId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="feedback-page" aria-labelledby="feedback-title">
      <div className="feedback-column">
        <header>
          <h1 id="feedback-title" className="aegis-page-title">
            {t("feedback.title")}
          </h1>
          <p>{t("feedback.subtitle")}</p>
        </header>
        {isAdmin ? (
          <>
            <AccountRolesPanel />
            <ReportedDecksPanel onOpenDeck={onOpenDeck} />
            <ReportedTournamentsPanel />
            <PlaytestAdminPanel />
            <FeedbackTriage selectedId={selectedId} onSelect={onSelect} />
          </>
        ) : (
          <Alert tone="warning" title={t("feedback.restricted")} />
        )}
      </div>
    </section>
  );
}

function FeedbackTriage({ selectedId, onSelect }: { selectedId?: number; onSelect: (id: number | undefined) => void }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<FeedbackFilter>({});
  const [searchInput, setSearchInput] = useState("");
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState<FeedbackPage>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"restricted" | "error">();
  const [dirty, setDirty] = useState(false);
  const before = cursors.at(-1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const search = searchInput.trim() || undefined;
      setFilter((current) => (current.search === search ? current : { ...current, search }));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => setCursors([undefined]), [filter]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    void listFeedback({ ...filter, before }, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setPage(result);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setPage(undefined);
        setError(failure instanceof BugReportApiError && [401, 403].includes(failure.status) ? "restricted" : "error");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filter, before, revision]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const select = (id: number | undefined) => {
    if (id === selectedId) return;
    if (dirty && !window.confirm(t("feedback.triage.discardConfirm"))) return;
    setDirty(false);
    onSelect(id);
  };

  const saved = (detail: FeedbackDetail) => {
    setPage((current) => {
      if (!current) return current;
      const previous = current.items.find((item) => item.id === detail.id);
      const counts = { ...current.counts };
      let reopenedCount = current.reopenedCount;
      if (previous && previous.status !== detail.status) {
        counts[previous.status] = Math.max(0, counts[previous.status] - 1);
        counts[detail.status] += 1;
        reopenedCount += Number(awaitsAfterReopen(detail)) - Number(awaitsAfterReopen(previous));
      }
      return {
        ...current,
        counts,
        reopenedCount: Math.max(0, reopenedCount),
        items: current.items.map((item) => (item.id === detail.id ? detail : item)),
      };
    });
  };

  const total = page ? Object.values(page.counts).reduce((sum, count) => sum + count, 0) : undefined;

  return (
    <div className="feedback-triage" data-has-selection={selectedId !== undefined || undefined}>
      <div className="feedback-filters">
        <div className="feedback-chips" role="group" aria-label={t("feedback.triage.statusFilter")}>
          <StatusChip
            label={t("feedback.triage.all")}
            count={total}
            pressed={!filter.status && !filter.reopened}
            onClick={() => setFilter((current) => ({ ...current, status: undefined, reopened: undefined }))}
          />
          <StatusChip
            label={t("feedback.triage.reopened")}
            count={page?.reopenedCount}
            pressed={!!filter.reopened}
            attention={!!page?.reopenedCount}
            onClick={() => setFilter((current) => ({ ...current, status: undefined, reopened: true }))}
          />
          {FEEDBACK_STATUSES.map((status) => (
            <StatusChip
              key={status}
              label={t(`feedback.status.${status}`)}
              count={page?.counts[status]}
              pressed={filter.status === status}
              onClick={() => setFilter((current) => ({ ...current, status, reopened: undefined }))}
            />
          ))}
        </div>
        <div className="feedback-filters__row">
          <label className="feedback-select">
            <span>{t("feedback.triage.kind")}</span>
            <select
              value={filter.kind ?? ""}
              onChange={(event) =>
                setFilter((current) => ({
                  ...current,
                  kind: (event.target.value || undefined) as FeedbackKind | undefined,
                }))
              }
            >
              <option value="">{t("feedback.triage.allKinds")}</option>
              {FEEDBACK_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`bugReport.kind.${kind}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="feedback-search">
            <Icons.Search size={16} />
            <span className="aegis-sr-only">{t("feedback.triage.search")}</span>
            <input
              type="search"
              value={searchInput}
              maxLength={MAX_FEEDBACK_SEARCH}
              placeholder={t("feedback.triage.searchPlaceholder")}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
          <Button
            variant="secondary"
            size="sm"
            disabled={loading}
            onClick={() => {
              setCursors([undefined]);
              setRevision((value) => value + 1);
            }}
          >
            {t("feedback.refresh")}
          </Button>
        </div>
      </div>

      <div className="feedback-panes">
        <div className="feedback-list-pane">
          {loading && !page ? <p role="status">{t("common.loading")}</p> : null}
          {error ? <Alert tone="warning" title={t(`feedback.${error}`)} /> : null}
          {page?.items.length === 0 ? <p role="status">{t("feedback.empty")}</p> : null}
          {page?.items.length ? (
            <ul className="feedback-list" aria-busy={loading || undefined}>
              {page.items.map((item) => (
                <li key={item.id}>
                  <FeedbackRow item={item} selected={item.id === selectedId} onSelect={() => select(item.id)} />
                </li>
              ))}
            </ul>
          ) : null}
          <nav className="feedback-toolbar" aria-label={t("feedback.pagination")}>
            <Button
              variant="secondary"
              size="sm"
              disabled={loading || cursors.length === 1}
              onClick={() => setCursors((values) => values.slice(0, -1))}
            >
              {t("feedback.newer")}
            </Button>
            <span>{t("feedback.page", { page: cursors.length })}</span>
            <Button
              variant="secondary"
              size="sm"
              disabled={loading || !page?.nextBefore}
              onClick={() => {
                if (page?.nextBefore) setCursors((values) => [...values, page.nextBefore!]);
              }}
            >
              {t("feedback.older")}
            </Button>
          </nav>
        </div>
        <div className="feedback-detail-pane">
          {selectedId === undefined ? (
            <p className="feedback-detail-pane__empty">{t("feedback.triage.pick")}</p>
          ) : (
            <FeedbackDetailPanel
              key={selectedId}
              id={selectedId}
              onBack={() => select(undefined)}
              onOpen={select}
              onSaved={saved}
              onDirtyChange={setDirty}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StatusChip({
  label,
  count,
  pressed,
  attention = false,
  onClick,
}: {
  label: string;
  count?: number;
  pressed: boolean;
  /** Marks a queue that is waiting on the team. */
  attention?: boolean;
  onClick: () => void;
}) {
  return (
    <button className="feedback-chip" aria-pressed={pressed} data-attention={attention || undefined} onClick={onClick}>
      {label}
      {count === undefined ? null : <span className="feedback-chip__count">{count}</span>}
    </button>
  );
}

/** Reopened by the reporter and not closed again yet: the team owes them a new look. */
function awaitsAfterReopen(record: FeedbackRecord): boolean {
  return record.reopenedAt !== null && !isClosedFeedbackStatus(record.status);
}

function FeedbackRow({ item, selected, onSelect }: { item: FeedbackRecord; selected: boolean; onSelect: () => void }) {
  const { t, locale } = useTranslation();
  const { report } = item;
  return (
    <button className="feedback-row" aria-current={selected || undefined} onClick={onSelect}>
      <span className="feedback-row__meta">
        <span className="feedback-row__id">#{item.id}</span>
        <Badge>{t(`bugReport.kind.${report.kind}`)}</Badge>
        <Badge tone={FEEDBACK_STATUS_TONE[item.status]}>{t(`feedback.status.${item.status}`)}</Badge>
        {awaitsAfterReopen(item) ? <Badge tone="danger">{t("feedback.triage.reopenedBadge")}</Badge> : null}
        {item.confirmedBug ? <Badge tone="success">{t("feedback.triage.confirmedBugBadge")}</Badge> : null}
      </span>
      <span className="feedback-row__summary">{report.summary}</span>
      <span className="feedback-row__footer">
        <span className="feedback-row__cards">{report.cardIds.slice(0, 3).join(" · ")}</span>
        <span>
          {report.reporterName ?? t("feedback.anonymous")} ·{" "}
          <time dateTime={new Date(item.createdAt).toISOString()}>{relativeTime({ at: item.createdAt, locale })}</time>
        </span>
      </span>
    </button>
  );
}

function FeedbackDetailPanel({
  id,
  onBack,
  onOpen,
  onSaved,
  onDirtyChange,
}: {
  id: number;
  onBack: () => void;
  onOpen: (id: number) => void;
  onSaved: (detail: FeedbackDetail) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { t, locale } = useTranslation();
  const [detail, setDetail] = useState<FeedbackDetail>();
  const [failed, setFailed] = useState<"missing" | "error">();

  useEffect(() => {
    const controller = new AbortController();
    void getFeedback(id, controller.signal)
      .then((result) => setDetail(result))
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setFailed(failure instanceof BugReportApiError && failure.status === 404 ? "missing" : "error");
      });
    return () => controller.abort();
  }, [id]);

  const back = (
    <Button variant="ghost" size="sm" className="feedback-detail__back" icon={Icons.ArrowLeft} onClick={onBack}>
      {t("feedback.triage.back")}
    </Button>
  );
  if (failed) {
    return (
      <article className="feedback-detail">
        {back}
        <Alert tone="warning" title={t(failed === "missing" ? "feedback.triage.missing" : "feedback.error")} />
      </article>
    );
  }
  if (!detail) return <p role="status">{t("common.loading")}</p>;

  const { report } = detail;
  const context = [
    [t("feedback.match"), report.matchId],
    [t("feedback.version"), report.publicVersion],
    [t("feedback.client"), report.clientRevision],
    [t("feedback.server"), report.serverRevision],
    [t("feedback.browser"), report.userAgent],
  ].filter((entry) => entry[1]);

  return (
    <article className="feedback-detail" aria-labelledby={`feedback-${id}-title`}>
      {back}
      <header className="feedback-detail__header">
        <div>
          <p className="feedback-detail__meta">
            #{detail.id} · {t(`bugReport.kind.${report.kind}`)} · {report.reporterName ?? t("feedback.anonymous")}
            {detail.reporterConfirmedBugs === null
              ? null
              : ` (${t("feedback.triage.reporterPoints", { count: detail.reporterConfirmedBugs })})`}{" "}
            ·{" "}
            <time dateTime={new Date(detail.createdAt).toISOString()}>
              {new Date(detail.createdAt).toLocaleString(locale)}
            </time>
          </p>
          <h2 id={`feedback-${id}-title`}>{report.summary}</h2>
        </div>
        {detail.githubUrl ? (
          <a href={detail.githubUrl} target="_blank" rel="noreferrer">
            {t("feedback.github", { number: detail.githubNumber ?? "" })}
          </a>
        ) : null}
      </header>
      <p className="feedback-detail__description">{report.description}</p>
      {report.tournamentId ? (
        <Alert tone="info" title={t("feedback.officialTournament.hint")}>
          <a href={pathForRoute({ screen: "tournaments", tournament: { kind: "detail", id: report.tournamentId } })}>
            {t("feedback.officialTournament.open")}
          </a>
        </Alert>
      ) : null}
      {report.cardIds.length ? (
        <ul className="feedback-detail__cards" aria-label={t("bugReport.cardsLabel")}>
          {report.cardIds.map((cardId) => (
            <li key={cardId}>{cardId}</li>
          ))}
        </ul>
      ) : null}
      {report.opponentDeck ? (
        <p>
          <strong>{t("bugReport.opponentDeckLabel")}:</strong> {report.opponentDeck}
        </p>
      ) : null}
      <details>
        <summary>{t("feedback.context")}</summary>
        <dl className="feedback-context">
          {context.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
          <div>
            <dt>GitHub</dt>
            <dd>{t(`feedback.mirror.${detail.githubStatus}`)}</dd>
          </div>
        </dl>
      </details>

      {awaitsAfterReopen(detail) ? <ReopenNotice detail={detail} /> : null}

      <ResolutionForm
        detail={detail}
        onOpen={onOpen}
        onDirtyChange={onDirtyChange}
        onSaved={(next) => {
          setDetail(next);
          onSaved(next);
        }}
        onConflict={setDetail}
      />

      {report.kind === "official_tournament" ? null : (
        <RoadmapPublishPanel feedbackId={detail.id} summary={report.summary} description={report.description} />
      )}

      <section className="feedback-history" aria-labelledby={`feedback-${id}-history`}>
        <h3 id={`feedback-${id}-history`}>{t("feedback.triage.history")}</h3>
        <ol>
          {detail.history.map((entry, index) => (
            <li key={index}>
              {entry.from === null
                ? t("feedback.triage.historyCreated")
                : entry.byReporter
                  ? t("feedback.triage.historyReopened", {
                      actor: entry.actorName ?? t("feedback.anonymous"),
                      comment: entry.comment ?? "",
                    })
                  : t("feedback.triage.historyChange", {
                      actor: entry.actorName ?? t("feedback.triage.formerAdmin"),
                      from: t(`feedback.status.${entry.from}`),
                      to: t(`feedback.status.${entry.to}`),
                    })}{" "}
              · <time dateTime={new Date(entry.at).toISOString()}>{relativeTime({ at: entry.at, locale })}</time>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}

function ReopenNotice({ detail }: { detail: FeedbackDetail }) {
  const { t, locale } = useTranslation();
  const reopening = [...detail.history].reverse().find((entry) => entry.byReporter);
  return (
    <Alert
      tone="warning"
      className="feedback-reopen-notice"
      title={t("feedback.triage.reopenedTitle", {
        actor: detail.report.reporterName ?? t("feedback.anonymous"),
        when: relativeTime({ at: detail.reopenedAt!, locale }),
      })}
    >
      {reopening?.comment ? <blockquote>{reopening.comment}</blockquote> : null}
      <p>{t("feedback.triage.reopenedHint")}</p>
    </Alert>
  );
}

type Draft = {
  status: FeedbackStatus;
  finalReply: string;
  internalNote: string;
  duplicateOfId: string;
  confirmedBug: boolean;
};

function draftOf(detail: FeedbackDetail): Draft {
  return {
    status: detail.status,
    finalReply: detail.finalReply ?? "",
    internalNote: detail.internalNote ?? "",
    duplicateOfId: detail.duplicateOfId === null ? "" : String(detail.duplicateOfId),
    confirmedBug: detail.confirmedBug,
  };
}

/** What a save would actually store: surrounding whitespace is dropped and duplicates never count. */
function normalized(draft: Draft): Draft {
  return {
    ...draft,
    finalReply: draft.finalReply.trim(),
    internalNote: draft.internalNote.trim(),
    confirmedBug: draft.status !== FeedbackStatus.DUPLICATE.value && draft.confirmedBug,
  };
}

function ResolutionForm({
  detail,
  onOpen,
  onSaved,
  onConflict,
  onDirtyChange,
}: {
  detail: FeedbackDetail;
  onOpen: (id: number) => void;
  onSaved: (detail: FeedbackDetail) => void;
  onConflict: (current: FeedbackDetail) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  // Seeded once per report: a conflict replaces `detail` underneath without discarding what the admin typed.
  const [draft, setDraft] = useState<Draft>(() => draftOf(detail));
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<"saved" | "conflict" | "error" | string>();

  const saved = draftOf(detail);
  const pending = normalized(draft);
  const dirty = (Object.keys(pending) as (keyof Draft)[]).some((key) => pending[key] !== normalized(saved)[key]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const closed = isClosedFeedbackStatus(draft.status);
  const reply = draft.finalReply.trim();
  const duplicateOfId = Number(draft.duplicateOfId);
  const problem =
    closed && !reply
      ? "final_reply_required"
      : draft.status === FeedbackStatus.DUPLICATE.value &&
          !(Number.isSafeInteger(duplicateOfId) && duplicateOfId > 0 && duplicateOfId !== detail.id)
        ? "invalid_duplicate_target"
        : undefined;
  const notifies =
    draft.status !== detail.status ||
    (pending.confirmedBug && !detail.confirmedBug) ||
    (closed && (reply !== (detail.finalReply ?? "") || draft.duplicateOfId !== saved.duplicateOfId));

  const update = (patch: Partial<Draft>) => {
    setOutcome(undefined);
    setDraft((current) => ({ ...current, ...patch }));
  };

  const save = async () => {
    setSaving(true);
    setOutcome(undefined);
    try {
      const next = await triageFeedback(detail.id, {
        revision: detail.revision,
        status: draft.status,
        finalReply: draft.finalReply,
        internalNote: draft.internalNote,
        duplicateOfId: draft.status === FeedbackStatus.DUPLICATE.value ? duplicateOfId : null,
        confirmedBug: pending.confirmedBug,
      });
      setDraft(draftOf(next));
      onSaved(next);
      setOutcome("saved");
    } catch (failure) {
      if (failure instanceof FeedbackConflictError) {
        onConflict(failure.current);
        setOutcome("conflict");
      } else {
        setOutcome(failure instanceof BugReportApiError && failure.code ? failure.code : "error");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="feedback-resolution"
      aria-labelledby={`${formId}-title`}
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty && !problem && !saving) void save();
      }}
    >
      <h3 id={`${formId}-title`}>{t("feedback.triage.resolution")}</h3>
      <fieldset className="feedback-segments">
        <legend>{t("feedback.triage.status")}</legend>
        {FEEDBACK_STATUSES.map((status) => (
          <label key={status}>
            <input
              type="radio"
              name={`${formId}-status`}
              value={status}
              checked={draft.status === status}
              onChange={() => update({ status })}
            />
            <span>{t(`feedback.status.${status}`)}</span>
          </label>
        ))}
      </fieldset>

      <div className="feedback-confirm">
        <label>
          <input
            type="checkbox"
            checked={pending.confirmedBug}
            disabled={draft.status === FeedbackStatus.DUPLICATE.value}
            aria-describedby={`${formId}-confirm-hint`}
            onChange={(event) => update({ confirmedBug: event.target.checked })}
          />
          <span>{t("feedback.triage.confirmedBug")}</span>
        </label>
        <small id={`${formId}-confirm-hint`}>
          {draft.status === FeedbackStatus.DUPLICATE.value
            ? t("feedback.triage.confirmedBugDuplicate")
            : detail.reporterConfirmedBugs === null
              ? t("feedback.triage.confirmedBugAnonymous")
              : t("feedback.triage.confirmedBugHint", {
                  name: detail.report.reporterName ?? t("feedback.anonymous"),
                  count: detail.reporterConfirmedBugs,
                })}
        </small>
      </div>

      {draft.status === FeedbackStatus.DUPLICATE.value ? (
        <div className="feedback-duplicate">
          <label className="feedback-textfield">
            <span>{t("feedback.triage.duplicateOf")}</span>
            <input
              inputMode="numeric"
              value={draft.duplicateOfId}
              onChange={(event) => update({ duplicateOfId: event.target.value.replace(/\D/g, "") })}
            />
          </label>
          {detail.duplicateOfId !== null && draft.duplicateOfId === saved.duplicateOfId ? (
            <Button variant="ghost" size="sm" onClick={() => onOpen(detail.duplicateOfId!)}>
              {t("feedback.triage.openOriginal", { id: detail.duplicateOfId })}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="feedback-textfield">
        <label htmlFor={`${formId}-reply`}>
          {t(closed ? "feedback.triage.replyRequired" : "feedback.triage.replyOptional")}
        </label>
        <textarea
          id={`${formId}-reply`}
          rows={5}
          value={draft.finalReply}
          maxLength={MAX_FEEDBACK_FINAL_REPLY}
          aria-describedby={`${formId}-reply-count`}
          onChange={(event) => update({ finalReply: event.target.value })}
        />
        <small id={`${formId}-reply-count`} className="feedback-textfield__count">
          {draft.finalReply.length} / {MAX_FEEDBACK_FINAL_REPLY}
        </small>
      </div>

      <label className="feedback-textfield">
        <span>
          <Icons.Lock size={14} /> {t("feedback.triage.internalNote")}
        </span>
        <textarea
          rows={2}
          value={draft.internalNote}
          maxLength={MAX_FEEDBACK_INTERNAL_NOTE}
          onChange={(event) => update({ internalNote: event.target.value })}
        />
      </label>

      <p className="feedback-resolution__hint">
        {!detail.hasReporterAccount
          ? t("feedback.triage.anonymousHint")
          : notifies
            ? t("feedback.triage.notifyHint")
            : t("feedback.triage.silentHint")}
      </p>

      {outcome === "saved" ? <Alert tone="success" title={t("feedback.triage.saved")} /> : null}
      {outcome === "conflict" ? (
        <Alert tone="warning" title={t("feedback.triage.conflict")}>
          {t("feedback.triage.conflictDetail", { status: t(`feedback.status.${detail.status}`) })}
        </Alert>
      ) : null}
      {outcome && outcome !== "saved" && outcome !== "conflict" ? (
        <Alert tone="danger" title={t("feedback.triage.saveFailed")}>
          {isKnownFailure(outcome) ? t(`feedback.triage.failure.${outcome}`) : null}
        </Alert>
      ) : null}
      {dirty && problem ? (
        <p className="feedback-resolution__problem">{t(`feedback.triage.failure.${problem}`)}</p>
      ) : null}

      <div className="feedback-resolution__actions">
        <Button type="submit" disabled={!dirty || !!problem || saving}>
          {saving ? t("feedback.triage.saving") : t("feedback.triage.save")}
        </Button>
        <Button
          variant="secondary"
          disabled={!dirty || saving}
          onClick={() => {
            setDraft(draftOf(detail));
            setOutcome(undefined);
          }}
        >
          {t("feedback.triage.discard")}
        </Button>
      </div>
    </form>
  );
}

const KNOWN_FAILURES = [
  "final_reply_required",
  "final_reply_too_long",
  "internal_note_too_long",
  "duplicate_target_required",
  "invalid_duplicate_target",
] as const;

function isKnownFailure(code: string): code is (typeof KNOWN_FAILURES)[number] {
  return KNOWN_FAILURES.includes(code as (typeof KNOWN_FAILURES)[number]);
}
