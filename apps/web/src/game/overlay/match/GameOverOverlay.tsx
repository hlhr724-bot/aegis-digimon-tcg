import { AddFriendButton } from "@/friends/AddFriendButton";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "../../../design/primitives";
import { Icons } from "../../../design/icons";
import { useTranslation } from "../../../i18n";
import { gameOverSplash, type GameOverOutcome } from "../../gameOverSplash";
import type { SeriesView } from "../../seriesModel";
import { SeriesNextGame, SeriesScore } from "./SeriesStatus";
import { ReplaySavePrompt, type ReplaySaveProps } from "../../../replays/ReplaySavePrompt";
import { RematchPanel, type RematchProps } from "@/game/overlay/match/RematchPanel";

/** The best-of-three this game belongs to, for a seated player. */
export interface SeriesResultProps {
  view: SeriesView;
  opponentName: string;
  onChooseTurnOrder: (goFirst: boolean) => void;
  onLeave: () => void;
}

const SERIES_TITLES = {
  win: "overlay.series.won",
  loss: "overlay.series.lost",
  draw: "overlay.series.drawn",
} as const;

function seriesReason(t: ReturnType<typeof useTranslation>["t"], { view, opponentName }: SeriesResultProps): string {
  switch (view.endReason) {
    case "forfeit":
      return view.outcome === "win"
        ? t("overlay.series.reason.opponentLeft", { name: opponentName })
        : t("overlay.series.reason.youLeft");
    case "draw":
      return t("overlay.series.reason.draw");
    case "aborted":
      return t("overlay.series.reason.aborted");
    default:
      return t("overlay.series.reason.won", { you: view.viewerWins, opponent: view.opponentWins });
  }
}

export interface PostGameChat {
  open: boolean;
  unread: number;
  onToggle: () => void;
}

const HEADER_GAP_PX = 12;

/** How much the bar spells out, from everything down to icons only. */
type BarDensity = "full" | "brief" | "compact";

const BAR_DENSITIES: readonly BarDensity[] = ["full", "brief", "compact"];

type ResultView = "splash" | "board" | "usedDeck";

interface BarPlacement {
  density: BarDensity;
  style?: CSSProperties;
}

/**
 * Where the board-review bar fits without covering the opponent's hand fan or the match
 * buttons, which share the header with it. Their widths depend on the hand size and the
 * layout, so the bar measures the room between them instead of guessing breakpoints:
 * the densest form that fits, else the icon-only bar centred below the header.
 */
function placeBar(bar: HTMLElement): BarPlacement | undefined {
  const container = (bar.offsetParent ?? document.body).getBoundingClientRect();
  const hand = document.querySelector(".game-opponent-hand")?.getBoundingClientRect();
  const actions = document.querySelector(".game-topbar-actions, .game-mobile-menu")?.getBoundingClientRect();
  const header = document.querySelector(".game-opponent-bar")?.getBoundingClientRect();
  if (!hand || !actions || !header || actions.width === 0) return undefined;
  const room = actions.left - hand.right - 2 * HEADER_GAP_PX;
  const widthWhen = (density: BarDensity) => {
    for (const each of BAR_DENSITIES) bar.classList.toggle(`game-result-bar--${each}`, each === density);
    return bar.offsetWidth;
  };
  const density = BAR_DENSITIES.find((each) => widthWhen(each) <= room);
  if (density) {
    return {
      density,
      style: { left: "auto", right: container.right - actions.left + HEADER_GAP_PX, translate: "none" },
    };
  }
  return { density: "compact", style: { top: header.bottom - container.top + HEADER_GAP_PX } };
}

/**
 * The match's last moment. The existing Aegis screen reveals the result at its
 * resting size immediately, with the reason and actions ready on the same frame.
 *
 * Both halves of the ending are server truth. `gameOver` carries a discriminated
 * `result` and one of four `reason` codes; `gameOverSplash` only turns that pair
 * into words (game/gameOverSplash.ts).
 *
 * "View board" folds the splash into a slim bar so the viewer can study the final
 * board, their hand, and every pile; the bar brings the splash back. Once the server
 * reveals the hidden zones, the face-down piles on the board open too, and the bar says so.
 */
export function GameOverOverlay({
  spectatorResult,
  onDownloadReplay,
  usedDeckDialog,
  usedDeckName,
  opponentDeckName,
  opponentDeckDialog,
  replayFile,
  replayStatus,
  signedIn,
  result,
  reason,
  stats,
  cardsRevealed = false,
  onMenu,
  onRematch,
  returnsToRoom = false,
  series,
  rematch,
  friendMatchId,
  chat,
}: ReplaySaveProps & {
  spectatorResult?: string;
  opponentDeckDialog?: (onClose: () => void) => ReactNode;
  usedDeckDialog?: (onClose: () => void) => ReactNode;
  usedDeckName?: string;
  opponentDeckName?: string;
  result: GameOverOutcome;
  reason: string;
  stats: { value: number | string; label: string }[];
  /** The server revealed every hidden zone, so the face-down piles open. */
  cardsRevealed?: boolean;
  onMenu: () => void;
  onRematch: () => void;
  /** A private match goes back to its room, where both players can switch decks. */
  returnsToRoom?: boolean;
  /** Set in a best-of-three: the splash shows the series and, between games, the next one. */
  series?: SeriesResultProps;
  rematch?: RematchProps;
  friendMatchId?: string;
  chat?: PostGameChat;
}) {
  const { t } = useTranslation();
  const splash = gameOverSplash(result, reason);
  const [opponentDeckOpen, setOpponentDeckOpen] = useState(false);
  const [deckPickerOpen, setDeckPickerOpen] = useState(false);
  const [view, setView] = useState<ResultView>("splash");
  const reviewingBoard = view === "board";
  const barRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<BarPlacement>({ density: "full" });

  useLayoutEffect(() => {
    if (!reviewingBoard) return;
    const place = () => {
      if (barRef.current) setPlacement(placeBar(barRef.current) ?? { density: "full" });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [reviewingBoard]);
  const seriesOutcome = series?.view.outcome;
  const seriesRunning = series !== undefined && seriesOutcome === undefined;
  const rematchStarting = rematch?.view.stage === "accepted";
  const keepsMatchOpen = seriesRunning || rematchStarting;
  const title = spectatorResult
    ? t("spectator.finished")
    : seriesOutcome
      ? t(SERIES_TITLES[seriesOutcome])
      : t(splash.titleKey);
  const eyebrow = !series
    ? t("overlay.matchComplete")
    : seriesOutcome
      ? t("overlay.series.complete")
      : t("overlay.series.gameComplete", { game: series.view.gameNumber, bestOf: series.view.bestOf });
  const reasonText = spectatorResult ?? (series && seriesOutcome ? seriesReason(t, series) : t(splash.reasonKey));

  const choosingDeck = rematch?.view.series?.stage === "deckSelection" && !rematch.view.series.viewerDeckReady;
  if (deckPickerOpen && choosingDeck && rematch?.deckPicker) {
    return rematch.deckPicker(() => setDeckPickerOpen(false));
  }

  if (opponentDeckOpen && opponentDeckDialog) {
    return opponentDeckDialog(() => setOpponentDeckOpen(false));
  }

  if (view === "usedDeck" && usedDeckDialog) return usedDeckDialog(() => setView("board"));

  if (reviewingBoard) {
    return (
      <div
        ref={barRef}
        className={`game-result-bar game-result--${splash.tone} game-result-bar--${placement.density}`}
        style={placement.style}
        role="status"
      >
        <span className="game-result-bar__title">{title}</span>
        {cardsRevealed ? <span className="game-result-bar__hint">{t("overlay.reveal.hint")}</span> : null}
        <Button
          className="game-result-bar__show"
          size="sm"
          variant="secondary"
          icon={Icons.Maximize}
          aria-label={t("overlay.showResult")}
          title={t("overlay.showResult")}
          onClick={() => setView("splash")}
        >
          <span className="game-result-bar__label">{t("overlay.showResult")}</span>
        </Button>
      </div>
    );
  }

  return (
    <div
      className={`game-result game-result--${splash.tone}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="aegis-game-over-title"
    >
      <div className="game-result__rays" aria-hidden="true" />
      <div className="game-result__panel">
        <p className="game-result__eyebrow">{eyebrow}</p>
        <h1
          id="aegis-game-over-title"
          className={`game-result__title${seriesOutcome ? " game-result__title--series" : ""}`}
        >
          {title}
        </h1>
        <p className="game-result__reason">{reasonText}</p>
        {!spectatorResult && (usedDeckName || opponentDeckName) ? (
          <dl className="game-result__decks">
            {usedDeckName ? (
              <div>
                <dt>{t("profile.filter.deck")}</dt>
                <dd>{usedDeckName}</dd>
              </div>
            ) : null}
            {opponentDeckName ? (
              <div>
                <dt>{t("overlay.opponentDeck")}</dt>
                <dd>{opponentDeckName}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        {series ? (
          <SeriesScore series={series.view} opponentName={series.opponentName} />
        ) : (
          <div className="game-result__stats">
            {stats.map((entry) => (
              <div key={entry.label} className="game-result__stat">
                <span className="game-result__stat-value">{entry.value}</span>
                <span className="game-result__stat-label">{entry.label}</span>
              </div>
            ))}
          </div>
        )}
        {seriesRunning ? (
          <SeriesNextGame
            series={series.view}
            opponentName={series.opponentName}
            onChooseTurnOrder={series.onChooseTurnOrder}
          />
        ) : null}
        {friendMatchId && signedIn && !spectatorResult ? <AddFriendButton matchId={friendMatchId} /> : null}
        {rematch && !spectatorResult ? (
          <RematchPanel {...rematch} onChangeDeck={rematch.deckPicker ? () => setDeckPickerOpen(true) : undefined} />
        ) : null}
        {keepsMatchOpen ? null : (
          <div className="game-actions-row">
            <Button full autoFocus icon={returnsToRoom ? Icons.Link2 : Icons.Swords} onClick={onRematch}>
              {t(spectatorResult ? "spectator.back" : returnsToRoom ? "overlay.backToRoom" : "overlay.findRematch")}
            </Button>
            <Button full variant="secondary" icon={Icons.LayoutDashboard} onClick={onMenu}>
              {t("overlay.mainMenu")}
            </Button>
          </div>
        )}
        <div className="game-result__links">
          {opponentDeckDialog ? (
            <Button
              className="game-result__link"
              variant="ghost"
              size="sm"
              icon={Icons.FileText}
              onClick={() => setOpponentDeckOpen(true)}
            >
              {t("overlay.opponentDeck")}
            </Button>
          ) : null}
          {usedDeckDialog ? (
            <Button
              className="game-result__link"
              variant="ghost"
              size="sm"
              icon={Icons.FileText}
              onClick={() => setView("usedDeck")}
            >
              {t("overlay.viewUsedDeck")}
            </Button>
          ) : null}
          {chat ? (
            <Button
              className="game-result__link"
              variant="ghost"
              size="sm"
              icon={Icons.MessageSquare}
              aria-pressed={chat.open}
              data-testid="game-result-chat"
              onClick={chat.onToggle}
            >
              {chat.unread > 0 ? t("chat.openUnread", { count: chat.unread }) : t("chat.open")}
            </Button>
          ) : null}
          <Button
            className="game-result__link"
            variant="ghost"
            size="sm"
            icon={Icons.Eye}
            onClick={() => setView("board")}
          >
            {t("overlay.viewBoard")}
          </Button>
          {seriesRunning && series.view.stage === "choosing" ? (
            <Button
              className="game-result__link series-leave"
              variant="ghost"
              size="sm"
              icon={Icons.LogOut}
              onClick={series.onLeave}
            >
              {t("overlay.series.leave")}
            </Button>
          ) : null}
        </div>
        <ReplaySavePrompt
          onDownloadReplay={onDownloadReplay}
          replayFile={replayFile}
          replayStatus={replayStatus}
          signedIn={signedIn}
          keepsMatchOpen={keepsMatchOpen}
        />
      </div>
    </div>
  );
}
