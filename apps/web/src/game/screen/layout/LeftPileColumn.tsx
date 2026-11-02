import { ArenaInputRegion } from "@/game/input/ArenaInputRegion";
/* The left edge of the field: the opponent's deck and trash at the top, the viewer's
   own security stack at the bottom — the two players' piles on the side each of them
   sits on. */

import type { RefObject } from "react";
import { useTranslation } from "../../../i18n";
import { Pile } from "../../piece";
import { Side } from "../../side";
import { hasFaceUpSecurity } from "../../securityChrome";
import type { SecurityBreakCue } from "../../match/types";
import type { PresentedPlayer } from "../types";
import type { TrashEffectCard } from "../../effectSource";

export function LeftPileColumn({
  opponent,
  viewer,
  pileWidth,
  compactPiles,
  opponentDeckRef,
  viewerSecurityRef,
  opponentDeckRiffling,
  opponentTrashClassName,
  opponentTrashEffectCard,
  securityCount,
  securityBreak,
  securityBreakMine,
  securityHit,
  securityLanding,
  onOpenOpponentTrash,
  onOpenOpponentDeck,
  onOpenViewerSecurity,
}: {
  opponent: PresentedPlayer;
  viewer: PresentedPlayer;
  pileWidth: number;
  compactPiles: boolean;
  opponentDeckRef: RefObject<HTMLDivElement | null>;
  viewerSecurityRef: RefObject<HTMLDivElement | null>;
  opponentDeckRiffling: boolean | number;
  /** The trash marks itself when an effect is resolving from the pile. */
  opponentTrashClassName: string;
  opponentTrashEffectCard?: TrashEffectCard;
  /** What the shield shows: a scene still holding a card keeps the higher figure. */
  securityCount: number;
  securityBreak: SecurityBreakCue | null;
  /** The break on screen is this seat's, which is what arms and breaks the shield. */
  securityBreakMine: boolean;
  securityHit: boolean;
  securityLanding: number | undefined;
  onOpenOpponentTrash: (() => void) | undefined;
  /** Opens the revealed deck once the match is over. */
  onOpenOpponentDeck?: () => void;
  onOpenViewerSecurity: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  return (
    <aside
      className="game-pile-column game-pile-column--left"
      data-arena-region={ArenaInputRegion.PILES.value}
      style={{
        width: 130,
        flexShrink: 0,
        borderRight: "1px solid var(--ds-line)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "14px 10px",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
        {/* The ref rides a wrapper so the pile itself keeps the exact prop
            shape opponentSleeves.test.ts pins for sleeve privacy. */}
        <div
          className="game-utility-slot game-utility-slot--opp-deck"
          ref={(el) => {
            opponentDeckRef.current = el;
          }}
        >
          <Pile
            width={pileWidth}
            compact={compactPiles}
            count={opponent.deckCount}
            label={t("game.pile.deck")}
            riffling={opponentDeckRiffling}
            onClick={onOpenOpponentDeck}
            onInspect={onOpenOpponentDeck}
            useSelectedSleeve={false}
          />
        </div>
        <Pile
          width={pileWidth}
          className={`game-utility-slot game-utility-slot--opp-trash ${opponentTrashClassName}`}
          compact={compactPiles}
          count={opponent.trash.length}
          label={t("game.pile.trash")}
          topCardId={opponent.trash[opponent.trash.length - 1]?.cardId}
          topArtId={opponent.trash[opponent.trash.length - 1]?.artId}
          effectCard={opponentTrashEffectCard}
          onClick={onOpenOpponentTrash}
          onInspect={onOpenOpponentTrash}
          useSelectedSleeve={false}
        />
      </div>
      <div style={{ flex: 1 }} />
      <Pile
        width={pileWidth}
        className={`game-security-pile${securityHit ? " game-security-shield--hit" : ""}`}
        compact={compactPiles}
        count={securityCount}
        shield={Side.Viewer}
        armed={securityBreakMine && securityBreak?.phase === "arm"}
        breaking={securityBreakMine && securityBreak?.phase === "break"}
        shardSeed={securityBreak?.key}
        securityDpDelta={viewer.securityDpDelta}
        faceUp={hasFaceUpSecurity(viewer.securityView)}
        securityCards={viewer.securityView}
        landing={securityLanding}
        label={t("game.yourSecurityPile")}
        refEl={(el) => {
          viewerSecurityRef.current = el;
        }}
        onClick={onOpenViewerSecurity}
        onInspect={onOpenViewerSecurity}
      />
    </aside>
  );
}
