import { CardAceBadge } from "@/design/CardAceBadge";
import { CardTextField } from "@/i18n/CardTextField";
import { I18nContext } from "@/i18n/I18nContext";
import { useCardFaceTranslation } from "@/screens/cardLanguage/useCardFaceTranslation";
import { EffectText } from "@/game/EffectText";
import { useCardTranslations } from "@/i18n/useCardTranslations";
import { getTranslatedCardName } from "@/i18n/getTranslatedCardName";
import { getTranslatedCardMeta } from "@/i18n/getTranslatedCardMeta";
/* The card detail drawer: the full card, its printed numbers and its effect text. */

import { useState, type ReactNode } from "react";
import {
  formatCopyLimit,
  type DeckFormat,
  getCardDefinition,
  getCardArts,
  resolveCardArt,
  formatRestrictionLabel,
} from "@aegis/shared";
import { Eyebrow } from "../design/primitives";
import { CardFull } from "../design/cards";
import { formLabel, kindOf } from "../design/theme";
import { useTranslation } from "../i18n";
import { isBetaCard } from "@/screens/isBetaCard";
import "./cardLibrary.css";

/* ---------- the shared right detail drawer ---------- */
export function CardDetailDrawer({
  cardId,
  format = "standard",
  onClose,
  footer,
  artId,
  initialArtId,
  onArtChange,
  onArtApply,
}: {
  cardId: string;
  format?: DeckFormat;
  onClose: () => void;
  footer?: ReactNode;
  artId?: string;
  initialArtId?: string;
  onArtChange?: (artId: string) => void;
  onArtApply?: (artId: string) => void;
}) {
  const { t } = useTranslation();
  const [browsedArt, setBrowsedArt] = useState<{ cardId: string; artId: string } | null>(null);
  const selectedArt = resolveCardArt(
    cardId,
    artId ?? (browsedArt?.cardId === cardId ? browsedArt.artId : initialArtId),
  ).artId;
  const cardTranslation = useCardFaceTranslation({ artId: selectedArt });
  const translations = useCardTranslations({ locale: cardTranslation.locale });
  const arts = getCardArts(cardId);
  const def = getCardDefinition(cardId);
  if (!def) return null;
  const isDigi = kindOf(def) === "Digimon";
  const forms = isDigi && def.forms?.length ? def.forms : [formLabel(def)];
  const traits = [
    ...(def.attributes ?? []).map((value) => getTranslatedCardMeta({ value, group: "attributes", translations })),
    ...(def.types ?? []).map((value) => getTranslatedCardMeta({ value, group: "traits", translations })),
  ].filter((value) => value && value !== "-" && value !== "—");
  const copyLimit = formatCopyLimit(cardId, format);
  const banLabel = formatRestrictionLabel(cardId, format);
  return (
    <aside aria-labelledby="card-detail-title" aria-modal="true" className="card-detail-drawer" role="dialog">
      <div className="card-detail-header">
        <div id="card-detail-title">
          <Eyebrow>{t("library.cardDetail")}</Eyebrow>
        </div>
        <button aria-label={t("common.close")} className="card-detail-close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="card-detail-overview">
        <div className="card-detail-preview">
          <CardFull cardId={def.cardId} artId={selectedArt} width={228} zoomOnHover={false} />
        </div>
        {arts.length > 1 ? (
          <div className="card-art-selector" role="group" aria-label={t("library.artworks")}>
            <div className="card-art-selector__label">
              {t("library.artworks")} · {arts.length}
            </div>
            {onArtApply ? (
              <p className="card-art-selector__hint" id="card-art-apply-hint">
                {t("deck.artDoubleClickHint")}
              </p>
            ) : null}
            <div className="card-art-selector__choices">
              {arts.map((art, index) => {
                const label = index === 0 ? t("library.baseArt") : t("library.alternateArt", { number: index });
                return (
                  <button
                    type="button"
                    key={art.artId}
                    aria-label={label}
                    aria-pressed={art.artId === selectedArt}
                    aria-describedby={onArtApply ? "card-art-apply-hint" : undefined}
                    onClick={() => {
                      setBrowsedArt({ cardId, artId: art.artId });
                      onArtChange?.(art.artId);
                    }}
                    onDoubleClick={onArtApply ? () => onArtApply(art.artId) : undefined}
                  >
                    <CardFull cardId={cardId} artId={art.artId} width={56} zoomOnHover={false} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="card-detail-summary">
          <h2>
            {getTranslatedCardName({ name: def.nameEn, translations })}
            <CardAceBadge cardId={cardId} />
          </h2>
          <div className="card-detail-limit">
            {banLabel ? <span className="card-detail-restriction">{banLabel}</span> : null}
            {isBetaCard(cardId) ? (
              <span className="card-detail-restriction" data-tone="beta" title={t("beta.cardHint")}>
                {t("beta.tag")}
              </span>
            ) : null}
            <span className="card-detail-copy-limit">{t("library.maxPerDeck", { count: copyLimit })}</span>
          </div>
          <div className="card-detail-metadata">
            <DetailRow label={cardTranslation.t("library.rowSet")} value={def.set} mono />
            <DetailRow label={cardTranslation.t("library.rowColor")} value={def.colors.join(" / ")} />
            <DetailRow
              label={cardTranslation.t("library.rowType")}
              value={forms.map((value) => getTranslatedCardMeta({ value, group: "forms", translations })).join(" / ")}
            />
            <DetailRow
              label={cardTranslation.t(def.isDualCard ? "library.rowUseCost" : "library.rowPlayCost")}
              value={def.playCost < 0 ? "—" : String(def.playCost)}
              mono
            />
            {isDigi ? (
              <DetailRow label={cardTranslation.t("library.rowDp")} value={def.dp.toLocaleString()} mono />
            ) : null}
            {traits.length ? (
              <DetailRow label={cardTranslation.t("library.rowTraits")} value={traits.join(", ")} />
            ) : null}
            {def.rarity ? <DetailRow label={cardTranslation.t("library.rowRarity")} value={def.rarity} mono /> : null}
          </div>
        </div>
      </div>
      <div className="card-detail-effects">
        <I18nContext.Provider value={cardTranslation}>
          <DetailEffect cardId={cardId} title={cardTranslation.t("library.mainEffect")} text={def.effectText} />
          <DetailEffect cardId={cardId} title={cardTranslation.t("library.optionEffect")} text={def.optionEffect} />
          <DetailEffect
            cardId={cardId}
            title={cardTranslation.t("library.inheritedEffect")}
            text={def.inheritedEffectText}
            tone="inherited"
          />
          <DetailEffect
            cardId={cardId}
            title={cardTranslation.t("library.linkEffect")}
            text={def.linkEffect}
            field={CardTextField.LINK.value}
          />
          <DetailEffect
            cardId={cardId}
            title={cardTranslation.t("library.securityEffect")}
            text={def.securityEffectText}
            tone="security"
          />
        </I18nContext.Provider>
        {footer}
      </div>
    </aside>
  );
}

function DetailRow({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="card-detail-row">
      <span>{label}</span>
      <span data-mono={mono || undefined}>{value}</span>
    </div>
  );
}

function DetailEffect({
  cardId,
  title,
  text,
  field,
  tone = "main",
}: {
  cardId: string;
  title: string;
  text?: string;
  field?: CardTextField;
  tone?: "main" | "inherited" | "security";
}) {
  if (!text) return null;
  return (
    <div className="card-detail-effect" data-tone={tone}>
      <div className="card-detail-effect__title">{title}</div>
      <p>
        <EffectText cardId={cardId} text={readableEffectText(text)} field={field} />
      </p>
    </div>
  );
}

/**
 * Historical catalog text sometimes joins independent printed clauses without a
 * space (for example BT9-109's `cards.[When Attacking]`). Preserve adjacent
 * multi-timing headers while giving punctuation-delimited clauses a visible line.
 */
export function readableEffectText(text: string): string {
  return text
    .replace(/([.\]])(?=＜)/g, "$1\n")
    .replace(/([.!?])(?=\[[^\]]+\])/g, "$1\n")
    .replace(/([^\]\s])(?=\[(?:All Turns|Your Turn|Opponent's Turn|When |On |Main\]|Security\]|Start |End ))/g, "$1\n");
}
