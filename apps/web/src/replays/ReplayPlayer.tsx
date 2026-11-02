import { ReplayDeckIcons } from "@/replays/ReplayDeckIcons";
import { ReplayDeckDialog } from "@/replays/ReplayDeckDialog";
import { getReplayResult } from "@/replays/getReplayResult";
import { useReplayEnding } from "@/replays/useReplayEnding";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MatchReplay, Seat } from "@aegis/shared";
import { GameScreen } from "../game/GameScreen";
import { buildMatchLog } from "../game/matchLog";
import type { PresentationControls, PresentationProbe } from "../game/presentationProbe";
import { useTranslation } from "../i18n";
import { Icons } from "../design/icons";
import { Button } from "../design/primitives";
import { createPlaybackClock, frameDelay, playbackState, presentationEnd, turnPositions } from "./playback";
import { SEQUENTIAL_PACING_ENABLED } from "../features";
import { createAnimationPlayback } from "../game/animationPlayback";
import { ReplayRecording } from "./ReplayRecording";
import { ReplayControls } from "@/replays/ReplayControls";
import { ReplayTimeline } from "@/replays/ReplayTimeline";

const emptyDeck = { mainDeck: [], eggDeck: [] };
const acknowledgeDecision = () => undefined;

export function ReplayPlayer({
  replay,
  onClose,
  devProbe,
}: {
  replay: MatchReplay;
  onClose: () => void;
  devProbe?: PresentationProbe;
}) {
  const observer = useRef(devProbe);
  observer.current = devProbe;
  const { t, locale } = useTranslation();
  const [cursor, setCursor] = useState({ index: 0, from: 0, epoch: 0, animate: false });
  const [playing, setPlaying] = useState(false);
  const [jumping, setJumping] = useState(false);
  const pendingJump = useRef<number | undefined>(undefined);
  const [settled, setSettled] = useState(true);
  const clock = useMemo(() => createPlaybackClock(), []);
  const [speed, setSpeed] = useState(1);
  const [skipThinking, setSkipThinking] = useState(true);
  const [deckSeat, setDeckSeat] = useState<Seat>();
  const [showHand, setShowHand] = useState(true);
  const [viewerSeat, setViewerSeat] = useState<Seat>(replay.viewerSeat === 1 ? 1 : 0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [recordingMode, setRecordingMode] = useState(false);
  const history = useRef<HTMLElement>(null);
  const historyToggle = useRef<HTMLButtonElement>(null);
  const surface = useRef<HTMLElement>(null);
  const controls = useRef<PresentationControls | undefined>(undefined);
  const painted = useMemo(
    () =>
      createAnimationPlayback(() =>
        (surface.current?.querySelector(".replay-player__board")?.getAnimations({ subtree: true }) ?? []).filter(
          (animation) => !(animation instanceof CSSAnimation && animation.animationName === "replay-board-enter"),
        ),
      ),
    [],
  );
  useEffect(() => {
    let frameId: number;
    const sync = () => {
      painted.apply(speed, !playing && !jumping);
      frameId = requestAnimationFrame(sync);
    };
    sync();
    return () => cancelAnimationFrame(frameId);
  }, [painted, speed, playing, jumping]);
  useEffect(() => () => painted.release(), [painted]);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const turns = useMemo(() => turnPositions(replay), [replay]);
  const atEnd = cursor.index === replay.frames.length - 1;
  const resultVisible = atEnd && settled && !playing;
  const endingFinished = useReplayEnding({ visible: resultVisible });
  const result = useMemo(() => getReplayResult({ replay, viewerSeat }), [replay, viewerSeat]);
  const state = useMemo(() => playbackState(replay, cursor.index, showHand), [replay, cursor.index, showHand]);
  const probe = useMemo<PresentationProbe>(
    () => ({
      onQueue(next) {
        controls.current = next;
        next.queue.setRate(speedRef.current);
        next.queue.resume();
        observer.current?.onQueue?.(next);
      },
      onStep(event) {
        observer.current?.onStep?.(event);
      },
      onBatch(batch) {
        observer.current?.onBatch?.(batch);
      },
      onBoard(board) {
        observer.current?.onBoard?.(board);
      },
    }),
    [],
  );
  const logLines = useMemo(
    () =>
      replay.frames.map(
        (entry) =>
          buildMatchLog(entry.events, replay.viewerSeat === 1 ? 1 : 0, new Map(), t, 1, {
            0: replay.players[0],
            1: replay.players[1],
          })[0]?.text,
      ),
    [replay, t],
  );
  const labels = useMemo(
    () =>
      logLines.map(
        (line, index) =>
          line ?? `${t("replay.turn")} ${replay.frames[index]!.state.turnCount} · ${replay.frames[index]!.state.phase}`,
      ),
    [logLines, replay, t],
  );
  const presentedFrames = useMemo(
    () => (cursor.animate ? replay.frames.slice(cursor.from, cursor.index + 1) : []),
    [replay, cursor],
  );
  const batches = useMemo(
    () =>
      presentedFrames.map((entry, offset) => ({
        id: entry.events[0]?.batch ?? `replay-${cursor.from + offset}`,
        stateVersion: entry.state.stateVersion,
        events: entry.events,
      })),
    [presentedFrames, cursor.from],
  );
  // Every dependency in this causal span arrives before the queue waits for it.
  const historyEvents = useMemo(
    () => replay.frames.slice(0, cursor.index + 1).flatMap((frame) => frame.events),
    [replay, cursor.index],
  );
  const events = useMemo(() => presentedFrames.flatMap((entry) => entry.events), [presentedFrames]);
  const snapshotStart = Math.min(Math.max(0, cursor.index - 39), Math.max(0, cursor.from - 1));
  const connection = useMemo(
    () => ({
      room: undefined,
      status: "connected" as const,
      state,
      events,
      batches,
      decision: undefined,
      acknowledgeDecision,
      error: undefined,
      snapshots: replay.frames.slice(snapshotStart, cursor.index + 1).map((entry, offset) => ({
        stateVersion: entry.state.stateVersion,
        state: playbackState(replay, snapshotStart + offset, showHand),
      })),
      sessionId: `replay-seat-${viewerSeat}`,
      roomCode: "",
    }),
    [state, events, batches, viewerSeat, replay, cursor.index, snapshotStart, showHand],
  );

  useEffect(() => {
    clock.configure(speed, playing);
    controls.current?.queue.setRate(speed);
  }, [clock, speed, playing]);
  useEffect(() => {
    if (!playing && !jumping) return;
    const interval = setInterval(() => {
      if (!controls.current?.queue.isIdle()) return;
      if (!playing || atEnd) {
        setSettled(true);
        setPlaying(false);
        setJumping(false);
        return;
      }
      if (clock.elapsed() < frameDelay(replay, cursor.index, 1, skipThinking)) return;
      clock.reset();
      setSettled(false);
      setCursor((current) => ({
        ...current,
        from: current.index + 1,
        index: presentationEnd(replay, current.index + 1),
        animate: true,
      }));
    }, 50);
    return () => clearInterval(interval);
  }, [clock, playing, jumping, atEnd, replay, cursor.index, skipThinking]);
  useEffect(() => {
    if (!historyOpen) return;
    history.current?.querySelector<HTMLElement>('[aria-current="step"]')?.scrollIntoView({ block: "nearest" });
  }, [historyOpen, cursor.index]);
  useEffect(() => {
    if (!historyOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHistoryOpen(false);
        historyToggle.current?.focus();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [historyOpen]);

  useEffect(() => {
    if (pendingJump.current === undefined) return;
    const timeout = setTimeout(() => {
      const start = pendingJump.current;
      pendingJump.current = undefined;
      if (start !== undefined) animateFrom(start);
    }, 220);
    return () => clearTimeout(timeout);
  }, [cursor.epoch]);

  function animateFrom(start: number) {
    setSettled(false);
    setJumping(true);
    controls.current?.queue.resume();
    setCursor((current) => ({ ...current, from: start, index: presentationEnd(replay, start), animate: true }));
  }
  function seek(index: number) {
    const target = Math.max(0, Math.min(replay.frames.length - 1, index));
    pendingJump.current = undefined;
    setPlaying(false);
    setJumping(false);
    setSettled(true);
    clock.reset();
    controls.current = undefined;
    setCursor((current) => ({ index: target, from: target, epoch: current.epoch + 1, animate: false }));
  }
  function jump(index: number) {
    const target = Math.max(0, Math.min(replay.frames.length - 1, index));
    if (target === 0) {
      seek(0);
      return;
    }
    setPlaying(false);
    setSettled(true);
    clock.reset();
    if (target === cursor.index + 1 && controls.current) {
      animateFrom(target);
      return;
    }
    seek(target - 1);
    pendingJump.current = target;
  }
  function togglePlay() {
    if (playing) {
      controls.current?.queue.pause();
      setPlaying(false);
      setJumping(false);
      return;
    }
    if (atEnd && settled) seek(0);
    controls.current?.queue.resume();
    setPlaying(true);
  }
  const stopRecordingPlayback = useCallback(() => {
    controls.current?.queue.pause();
    setPlaying(false);
  }, []);
  function startRecordingPlayback() {
    setHistoryOpen(false);
    seek(0);
    setPlaying(true);
  }
  const currentTurn = turns.filter((turn) => turn.index <= cursor.index).at(-1)!;
  const outcome =
    replay.winnerSeat < 0 ? t("replay.draw") : t("replay.winner", { name: replay.players[replay.winnerSeat]! });

  return (
    <section
      ref={surface}
      className={`replay-player${recordingMode ? " replay-player--recording" : ""}`}
      aria-label={t("replay.title")}
    >
      <ReplayRecording
        replayId={replay.id}
        finished={endingFinished}
        onStart={startRecordingPlayback}
        onStop={stopRecordingPlayback}
        onActiveChange={setRecordingMode}
      />
      <header className="replay-player__heading">
        <Button
          variant="secondary"
          size="sm"
          icon={Icons.ChevronLeft}
          onClick={onClose}
          aria-label={t("replay.back")}
          title={t("replay.back")}
        >
          <span className="replay-player__back-label">{t("replay.back")}</span>
        </Button>
        <h1>
          {replay.players[0]} <span>vs</span> {replay.players[1]}
        </h1>
        <div className="replay-player__metadata">
          <time dateTime={new Date(replay.startedAt).toISOString()}>
            {new Date(replay.startedAt).toLocaleDateString(locale)}
          </time>
          <span className="replay-player__outcome">{outcome}</span>
        </div>
      </header>
      {deckSeat !== undefined && replay.decks?.[deckSeat] ? (
        <ReplayDeckDialog deck={replay.decks[deckSeat]} onClose={() => setDeckSeat(undefined)} />
      ) : null}
      <p className="aegis-sr-only">
        {t("replay.perspective", {
          name: replay.viewerSeat === -1 ? t("friends.spectatorReplay") : replay.players[replay.viewerSeat],
        })}
      </p>
      <div className="replay-player__body">
        <div className="replay-player__board">
          <GameScreen
            key={`${cursor.epoch}-${viewerSeat}`}
            replayMode
            historyEvents={historyEvents}
            replayPlayers={replay.players}
            presentationPacing={SEQUENTIAL_PACING_ENABLED ? "sequential" : "current"}
            joinOptions={{ displayName: replay.players[viewerSeat], deck: emptyDeck }}
            identityColor="Blue"
            demoConnection={connection}
            devProbe={probe}
            onExit={onClose}
          />
        </div>
        {resultVisible ? (
          <div className="replay-result" role="status" data-tone={result.tone}>
            <strong>{t(result.titleKey)}</strong>
            <span>
              {replay.winnerSeat < 0
                ? t("replay.draw")
                : t("replay.winner", { name: replay.players[replay.winnerSeat]! })}
            </span>
            {result.reasonKey ? <p>{t(result.reasonKey)}</p> : null}
          </div>
        ) : null}
        {historyOpen ? (
          <aside ref={history} id="replay-history" className="replay-history" aria-label={t("replay.log")}>
            <header>
              <h2>{t("replay.log")}</h2>
              <Button
                size="sm"
                variant="ghost"
                icon={Icons.X}
                aria-label={t("replay.historyClose")}
                onClick={() => {
                  setHistoryOpen(false);
                  historyToggle.current?.focus();
                }}
              />
            </header>
            <ol>
              {labels.map((label, index) => (
                <li key={index}>
                  <button
                    type="button"
                    aria-current={index === cursor.index ? "step" : undefined}
                    onClick={() => jump(index)}
                  >
                    <span className="replay-history__number">{index + 1}</span>
                    <span className="replay-history__entry">
                      <small>
                        {t("replay.turn")} {replay.frames[index]!.state.turnCount}
                      </small>
                      <span>{label}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </aside>
        ) : null}
      </div>
      <div className="replay-player__tools">
        <button
          ref={historyToggle}
          type="button"
          className="replay-player__tool"
          aria-label={t("replay.historyShow")}
          title={t("replay.historyShow")}
          aria-expanded={historyOpen}
          aria-controls="replay-history"
          onClick={() => setHistoryOpen((open) => !open)}
        >
          <Icons.FileText size={20} />
        </button>
        <button
          type="button"
          className="replay-player__tool"
          aria-label={t(controlsVisible ? "replay.controlsHide" : "replay.controlsShow")}
          title={t(controlsVisible ? "replay.controlsHide" : "replay.controlsShow")}
          aria-expanded={controlsVisible}
          aria-controls="replay-controls"
          onClick={() => setControlsVisible((visible) => !visible)}
        >
          <Icons.PlayCircle size={20} />
        </button>
      </div>
      <ReplayControls visible={controlsVisible}>
        <div className="replay-controls__timeline">
          <ReplayTimeline replay={replay} logLines={logLines} index={cursor.index} onSeek={seek} onJump={jump} />
          <span role="status" title={atEnd && settled ? t("replay.finished") : labels[cursor.index]}>
            {atEnd && settled ? t("replay.finished") : labels[cursor.index]}
          </span>
        </div>
        <div className="replay-player__decks">
          <ReplayDeckIcons summary={replay} />
          {replay.decks?.map((deck, seat) =>
            deck ? (
              <button key={seat} type="button" onClick={() => setDeckSeat(seat as Seat)}>
                <span>{replay.players[seat]}</span>
                <strong>{deck.deckName}</strong>
              </button>
            ) : null,
          )}
        </div>
        <div className="replay-controls__buttons">
          <div className="replay-controls__transport">
            <Button
              size="sm"
              variant="secondary"
              disabled={cursor.index === 0}
              onClick={() => seek(0)}
              aria-label={t("replay.start")}
            >
              <Icons.ChevronLeft size={18} />
              <span className="replay-controls__edge" aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={cursor.index === 0}
              onClick={() => seek(cursor.index - 1)}
              aria-label={t("replay.previous")}
            >
              <Icons.ChevronLeft size={18} />
            </Button>
            <Button
              className="replay-controls__play"
              size="sm"
              icon={playing ? Icons.Pause : Icons.Play}
              onClick={togglePlay}
              aria-pressed={playing}
            >
              <span className="replay-controls__play-label">{t(playing ? "replay.pause" : "replay.play")}</span>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={atEnd}
              onClick={() => jump(cursor.index + 1)}
              aria-label={t("replay.next")}
            >
              <Icons.ChevronRight size={18} />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={atEnd}
              onClick={() => seek(replay.frames.length - 1)}
              aria-label={t("replay.end")}
            >
              <Icons.ChevronRight size={18} />
              <span className="replay-controls__edge" aria-hidden="true" />
            </Button>
          </div>
          <details className="replay-controls__options">
            <summary aria-label={t("replay.options")}>
              <Icons.Settings size={20} />
              <span>{t("replay.options")}</span>
            </summary>
            <div className="replay-controls__settings">
              <label>
                <span>{t("replay.skipThinking")}</span>
                <input
                  type="checkbox"
                  checked={skipThinking}
                  onChange={(event) => {
                    clock.reset();
                    setSkipThinking(event.target.checked);
                  }}
                />
              </label>
              <label>
                <span>{t("replay.speedShort")}</span>
                <select
                  aria-label={t("replay.speed")}
                  value={speed}
                  onChange={(event) => setSpeed(Number(event.target.value))}
                >
                  {[0.5, 1, 2, 4].map((value) => (
                    <option key={value} value={value}>
                      {value}×
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t("replay.turn")}</span>
                <select
                  aria-label={t("replay.turn")}
                  value={currentTurn.index}
                  onChange={(event) => seek(Number(event.target.value))}
                >
                  {turns.map((turn) => (
                    <option key={turn.index} value={turn.index}>
                      {turn.turn} · {replay.players[turn.seat]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t("replay.hands")}</span>
                <select
                  aria-label={t("replay.hands")}
                  value={showHand ? "show" : "hide"}
                  onChange={(event) => {
                    seek(cursor.index);
                    setShowHand(event.target.value === "show");
                  }}
                >
                  <option value="show">{t("replay.hand.show")}</option>
                  <option value="hide">{t("replay.hand.hide")}</option>
                </select>
              </label>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  seek(cursor.index);
                  setViewerSeat((seat) => (1 - seat) as Seat);
                }}
              >
                {t("replay.flip")}
              </Button>
            </div>
          </details>
        </div>
      </ReplayControls>
    </section>
  );
}
