import { CardAceBadge } from "@/design/CardAceBadge";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { useCardTranslations } from "@/i18n/useCardTranslations";
import { getTranslatedCardName } from "@/i18n/getTranslatedCardName";
import { createPortal } from "react-dom";
import { getCardDefinition } from "@aegis/shared";
import { Badge } from "../../../design/primitives";
import { formatResolvedKeyword } from "../../keywordDisplay";
import { inspectorPlacement, type PermanentDetail } from "../../permanentDetail";
import { type PendingFateBadge } from "../../pendingFate";
import { useTranslation } from "../../../i18n";
import { CardArt } from "../CardArt";
import { ROLE_LABEL_KEYS } from "../constants";

/** How wide and tall the inspector is allowed to get, so it can be placed before it renders. */
const INSPECTOR_WIDTH = 440;
const INSPECTOR_HEIGHT = 640;

/**
 * The permanent inspector: the position as it stands right
 * now — its live DP against the printed figure, the keywords the server resolved,
 * the whole stack, and the fate an open effect has already pinned to it.
 *
 * It opens on the opposite side of the card that was clicked, so the card the
 * reader is asking about stays visible beside its own detail.
 */
export function PermanentDetailInspector({
  detail,
  fate,
  anchorX,
  anchorY,
  inline,
  onInteractStart,
  onInteractEnd,
}: {
  detail: PermanentDetail;
  /** The badge an open effect has already pinned to this permanent, if any. */
  fate?: PendingFateBadge;
  /** Right edge and top of the card that was clicked, in viewport coordinates. */
  anchorX: number;
  anchorY: number;
  /** Render in place rather than portalling, so a fixture stage can hold the panel. */
  inline?: boolean;
  onInteractStart?: () => void;
  onInteractEnd?: () => void;
}) {
  const getCardName = useTranslatedCardName();
  const translations = useCardTranslations();
  const { t } = useTranslation();
  const topDef = getCardDefinition(detail.cardId);
  const supporting = detail.cards.filter((card) => card.role !== "top");
  const granted = new Set(detail.grantedKeywords);
  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
  const panelWidth = Math.min(INSPECTOR_WIDTH, viewportWidth - 24);
  const panelHeight = Math.min(INSPECTOR_HEIGHT, viewportHeight - 24);
  const placement = inspectorPlacement({
    anchorX,
    anchorY,
    viewportWidth,
    viewportHeight,
    panelWidth,
    panelHeight,
  });

  const panel = (
    <aside
      id="opponent-permanent-inspector"
      className="opponent-permanent-inspector"
      data-side={placement.side}
      role="tooltip"
      tabIndex={0}
      onMouseEnter={onInteractStart}
      onMouseLeave={onInteractEnd}
      onFocus={onInteractStart}
      onBlur={onInteractEnd}
      style={{ left: placement.left, top: placement.top, width: panelWidth, maxHeight: panelHeight }}
    >
      <header>
        <div>
          <strong>{getTranslatedCardName({ name: detail.name, translations })}</strong>
          <CardAceBadge cardId={detail.cardId} />
          {/* The live figure is what the position actually has; the printed one sits
              beside it only when something has moved it. */}
          <span>
            {detail.currentDP.toLocaleString()} DP
            {detail.dpDelta === 0 ? null : (
              <em data-direction={detail.dpDelta > 0 ? "up" : "down"}>
                {detail.dpDelta > 0 ? "+" : "−"}
                {Math.abs(detail.dpDelta).toLocaleString()}
              </em>
            )}
          </span>
        </div>
        <Badge>
          {t("game.stack")} · {detail.cards.length}
        </Badge>
      </header>
      {detail.dpDelta === 0 ? null : (
        <p className="opponent-permanent-inspector__base">
          {t("overlay.baseDp")}: {detail.baseDP.toLocaleString()}
        </p>
      )}
      <section className="opponent-permanent-inspector__keywords" aria-label={t("overlay.keywords")}>
        <span>{t("overlay.keywords")}</span>
        {detail.keywords.length === 0 ? (
          <p>{t("overlay.noKeywords")}</p>
        ) : (
          <ul>
            {detail.keywords.map((keyword) => (
              <li key={keyword} data-granted={granted.has(keyword) || undefined}>
                {formatResolvedKeyword(keyword, detail.securityAttackModifier)}
              </li>
            ))}
          </ul>
        )}
      </section>
      {detail.restrictions.length ? (
        <ul className="opponent-permanent-inspector__restrictions" aria-label={t("overlay.restrictions")}>
          {detail.restrictions.map((restriction) => (
            <li key={restriction.kind}>{t(restriction.labelKey)}</li>
          ))}
        </ul>
      ) : null}
      {fate ? (
        <p className="opponent-permanent-inspector__fate" data-tone={fate.tone}>
          <span aria-hidden="true">{fate.glyph}</span>
          {t(fate.labelKey)}
        </p>
      ) : null}
      <section className="opponent-permanent-inspector__effect">
        <span>{t("overlay.printedEffect")}</span>
        <p>{topDef?.effectText || t("overlay.noPrintedEffect")}</p>
      </section>
      {detail.grantedEffectTexts.length > 0 ? (
        <section className="opponent-permanent-inspector__effect" aria-label={t("overlay.grantedEffects")}>
          <span>{t("overlay.grantedEffects")}</span>
          {detail.grantedEffectTexts.map((effect, index) => (
            <p key={`${effect}-${index}`}>{effect}</p>
          ))}
        </section>
      ) : null}
      {supporting.length ? (
        <section className="opponent-permanent-inspector__stack" aria-label={t("game.stack")}>
          {supporting.map((card, index) => {
            const def = getCardDefinition(card.cardId);
            const effect = card.role === "linked" ? def?.linkEffect : def?.inheritedEffectText;
            return (
              <div key={`${card.cardId}-${index}`}>
                <CardArt cardId={card.cardId} artId={card.artId} width={38} />
                <div>
                  <strong>{getCardName(card.cardId)}</strong>
                  <span>{t(ROLE_LABEL_KEYS[card.role])}</span>
                  <p>{effect || t("overlay.noPrintedEffect")}</p>
                </div>
              </div>
            );
          })}
        </section>
      ) : null}
    </aside>
  );
  return inline ? panel : createPortal(panel, document.body);
}
