import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { createPortal } from "react-dom";
import { getCardDefinition } from "@aegis/shared";
import { Button } from "../../../design/primitives";
import { Icons } from "../../../design/icons";
import { useTranslation } from "../../../i18n";
import { formatResolvedKeyword } from "../../keywordDisplay";
import { type PendingFateBadge } from "../../pendingFate";
import { type PermanentDetail } from "../../permanentDetail";
import { CardArt } from "../CardArt";
import { ROLE_LABEL_KEYS } from "../constants";
import { type StackCard } from "../types";
import { CardZoomOverlay } from "./CardZoomOverlay";
import { stackCardCaption } from "./stackCardCaption";

/**
 * The phone reading of a field permanent: one sheet that runs top to bottom —
 * header, computed state, then a wrapping grid per role — so nothing is cut off
 * sideways. Tapping any card opens the shared zoom overlay rather than pinning a
 * full-width card under the sheet.
 */
export function StackViewerSheet({
  cards,
  title,
  detail,
  fate,
  zoomed,
  zoomedArtId,
  onZoom,
  canAttack,
  canVortex,
  onAttack,
  onVortex,
  onClose,
}: {
  cards: StackCard[];
  title: string;
  detail?: PermanentDetail;
  fate?: PendingFateBadge;
  zoomed: string | null;
  zoomedArtId?: string;
  onZoom: (cardId: string | null, artId?: string) => void;
  canAttack: boolean;
  canVortex?: boolean;
  onAttack: () => void;
  onVortex?: () => void;
  onClose: () => void;
}) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  const active = cards.find((c) => c.role === "top") ?? cards[0];
  const def = getCardDefinition(active?.cardId ?? "");
  const dp = detail?.currentDP ?? def?.dp;
  const dpDelta = detail?.dpDelta ?? 0;
  const granted = new Set(detail?.grantedKeywords ?? []);
  const keywords = detail?.keywords ?? [];
  const header = (
    <>
      <strong>{def ? getCardName(def.cardId) : title}</strong>
      <div className="card-action-sheet__stats">
        {def?.level ? <span>Lv.{def.level}</span> : null}
        {def?.colors?.length ? <span>{def.colors.join(" / ")}</span> : null}
        {dp ? (
          <span>
            {dp.toLocaleString()} DP
            {dpDelta === 0 ? null : (
              <em data-sign={dpDelta > 0 ? "up" : "down"}>
                {dpDelta > 0 ? "+" : "−"}
                {Math.abs(dpDelta).toLocaleString()}
              </em>
            )}
          </span>
        ) : null}
        {detail?.suspended ? <span data-state="suspended">{t("overlay.suspended")}</span> : null}
      </div>
      {keywords.length ? (
        <div className="card-action-sheet__keywords" aria-label={t("overlay.keywords")}>
          {keywords.map((keyword) => (
            <span key={keyword} data-granted={granted.has(keyword) || undefined}>
              {formatResolvedKeyword(keyword, detail?.securityAttackModifier)}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
  return createPortal(
    <div className="card-action-sheet stack-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="card-action-sheet__panel" onClick={(e) => e.stopPropagation()}>
        <div className="card-action-sheet__grip" aria-hidden />
        <div className="card-action-sheet__body">
          {active ? (
            <button
              type="button"
              className="card-action-sheet__zoom"
              onClick={() => onZoom(active.cardId, active.artId)}
              aria-label={t("overlay.zoomCard")}
            >
              <CardArt cardId={active.cardId} artId={active.artId} width={140} />
            </button>
          ) : null}
          <div className="card-action-sheet__info">{header}</div>
        </div>
        {detail?.restrictions.length ? (
          <ul className="stack-viewer-state__restrictions" aria-label={t("overlay.restrictions")}>
            {detail.restrictions.map((restriction) => (
              <li key={restriction.kind}>{t(restriction.labelKey)}</li>
            ))}
          </ul>
        ) : null}
        {fate ? (
          <p className="stack-viewer-state__fate" data-tone={fate.tone}>
            <span aria-hidden="true">{fate.glyph}</span>
            {t(fate.labelKey)}
          </p>
        ) : null}
        <div className="stack-sheet__groups">
          {(["top", "stack", "linked"] as const).map((role) => {
            const group = cards.filter((c) => c.role === role);
            if (group.length === 0) return null;
            return (
              <section key={role} aria-label={t(ROLE_LABEL_KEYS[role])}>
                <span>{t(ROLE_LABEL_KEYS[role])}</span>
                <div className="stack-sheet__grid">
                  {group.map((c, i) => (
                    <button
                      type="button"
                      key={`${c.cardId}-${i}`}
                      disabled={!c.cardId}
                      onClick={() => onZoom(c.cardId, c.artId)}
                    >
                      <CardArt cardId={c.cardId} artId={c.artId} width={72} />
                      <figcaption>
                        {role === "stack" ? <b>{i + 1}</b> : null}
                        {stackCardCaption(c, t)}
                      </figcaption>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        <div className="card-action-sheet__actions">
          {canAttack ? (
            <Button size="md" full variant="danger" icon={Icons.Swords} onClick={onAttack}>
              {t("overlay.attack")}
            </Button>
          ) : null}
          {canVortex && onVortex ? (
            <Button size="md" full variant="danger" icon={Icons.Swords} onClick={onVortex}>
              {t("overlay.vortexAttack")}
            </Button>
          ) : null}
          <Button
            size="sm"
            full
            variant="ghost"
            data-arena-cancel
            onClick={onClose}
            autoFocus={!canAttack && !canVortex}
          >
            {t("common.close")}
          </Button>
        </div>
      </div>
      {zoomed ? (
        <CardZoomOverlay
          cardId={zoomed}
          artId={zoomedArtId}
          details={zoomed === active?.cardId ? header : undefined}
          onClose={() => onZoom(null)}
        />
      ) : null}
    </div>,
    document.body,
  );
}
