import { useId, useState } from "react";
import { ArenaLookSettings } from "@/design/ArenaLookSettings";
import type { ArenaDeckColors } from "@/design/arenaPalette";
import { Icons, type IconComponent } from "@/design/icons";
import { playSound } from "@/design/sound";
import { COARSE_POINTER_QUERY, useMediaQuery } from "@/design/useMediaQuery";
import { ArenaEnvironmentSettings } from "@/game/arena3d/ArenaEnvironmentSettings";
import { BoardStyle } from "@/game/arena3d/boardStyle/BoardStyle";
import { boardStylePreference } from "@/game/arena3d/boardStyle/boardStylePreference";
import { resolveBoardStyle } from "@/game/arena3d/boardStyle/resolveBoardStyle";
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

type Props = {
  deckColors?: ArenaDeckColors;
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
      <div className="aegis-arena-look__segments">
        {QUALITY_OPTIONS.map((option) => (
          <label key={option.choice} className="aegis-arena-look__segment">
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
            <span>{t(option.labelKey)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function BoardStyleSettings({ deckColors }: Props) {
  const { t } = useTranslation();
  const groupName = useId();
  const preference = boardStylePreference.useStyle();
  const [webGlAvailable] = useState(isWebGlAvailable);
  const selected = resolveBoardStyle({ preference, webGlAvailable });
  const arena3dActive = selected === BoardStyle.ARENA_3D.value;
  const unsupportedNoteId = useId();
  const touchDevice = useMediaQuery(COARSE_POINTER_QUERY);

  return (
    <div className="aegis-arena-look aegis-board-style">
      <fieldset className="aegis-arena-look__group">
        <legend className="aegis-arena-look__legend">{t("redesign.foundation.boardStyle.title")}</legend>
        <div className="aegis-arena-look__segments">
          {STYLE_OPTIONS.map((option) => {
            const blocked = option.style === BoardStyle.ARENA_3D.value && !webGlAvailable;
            return (
              <label key={option.style} className="aegis-arena-look__segment">
                <input
                  type="radio"
                  className="aegis-sr-only"
                  name={groupName}
                  value={option.style}
                  checked={option.style === selected}
                  disabled={blocked}
                  aria-describedby={blocked ? unsupportedNoteId : undefined}
                  onChange={() => {
                    boardStylePreference.setStyle(option.style);
                    playSound("select");
                  }}
                />
                <span className="aegis-arena-look__segment-icon" aria-hidden="true">
                  <option.icon size={16} />
                </span>
                <span>{t(option.labelKey)}</span>
              </label>
            );
          })}
        </div>
        {arena3dActive ? (
          <p className="aegis-arena-look__note">{t("redesign.foundation.boardStyle.arena3dDesc")}</p>
        ) : null}
        {webGlAvailable ? null : (
          <p id={unsupportedNoteId} className="aegis-arena-look__note aegis-board-style__unsupported">
            {t(
              touchDevice
                ? "redesign.foundation.boardStyle.unsupportedTouch"
                : "redesign.foundation.boardStyle.unsupported",
            )}
          </p>
        )}
      </fieldset>
      {arena3dActive ? (
        <>
          <ArenaEnvironmentSettings />
          <Arena3dQualitySettings />
        </>
      ) : (
        <ArenaLookSettings deckColors={deckColors} />
      )}
    </div>
  );
}
