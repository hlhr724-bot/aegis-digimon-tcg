import { Icons } from "../../../design/icons";
import { useTranslation } from "../../../i18n";

export function TriggerChooserScrollCue({ onClick, label }: { onClick: () => void; label?: string }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="trigger-chooser__scroll-cue"
      data-testid="trigger-chooser-scroll-cue"
      onClick={onClick}
    >
      <Icons.ChevronDown size={16} />
      <span>{label ?? t("overlay.moreEffectsBelow")}</span>
    </button>
  );
}
