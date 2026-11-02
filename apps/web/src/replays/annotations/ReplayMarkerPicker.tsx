import { ReplayMarkerEmoji } from "@aegis/shared/replays/annotations/ReplayMarkerEmoji";
import { useTranslation } from "@/i18n/useTranslation";
import "@/replays/annotations/replayAnnotations.css";

type Props = {
  disabled?: boolean;
  onPick: (emoji: ReplayMarkerEmoji) => void;
};

export function ReplayMarkerPicker({ disabled = false, onPick }: Props) {
  const { t } = useTranslation();
  return (
    <div className="replay-marker-picker" role="group" aria-label={t("replayAnnotations.markMoment")}>
      {Object.values(ReplayMarkerEmoji).map((entry) => (
        <button
          key={entry.name}
          type="button"
          disabled={disabled}
          aria-label={t(entry.label)}
          title={t(entry.label)}
          onClick={() => onPick(entry.value)}
        >
          <span aria-hidden="true">{entry.value}</span>
        </button>
      ))}
    </div>
  );
}
