import { useState, useEffect } from "react";
import type { ArenaInspectionOptions } from "../../ArenaPermanentInspector";
import type { PermanentDetail } from "../../permanentDetail";
import type { PendingFateBadge } from "../../pendingFate";
import type { StackCard } from "../types";
import { ArenaCardActions } from "./ArenaCardActions";
import { CardActionSheetPanel } from "./CardActionSheetPanel";
import { CardActionPopupMenu } from "./CardActionPopupMenu";
import type { CardActionEffect, CardActionLink, CardActionPromote } from "./cardActionMenuTypes";

export function CardActionMenu({
  arenaInspection,
  detail,
  fate,
  x,
  y,
  cardId,
  artId,
  sheet,
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
}: {
  /** Arena field cards read across the opposite half while retaining their legal actions. */
  arenaInspection?: ArenaInspectionOptions;
  detail?: PermanentDetail;
  fate?: PendingFateBadge;
  x: number;
  y: number;
  /** Card shown alongside the actions in `sheet` mode. */
  cardId?: string;
  artId?: string;
  /** Render as a bottom sheet (touch layouts) instead of a menu anchored to the card. */
  sheet?: boolean;
  /** Live permanent stats, shown in `sheet` mode. */
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
}) {
  const [zoomed, setZoomed] = useState<string | null>(null);
  const [zoomedArtId, setZoomedArtId] = useState<string | undefined>();
  const openZoom = (id: string | null, selectedArtId?: string) => {
    setZoomed(id);
    setZoomedArtId(selectedArtId);
  };
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && zoomed === null) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, zoomed]);

  if (arenaInspection && detail) {
    return (
      <ArenaCardActions
        detail={detail}
        arenaInspection={arenaInspection}
        fate={fate}
        zoomed={zoomed}
        zoomedArtId={zoomedArtId}
        onZoom={openZoom}
        onZoomClose={() => setZoomed(null)}
        onClose={onClose}
        canAttack={canAttack}
        canVortex={canVortex}
        onAttack={onAttack}
        onVortex={onVortex}
        link={link}
        effects={effects}
        promote={promote}
      />
    );
  }

  if (sheet) {
    return (
      <CardActionSheetPanel
        cardId={cardId}
        artId={artId}
        dp={dp}
        baseDP={baseDP}
        keywords={keywords}
        stackCards={stackCards}
        suspended={suspended}
        promote={promote}
        effects={effects}
        link={link}
        canAttack={canAttack}
        canVortex={canVortex}
        onViewStack={onViewStack}
        onAttack={onAttack}
        onVortex={onVortex}
        onClose={onClose}
        zoomed={zoomed}
        zoomedArtId={zoomedArtId}
        onZoom={openZoom}
        onZoomClose={() => setZoomed(null)}
      />
    );
  }

  return (
    <CardActionPopupMenu
      cardId={cardId}
      x={x}
      y={y}
      onClose={onClose}
      canAttack={canAttack}
      canVortex={canVortex}
      onViewStack={onViewStack}
      onAttack={onAttack}
      onVortex={onVortex}
      link={link}
      effects={effects}
    />
  );
}
