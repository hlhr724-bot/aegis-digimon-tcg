import { deckFormatSettings, type DeckFormat } from "@aegis/shared/deckFormat";
import type { Translate } from "@/i18n/translationTypes";

export function deckFormatLabel(value: DeckFormat, t: Translate): string {
  const { set, rules } = deckFormatSettings(value);
  const label = t(
    rules === "unlimited" ? "lobby.unlimited" : rules === "pauper" ? "deckFormat.pauper" : "deckFormat.standard",
  );
  return set === "all" ? label : `${set} · ${label}`;
}
