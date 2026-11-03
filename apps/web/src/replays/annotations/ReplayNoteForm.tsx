import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { normalizeReplayNoteText } from "@aegis/shared/replays/annotations/normalizeReplayNoteText";
import { REPLAY_NOTE_MAX_LENGTH } from "@aegis/shared/replays/annotations/replayAnnotationLimits";
import { Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import type { TranslationKey } from "@/i18n/translationTypes";
import "@/replays/annotations/replayAnnotations.css";

type Props = {
  label: TranslationKey;
  submitLabel: TranslationKey;
  initialText?: string;
  rows?: number;
  focusOnMount?: boolean;
  onSubmit: (text: string) => Promise<boolean> | boolean;
  onCancel?: () => void;
};

export function ReplayNoteForm({
  label,
  submitLabel,
  initialText = "",
  rows = 3,
  focusOnMount = false,
  onSubmit,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const fieldId = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const text = normalizeReplayNoteText(draft);

  useEffect(() => {
    if (focusOnMount) {
      field.current?.focus();
    }
  }, [focusOnMount]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!text || saving) {
      return;
    }
    setSaving(true);
    const saved = await onSubmit(text);
    setSaving(false);
    if (saved && !initialText) {
      setDraft("");
    }
  }

  return (
    <form className="replay-note-form" onSubmit={(event) => void submit(event)}>
      <label htmlFor={fieldId}>{t(label)}</label>
      <textarea
        ref={field}
        id={fieldId}
        value={draft}
        rows={rows}
        maxLength={REPLAY_NOTE_MAX_LENGTH}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="replay-note-form__actions">
        <small>
          {t("replayAnnotations.noteLength", { count: Array.from(draft).length, max: REPLAY_NOTE_MAX_LENGTH })}
        </small>
        {onCancel ? (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {t("replayAnnotations.cancel")}
          </Button>
        ) : null}
        <Button size="sm" type="submit" disabled={!text || saving}>
          {t(submitLabel)}
        </Button>
      </div>
    </form>
  );
}
