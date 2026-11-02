import type { MatchReplay } from "@aegis/shared/replays";
import { Icons } from "@/design/icons";
import { Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import "@/replays/annotations/replayAnnotations.css";
import { ReplayMarkerPicker } from "@/replays/annotations/ReplayMarkerPicker";
import type { ReplayAnnotationsState } from "@/replays/annotations/useReplayAnnotations";

type Props = {
  replay: MatchReplay;
  annotations: ReplayAnnotationsState;
  index: number;
  onJump: (index: number) => void;
  onClose: () => void;
};

export function ReplayAnnotationPanel({ replay, annotations, index, onJump, onClose }: Props) {
  const { t } = useTranslation();
  const turn = replay.frames[index]?.state.turnCount ?? 0;
  return (
    <aside id="replay-annotations" className="replay-annotations" aria-label={t("replayAnnotations.title")}>
      <header>
        <h2>{t("replayAnnotations.title")}</h2>
        <Button size="sm" variant="ghost" icon={Icons.X} aria-label={t("replayAnnotations.close")} onClick={onClose} />
      </header>
      {annotations.canAnnotate ? (
        <section className="replay-annotations__compose">
          <h3>{t("replayAnnotations.markMomentAt", { turn, action: index + 1 })}</h3>
          <ReplayMarkerPicker onPick={(emoji) => void annotations.markMoment({ frameIndex: index, turn, emoji })} />
          <p className="replay-annotations__hint">{t("replayAnnotations.privateHint")}</p>
        </section>
      ) : (
        <p className="replay-annotations__hint">{t("replayAnnotations.unavailable")}</p>
      )}
      {annotations.failed ? <p role="alert">{t("replayAnnotations.error")}</p> : null}
      {annotations.markers.length === 0 ? (
        <p className="replay-annotations__empty">{t("replayAnnotations.empty")}</p>
      ) : (
        <ol className="replay-annotations__list">
          {annotations.markers.map((marker) => (
            <li key={marker.id}>
              <button
                type="button"
                className="replay-annotations__moment"
                aria-current={marker.frameIndex === index ? "step" : undefined}
                onClick={() => onJump(marker.frameIndex)}
              >
                <span aria-hidden="true">{marker.emoji}</span>
                <span>{t("replayAnnotations.moment", { turn: marker.turn, action: marker.frameIndex + 1 })}</span>
              </button>
              <Button
                size="sm"
                variant="ghost"
                icon={Icons.Trash}
                aria-label={t("replayAnnotations.removeMarker")}
                title={t("replayAnnotations.removeMarker")}
                onClick={() => void annotations.removeMarker(marker.id)}
              />
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
