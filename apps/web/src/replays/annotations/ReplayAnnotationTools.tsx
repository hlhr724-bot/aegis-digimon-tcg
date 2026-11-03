import { useId, useMemo, useState } from "react";
import type { MatchReplay } from "@aegis/shared/replays";
import { ReplayMarkerEmoji } from "@aegis/shared/replays/annotations/ReplayMarkerEmoji";
import { ReplayVisibility } from "@aegis/shared/replays/ReplayVisibility";
import { Icons } from "@/design/icons";
import { Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import type { ReplayAnnotationEntry } from "@/replays/annotations/buildReplayAnnotationEntries";
import { buildReplayChapters } from "@/replays/annotations/buildReplayChapters";
import { buildReplayMomentLink } from "@/replays/annotations/buildReplayMomentLink";
import type { ReplayAnnotationsState } from "@/replays/annotations/useReplayAnnotations";

const CHAPTER_TEXT_LIMIT = 80;

type Props = {
  replay: MatchReplay;
  annotations: ReplayAnnotationsState;
  entries: readonly ReplayAnnotationEntry[];
  index: number;
  skipThinking: boolean;
  shareId?: string;
};

type Copied = "link" | "chapters" | "failed";

function shortenNote(text: string): string {
  const firstLine = text.split("\n")[0] ?? "";
  const characters = Array.from(firstLine);
  if (characters.length <= CHAPTER_TEXT_LIMIT) {
    return firstLine;
  }
  return `${characters.slice(0, CHAPTER_TEXT_LIMIT - 1).join("")}…`;
}

export function ReplayAnnotationTools({ replay, annotations, entries, index, skipThinking, shareId }: Props) {
  const { t } = useTranslation();
  const chaptersId = useId();
  const [copied, setCopied] = useState<Copied>();
  const linkId = shareId ?? annotations.ownReplays[0]?.replayId;
  const chapters = useMemo(
    () =>
      buildReplayChapters({
        replay,
        entries,
        skipThinking,
        startLabel: t("replayAnnotations.chapterStart", { first: replay.players[0], second: replay.players[1] }),
        describe: (entry) => {
          if (entry.kind === "note") {
            return t("replayAnnotations.chapterNote", { turn: entry.turn, text: shortenNote(entry.note.text) });
          }
          const definition = Object.values(ReplayMarkerEmoji).find((option) => option.value === entry.marker.emoji);
          if (!definition) {
            return t("replayAnnotations.chapterEmoji", { emoji: entry.marker.emoji, turn: entry.turn });
          }
          return t("replayAnnotations.chapterMarker", {
            emoji: entry.marker.emoji,
            label: t(definition.label),
            turn: entry.turn,
          });
        },
      }),
    [replay, entries, skipThinking, t],
  );

  async function copy(text: string, kind: Copied) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
    } catch {
      setCopied("failed");
    }
  }

  return (
    <section className="replay-annotations__tools" aria-label={t("replayAnnotations.tools")}>
      {annotations.canAnnotate ? (
        <p className="replay-annotations__hint replay-annotations__private">
          <Icons.Lock size={12} />
          {t("replayAnnotations.privateHint")}
        </p>
      ) : null}
      {annotations.ownReplays.map((own) => (
        <label key={own.replayId} className="replay-annotations__sharing">
          <input
            type="checkbox"
            checked={own.annotationsShared}
            onChange={(event) => void annotations.setSharing({ replayId: own.replayId, shared: event.target.checked })}
          />
          <span>
            {t("replayAnnotations.shareWithReplay")}
            <small>
              {t(
                own.visibility === ReplayVisibility.PRIVATE.value
                  ? "replayAnnotations.shareHintPrivate"
                  : "replayAnnotations.shareHintShared",
              )}
            </small>
          </span>
        </label>
      ))}
      <div className="replay-annotations__actions">
        {linkId ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void copy(buildReplayMomentLink({ replayId: linkId, index }), "link")}
          >
            {t("replayAnnotations.copyMomentLink")}
          </Button>
        ) : null}
        {entries.length ? (
          <Button size="sm" variant="secondary" onClick={() => void copy(chapters, "chapters")}>
            {t("replayAnnotations.copyChapters")}
          </Button>
        ) : null}
      </div>
      {copied ? (
        <p role="status" className="replay-annotations__hint">
          {t(copied === "failed" ? "replayAnnotations.copyFailed" : "replayAnnotations.copied")}
        </p>
      ) : null}
      {entries.length ? (
        <details className="replay-annotations__chapters">
          <summary>{t("replayAnnotations.chapters")}</summary>
          <label htmlFor={chaptersId} className="replay-annotations__hint">
            {t("replayAnnotations.chaptersHint")}
          </label>
          <textarea
            id={chaptersId}
            readOnly
            rows={5}
            value={chapters}
            onFocus={(event) => event.currentTarget.select()}
          />
        </details>
      ) : null}
    </section>
  );
}
