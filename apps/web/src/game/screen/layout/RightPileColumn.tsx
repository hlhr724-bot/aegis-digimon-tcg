import { ArenaInputRegion } from "@/game/input/ArenaInputRegion";
/* The right edge of the field: the opponent's raising area and security stack at the
   top, the viewer's own deck and trash at the bottom — the mirror of the left edge. A
   desktop too short for all five piles moves the deck and trash into the bottom strip.

   The opponent's shield is also the drop area an attack on the player is released
   onto, and the tap target that declares the same attack. */

import type { ReactNode, RefObject } from "react";
import { useTranslation } from "../../../i18n";
import { BreedingSlot, Pile, type DropAttrs } from "../../piece";
import { Side } from "../../side";
import { hasFaceUpSecurity, securityAttackLabelKey } from "../../securityChrome";
import type { PermanentBurst } from "../../showcases";
import type { SecurityBreakCue } from "../../match/types";
import type { PresentedPlayer } from "../types";

export function RightPileColumn({
  opponent,
  opponentBreeding,
  viewerPiles,
  pileWidth,
  raisingWidth,
  compactPiles,
  opponentSecurityRef,
  opponentEggDeckRiffling,
  breedingBurst,
  breedingEffectSource,
  breedingEffectLinked,
  breedingHighlight,
  securityCount,
  securityBreak,
  securityBreakMine,
  securityHit,
  securityLanding,
  securityDrop,
  attackable,
  selected,
  onOpenOpponentBreeding,
  onAttackSecurity,
  onOpenOpponentSecurity,
  onOpenOpponentEggDeck,
}: {
  opponent: PresentedPlayer;
  /** The opponent's raising area as the narration has it, which may lag the board. */
  opponentBreeding: PresentedPlayer;
  /** The viewer's deck and trash, unless the bottom strip holds them. */
  viewerPiles: ReactNode;
  pileWidth: number;
  /** The egg deck and raising slot, which can be larger than the other piles. */
  raisingWidth: number;
  compactPiles: boolean;
  opponentSecurityRef: RefObject<HTMLDivElement | null>;
  opponentEggDeckRiffling: boolean | number;
  breedingBurst: PermanentBurst | undefined;
  breedingEffectSource: boolean;
  breedingEffectLinked: boolean;
  breedingHighlight: boolean;
  /** What the shield shows: a scene still holding a card keeps the higher figure. */
  securityCount: number;
  securityBreak: SecurityBreakCue | null;
  /** The break on screen is this seat's, which is what arms and breaks the shield. */
  securityBreakMine: boolean;
  securityHit: boolean;
  securityLanding: number | undefined;
  securityDrop: DropAttrs;
  /** An attack on the player is available, which lights the shield and names it. */
  attackable: boolean;
  /** The security stack is the currently picked target in an in-board decision. */
  selected?: boolean;
  onOpenOpponentBreeding: (() => void) | undefined;
  onAttackSecurity: (() => void) | undefined;
  onOpenOpponentSecurity: (() => void) | undefined;
  /** Opens the revealed egg deck once the match is over. */
  onOpenOpponentEggDeck?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <aside
      className="game-pile-column game-pile-column--right"
      data-arena-region={ArenaInputRegion.PILES.value}
      style={{
        width: 130,
        flexShrink: 0,
        borderLeft: "1px solid var(--ds-line)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "14px 10px",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
        <div className="game-opponent-breeding" data-testid="opponent-breeding">
          <Pile
            className="game-utility-slot game-utility-slot--opp-eggs"
            width={raisingWidth}
            compact={compactPiles}
            count={opponentBreeding.eggDeckCount}
            egg
            label={t("game.pile.eggs")}
            useSelectedSleeve={false}
            riffling={opponentEggDeckRiffling}
            onClick={onOpenOpponentEggDeck}
            onInspect={onOpenOpponentEggDeck}
          />
          <div className="game-utility-slot game-utility-slot--opp-raising">
            <BreedingSlot
              perm={opponentBreeding.breeding}
              label={t("game.pile.raising")}
              compact={compactPiles}
              burst={breedingBurst}
              effectSource={breedingEffectSource}
              effectLinked={breedingEffectLinked}
              highlight={breedingHighlight}
              width={raisingWidth}
              onClick={onOpenOpponentBreeding}
            />
          </div>
        </div>
        <Pile
          width={pileWidth}
          className={`game-security-pile${securityHit ? " game-security-shield--hit" : ""}`}
          compact={compactPiles}
          count={securityCount}
          shield={Side.Opponent}
          armed={securityBreakMine && securityBreak?.phase === "arm"}
          breaking={securityBreakMine && securityBreak?.phase === "break"}
          shardSeed={securityBreak?.key}
          securityDpDelta={opponent.securityDpDelta}
          faceUp={hasFaceUpSecurity(opponent.securityView)}
          securityCards={opponent.securityView}
          landing={securityLanding}
          attackLabel={attackable ? t(securityAttackLabelKey(opponent.securityCount)) : undefined}
          label={t("game.opponentSecurity")}
          useSelectedSleeve={false}
          refEl={(el) => {
            opponentSecurityRef.current = el;
          }}
          drop={securityDrop}
          glow={attackable}
          selected={selected}
          onClick={onAttackSecurity ?? onOpenOpponentSecurity}
          onInspect={onOpenOpponentSecurity}
        />
      </div>
      <div style={{ flex: 1 }} />
      {viewerPiles}
    </aside>
  );
}
