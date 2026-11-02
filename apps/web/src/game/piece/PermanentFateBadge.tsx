import type { PendingFateBadge } from "../pendingFate";
import { useTranslation } from "../../i18n";

/** The badge a permanent wears while an effect is deciding its fate. */
export function PermanentFateBadge({ fate }: { fate: PendingFateBadge }) {
  const { t } = useTranslation();
  // Deletion targets already have the same strong selection outline used by
  // every target picker. The extra magenta label obscures the card art without
  // adding information, so keep the target state and omit only that pill.
  if (fate.fate === "delete") return null;
  return (
    <span className={`game-fate-badge game-fate-badge--${fate.tone}`} data-fate={fate.fate} aria-hidden="true">
      {t(fate.labelKey)}
    </span>
  );
}
