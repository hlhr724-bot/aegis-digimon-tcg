/* Arena look: a live mini board, lane layout, and the battlefield. Used by
   the Settings screen and the match screen's settings dialog; the caller
   supplies the container. The board's light or dark look follows the app theme. */

import { useId, useRef, useState } from "react";
import { arenaPaletteStyle, useArenaPalette, type ArenaDeckColors } from "./arenaPalette";
import {
  BATTLEFIELDS,
  CLASSIC_BATTLEFIELD,
  CUSTOM_BATTLEFIELD_ID,
  RANDOM_BATTLEFIELD_ID,
  battlefieldById,
  clearCustomBattlefield,
  setBattlefieldId,
  setCustomBattlefield,
  toStorableDataUrl,
  useBattlefieldId,
  useCustomBattlefieldSrc,
  type Battlefield,
} from "./battlefield";
import { Icons } from "./icons";

import { FieldLayout, setFieldLayout, useFieldLayout } from "@/design/fieldLayout";
import { BattleLanes, setBattleLanes, useBattleLanePreference } from "./battleLanes";
import { playSound } from "./sound";
import { useTranslation, type TranslationKey } from "../i18n";
import "./arenaTheme.css";
import "./ArenaLookSettings.css";

const BATTLEFIELD_LABEL_KEYS: Partial<Record<string, TranslationKey>> = {
  classic: "redesign.foundation.battlefield.classic",
  tropical: "redesign.foundation.battlefield.tropical",
  sanctum: "redesign.foundation.battlefield.sanctum",
  skyfall: "redesign.foundation.battlefield.skyfall",
  nexus: "redesign.foundation.battlefield.nexus",
  stone: "redesign.foundation.battlefield.stone",
  void: "redesign.foundation.battlefield.void",
  cloth: "redesign.foundation.battlefield.cloth",
  "digital-island": "redesign.foundation.battlefield.digital-island",
  "egg-village": "redesign.foundation.battlefield.egg-village",
  "data-sea": "redesign.foundation.battlefield.data-sea",
  "server-canyon": "redesign.foundation.battlefield.server-canyon",
  "dark-network": "redesign.foundation.battlefield.dark-network",
  "data-plaza": "redesign.foundation.battlefield.data-plaza",
  "panorama-plains": "redesign.foundation.battlefield.panorama-plains",
  "jungle-cove": "redesign.foundation.battlefield.jungle-cove",
  "pipe-lake": "redesign.foundation.battlefield.pipe-lake",
  "cyber-hub": "redesign.foundation.battlefield.cyber-hub",
  "wire-woods": "redesign.foundation.battlefield.wire-woods",
  [CUSTOM_BATTLEFIELD_ID]: "settings.playmatCustom",
};

const PREVIEW_DIGIMON_SLOTS = 3;
const PREVIEW_TAMER_SLOTS = 2;

function PreviewSlots({
  count,
  side,
  kind,
}: {
  count: number;
  side: "player" | "opponent";
  kind: "digimon" | "tamer";
}) {
  return Array.from({ length: count }, (_, slot) => (
    <span key={`${kind}-${slot}`} data-side={side} data-kind={kind} className="aegis-arena-look__slot" />
  ));
}

function PreviewHalf({ label, side, lanes }: { label: string; side: "player" | "opponent"; lanes: BattleLanes }) {
  return (
    <div className="aegis-arena-look__half" data-side={side}>
      <span data-side={side} className="aegis-arena-side-label aegis-arena-look__side-label">
        {label}
      </span>
      {lanes === BattleLanes.Two ? (
        <>
          <div className="aegis-arena-look__lane">
            <PreviewSlots count={PREVIEW_DIGIMON_SLOTS} side={side} kind="digimon" />
          </div>
          <div className="aegis-arena-look__lane">
            <PreviewSlots count={PREVIEW_TAMER_SLOTS} side={side} kind="tamer" />
          </div>
        </>
      ) : (
        <div className="aegis-arena-look__lane">
          <PreviewSlots count={PREVIEW_DIGIMON_SLOTS} side={side} kind="digimon" />
          <PreviewSlots count={PREVIEW_TAMER_SLOTS} side={side} kind="tamer" />
        </div>
      )}
    </div>
  );
}

function BattlefieldThumbnail({ field }: { field: Battlefield }) {
  return (
    <span className="aegis-arena-look__thumb">
      {field.src ? <img src={field.src} alt="" loading="lazy" /> : <span className="aegis-arena-backdrop" />}
    </span>
  );
}

const LANE_CHOICES: readonly { lanes: BattleLanes; count: number; label: TranslationKey }[] = [
  { lanes: BattleLanes.Two, count: 2, label: "redesign.foundation.arena.lanes.two" },
  { lanes: BattleLanes.One, count: 1, label: "redesign.foundation.arena.lanes.one" },
];

export function ArenaLookSettings({ deckColors }: { deckColors?: ArenaDeckColors }) {
  const { t } = useTranslation();
  const groupName = useId();
  const palette = useArenaPalette(deckColors);
  const lanePreference = useBattleLanePreference();
  const fieldLayout = useFieldLayout();
  const battleLanes = fieldLayout === FieldLayout.Classic ? BattleLanes.One : lanePreference;
  const battlefieldId = useBattlefieldId();
  const customSrc = useCustomBattlefieldSrc();
  const randomBattlefield = battlefieldId === RANDOM_BATTLEFIELD_ID;
  const battlefield = randomBattlefield ? CLASSIC_BATTLEFIELD : battlefieldById(battlefieldId);
  const battlefields = customSrc ? [...BATTLEFIELDS, battlefieldById(CUSTOM_BATTLEFIELD_ID)] : BATTLEFIELDS;
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploadError, setUploadError] = useState<string>();

  const battlefieldLabel = (field: Battlefield) => {
    const key = BATTLEFIELD_LABEL_KEYS[field.id];
    return key ? t(key) : field.label;
  };

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setUploadError(undefined);
    if (!file.type.startsWith("image/")) {
      setUploadError(t("settings.playmatInvalid"));
      return;
    }
    try {
      setCustomBattlefield(await toStorableDataUrl(file));
      playSound("select");
    } catch {
      setUploadError(t("settings.playmatTooLarge"));
    }
  }

  return (
    <div className="aegis-arena aegis-arena-look" style={arenaPaletteStyle(palette)}>
      <div className="aegis-arena-look__layout">
        <div className="aegis-arena-look__preview-column">
          <div
            className="aegis-arena-board aegis-arena-look__preview"
            role="img"
            aria-label={t("redesign.foundation.arena.preview")}
          >
            {battlefield.src ? <img className="aegis-arena-look__art" src={battlefield.src} alt="" /> : null}
            <div
              className="aegis-arena-backdrop aegis-arena-look__backdrop"
              data-art={battlefield.src ? "" : undefined}
            />
            <PreviewHalf label={t("redesign.foundation.arena.opponent")} side="opponent" lanes={battleLanes} />
            <PreviewHalf label={t("redesign.foundation.arena.you")} side="player" lanes={battleLanes} />
            <span className="aegis-arena-clash aegis-arena-look__clash" />
          </div>
          <p className="aegis-arena-look__note">{t("redesign.foundation.arena.themeNote")}</p>
          {randomBattlefield ? (
            <p className="aegis-arena-look__note">{t("redesign.foundation.arena.randomNote")}</p>
          ) : null}
        </div>

        <div className="aegis-arena-look__controls">
          <fieldset className="aegis-arena-look__group">
            <legend className="aegis-arena-look__legend">{t("redesign.foundation.arena.lanes")}</legend>
            <div className="aegis-arena-look__palettes">
              {LANE_CHOICES.map((option) => {
                const chosen = option.lanes === battleLanes;
                return (
                  <label key={option.lanes} className="aegis-arena-look__option aegis-arena-look__palette">
                    <input
                      type="radio"
                      className="aegis-sr-only"
                      name={`${groupName}-lanes`}
                      value={option.lanes}
                      checked={chosen}
                      onChange={() => {
                        setFieldLayout(FieldLayout.Organized);
                        setBattleLanes(option.lanes);
                        playSound("select");
                      }}
                    />
                    <span className="aegis-arena-look__lanes-icon" aria-hidden="true">
                      {Array.from({ length: option.count }, (_, lane) => (
                        <span key={lane} />
                      ))}
                    </span>
                    <span className="aegis-arena-look__option-label">{t(option.label)}</span>
                    {chosen ? (
                      <span className="aegis-arena-look__check" aria-hidden="true">
                        <Icons.Check size={16} />
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
            <p className="aegis-arena-look__note">{t("redesign.foundation.arena.lanes.phoneNote")}</p>
          </fieldset>

          <fieldset className="aegis-arena-look__group">
            <legend className="aegis-arena-look__legend">{t("redesign.foundation.arena.battlefield")}</legend>
            <div className="aegis-arena-look__battlefields">
              {battlefields.map((field) => (
                <label key={field.id} className="aegis-arena-look__option aegis-arena-look__battlefield">
                  <input
                    type="radio"
                    className="aegis-sr-only"
                    name={`${groupName}-battlefield`}
                    value={field.id}
                    checked={field.id === battlefieldId}
                    onChange={() => {
                      setBattlefieldId(field.id);
                      playSound("select");
                    }}
                  />
                  <BattlefieldThumbnail field={field} />
                  <span className="aegis-arena-look__option-label">{battlefieldLabel(field)}</span>
                </label>
              ))}
              <label className="aegis-arena-look__option aegis-arena-look__battlefield">
                <input
                  type="radio"
                  className="aegis-sr-only"
                  name={`${groupName}-battlefield`}
                  value={RANDOM_BATTLEFIELD_ID}
                  checked={randomBattlefield}
                  onChange={() => {
                    setBattlefieldId(RANDOM_BATTLEFIELD_ID);
                    playSound("select");
                  }}
                />
                <span className="aegis-arena-look__thumb aegis-arena-look__upload" aria-hidden="true">
                  <Icons.Dices size={20} />
                </span>
                <span className="aegis-arena-look__option-label">{t("redesign.foundation.battlefield.random")}</span>
              </label>
              <button
                type="button"
                className="aegis-arena-look__option aegis-arena-look__battlefield"
                onClick={() => fileRef.current?.click()}
              >
                <span className="aegis-arena-look__thumb aegis-arena-look__upload" aria-hidden="true">
                  <Icons.Upload size={20} />
                </span>
                <span className="aegis-arena-look__option-label">
                  {customSrc ? t("redesign.foundation.arena.replaceImage") : t("settings.playmatUpload")}
                </span>
              </button>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                void pickFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />

            {customSrc ? (
              <button type="button" className="aegis-arena-look__remove" onClick={() => clearCustomBattlefield()}>
                <Icons.Ban size={14} />
                {t("settings.playmatRemove")}
              </button>
            ) : null}

            {uploadError ? (
              <p className="aegis-arena-look__error" role="status">
                {uploadError}
              </p>
            ) : null}
          </fieldset>
        </div>
      </div>
    </div>
  );
}
