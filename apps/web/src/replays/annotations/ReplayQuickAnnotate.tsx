import { useRef, useState } from "react";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { ReplayMarkerPicker } from "@/replays/annotations/ReplayMarkerPicker";
import { ReplayNoteForm } from "@/replays/annotations/ReplayNoteForm";
import type { ReplayAnnotationsState } from "@/replays/annotations/useReplayAnnotations";
import "@/replays/annotations/replayAnnotations.css";

type Props = {
  annotations: ReplayAnnotationsState;
  index: number;
  turn: number;
};

export function ReplayQuickAnnotate({ annotations, index, turn }: Props) {
  const { t } = useTranslation();
  const popover = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);

  function close() {
    if (popover.current) {
      popover.current.open = false;
    }
    setOpen(false);
    setComposing(false);
  }

  return (
    <details
      ref={popover}
      className="replay-controls__options replay-controls__annotate"
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
        if (!event.currentTarget.open) {
          setComposing(false);
        }
      }}
    >
      <summary aria-label={t("replayAnnotations.markMoment")} title={t("replayAnnotations.markMoment")}>
        <Icons.BookmarkPlus size={20} />
      </summary>
      {open ? (
        <div className="replay-controls__settings replay-quick-annotate">
          <h3>{t("replayAnnotations.markMomentAt", { turn, action: index + 1 })}</h3>
          <ReplayMarkerPicker
            onPick={(emoji) => {
              void annotations.markMoment({ frameIndex: index, turn, emoji });
              close();
            }}
          />
          {composing ? (
            <ReplayNoteForm
              label="replayAnnotations.addNote"
              submitLabel="replayAnnotations.saveNote"
              rows={2}
              focusOnMount
              onCancel={() => setComposing(false)}
              onSubmit={async (text) => {
                const saved = await annotations.addNote({ frameIndex: index, turn, text });
                if (saved) {
                  close();
                }
                return saved;
              }}
            />
          ) : (
            <button type="button" className="replay-annotations__add-note" onClick={() => setComposing(true)}>
              <Icons.Pencil size={14} />
              {t("replayAnnotations.addNote")}
            </button>
          )}
        </div>
      ) : null}
    </details>
  );
}
