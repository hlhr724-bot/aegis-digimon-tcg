import { useCardImageLanguage } from "@/screens/cardLanguage/useCardImageLanguage";
import { setCardImageLanguage } from "@/screens/cardLanguage/setCardImageLanguage";
import "@/screens/cardLanguage/cardLanguageSettings.css";
import { useRef, useState } from "react";
import { Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import type { DeckListing } from "@/game/decks";
import { CardImageLanguage } from "@aegis/shared/cards/CardImageLanguage";
import { applyDeckCardLanguage } from "@/screens/cardLanguage/applyDeckCardLanguage";

type Props = {
  decks: readonly DeckListing[];
  ready: boolean;
  onSave: (deck: DeckListing) => Promise<void>;
};

const languages = Object.values(CardImageLanguage);

export function CardLanguageSettings({ decks, ready, onSave }: Props) {
  const { t } = useTranslation();
  const storedLanguage = useCardImageLanguage();
  const language = storedLanguage ?? CardImageLanguage.ENGLISH.value;
  const running = useRef(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof applyDeckCardLanguage>> | null>(null);
  async function applyLanguage() {
    if (running.current || !ready) {
      return;
    }
    setCardImageLanguage(language);
    running.current = true;
    setProgress(0);
    setResult(null);
    try {
      setResult(await applyDeckCardLanguage({ decks, language, saveDeck: onSave, onProgress: setProgress }));
    } finally {
      running.current = false;
      setProgress(null);
    }
  }
  return (
    <div className="settings-row settings-row--stack card-language-settings">
      <div className="settings-row__copy">
        <strong id="card-image-language-label">{t("settings.cardImageLanguage")}</strong>
        <small id="card-image-language-description">{t("settings.cardImageLanguageDesc")}</small>
      </div>
      <div className="settings-row__control">
        <select
          aria-labelledby="card-image-language-label"
          aria-describedby="card-image-language-description"
          className="card-language-settings__select"
          value={language}
          disabled={progress !== null}
          onChange={(event) => {
            const selected = languages.find((entry) => entry.value === event.target.value);
            if (selected) {
              setCardImageLanguage(selected.value);
              setResult(null);
            }
          }}
        >
          {languages.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          size="sm"
          disabled={!ready || decks.length === 0 || progress !== null}
          onClick={() => void applyLanguage()}
        >
          {t("settings.cardImageLanguageApply")}
        </Button>
      </div>
      <div role="status" aria-live="polite">
        {!ready && t("settings.cardImageLanguageLoading")}
        {ready && decks.length === 0 && t("settings.cardImageLanguageEmpty")}
        {progress !== null && t("settings.cardImageLanguageProgress", { completed: progress, total: decks.length })}
        {result && t("settings.cardImageLanguageResult", result)}
      </div>
    </div>
  );
}
