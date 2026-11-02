import { Button } from "../../../design/primitives";
import { useTranslatedCardText } from "@/i18n/useTranslatedCardText";
import { Icons } from "../../../design/icons";
import { useTranslation } from "../../../i18n";
import { ArenaPermanentInspector, type ArenaInspectionOptions } from "../../ArenaPermanentInspector";
import { type PermanentDetail } from "../../permanentDetail";
import { type PendingFateBadge } from "../../pendingFate";
import { CardZoomOverlay } from "./CardZoomOverlay";
import type { CardActionEffect, CardActionLink, CardActionPromote } from "./cardActionMenuTypes";

/** The arena branch: the permanent's inspector, its actions, and the card zoom over it. */
export function ArenaCardActions({
  detail,
  arenaInspection,
  fate,
  zoomed,
  zoomedArtId,
  onZoom,
  onZoomClose,
  onClose,
  canAttack,
  canVortex,
  onAttack,
  onVortex,
  link,
  effects,
  promote,
}: {
  detail: PermanentDetail;
  arenaInspection: ArenaInspectionOptions;
  fate?: PendingFateBadge;
  zoomed: string | null;
  zoomedArtId?: string;
  onZoom: (id: string | null, artId?: string) => void;
  onZoomClose: () => void;
  onClose: () => void;
  canAttack: boolean;
  canVortex?: boolean;
  onAttack: () => void;
  onVortex?: () => void;
  link?: CardActionLink;
  effects?: CardActionEffect[];
  promote?: CardActionPromote;
}) {
  const { t } = useTranslation();
  const translateCardText = useTranslatedCardText();
  return (
    <>
      <ArenaPermanentInspector
        detail={detail}
        inspection={arenaInspection}
        fate={fate}
        zoomed={zoomed !== null}
        onZoom={onZoom}
        onClose={onClose}
        actions={
          canAttack || (canVortex && onVortex) || link || effects?.length || promote ? (
            <>
              {canAttack ? (
                <Button size="sm" variant="danger" icon={Icons.Swords} onClick={onAttack}>
                  {t("overlay.attack")}
                </Button>
              ) : null}
              {canVortex && onVortex ? (
                <Button size="sm" variant="danger" icon={Icons.Swords} onClick={onVortex}>
                  {t("overlay.vortexAttack")}
                </Button>
              ) : null}
              {link ? (
                <Button size="sm" variant="secondary" icon={Icons.Link2} onClick={link.onLink}>
                  {t("overlay.link")}
                </Button>
              ) : null}
              {(effects ?? []).map((effect, index) => (
                <Button
                  key={index}
                  size="sm"
                  variant="secondary"
                  icon={Icons.Sparkles}
                  className="arena-permanent-inspector__activate"
                  onClick={effect.onActivate}
                  aria-label={`${t("game.activateEffect")}: ${translateCardText({ text: effect.label, cardId: detail.cardId })}`}
                  title={translateCardText({ text: effect.label, cardId: detail.cardId })}
                >
                  {t("game.activateMainEffect")}
                  {(effects?.length ?? 0) > 1 ? ` ${index + 1}` : ""}
                </Button>
              ))}
              {promote ? (
                <Button size="sm" variant="secondary" icon={Icons.ChevronUp} onClick={promote.onPromote}>
                  {promote.label}
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      />
      {zoomed ? <CardZoomOverlay cardId={zoomed} artId={zoomedArtId} onClose={onZoomClose} /> : null}
    </>
  );
}
