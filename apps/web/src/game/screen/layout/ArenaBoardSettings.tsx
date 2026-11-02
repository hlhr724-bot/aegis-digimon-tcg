import { ArenaAppearanceControls } from "@/design/arenaAppearance/ArenaAppearanceControls";
import { useTamerGrouping } from "@/design/tamerGrouping/useTamerGrouping";
import { setTamerGroupingEnabled } from "@/design/tamerGrouping/setTamerGroupingEnabled";
/* Board display choices for the match dialog. They share their stores with the
   Settings screen, so a change here shows on the board behind the dialog at once. */

import { cardConfirmationModeLabelKey } from "@/game/cardConfirmation/cardConfirmationModeLabelKey";
import { cardConfirmationModeValues } from "@/game/cardConfirmation/cardConfirmationModeValues";
import { cardConfirmationPreference } from "@/game/cardConfirmation/cardConfirmationPreference";
import { isCardConfirmationMode } from "@/game/cardConfirmation/isCardConfirmationMode";

import { EFFECT_PROMPT_POSITIONS, setEffectPromptPosition, useEffectPromptPosition } from "../../effectPromptPosition";
import { TEXT_SCALES, setTextScale, useTextScale } from "../../../design/textScale";
import { useId, useState } from "react";
import { setPileCountsShown, usePileCountsShown } from "../../../design/pileCounts";
import { Switch } from "../../../design/primitives";
import { SEQUENTIAL_PACING_ENABLED } from "../../../features";
import { useTranslation, type TranslationKey } from "../../../i18n";
import { setAutoHatchEnabled, useAutoHatch } from "../../autoHatch";
import { setEffectConfirmationHoldEnabled, useEffectConfirmationHold } from "../../effectConfirmationHold";
import { setHandAutoSortEnabled, useHandAutoSort } from "../../handAutoSort";
import { arenaInputPreference } from "@/game/input/arenaInputPreference";
import { useArenaInputEnabled } from "@/game/input/useArenaInputEnabled";
import { hoverZoomPreference } from "@/design/hoverZoomPreference";
import { useHoverZoomPreference } from "@/design/useHoverZoomPreference";
import { NOTICE_DURATION_LABELS, NOTICE_DURATIONS, setNoticeDuration, useNoticeDuration } from "../../noticeDuration";
import { MatchLogDisplay } from "@/game/log/MatchLogDisplay";
import { isMatchLogDisplay } from "@/game/log/isMatchLogDisplay";
import { matchLogDisplayPreference } from "@/game/log/matchLogDisplayPreference";
import { useMatchLogDisplay } from "@/game/log/useMatchLogDisplay";
import { EFFECT_SPEEDS, getEffectSpeed, setEffectSpeed, type EffectSpeed } from "../../pacing";

const EFFECT_SPEED_LABELS: Record<EffectSpeed, TranslationKey> = {
  slow: "settings.effectSpeedSlow",
  normal: "settings.effectSpeedNormal",
  fast: "settings.effectSpeedFast",
};

export function ArenaBoardSettings() {
  const { t } = useTranslation();
  const titleId = useId();
  const pileCountsShown = usePileCountsShown();
  const hoverZoom = useHoverZoomPreference();
  const textScale = useTextScale();
  const handAutoSort = useHandAutoSort();
  const arenaInputEnabled = useArenaInputEnabled();
  const autoHatch = useAutoHatch();
  const groupIdenticalTamers = useTamerGrouping();
  const effectConfirmationHold = useEffectConfirmationHold();
  const effectPromptPosition = useEffectPromptPosition();
  const noticeDuration = useNoticeDuration();
  const matchLogDisplay = useMatchLogDisplay();
  const cardConfirmationMode = cardConfirmationPreference.useMode();
  const [effectSpeed, setEffectSpeedChoice] = useState<EffectSpeed>(getEffectSpeed);
  return (
    <section className="game-arena-board-settings" aria-labelledby={titleId}>
      <h3 id={titleId} className="game-arena-settings__title">
        {t("redesign.arena.board.title")}
      </h3>
      <div className="game-arena-settings__panel">
        <ArenaAppearanceControls />
        <div className="game-arena-settings__row game-arena-board-settings__size">
          <label htmlFor={`${titleId}-text-size`}>{t("settings.textSize")}</label>
          <select
            id={`${titleId}-text-size`}
            value={textScale}
            onChange={(event) => {
              const scale = TEXT_SCALES.find((value) => value === event.target.value);
              if (scale) setTextScale(scale);
            }}
          >
            {TEXT_SCALES.map((scale) => (
              <option key={scale} value={scale}>
                {t(
                  scale === "default"
                    ? "settings.textSizeDefault"
                    : scale === "large"
                      ? "settings.textSizeLarge"
                      : "settings.textSizeLarger",
                )}
              </option>
            ))}
          </select>
        </div>
        <div className="game-arena-settings__row game-arena-board-settings__size">
          <label htmlFor={`${titleId}-effect-position`}>{t("settings.effectPromptPosition")}</label>
          <select
            id={`${titleId}-effect-position`}
            value={effectPromptPosition}
            aria-describedby={`${titleId}-effect-position-desc`}
            onChange={(event) => {
              const position = EFFECT_PROMPT_POSITIONS.find((value) => value === event.target.value);
              if (position) setEffectPromptPosition(position);
            }}
          >
            {EFFECT_PROMPT_POSITIONS.map((position) => (
              <option key={position} value={position}>
                {t(position === "center" ? "settings.effectPromptCenter" : "settings.effectPromptLeft")}
              </option>
            ))}
          </select>
          <small id={`${titleId}-effect-position-desc`}>{t("settings.effectPromptPositionDesc")}</small>
        </div>
        {SEQUENTIAL_PACING_ENABLED ? (
          <div className="game-arena-settings__row game-arena-board-settings__size">
            <label htmlFor={`${titleId}-effect-speed`}>{t("settings.effectSpeed")}</label>
            <select
              id={`${titleId}-effect-speed`}
              value={effectSpeed}
              aria-describedby={`${titleId}-effect-speed-desc`}
              onChange={(event) => {
                const speed = EFFECT_SPEEDS.find((value) => value === event.target.value);
                if (!speed) return;
                setEffectSpeed(speed);
                setEffectSpeedChoice(speed);
              }}
            >
              {EFFECT_SPEEDS.map((speed) => (
                <option key={speed} value={speed}>
                  {t(EFFECT_SPEED_LABELS[speed])}
                </option>
              ))}
            </select>
            <small id={`${titleId}-effect-speed-desc`}>{t("settings.effectSpeedDesc")}</small>
          </div>
        ) : null}
        <div className="game-arena-settings__row game-arena-board-settings__size">
          <label htmlFor={`${titleId}-notice-duration`}>{t("settings.noticeDuration")}</label>
          <select
            id={`${titleId}-notice-duration`}
            value={noticeDuration}
            aria-describedby={`${titleId}-notice-duration-desc`}
            onChange={(event) => {
              const duration = NOTICE_DURATIONS.find((value) => value === event.target.value);
              if (duration) setNoticeDuration(duration);
            }}
          >
            {NOTICE_DURATIONS.map((duration) => (
              <option key={duration} value={duration}>
                {t(NOTICE_DURATION_LABELS[duration])}
              </option>
            ))}
          </select>
          <small id={`${titleId}-notice-duration-desc`}>{t("settings.noticeDurationDesc")}</small>
        </div>
        <div className="game-arena-settings__row game-arena-board-settings__size">
          <label htmlFor={`${titleId}-match-log-display`}>{t("settings.matchLogDisplay")}</label>
          <select
            id={`${titleId}-match-log-display`}
            value={matchLogDisplay.value}
            aria-describedby={`${titleId}-match-log-display-desc`}
            onChange={(event) => {
              if (isMatchLogDisplay(event.target.value)) matchLogDisplayPreference.set(event.target.value);
            }}
          >
            {Object.values(MatchLogDisplay).map((entry) => (
              <option key={entry.value} value={entry.value}>
                {t(entry.labelKey)}
              </option>
            ))}
          </select>
          <small id={`${titleId}-match-log-display-desc`}>{t("settings.matchLogDisplayDesc")}</small>
        </div>
        <div className="game-arena-settings__row game-arena-board-settings__size">
          <label htmlFor={`${titleId}-card-confirmation`}>{t("settings.cardConfirmation")}</label>
          <select
            id={`${titleId}-card-confirmation`}
            value={cardConfirmationMode}
            aria-describedby={`${titleId}-card-confirmation-desc`}
            onChange={(event) => {
              const mode = event.target.value;
              if (isCardConfirmationMode(mode)) cardConfirmationPreference.setMode(mode);
            }}
          >
            {cardConfirmationModeValues.map((mode) => (
              <option key={mode} value={mode}>
                {t(cardConfirmationModeLabelKey(mode))}
              </option>
            ))}
          </select>
          <small id={`${titleId}-card-confirmation-desc`}>{t("settings.cardConfirmationDesc")}</small>
        </div>
        <div className="game-arena-settings__row">
          <Switch
            checked={effectConfirmationHold}
            label={t("settings.effectConfirmationHold")}
            description={t("settings.effectConfirmationHoldDesc")}
            onChange={setEffectConfirmationHoldEnabled}
          />
        </div>
        <div className="game-arena-settings__row">
          <Switch
            checked={groupIdenticalTamers}
            label={t("settings.groupIdenticalTamers")}
            description={t("settings.groupIdenticalTamersDesc")}
            onChange={setTamerGroupingEnabled}
          />
        </div>
        <div className="game-arena-settings__row">
          <Switch
            checked={autoHatch}
            label={t("settings.autoHatch")}
            description={t("settings.autoHatchDesc")}
            onChange={setAutoHatchEnabled}
          />
        </div>
        <div className="game-arena-settings__row">
          <Switch
            checked={arenaInputEnabled}
            label={t("settings.arenaInput")}
            description={t("settings.arenaInputDesc")}
            onChange={arenaInputPreference.setEnabled}
          />
        </div>
        <div className="game-arena-settings__row">
          <Switch
            checked={handAutoSort}
            label={t("settings.handAutoSort")}
            description={t("settings.handAutoSortDesc")}
            onChange={setHandAutoSortEnabled}
          />
        </div>
        <div className="game-arena-settings__row">
          <Switch
            checked={pileCountsShown}
            label={t("settings.pileCounts")}
            description={t("settings.pileCountsDesc")}
            onChange={setPileCountsShown}
          />
        </div>
        <div className="game-arena-settings__row">
          <Switch
            checked={hoverZoom}
            label={t("settings.hoverZoom")}
            description={t("settings.hoverZoomDesc")}
            onChange={hoverZoomPreference.setEnabled}
          />
        </div>
      </div>
    </section>
  );
}
