/* What the viewer opens for themselves — the match log, a card blown up, the bug
   report — and the two the match opens over them: an opponent who dropped, and the
   result once the game is over. */

import type { ReactNode } from "react";
import { BugReportDialog } from "../../../bugs/BugReportDialog";
import { PlayLogSidebar } from "@/game/log/PlayLogSidebar";
import { CardZoomOverlay, GameOverOverlay, OpponentDroppedOverlay } from "../../overlay";
import type { PostGameChat, SeriesResultProps } from "../../overlay/match/GameOverOverlay";
import type { RematchProps } from "@/game/overlay/match/RematchPanel";
import type { LogTurnGroup } from "@/game/log/LogEntry";
import type { SeatNames } from "@/game/log/SeatNames";
import type { SeatAvatars } from "@/game/log/SeatAvatars";
import type { Seat } from "@aegis/shared/schema/enums";
import type { GameOverOutcome } from "../../gameOverSplash";
import type { ArenaDeckColors } from "../../../design/arenaPalette";
import { ArenaLookDialog } from "./ArenaLookDialog";
import type { ReplaySaveProps } from "../../../replays/ReplaySavePrompt";

export function MatchStatusOverlays({
  turns,
  playerNames,
  playerAvatars,
  viewerSeat,
  historyOpen,
  zoomCardId,
  zoomArtId,
  bugReportOpen,
  arenaLook,
  matchLogId,
  signedIn,
  opponentDropped,
  gameOver,
  onCloseHistory,
  onOpenCard,
  onCloseZoom,
  onCloseBugReport,
  onMenu,
  onRematch,
  onLeaveDropped,
  returnsToRoom,
}: {
  turns: readonly LogTurnGroup[];
  playerNames: SeatNames;
  playerAvatars?: SeatAvatars;
  viewerSeat?: Seat;
  historyOpen: boolean;
  zoomCardId: string | null;
  zoomArtId: string | undefined;
  bugReportOpen: boolean;
  /** The board look settings, while the viewer has them open. */
  arenaLook?: { deckColors: ArenaDeckColors; onClose: () => void; handoffUrl?: string };
  matchLogId: string;
  /** Only shapes what the report dialog says about follow-up questions. */
  signedIn: boolean;
  /** The opponent's socket is gone and the match has not ended, so the board waits. */
  opponentDropped: boolean;
  /** The result and its stats, or nothing while the match is still running. */
  gameOver:
    | (ReplaySaveProps & {
        spectatorResult?: string;
        onDownloadReplay?: () => void;
        opponentDeckDialog?: (onClose: () => void) => ReactNode;
        usedDeckDialog?: (onClose: () => void) => ReactNode;
        usedDeckName?: string;
        opponentDeckName?: string;
        replayStatus?: "preparing" | "unavailable";
        result: GameOverOutcome;
        reason: string;
        stats: { value: number; label: string }[];
        cardsRevealed: boolean;
        series?: SeriesResultProps;
        rematch?: RematchProps;
        friendMatchId?: string;
        chat?: PostGameChat;
      })
    | undefined;
  onCloseHistory: () => void;
  onOpenCard: (cardId: string) => void;
  onCloseZoom: () => void;
  onCloseBugReport: () => void;
  onMenu: () => void;
  onRematch: () => void;
  /** Asks to leave the match while the opponent is gone; leaving counts as a surrender. */
  onLeaveDropped: () => void;
  returnsToRoom?: boolean;
}) {
  return (
    <>
      {historyOpen ? (
        <PlayLogSidebar
          turns={turns}
          playerNames={playerNames}
          playerAvatars={playerAvatars}
          viewerSeat={viewerSeat}
          onClose={onCloseHistory}
          onOpenCard={onOpenCard}
        />
      ) : null}

      {zoomCardId ? <CardZoomOverlay cardId={zoomCardId} artId={zoomArtId} onClose={onCloseZoom} /> : null}

      {bugReportOpen ? (
        <BugReportDialog signedIn={signedIn} matchLogId={matchLogId} onClose={onCloseBugReport} />
      ) : null}

      {arenaLook ? (
        <ArenaLookDialog
          deckColors={arenaLook.deckColors}
          onClose={arenaLook.onClose}
          handoffUrl={arenaLook.handoffUrl}
        />
      ) : null}

      {opponentDropped ? <OpponentDroppedOverlay onLeave={onLeaveDropped} /> : null}

      {gameOver ? (
        <GameOverOverlay
          spectatorResult={gameOver.spectatorResult}
          usedDeckName={gameOver.usedDeckName}
          opponentDeckName={gameOver.opponentDeckName}
          usedDeckDialog={gameOver.usedDeckDialog}
          opponentDeckDialog={gameOver.opponentDeckDialog}
          onDownloadReplay={gameOver.onDownloadReplay}
          replayFile={gameOver.replayFile}
          replayStatus={gameOver.replayStatus}
          signedIn={signedIn}
          result={gameOver.result}
          reason={gameOver.reason}
          stats={gameOver.stats}
          cardsRevealed={gameOver.cardsRevealed}
          onMenu={onMenu}
          onRematch={onRematch}
          returnsToRoom={returnsToRoom}
          series={gameOver.series}
          rematch={gameOver.rematch}
          friendMatchId={gameOver.friendMatchId}
          chat={gameOver.chat}
        />
      ) : null}
    </>
  );
}
