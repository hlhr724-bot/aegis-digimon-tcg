import { Suspense, useId, useRef } from "react";
import { ClientErrorBoundary } from "@/clientErrors/ClientErrorBoundary";
import { Icons } from "@/design/icons";
import { playSound } from "@/design/sound";
import { ArenaEnvironment } from "@/game/arena3d/ArenaEnvironment";
import { RANDOM_ARENA_ENVIRONMENT, type ArenaEnvironmentChoice } from "@/game/arena3d/ArenaEnvironmentChoice";
import { arenaEnvironmentPreference } from "@/game/arena3d/arenaEnvironmentPreference";
import { arenaEnvironmentPreviewStore } from "@/game/arena3d/environmentPreview/arenaEnvironmentPreviewStore";
import { useArenaSideColors } from "@/game/arena3d/useArenaSideColors";
import type { TranslationKey } from "@/i18n/translationTypes";
import { useTranslation } from "@/i18n/useTranslation";
import { createLazyComponent } from "@/net/createLazyComponent";
import "@/design/ArenaLookSettings.css";

type Option = {
  choice: ArenaEnvironmentChoice;
  labelKey: TranslationKey;
  swatch: string | undefined;
};

const ENVIRONMENTS = Object.values(ArenaEnvironment);

const OPTIONS: readonly Option[] = [
  ...ENVIRONMENTS.map((entry) => ({ choice: entry.value, labelKey: entry.labelKey, swatch: entry.swatch })),
  { choice: RANDOM_ARENA_ENVIRONMENT, labelKey: "redesign.foundation.environment.random", swatch: undefined },
];

const ArenaEnvironmentPreviewRenderer = createLazyComponent({
  load: () => import("@/game/arena3d/environmentPreview/ArenaEnvironmentPreviewRenderer"),
  pick: (module) => module.ArenaEnvironmentPreviewRenderer,
});

export function ArenaEnvironmentSettings() {
  const { t } = useTranslation();
  const groupName = useId();
  const selected = arenaEnvironmentPreference.useChoice();
  const root = useRef<HTMLDivElement>(null);
  const colors = useArenaSideColors({ board: root, paletteKey: undefined });
  const colorsKey = JSON.stringify(colors);
  const previews = arenaEnvironmentPreviewStore.usePreviews(colorsKey);
  const pending = ENVIRONMENTS.map((entry) => entry.value).filter((environment) => !previews[environment]);

  return (
    <div ref={root} className="aegis-arena-look aegis-arena-look--environment">
      <fieldset className="aegis-arena-look__group">
        <legend className="aegis-arena-look__legend">{t("redesign.foundation.arena.environment")}</legend>
        <div className="aegis-arena-look__battlefields">
          {OPTIONS.map((option) => {
            const preview = option.choice === RANDOM_ARENA_ENVIRONMENT ? undefined : previews[option.choice];
            return (
              <label key={option.choice} className="aegis-arena-look__option aegis-arena-look__battlefield">
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
                  <span className="aegis-arena-look__thumb" style={{ background: option.swatch }}>
                    {preview ? <img src={preview} alt="" /> : null}
                  </span>
                ) : (
                  <span className="aegis-arena-look__thumb aegis-arena-look__upload" aria-hidden="true">
                    <Icons.Dices size={20} />
                  </span>
                )}
                <span className="aegis-arena-look__option-label">{t(option.labelKey)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {pending.length > 0 ? (
        <ClientErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <ArenaEnvironmentPreviewRenderer
              colors={colors}
              pending={pending}
              onCapture={(environment, url) => arenaEnvironmentPreviewStore.record(colorsKey, environment, url)}
            />
          </Suspense>
        </ClientErrorBoundary>
      ) : null}
    </div>
  );
}
