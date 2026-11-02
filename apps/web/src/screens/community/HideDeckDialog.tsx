import { useId, useState } from "react";
import {
  COMMUNITY_MODERATION_NOTE_MAX,
  COMMUNITY_REPORT_REASONS,
  type CommunityModeration,
  type CommunityReportReason,
} from "@aegis/shared";
import { communityApi } from "../../community/client";
import { Icons } from "../../design/icons";
import { Alert, Button, Dialog } from "../../design/primitives";
import { useTranslation } from "../../i18n";

export function HideDeckDialog({
  deckId,
  deckName,
  onHidden,
  onClose,
}: {
  deckId: string;
  deckName: string;
  onHidden: (moderation: CommunityModeration) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const reasonName = useId();
  const noteId = useId();
  const [reason, setReason] = useState<CommunityReportReason>("offensive_name");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  const submit = () => {
    setSubmitting(true);
    setFailed(false);
    const trimmed = note.trim();
    void communityApi
      .moderate(deckId, { action: "hide", reason, ...(trimmed ? { note: trimmed } : {}) })
      .then(() =>
        onHidden({ reason, note: trimmed || null, hiddenAt: Date.now(), reviewRequestedAt: null, reviewNote: null }),
      )
      .catch(() => {
        setFailed(true);
        setSubmitting(false);
      });
  };

  return (
    <Dialog className="community-report" labelledBy={titleId} onClose={onClose}>
      <header className="aegis-dialog__header">
        <span className="community-report__title">
          <Icons.Shield size={20} />
          <h2 id={titleId}>{t("community.moderation.hideTitle", { name: deckName })}</h2>
        </span>
        <p>{t("community.moderation.hideBody")}</p>
      </header>

      <fieldset className="community-report__reasons">
        <legend className="aegis-field__label">{t("community.report.reasonLabel")}</legend>
        {COMMUNITY_REPORT_REASONS.map((option) => (
          <label key={option} className="community-report__reason">
            <input
              type="radio"
              name={reasonName}
              value={option}
              checked={reason === option}
              onChange={() => setReason(option)}
            />
            <span>{t(`community.report.reason.${option}`)}</span>
          </label>
        ))}
      </fieldset>

      <div className="aegis-field">
        <label className="aegis-field__label" htmlFor={noteId}>
          {t("community.moderation.noteLabel")}
        </label>
        <textarea
          id={noteId}
          className="aegis-field__control"
          rows={3}
          maxLength={COMMUNITY_MODERATION_NOTE_MAX}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <span className="aegis-field__message">
          {note.length}/{COMMUNITY_MODERATION_NOTE_MAX}
        </span>
      </div>

      {failed ? <Alert tone="danger">{t("community.moderation.error")}</Alert> : null}

      <footer className="community-report__actions">
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="danger" onClick={submit} disabled={submitting}>
          {t("community.moderation.hide")}
        </Button>
      </footer>
    </Dialog>
  );
}
