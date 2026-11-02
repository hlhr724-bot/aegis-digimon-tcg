import { useId, useState } from "react";
import { COMMUNITY_MODERATION_NOTE_MAX, type CommunityModeration } from "@aegis/shared";
import { communityApi } from "../../community/client";
import { Icons } from "../../design/icons";
import { Alert, Button } from "../../design/primitives";
import { relativeTime } from "@/i18n/relativeTime";
import { useTranslation } from "../../i18n";

export function DeckReviewPanel({
  deckId,
  moderation,
  onApproved,
  onDeclined,
}: {
  deckId: string;
  moderation: CommunityModeration;
  onApproved: () => void;
  onDeclined: (moderation: CommunityModeration) => void;
}) {
  const { t, locale } = useTranslation();
  const noteId = useId();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const reviewRequestedAt = moderation.reviewRequestedAt;

  const act = (work: () => Promise<void>) => {
    setBusy(true);
    setFailed(false);
    work()
      .catch(() => setFailed(true))
      .finally(() => setBusy(false));
  };
  const approve = () =>
    act(async () => {
      await communityApi.moderate(deckId, { action: "restore" });
      onApproved();
    });
  const decline = () =>
    act(async () => {
      const trimmed = note.trim();
      await communityApi.moderate(deckId, { action: "decline_review", ...(trimmed ? { note: trimmed } : {}) });
      onDeclined({ ...moderation, note: trimmed || moderation.note, reviewRequestedAt: null, reviewNote: null });
    });

  return (
    <section className="community-reports" aria-labelledby="community-review-title">
      <h2 id="community-review-title">{t("community.moderation.reviewTitle")}</h2>
      <ul>
        <li>
          <strong>
            {moderation.reason
              ? t("community.moderation.hiddenReason", { reason: t(`community.report.reason.${moderation.reason}`) })
              : t("community.moderation.hiddenBadge")}
          </strong>
          {moderation.note ? <p>{t("community.moderation.ownerNote", { note: moderation.note })}</p> : null}
        </li>
        {reviewRequestedAt === null ? null : (
          <li>
            <strong>{t("community.moderation.reviewRequestedBadge")}</strong>
            {moderation.reviewNote ? <p>{moderation.reviewNote}</p> : null}
            <small>
              <time dateTime={new Date(reviewRequestedAt).toISOString()}>
                {relativeTime({ at: reviewRequestedAt, locale })}
              </time>
            </small>
          </li>
        )}
      </ul>
      {reviewRequestedAt === null ? null : (
        <>
          <div className="aegis-field">
            <label className="aegis-field__label" htmlFor={noteId}>
              {t("community.moderation.noteLabel")}
            </label>
            <textarea
              id={noteId}
              className="aegis-field__control"
              rows={2}
              maxLength={COMMUNITY_MODERATION_NOTE_MAX}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <div className="community-reports__actions">
            <Button size="sm" icon={Icons.Eye} disabled={busy} onClick={approve}>
              {t("community.moderation.approve")}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={decline}>
              {t("community.moderation.decline")}
            </Button>
          </div>
        </>
      )}
      {failed ? <Alert tone="danger">{t("community.moderation.error")}</Alert> : null}
    </section>
  );
}
