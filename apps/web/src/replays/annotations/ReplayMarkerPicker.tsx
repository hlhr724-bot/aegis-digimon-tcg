import { useId, useState, type FormEvent } from "react";
import { isReplayMarkerEmoji } from "@aegis/shared/replays/annotations/isReplayMarkerEmoji";
import { REPLAY_MARKER_EMOJI_MAX_LENGTH } from "@aegis/shared/replays/annotations/replayAnnotationLimits";
import { ReplayMarkerEmoji } from "@aegis/shared/replays/annotations/ReplayMarkerEmoji";
import { Icons } from "@/design/icons";
import { Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import "@/replays/annotations/replayAnnotations.css";

const MORE_EMOJI = [
  "😂",
  "😭",
  "😡",
  "🤔",
  "😎",
  "🥶",
  "🤯",
  "😴",
  "👀",
  "👏",
  "🙏",
  "💪",
  "🎯",
  "🧠",
  "💀",
  "👑",
  "🛡️",
  "⚔️",
  "🧨",
  "💥",
  "⚡",
  "🌀",
  "🎲",
  "⏳",
  "📌",
  "✅",
  "⚠️",
  "🚫",
  "💯",
  "🏆",
  "🐉",
  "🥚",
];

type Props = {
  disabled?: boolean;
  onPick: (emoji: string) => void;
};

export function ReplayMarkerPicker({ disabled = false, onPick }: Props) {
  const { t } = useTranslation();
  const moreId = useId();
  const fieldId = useId();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const custom = draft.trim();
  const customValid = isReplayMarkerEmoji(custom);

  function pick(emoji: string) {
    onPick(emoji);
    setExpanded(false);
    setDraft("");
  }

  function submitCustom(event: FormEvent) {
    event.preventDefault();
    if (customValid && !disabled) {
      pick(custom);
    }
  }

  return (
    <div className="replay-marker-chooser">
      <div className="replay-marker-picker" role="group" aria-label={t("replayAnnotations.markMoment")}>
        {Object.values(ReplayMarkerEmoji).map((entry) => (
          <button
            key={entry.name}
            type="button"
            disabled={disabled}
            aria-label={t(entry.label)}
            title={t(entry.label)}
            onClick={() => pick(entry.value)}
          >
            <span aria-hidden="true">{entry.value}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="replay-marker-picker__more"
        aria-expanded={expanded}
        aria-controls={moreId}
        onClick={() => setExpanded((open) => !open)}
      >
        <Icons.Plus size={14} />
        {t("replayAnnotations.moreEmoji")}
      </button>
      {expanded ? (
        <div id={moreId} className="replay-marker-picker__extra">
          <div className="replay-marker-picker__grid" role="group" aria-label={t("replayAnnotations.moreEmoji")}>
            {MORE_EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                disabled={disabled}
                aria-label={emoji}
                title={emoji}
                onClick={() => pick(emoji)}
              >
                <span aria-hidden="true">{emoji}</span>
              </button>
            ))}
          </div>
          <form className="replay-marker-picker__custom" onSubmit={submitCustom}>
            <label htmlFor={fieldId}>{t("replayAnnotations.customEmoji")}</label>
            <div>
              <input
                id={fieldId}
                value={draft}
                maxLength={REPLAY_MARKER_EMOJI_MAX_LENGTH}
                autoComplete="off"
                enterKeyHint="done"
                placeholder="🙂"
                aria-invalid={custom !== "" && !customValid}
                onChange={(event) => setDraft(event.target.value)}
              />
              <Button size="sm" type="submit" disabled={!customValid || disabled}>
                {t("replayAnnotations.useEmoji")}
              </Button>
            </div>
            {custom !== "" && !customValid ? (
              <small role="alert">{t("replayAnnotations.customEmojiInvalid")}</small>
            ) : null}
          </form>
        </div>
      ) : null}
    </div>
  );
}
