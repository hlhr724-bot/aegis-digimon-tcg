import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { getCardDefinition } from "@aegis/shared";
import { useTranslation } from "../../../i18n";
import { Button } from "../../../design/primitives";
import { Icons } from "../../../design/icons";

export function ActionBar({
  selCardId,
  hasBase,
  linkingCardId,
  onCancel,
}: {
  selCardId?: string;
  hasBase: boolean;
  /** A link declaration is armed for this card; the bar shows the target hint. */
  linkingCardId?: string;
  onCancel: () => void;
}) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  const linkingDef = linkingCardId ? getCardDefinition(linkingCardId) : undefined;
  if (linkingDef) {
    return (
      <div
        className="game-action-bar game-action-bar--contextual"
        style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, padding: "4px 0 9px" }}
      >
        <span style={{ fontSize: 13, color: "var(--ds-text-3)" }}>
          <strong style={{ color: "var(--ds-text)" }}>{getCardName(linkingDef.cardId)}</strong>
        </span>
        <span
          style={{ fontSize: 12.5, color: "var(--ds-accent)", display: "inline-flex", alignItems: "center", gap: 5 }}
        >
          <Icons.Link2 size={14} />
          {t("game.clickToLink")}
        </span>
        <Button size="sm" variant="ghost" data-arena-cancel onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    );
  }
  const selDef = selCardId ? getCardDefinition(selCardId) : undefined;
  if (selDef) {
    return hasBase ? (
      <div
        className="game-action-bar game-action-bar--contextual"
        style={{ display: "flex", justifyContent: "center", padding: "4px 0 9px" }}
      >
        <span
          style={{ fontSize: 12.5, color: "var(--ds-accent)", display: "inline-flex", alignItems: "center", gap: 5 }}
        >
          <Icons.ChevronUp size={14} />
          {t("game.clickToDigivolve")}
        </span>
      </div>
    ) : null;
  }

  return (
    <div
      className="game-action-bar game-action-bar--idle"
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 6px 4px" }}
    >
      <span style={{ fontSize: 12.5, color: "var(--ds-text-3)" }}>{t("game.dragHint")}</span>
    </div>
  );
}
