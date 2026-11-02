import { useId } from "react";
import { GameMode } from "@aegis/shared/manual/GameMode";
import { useTranslation } from "@/i18n/useTranslation";
import "@/screens/gameModeSwitch.css";

type Props = { value: GameMode; onChange?: (mode: GameMode) => void };

export function GameModeSwitch({ value, onChange }: Props) {
  const { t } = useTranslation();
  const labelId = useId();
  const manual = value === GameMode.MANUAL.value;
  return (
    <div className="lobby-game-mode">
      <span id={labelId} className="lobby-game-mode__label">
        {t("manual.mode")}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={manual}
        aria-labelledby={labelId}
        aria-describedby={`${labelId}-value`}
        className="lobby-game-mode__switch"
        onClick={() => onChange?.(manual ? GameMode.AUTOMATIC.value : GameMode.MANUAL.value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            onChange?.(event.key === "ArrowRight" ? GameMode.MANUAL.value : GameMode.AUTOMATIC.value);
          }
        }}
      >
        <span className="aegis-sr-only" id={`${labelId}-value`}>
          {t(manual ? "manual.title" : "manual.automatic")}
        </span>
        <span className={!manual ? "is-active" : undefined} aria-hidden="true">
          {t("manual.automatic")}
        </span>
        <span className={manual ? "is-active" : undefined} aria-hidden="true">
          {t("replay.mode.manual")}
        </span>
      </button>
    </div>
  );
}
