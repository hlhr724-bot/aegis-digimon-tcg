import { useMemo, useState } from "react";
import type { MatchReplay } from "@aegis/shared/replays";
import { Icons } from "@/design/icons";
import { Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import {
  buildReplayAnnotationEntries,
  type ReplayAnnotationEntry,
} from "@/replays/annotations/buildReplayAnnotationEntries";
import { ReplayMarkerPicker } from "@/replays/annotations/ReplayMarkerPicker";
import { ReplayNoteForm } from "@/replays/annotations/ReplayNoteForm";
import { ReplayAnnotationTools } from "@/replays/annotations/ReplayAnnotationTools";
import type { ReplayAnnotationsState } from "@/replays/annotations/useReplayAnnotations";
import "@/replays/annotations/replayAnnotations.css";

type Props = {
  replay: MatchReplay;
  annotations: ReplayAnnotationsState;
  index: number;
  skipThinking: boolean;
  shareId?: string;
  onJump: (index: number) => void;
  onClose: () => void;
};

export function ReplayAnnotationPanel({ replay, annotations, index, skipThinking, shareId, onJump, onClose }: Props) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string>();
  const [composing, setComposing] = useState(false);
  const lastIndex = replay.frames.length - 1;
  const turn = replay.frames[index]?.state.turnCount ?? 0;
  const entries = useMemo(
    () => buildReplayAnnotationEntries({ markers: annotations.markers, notes: annotations.notes }),
    [annotations.markers, annotations.notes],
  );

  function removeEntry(entry: ReplayAnnotationEntry) {
    if (entry.kind === "marker") {
      void annotations.removeMarker(entry.id);
      return;
    }
    void annotations.removeNote(entry.id);
  }

  function renderEntry(entry: ReplayAnnotationEntry) {
    const moment = t("replayAnnotations.moment", { turn: entry.turn, action: entry.frameIndex + 1 });
    const removeLabel = t(entry.kind === "marker" ? "replayAnnotations.removeMarker" : "replayAnnotations.removeNote");
    if (entry.kind === "note" && editingId === entry.id) {
      return (
        <li key={entry.id} className="replay-annotations__editing">
          <ReplayNoteForm
            label="replayAnnotations.editNote"
            submitLabel="replayAnnotations.saveNote"
            initialText={entry.note.text}
            onCancel={() => setEditingId(undefined)}
            onSubmit={async (text) => {
              const saved = await annotations.editNote({ noteId: entry.id, text });
              if (saved) {
                setEditingId(undefined);
              }
              return saved;
            }}
          />
        </li>
      );
    }
    return (
      <li key={entry.id} data-kind={entry.kind}>
        <button
          type="button"
          className="replay-annotations__moment"
          aria-current={entry.frameIndex === index ? "step" : undefined}
          onClick={() => onJump(entry.frameIndex)}
        >
          <span className="replay-annotations__glyph" data-kind={entry.kind} aria-hidden="true">
            {entry.kind === "marker" ? entry.marker.emoji : <Icons.Pencil size={14} />}
          </span>
          <span className="replay-annotations__text">
            <small>{moment}</small>
            {entry.kind === "note" ? <span>{entry.note.text}</span> : null}
          </span>
        </button>
        {entry.kind === "note" ? (
          <Button
            size="sm"
            variant="ghost"
            icon={Icons.Pencil}
            aria-label={t("replayAnnotations.editNote")}
            title={t("replayAnnotations.editNote")}
            onClick={() => setEditingId(entry.id)}
          />
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          icon={Icons.Trash}
          aria-label={removeLabel}
          title={removeLabel}
          onClick={() => removeEntry(entry)}
        />
      </li>
    );
  }

  return (
    <aside id="replay-annotations" className="replay-annotations" aria-label={t("replayAnnotations.title")}>
      <header>
        <h2>
          {t("replayAnnotations.title")}
          {entries.length ? <span className="replay-annotations__count">{entries.length}</span> : null}
        </h2>
        <Button size="sm" variant="ghost" icon={Icons.X} aria-label={t("replayAnnotations.close")} onClick={onClose} />
      </header>
      {annotations.canAnnotate ? (
        <section className="replay-annotations__compose">
          <div className="replay-annotations__stepper">
            <Button
              size="sm"
              variant="ghost"
              icon={Icons.ChevronLeft}
              aria-label={t("replay.previous")}
              disabled={index <= 0}
              onClick={() => onJump(index - 1)}
            />
            <h3>{t("replayAnnotations.markMomentAt", { turn, action: index + 1 })}</h3>
            <Button
              size="sm"
              variant="ghost"
              icon={Icons.ChevronRight}
              aria-label={t("replay.next")}
              disabled={index >= lastIndex}
              onClick={() => onJump(index + 1)}
            />
          </div>
          <ReplayMarkerPicker onPick={(emoji) => void annotations.markMoment({ frameIndex: index, turn, emoji })} />
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
                  setComposing(false);
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
        </section>
      ) : (
        <p className="replay-annotations__hint">{t("replayAnnotations.unavailable")}</p>
      )}
      {annotations.failed ? <p role="alert">{t("replayAnnotations.error")}</p> : null}
      {entries.length === 0 ? (
        <p className="replay-annotations__empty">{t("replayAnnotations.empty")}</p>
      ) : (
        <ol className="replay-annotations__list">{entries.map(renderEntry)}</ol>
      )}
      <ReplayAnnotationTools
        replay={replay}
        annotations={annotations}
        entries={entries}
        index={index}
        skipThinking={skipThinking}
        shareId={shareId}
      />
    </aside>
  );
}
