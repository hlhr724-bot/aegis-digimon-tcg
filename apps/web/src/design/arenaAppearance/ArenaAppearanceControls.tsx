import { useId } from "react";
import { ArenaUiScale } from "@/design/arenaAppearance/ArenaUiScale";
import { EffectTransparency } from "@/design/arenaAppearance/EffectTransparency";
import { arenaAppearancePreference } from "@/design/arenaAppearance/arenaAppearancePreference";
import { useTranslation } from "@/i18n";
import "@/design/arenaAppearance/arenaAppearance.css";

export function ArenaAppearanceControls() {
  const id = useId();
  const { t } = useTranslation();
  const appearance = arenaAppearancePreference.useAppearance();
  return (
    <div className="arena-appearance-controls">
      <label htmlFor={`${id}-scale`}>{t("settings.boardScale")}</label>
      <select
        id={`${id}-scale`}
        value={appearance.scale}
        aria-describedby={`${id}-scale-help`}
        onChange={(event) => {
          const scale = Object.values(ArenaUiScale).find((entry) => entry.value === event.target.value);
          if (scale) {
            arenaAppearancePreference.setAppearance({ ...appearance, scale: scale.value });
          }
        }}
      >
        {Object.values(ArenaUiScale).map((entry) => (
          <option key={entry.value} value={entry.value}>
            {entry.label}
          </option>
        ))}
      </select>
      <small id={`${id}-scale-help`}>{t("settings.boardScaleDescription")}</small>
      <label htmlFor={`${id}-transparency`}>{t("settings.promptTransparency")}</label>
      <select
        id={`${id}-transparency`}
        value={appearance.transparency}
        aria-describedby={`${id}-transparency-help`}
        onChange={(event) => {
          const transparency = Object.values(EffectTransparency).find((entry) => entry.value === event.target.value);
          if (transparency) {
            arenaAppearancePreference.setAppearance({ ...appearance, transparency: transparency.value });
          }
        }}
      >
        {Object.values(EffectTransparency).map((entry) => (
          <option key={entry.value} value={entry.value}>
            {t(entry.labelKey)}
          </option>
        ))}
      </select>
      <small id={`${id}-transparency-help`}>{t("settings.promptTransparencyDescription")}</small>
      <button type="button" onClick={arenaAppearancePreference.resetAppearance}>
        {t("settings.resetArenaAppearance")}
      </button>
    </div>
  );
}
