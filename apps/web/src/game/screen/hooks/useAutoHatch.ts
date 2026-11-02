import { useEffect, useRef } from "react";
import type { GameState, PlayerState, Seat } from "@aegis/shared";
import type { AegisRoom } from "../../../net/client";
import { intents } from "../../../net/intents";
import { useAutoHatch as useAutoHatchPreference } from "../../autoHatch";
import { actionGuards } from "../model/actionGuards";

/** Sends the normal, server-validated hatch intent once per breeding step. */
export function useAutoHatch({
  room,
  state,
  viewer,
  viewerSeat,
  ready,
  decisionOpen,
  presenting,
  phasePresentationPending,
}: {
  room: AegisRoom | undefined;
  state: GameState | undefined;
  viewer: PlayerState | undefined;
  viewerSeat: Seat | undefined;
  ready: boolean;
  decisionOpen: boolean;
  presenting: boolean;
  phasePresentationPending: boolean;
}): void {
  const enabled = useAutoHatchPreference();
  const attempted = useRef<string | undefined>(undefined);
  const guards =
    state && viewer && viewerSeat !== undefined
      ? actionGuards({ state, viewer, viewerSeat, decisionOpen, presenting, phasePresentationPending })
      : undefined;
  const canHatch = ready && guards?.breedingActionsOpen && guards.canHatchEgg;
  const raisingDuringBreedingStep = Boolean(guards?.breedingWindow && viewer?.breeding);
  const step = room && state && `${room.roomId}:${state.turnCount}:${viewerSeat}`;

  useEffect(() => {
    if (raisingDuringBreedingStep && step) attempted.current = step;
    if (!enabled || !room || !step || !canHatch || attempted.current === step) return;
    // Mark before sending so rerenders and StrictMode cannot send a second intent.
    attempted.current = step;
    intents.hatchEgg(room);
  }, [enabled, room, step, canHatch, raisingDuringBreedingStep]);
}
