import { LiveReplayAnnotationRejection } from "@aegis/shared/replays/annotations/LiveReplayAnnotationRejection";
import type { LiveReplayAnnotationResult } from "@aegis/shared/replays/annotations/LiveReplayAnnotation";
import type { TranslationKey, TranslationParams } from "@/i18n/translationTypes";
import { useTranslation } from "@/i18n/useTranslation";
import { ReplayMarkerPicker } from "@/replays/annotations/ReplayMarkerPicker";
import type { LiveReplayAnnotations } from "@/replays/annotations/useLiveReplayAnnotations";

type Props = { annotations: LiveReplayAnnotations };

const REJECTION_MESSAGES: Record<LiveReplayAnnotationRejection, TranslationKey> = {
  [LiveReplayAnnotationRejection.SIGN_IN_REQUIRED.value]: "replayAnnotations.live.signIn",
  [LiveReplayAnnotationRejection.UNAVAILABLE.value]: "replayAnnotations.live.unavailable",
  [LiveReplayAnnotationRejection.LIMIT_REACHED.value]: "replayAnnotations.limitReached",
  [LiveReplayAnnotationRejection.TOO_FAST.value]: "replayAnnotations.live.tooFast",
  [LiveReplayAnnotationRejection.INVALID.value]: "replayAnnotations.error",
};

function getStatusKey(result: LiveReplayAnnotationResult): TranslationKey {
  if (result.kind === "rejected") {
    return REJECTION_MESSAGES[result.reason];
  }
  return "replayAnnotations.live.marked";
}

function getStatusParams(result: LiveReplayAnnotationResult): TranslationParams {
  if (result.kind === "marker") {
    return { emoji: result.marker.emoji, turn: result.marker.turn };
  }
  return {};
}

export function LiveReplayAnnotationBar({ annotations }: Props) {
  const { t } = useTranslation();
  const { send, lastResult } = annotations;
  if (!send) {
    return null;
  }
  const status = lastResult
    ? t(getStatusKey(lastResult), getStatusParams(lastResult))
    : t("replayAnnotations.privateHint");
  return (
    <section className="live-replay-annotations" aria-label={t("replayAnnotations.live.title")}>
      <h3>{t("replayAnnotations.live.title")}</h3>
      <ReplayMarkerPicker onPick={(emoji) => send({ kind: "marker", emoji })} />
      <p role="status">{status}</p>
    </section>
  );
}
