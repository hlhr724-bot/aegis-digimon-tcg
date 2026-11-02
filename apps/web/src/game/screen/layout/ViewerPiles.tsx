import { ArenaInputRegion } from "@/game/input/ArenaInputRegion";
/* The viewer's own deck and trash.

   One pair of piles, two homes: the foot of the right rail, or — on a desktop too short
   for the rail to hold five piles — the right end of the bottom strip, mirroring the
   raising area at its left end. */

import type { RefObject } from "react";
import { useTranslation } from "../../../i18n";
import { Pile } from "../../piece";
import type { PresentedPlayer } from "../types";
import type { TrashEffectCard } from "../../effectSource";

export function ViewerPiles({
  viewer,
  docked,
  pileWidth,
  compactPiles,
  viewerDeckRef,
  viewerDeckRiffling,
  viewerTrashClassName,
  viewerTrashEffectCard,
  onOpenViewerTrash,
  onOpenViewerDeck,
}: {
  viewer: PresentedPlayer;
  /** In the bottom strip, side by side, rather than stacked in the rail. */
  docked: boolean;
  pileWidth: number;
  compactPiles: boolean;
  viewerDeckRef: RefObject<HTMLDivElement | null>;
  viewerDeckRiffling: boolean | number;
  /** The trash marks itself when an effect is resolving from the pile. */
  viewerTrashClassName: string;
  viewerTrashEffectCard?: TrashEffectCard;
  onOpenViewerTrash: (() => void) | undefined;
  /** Opens the revealed deck once the match is over. */
  onOpenViewerDeck?: () => void;
}) {
  const { t } = useTranslation();
  const topTrashCard = viewer.trash[viewer.trash.length - 1];
  return (
    <div
      data-arena-region={ArenaInputRegion.PILES.value}
      className={docked ? "game-viewer-piles game-viewer-piles--docked" : "game-viewer-piles"}
      style={
        docked
          ? { display: "flex", gap: 8 }
          : { display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }
      }
    >
      <Pile
        className="game-utility-slot game-utility-slot--you-deck"
        width={pileWidth}
        compact={compactPiles}
        count={viewer.deckCount}
        label={t("game.pile.deck")}
        riffling={viewerDeckRiffling}
        onClick={onOpenViewerDeck}
        onInspect={onOpenViewerDeck}
        refEl={(el) => {
          viewerDeckRef.current = el;
        }}
      />
      <Pile
        width={pileWidth}
        className={`game-utility-slot game-utility-slot--you-trash ${viewerTrashClassName}`}
        compact={compactPiles}
        count={viewer.trash.length}
        label={t("game.pile.trash")}
        topCardId={topTrashCard?.cardId}
        topArtId={topTrashCard?.artId}
        effectCard={viewerTrashEffectCard}
        onClick={onOpenViewerTrash}
        onInspect={onOpenViewerTrash}
      />
    </div>
  );
}
