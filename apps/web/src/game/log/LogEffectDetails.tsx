import type { LogEffectDetail } from "@/game/log/LogEffectDetail";
import { EffectText } from "@/game/EffectText";
import { LogEffectTags } from "@/game/log/LogEffectTags";
import { getCardTextField } from "@/i18n/getCardTextField";

type Props = { effect: LogEffectDetail };

export function LogEffectDetails({ effect }: Props) {
  const { cardId, timing, timingLabel, isInherited, clause } = effect;
  if (timingLabel === undefined && !isInherited && clause === undefined) {
    return null;
  }
  return (
    <div className="play-log__effect">
      <LogEffectTags effect={effect} />
      {clause !== undefined ? (
        <p className="play-log__effect-text">
          <EffectText
            text={clause}
            cardId={cardId}
            field={getCardTextField({ cardId, timing, isInherited, text: clause })}
            surface="log"
            timing={timing}
            allowContext
          />
        </p>
      ) : null}
    </div>
  );
}
