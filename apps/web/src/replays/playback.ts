import { getCardDefinition, isOption, type MatchReplay, type Seat } from "@aegis/shared";

export function turnPositions(replay: MatchReplay): { index: number; turn: number; seat: Seat }[] {
  return replay.frames.flatMap((frame, index) =>
    index === 0 ||
    frame.state.turnCount !== replay.frames[index - 1]!.state.turnCount ||
    frame.state.turnSeat !== replay.frames[index - 1]!.state.turnSeat
      ? [{ index, turn: frame.state.turnCount, seat: frame.state.turnSeat }]
      : [],
  );
}

/** Skips thinking time, while giving each animation room to finish at the selected speed. */
export function frameDelay(replay: MatchReplay, index: number, speed: number, skipThinking = true): number {
  const gap = (replay.frames[index + 1]?.atMs ?? replay.frames[index]!.atMs) - replay.frames[index]!.atMs;
  return (skipThinking ? Math.min(2500, Math.max(1000, gap)) : Math.max(0, gap)) / speed;
}

export function playbackState(replay: MatchReplay, index: number, showHand: boolean) {
  const frame = replay.frames[index]!;
  if (showHand) return frame.state;
  return {
    ...frame.state,
    players: Array.from(frame.state.players, (player) => ({ ...player, hand: [] })),
  } as unknown as typeof frame.state;
}

/** A presentation may wait for a later rules batch to close its effect, attack or check.
 * Feed that whole causal span together; snapshots still preserve each batch's board. */
export function presentationEnd(replay: MatchReplay, start: number): number {
  const effects = new Map<string, number>();
  const attacks = new Set<string>();
  const checks = new Map<number, number>();
  const tops = new Set<string>();
  const options = new Set<string>();
  for (let index = start; index < replay.frames.length; index++) {
    for (const event of replay.frames[index]!.events) {
      if (event.kind === "cardPlayed" && event.permanentId === undefined && event.instanceId !== undefined) {
        const definition = getCardDefinition(event.cardId);
        if (definition !== undefined && isOption(definition)) options.add(event.instanceId);
      } else if (event.kind === "cardsMoved" && event.optionUsed === true) {
        for (const id of event.instanceIds) options.delete(id);
      } else if (event.kind === "turnEnded") options.clear();
      if (event.kind === "cardsMoved" && event.strippedStackTops?.sequenceId) {
        for (const id of event.instanceIds) tops.add(`${event.strippedStackTops.sequenceId}:${id}`);
      } else if (event.kind === "stackTopResolved") tops.delete(`${event.sequenceId}:${event.strippedInstanceId}`);
      if (event.kind === "effectTriggered") {
        const key = `${event.seat}:${event.sourceInstanceId ?? event.sourcePermanentId ?? event.sourceCardId}:${event.effectKey}`;
        effects.set(key, (effects.get(key) ?? 0) + 1);
      } else if (event.kind === "effectResolved") {
        const key = `${event.seat}:${event.sourceInstanceId ?? event.sourcePermanentId ?? event.sourceCardId}:${event.effectKey}`;
        const left = (effects.get(key) ?? 0) - 1;
        if (left > 0) effects.set(key, left);
        else effects.delete(key);
      } else if (event.kind === "attackDeclared") attacks.add(event.attackerPermanentId);
      else if (event.kind === "attackEnded") attacks.delete(event.attackerPermanentId);
      else if (event.kind === "securityRevealed") checks.set(event.seat, (checks.get(event.seat) ?? 0) + 1);
      else if (event.kind === "securityChecked") {
        const left = (checks.get(event.seat) ?? 0) - 1;
        if (left > 0) checks.set(event.seat, left);
        else checks.delete(event.seat);
      }
    }
    if (
      (!effects.size && !attacks.size && !checks.size && !tops.size && !options.size) ||
      replay.frames[index]!.state.gameOver
    )
      return index;
  }
  return replay.frames.length - 1;
}

/** Unscaled elapsed playback time survives pauses and mid-beat speed changes. */
export function createPlaybackClock(now = () => performance.now()) {
  let elapsed = 0;
  let sampledAt = now();
  let rate = 1;
  let running = false;
  const sample = () => {
    const next = now();
    if (running) elapsed += Math.max(0, next - sampledAt) * rate;
    sampledAt = next;
  };
  return {
    configure(nextRate: number, nextRunning: boolean) {
      sample();
      rate = nextRate;
      running = nextRunning;
    },
    reset() {
      elapsed = 0;
      sampledAt = now();
    },
    elapsed() {
      sample();
      return elapsed;
    },
  };
}
