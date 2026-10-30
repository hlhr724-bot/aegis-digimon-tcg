import { useId } from "react";
import { ArenaEnvironment } from "@/game/arena3d/ArenaEnvironment";
import { RANDOM_ARENA_ENVIRONMENT, type ArenaEnvironmentChoice } from "@/game/arena3d/ArenaEnvironmentChoice";
import { arenaEnvironmentPreference } from "@/game/arena3d/arenaEnvironmentPreference";
import { Icons } from "@/design/icons";
import { playSound } from "@/design/sound";
import type { TranslationKey } from "@/i18n/translationTypes";
import { useTranslation } from "@/i18n/useTranslation";
import "@/design/ArenaLookSettings.css";

type Option = {
  choice: ArenaEnvironmentChoice;
  labelKey: TranslationKey;
  swatch: string | undefined;
};

const OPTIONS: readonly Option[] = [
  ...Object.values(ArenaEnvironment).map((entry) => ({
    choice: entry.value,
    labelKey: entry.labelKey,
    swatch: entry.swatch,
  })),
  { choice: RANDOM_ARENA_ENVIRONMENT, labelKey: "redesign.foundation.environment.random", swatch: undefined },
];

export function ArenaEnvironmentSettings() {
  const { t } = useTranslation();
  const groupName = useId();
  const selected = arenaEnvironmentPreference.useChoice();

  return (
    <div className="aegis-arena-look aegis-arena-look--environment">
      <fieldset className="aegis-arena-look__group">
        <legend className="aegis-arena-look__legend">{t("redesign.foundation.arena.environment")}</legend>
        <div className="aegis-arena-look__battlefields">
          {OPTIONS.map((option) => (
            <label key={option.choice} className="aegis-arena-look__option aegis-arena-look__palette">
              <input
                type="radio"
                className="aegis-sr-only"
                name={groupName}
                value={option.choice}
                checked={option.choice === selected}
                onChange={() => {
                  arenaEnvironmentPreference.setChoice(option.choice);
                  playSound("select");
                }}
              />
              {option.swatch ? (
                <span className="aegis-arena-look__swatch" style={{ background: option.swatch }} aria-hidden="true" />
              ) : (
                <span className="aegis-arena-look__theme-icon" aria-hidden="true">
                  <Icons.Dices size={18} />
                </span>
              )}
              <span className="aegis-arena-look__option-label">{t(option.labelKey)}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
