import { ArenaInputRegion } from "@/game/input/ArenaInputRegion";
/* The strip along the bottom: the raising area on a wide screen, then the action bar
   and the hand, then the viewer's own counters. A portrait phone moves the raising
   area up into the field, so the dock takes it as a slot rather than rendering it. A
   short desktop moves the deck and trash down from the right rail the same way. */

import type { ReactNode, RefObject } from "react";
import { CardBack } from "../../../design/cards";
import { useTranslation } from "../../../i18n";
import { ArenaCounters } from "../../ArenaCounters";
import { Hand, type HandEntry } from "../../piece";
import { Side } from "../../side";
import { HandSortDirection } from "@/game/HandSortDirection";
import { HandSortMode } from "../../handSortMode";
import { ActionBar } from "./ActionBar";
import { HandSortControl } from "./HandSortControl";
import { PlayerLine } from "./PlayerLine";
import type { EffectActivation } from "../../effectSource";
import type { EffectSourceMark } from "@/game/effectMarks/EffectSourceMark";

export function PlayerDock({
  spectating = false,
  showRecordedHand = false,
  timer,
  playerName,
  playerAvatarId,
  playerEquippedRankedTier,
  playerBotPersonaId,
  actingLabel,
  breedingDock,
  pileDock,
  handDockRef,
  cardWidth,
  minExposure,
  cards,
  selectedInstanceId,
  effectSourceInstanceId,
  effectSource,
  effectSourceMarks,
  selection,
  draggingInstanceId,
  shakeInstanceId,
  actionBar,
  reserveActionBarSpace = false,
  eggDeckCount,
  handCount,
  deckCount,
  trashCount,
  startDrag,
  selectCard,
  onHoverChange,
  handSortMode = HandSortMode.Type,
  handSortDirection = HandSortDirection.ASCENDING.value,
  onSortHand,
  onMoveHandCard,
  reorderDropBeforeInstanceId,
}: {
  spectating?: boolean;
  handSortMode?: HandSortMode;
  handSortDirection?: HandSortDirection;
  onSortHand?: (mode: HandSortMode, direction: HandSortDirection) => void;
  /** Authorised replay cards can be inspected while every gameplay action stays disabled. */
  showRecordedHand?: boolean;
  onMoveHandCard?: (instanceId: string, direction: -1 | 1) => void;
  reorderDropBeforeInstanceId?: string | null;
  timer?: ReactNode;
  /** The viewer's name for the line over the tray, when the screen knows it. */
  playerName?: string;
  playerAvatarId?: string;
  playerEquippedRankedTier?: string;
  playerBotPersonaId?: string;
  actingLabel?: string;
  /** The raising area, when this screen puts it here rather than in the field. */
  breedingDock: ReactNode;
  /** The deck and trash, when this screen puts them here rather than in the rail. */
  pileDock: ReactNode;
  handDockRef: RefObject<HTMLDivElement | null>;
  cardWidth: number;
  minExposure?: number;
  cards: HandEntry[];
  selectedInstanceId?: string;
  effectSourceInstanceId?: string;
  effectSource?: EffectActivation;
  effectSourceMarks?: ReadonlyMap<string, EffectSourceMark>;
  selection?: {
    selectableInstanceIds: readonly string[];
    pickedInstanceIds: readonly string[];
    onToggle: (instanceId: string) => void;
    onInspect: (instanceId: string) => void;
  };
  draggingInstanceId?: string;
  shakeInstanceId?: string;
  /** What the bar above the hand says, or nothing while an attacker is chosen. */
  actionBar: { selCardId?: string; hasBase: boolean; linkingCardId?: string; onCancel: () => void } | undefined;
  /** Keep the desktop dock height stable while a field decision replaces the action bar. */
  reserveActionBarSpace?: boolean;
  eggDeckCount: number;
  handCount: number;
  deckCount: number;
  trashCount: number;
  startDrag: (index: number, event: React.PointerEvent, origin?: HTMLElement) => void;
  selectCard: (index: number) => void;
  onHoverChange: (instanceId: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const counters = (
    <ArenaCounters side={Side.Viewer} eggs={eggDeckCount} hand={handCount} deck={deckCount} trash={trashCount} />
  );
  return (
    <footer
      className="game-player-dock"
      style={{
        position: "relative",
        flexShrink: 0,
        borderTop: "1px solid var(--ds-line)",
        background: "var(--ds-sheet)",
        display: "flex",
        alignItems: "stretch",
      }}
    >
      {breedingDock}
      {playerName ? (
        <PlayerLine
          name={playerName}
          avatarId={playerAvatarId}
          equippedRankedTier={playerEquippedRankedTier}
          botPersonaId={playerBotPersonaId}
          side="player"
          timer={timer}
          actingLabel={actingLabel}
        />
      ) : null}
      <div
        className="game-hand-dock"
        data-arena-region={ArenaInputRegion.HAND.value}
        ref={handDockRef}
        style={{ flex: 1, minWidth: 0, padding: "8px 20px 12px" }}
      >
        {actionBar ? (
          <ActionBar
            selCardId={actionBar.selCardId}
            hasBase={actionBar.hasBase}
            linkingCardId={actionBar.linkingCardId}
            onCancel={actionBar.onCancel}
          />
        ) : reserveActionBarSpace ? (
          <div className="game-action-bar game-action-bar--idle" aria-hidden />
        ) : null}
        <div className="game-hand-tray">
          {spectating && !showRecordedHand ? (
            <div className="game-spectator-hand" aria-label={t("game.handCount", { count: handCount })}>
              {Array.from({ length: handCount }, (_, index) => (
                <CardBack key={index} width={40} useSelectedSleeve={false} />
              ))}
            </div>
          ) : (
            <Hand
              cardWidth={cardWidth}
              minExposure={minExposure}
              cards={cards}
              onMoveCard={spectating ? undefined : onMoveHandCard}
              reorderDropBeforeInstanceId={reorderDropBeforeInstanceId}
              selectedInstanceId={selectedInstanceId}
              effectSourceInstanceId={effectSourceInstanceId}
              effectSource={effectSource}
              effectSourceMarks={effectSourceMarks}
              selection={selection}
              startDrag={spectating ? (index) => selectCard(index) : startDrag}
              selectCard={selectCard}
              draggingInstanceId={draggingInstanceId}
              shakeInstanceId={shakeInstanceId}
              onHoverChange={onHoverChange}
            />
          )}
          {!spectating && onSortHand ? (
            <HandSortControl
              mode={handSortMode}
              direction={handSortDirection}
              disabled={cards.length < 2 || draggingInstanceId !== undefined}
              onSort={onSortHand}
            />
          ) : null}
        </div>
      </div>
      {pileDock ? (
        // The counters stack under the docked deck and trash, so the column is as wide as
        // the wider of the two and the hand never reaches under either.
        <div className="game-viewer-pile-dock">
          {pileDock}
          {counters}
        </div>
      ) : (
        counters
      )}
    </footer>
  );
}
