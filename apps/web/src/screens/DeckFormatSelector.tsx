import { deckFormatLabel } from "@/screens/deckFormatLabel";
import { useId } from "react";
import {
  createDeckFormat,
  deckFormatSettings,
  historicalDeckFormats,
  releaseDateForSet,
  formatBanlistDate,
  type DeckFormat,
  type DeckRuleMode,
  type HistoricalDeckSet,
} from "@aegis/shared";
import { useTranslation } from "../i18n";
import { useMediaQuery } from "../design/useMediaQuery";
import "./deckFormatSelector.css";
import { BanlistTooltip } from "./BanlistTooltip";

export function DeckFormatSelector({
  value,
  onChange,
  disabled = false,
  showBanlist = true,
}: {
  value: DeckFormat;
  onChange: (format: DeckFormat) => void;
  disabled?: boolean;
  showBanlist?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const compact = useMediaQuery("(width < 600px)");
  const { set, rules } = deckFormatSettings(value);
  const date = releaseDateForSet(set);
  return (
    <div className="deck-format-selector">
      <div className="deck-format-selector__header">
        <h3>{t("deckFormat.title")}</h3>
        <span className="deck-format-selector__badge">{deckFormatLabel(value, t)}</span>
      </div>
      <div className="deck-format-selector__fields">
        <div>
          <label htmlFor={`${id}-pool`}>{t("deckFormat.pool")}</label>
          <select
            id={`${id}-pool`}
            value={set}
            disabled={disabled}
            onChange={(event) => onChange(createDeckFormat(event.target.value as HistoricalDeckSet | "all", rules))}
            aria-describedby={`${id}-summary`}
          >
            <option value="all">{t(compact ? "deckFormat.allSetsShort" : "deckFormat.allSets")}</option>
            {historicalDeckFormats()
              .reverse()
              .map((product) => (
                <option key={product} value={product}>
                  {compact ? product : `${product} · ${releaseDateForSet(product)}`}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-rules`}>{t("deckFormat.label")}</label>
          <select
            id={`${id}-rules`}
            value={rules}
            disabled={disabled}
            onChange={(event) => onChange(createDeckFormat(set, event.target.value as DeckRuleMode))}
            aria-describedby={`${id}-summary`}
          >
            <option value="standard">{t("deckFormat.standard")}</option>
            <option value="pauper">{t(compact ? "deckFormat.pauperShort" : "deckFormat.pauper")}</option>
            <option value="unlimited">{t("lobby.unlimited")}</option>
          </select>
        </div>
      </div>
      <p id={`${id}-summary`}>
        <span className="deck-format-selector__pool-hint">
          {date ? t("deckFormat.poolHint", { set }) : t("deckFormat.allSetsHint")}
        </span>{" "}
        {!showBanlist ? null : rules === "unlimited" ? (
          t("deckFormat.noBanlist")
        ) : (
          <BanlistTooltip
            key={value}
            date={formatBanlistDate(value)}
            label={t("deckFormat.banlistHint", { date: date ?? t("deckFormat.current") })}
          />
        )}{" "}
        {rules === "pauper" ? t("deckFormat.rarityHint") : null}
      </p>
    </div>
  );
}
