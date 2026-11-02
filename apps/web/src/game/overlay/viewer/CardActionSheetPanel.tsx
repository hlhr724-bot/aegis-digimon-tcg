import { CardAceBadge } from "@/design/CardAceBadge";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { useTranslatedCardText } from "@/i18n/useTranslatedCardText";
import { createPortal } from "react-dom";
import { getCardDefinition } from "@aegis/shared";
import { Button } from "../../../design/primitives";
import { CardFull } from "../../../design/cards";
import { Icons } from "../../../design/icons";
import { useTranslation } from "../../../i18n";
import { formatKeyword } from "../../keywordDisplay";
import { CardArt } from "../CardArt";
import { ROLE_LABEL_KEYS } from "../constants";
import type { StackCard } from "../types";
import { CardZoomOverlay } from "./CardZoomOverlay";
import type { CardActionEffect, CardActionLink, CardActionPromote } from "./cardActionMenuTypes";
import { stackCardCaption } from "./stackCardCaption";

/** Bottom sheet (touch layouts) for a permanent's actions, with its live stats and stack. */
export function CardActionSheetPanel({
  cardId,
  artId,
  dp,
  baseDP,
  keywords,
  stackCards,
  suspended,
  promote,
  effects,
  link,
  canAttack,
  canVortex,
  onViewStack,
  onAttack,
  onVortex,
  onClose,
  zoomed,
  zoomedArtId,
  onZoom,
  onZoomClose,
}: {
  cardId?: string;
  artId?: string;
  dp?: number;
  baseDP?: number;
  keywords?: readonly string[];
  stackCards?: StackCard[];
  suspended?: boolean;
  promote?: CardActionPromote;
  effects?: CardActionEffect[];
  link?: CardActionLink;
  canAttack: boolean;
  canVortex?: boolean;
  onViewStack: () => void;
  onAttack: () => void;
  onVortex?: () => void;
  onClose: () => void;
  zoomed: string | null;
  zoomedArtId?: string;
  onZoom: (id: string | null, artId?: string) => void;
  onZoomClose: () => void;
}) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  const translateCardText = useTranslatedCardText();
  const def = getCardDefinition(cardId ?? "");
  const dpDelta = dp != null && baseDP != null ? dp - baseDP : 0;
  const beneath = (stackCards ?? []).filter((c) => c.role !== "top");
  const liveInfo = (
    <>
      <strong>{cardId ? getCardName(cardId) : null}</strong>
      <CardAceBadge cardId={cardId} />
      <div className="card-action-sheet__stats">
        {def?.level ? <span>Lv.{def.level}</span> : null}
        {dp != null ? (
          <span>
            {dp.toLocaleString()} DP
            {dpDelta !== 0 ? (
              <em data-sign={dpDelta > 0 ? "up" : "down"}>
                {dpDelta > 0 ? "+" : "−"}
                {Math.abs(dpDelta).toLocaleString()}
              </em>
            ) : null}
          </span>
        ) : null}
        {suspended ? <span data-state="suspended">{t("overlay.suspended")}</span> : null}
      </div>
      {keywords?.length ? (
        <div className="card-action-sheet__keywords">
          {keywords.map((k) => (
            <span key={k}>{formatKeyword(k)}</span>
          ))}
        </div>
      ) : null}
    </>
  );
  return createPortal(
    <div
      className="card-action-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={def ? getCardName(def.cardId) : t("game.actions")}
      onClick={onClose}
    >
      <div className="card-action-sheet__panel" onClick={(e) => e.stopPropagation()}>
        <div className="card-action-sheet__grip" aria-hidden />
        <div className="card-action-sheet__body">
          {cardId ? (
            <button
              type="button"
              className="card-action-sheet__zoom"
              onClick={() => onZoom(cardId, artId)}
              aria-label={t("overlay.zoomCard")}
            >
              <CardFull cardId={cardId} artId={artId} width={190} />
            </button>
          ) : null}
          <div className="card-action-sheet__info">
            {liveInfo}
            <div className="card-action-sheet__actions">
              <Button size="md" full variant="secondary" icon={Icons.Search} onClick={onViewStack}>
                {t("overlay.viewStack")}
              </Button>
              {canAttack ? (
                <Button size="md" full variant="danger" icon={Icons.Swords} onClick={onAttack} autoFocus>
                  {t("overlay.attack")}
                </Button>
              ) : null}
              {canVortex && onVortex ? (
                <Button size="md" full variant="danger" icon={Icons.Swords} onClick={onVortex}>
                  {t("overlay.vortexAttack")}
                </Button>
              ) : null}
              {link ? (
                <Button size="md" full variant="secondary" icon={Icons.Link2} onClick={link.onLink}>
                  {t("overlay.link")}
                </Button>
              ) : null}
              {(effects ?? []).map((effect) => (
                <Button
                  key={effect.label}
                  size="md"
                  full
                  variant="secondary"
                  onClick={effect.onActivate}
                  aria-label={`${t("game.activateEffect")}: ${translateCardText({ text: effect.label, cardId })}`}
                  title={translateCardText({ text: effect.label, cardId })}
                >
                  <span aria-hidden="true">⚡</span>
                  <span>{t("game.activateMainEffect")}</span>
                </Button>
              ))}
              {promote ? (
                <Button
                  size="md"
                  full
                  variant="secondary"
                  icon={Icons.ChevronUp}
                  onClick={promote.onPromote}
                  autoFocus={!canAttack}
                >
                  {promote.label}
                </Button>
              ) : null}
              <Button
                size="sm"
                full
                variant="ghost"
                data-arena-cancel
                onClick={onClose}
                autoFocus={!canAttack && !canVortex && !promote}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        </div>
        {beneath.length ? (
          <div className="card-action-sheet__stack">
            {(["stack", "linked"] as const).map((role) => {
              const group = beneath.filter((c) => c.role === role);
              if (!group.length) return null;
              return (
                <div key={role}>
                  <span>{t(ROLE_LABEL_KEYS[role])}</span>
                  <div>
                    {group.map((c, i) => (
                      <button
                        type="button"
                        key={`${c.cardId}-${i}`}
                        disabled={!c.cardId}
                        onClick={() => onZoom(c.cardId, c.artId)}
                      >
                        <CardArt cardId={c.cardId} artId={c.artId} width={54} />
                        <figcaption>{stackCardCaption(c, t)}</figcaption>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
      {zoomed ? (
        <CardZoomOverlay
          cardId={zoomed}
          artId={zoomedArtId}
          details={zoomed === cardId ? liveInfo : undefined}
          onClose={onZoomClose}
        />
      ) : null}
    </div>,
    document.body,
  );
}
