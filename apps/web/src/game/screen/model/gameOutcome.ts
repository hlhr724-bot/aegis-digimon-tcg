import type { FinalRevealPlayer, Seat, ServerEvent } from "@aegis/shared";
import type { Side } from "../../side";

export function gameOverReason(input: {
  events: readonly ServerEvent[];
}): Extract<ServerEvent, { kind: "gameOver" }>["reason"] {
  const { events } = input;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i]!;
    if (e.kind === "gameOver") return e.reason;
  }
  return "security";
}

export function gameOverResult(input: {
  events: readonly ServerEvent[];
  viewerSeat: Seat;
  winnerSeat: number;
}): "win" | "loss" | "draw" {
  const { events, viewerSeat, winnerSeat } = input;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i]!;
    if (e.kind === "gameOver")
      return e.result.outcome === "draw" ? "draw" : e.result.winnerSeat === viewerSeat ? "win" : "loss";
  }
  if (winnerSeat === -1) return "draw";
  return winnerSeat === viewerSeat ? "win" : "loss";
}

/** Both players' hidden zones, from the viewer's side of the board. */
export interface RevealedZones {
  viewer: FinalRevealPlayer;
  opponent: FinalRevealPlayer;
}

/** A face-down pile the viewer opened once the match is over. */
export interface RevealedZoneView {
  side: Side;
  zone: "deck" | "eggDeck";
}

// The hidden zones of both players, which the server sends once the match is over.
export function revealedZones(input: {
  events: readonly ServerEvent[];
  viewerSeat: Seat;
  resultShown: boolean;
}): RevealedZones | undefined {
  const { events, viewerSeat, resultShown } = input;
  if (!resultShown) return undefined;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i]!;
    if (e.kind !== "finalReveal") continue;
    const viewer = e.players.find((player) => player.seat === viewerSeat);
    const opponent = e.players.find((player) => player.seat !== viewerSeat);
    return viewer && opponent ? { viewer, opponent } : undefined;
  }
  return undefined;
}

// Turn order is server truth: `matchStarted` names the seat that takes turn 1.
// Nothing is shown until that event has arrived rather than inferring a side.
export function viewerTurnOrder(input: {
  events: readonly ServerEvent[];
  viewerSeat: Seat;
}): "first" | "second" | undefined {
  const { events, viewerSeat } = input;
  const started = events.find((event) => event.kind === "matchStarted");
  if (started?.kind !== "matchStarted") return undefined;
  return started.firstSeat === viewerSeat ? "first" : "second";
}
