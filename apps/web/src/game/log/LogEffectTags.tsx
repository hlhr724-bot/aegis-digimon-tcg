import type { LogEffectDetail } from "@/game/log/LogEffectDetail";
import { EffectText } from "@/game/EffectText";
import { useTranslation } from "@/i18n/useTranslation";

type Props = { effect: LogEffectDetail };

export function LogEffectTags({ effect }: Props) {
  const { t } = useTranslation();
  const { cardId, timing, timingLabel, isInherited } = effect;
  if (timingLabel === undefined && !isInherited) {
    return null;
  }
  return (
    <span className="play-log__effect-tags">
      {timingLabel !== undefined ? (
        <span className="play-log__effect-timing" data-timing={timing}>
          <EffectText text={timingLabel} cardId={cardId} surface="log" timing={timing} />
        </span>
      ) : null}
      {isInherited ? <span className="play-log__effect-inherited">{t("overlay.role.inherited")}</span> : null}
    </span>
  );
}
