import { useId, useState } from "react";
import { Icons, type IconComponent } from "@/design/icons";
import { playSound } from "@/design/sound";
import { ArenaEnvironmentSettings } from "@/game/arena3d/ArenaEnvironmentSettings";
import { BoardStyle } from "@/game/arena3d/boardStyle/BoardStyle";
import { boardStylePreference } from "@/game/arena3d/boardStyle/boardStylePreference";
import { isWebGlAvailable } from "@/game/arena3d/isWebGlAvailable";
import { Arena3dQuality } from "@/game/arena3d/quality/Arena3dQuality";
import { AUTO_ARENA_3D_QUALITY, type Arena3dQualityChoice } from "@/game/arena3d/quality/Arena3dQualityChoice";
import { arena3dQualityPreference } from "@/game/arena3d/quality/arena3dQualityPreference";
import type { TranslationKey } from "@/i18n/translationTypes";
import { useTranslation } from "@/i18n/useTranslation";
import "@/design/ArenaLookSettings.css";
import "@/game/arena3d/boardStyle/boardStyleSettings.css";

type StyleOption = {
  style: BoardStyle;
  labelKey: TranslationKey;
  icon: IconComponent;
};

type QualityOption = {
  choice: Arena3dQualityChoice;
  labelKey: TranslationKey;
};

const STYLE_OPTIONS: readonly StyleOption[] = [
  { style: BoardStyle.CLASSIC.value, labelKey: BoardStyle.CLASSIC.labelKey, icon: Icons.LayoutGrid },
  { style: BoardStyle.ARENA_3D.value, labelKey: BoardStyle.ARENA_3D.labelKey, icon: Icons.Hexagon },
];

const QUALITY_OPTIONS: readonly QualityOption[] = [
  { choice: AUTO_ARENA_3D_QUALITY, labelKey: "redesign.foundation.arena3dQuality.auto" },
  ...Object.values(Arena3dQuality).map((entry) => ({ choice: entry.value, labelKey: entry.labelKey })),
];

function Arena3dQualitySettings() {
  const { t } = useTranslation();
  const groupName = useId();
  const selected = arena3dQualityPreference.useChoice();
  return (
    <fieldset className="aegis-arena-look__group">
      <legend className="aegis-arena-look__legend">{t("redesign.foundation.arena3dQuality.title")}</legend>
      <div className="aegis-board-style__qualities">
        {QUALITY_OPTIONS.map((option) => (
          <label key={option.choice} className="aegis-arena-look__option aegis-board-style__quality">
            <input
              type="radio"
              className="aegis-sr-only"
              name={groupName}
              value={option.choice}
              checked={option.choice === selected}
              onChange={() => {
                arena3dQualityPreference.setChoice(option.choice);
                playSound("select");
              }}
            />
            <span className="aegis-arena-look__option-label">{t(option.labelKey)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function BoardStyleSettings() {
  const { t } = useTranslation();
  const groupName = useId();
  const selected = boardStylePreference.useStyle();
  const [webGlAvailable] = useState(isWebGlAvailable);
  const arena3dChosen = selected === BoardStyle.ARENA_3D.value;

  return (
    <div className="aegis-arena-look aegis-board-style">
      <fieldset className="aegis-arena-look__group">
        <legend className="aegis-arena-look__legend">{t("redesign.foundation.boardStyle.title")}</legend>
        <div className="aegis-arena-look__battlefields">
          {STYLE_OPTIONS.map((option) => (
            <label key={option.style} className="aegis-arena-look__option aegis-arena-look__palette">
              <input
                type="radio"
                className="aegis-sr-only"
                name={groupName}
                value={option.style}
                checked={option.style === selected}
                onChange={() => {
                  boardStylePreference.setStyle(option.style);
                  playSound("select");
                }}
              />
              <span className="aegis-arena-look__theme-icon" aria-hidden="true">
                <option.icon size={18} />
              </span>
              <span className="aegis-arena-look__option-label">{t(option.labelKey)}</span>
            </label>
          ))}
        </div>
        {arena3dChosen ? (
          <p className="aegis-arena-look__note">{t("redesign.foundation.boardStyle.arena3dDesc")}</p>
        ) : null}
        {arena3dChosen && !webGlAvailable ? (
          <p className="aegis-arena-look__note" role="status">
            {t("redesign.foundation.boardStyle.unsupported")}
          </p>
        ) : null}
      </fieldset>
      {arena3dChosen && webGlAvailable ? (
        <>
          <ArenaEnvironmentSettings />
          <Arena3dQualitySettings />
        </>
      ) : null}
    </div>
  );
}
