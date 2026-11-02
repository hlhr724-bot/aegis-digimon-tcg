/* How each play-choice prompt is answered.

   Every answer re-reads the live hand and board before it sends: the prompt may have been
   open while the server changed what it was about, and an answer to a play that is no
   longer legal must be dropped rather than sent. Each one closes its own prompt and puts
   the selection down, whether it sent anything or not. */

import { type AssemblyPlan, type DigiXrosPlan, type Permanent, type PlayerState } from "@aegis/shared";
import { intents } from "../../net/intents";
import { appFusionRoutesForHost, type EvoCostOption } from "../digivolveModel";
import type { HandEntry } from "../piece";
import type { SoundKind } from "../../design/sound";
import { DragKind } from "./enums";
import type {
  AppFusionChoice,
  AssemblyPick,
  DigiXrosPick,
  DualPlayChoice,
  EvoCostChoice,
  OverlayControls,
  PendingActionConfirmation,
} from "./types";

type Room = Parameters<typeof intents.playCard>[0];

export function playChoiceAnswers({
  room,
  viewer,
  handEntries,
  mainActionBlocked,
  appFusionAvailable,
  dualPlay,
  actionConfirm,
  appFusionChoice,
  appFusionRoutes,
  evoCostChoice,
  assemblyPick,
  digiXrosPick,
  overlays,
  setAppFusionChoice,
  clearSel,
  lastPlayAttemptRef,
  dispatchPlayCard,
  digivolveWithChoice,
  findPermanent,
  playNormally,
}: {
  room: Room | undefined;
  viewer: PlayerState;
  handEntries: HandEntry[];
  mainActionBlocked: boolean;
  appFusionAvailable: () => boolean;
  dualPlay: DualPlayChoice | null;
  actionConfirm: PendingActionConfirmation | null;
  appFusionChoice: AppFusionChoice | null;
  /** The App Fusion as the board can still carry it out, or nothing. */
  appFusionRoutes:
    | { entry: HandEntry | undefined; host: Permanent | undefined; normalEvolutionLegal: boolean }
    | undefined;
  evoCostChoice: EvoCostChoice | null;
  assemblyPick: AssemblyPick | null;
  digiXrosPick: DigiXrosPick | null;
  overlays: OverlayControls;
  setAppFusionChoice: (choice: AppFusionChoice | null) => void;
  clearSel: () => void;
  playGameCue: (kind: SoundKind) => void;
  lastPlayAttemptRef: { current: string | undefined };
  dispatchPlayCard: (
    room: Room,
    instanceId: string,
    targetSlot?: number,
    digiXros?: DigiXrosPlan,
    assembly?: AssemblyPlan,
    useAs?: "digimon" | "option",
  ) => void;
  digivolveWithChoice: (
    permanentId: string,
    instanceId: string,
    cardId: string,
    base: Permanent,
    confirmDrop?: boolean,
  ) => void;
  playNormally?: (instanceId: string, confirmDrop: boolean) => void;
  findPermanent: (permanentId: string) => Permanent | undefined;
}) {
  const close = (dismiss: () => void) => {
    dismiss();
    clearSel();
  };

  return {
    actionBlocked: mainActionBlocked,
    onDualPlay: (useAs: "digimon" | "option") => {
      if (!dualPlay || mainActionBlocked || !room) return;
      if (!handEntries.some((entry) => entry.instanceId === dualPlay.instanceId)) {
        close(() => overlays.setDualPlay(null));
        return;
      }
      lastPlayAttemptRef.current = dualPlay.instanceId;
      dispatchPlayCard(room, dualPlay.instanceId, undefined, undefined, undefined, useAs);
      close(() => overlays.setDualPlay(null));
    },
    onDualPlayCancel: () => close(() => overlays.setDualPlay(null)),

    onConfirmAction: (dnaMaterialPermanentIds?: string[]) => {
      if (!actionConfirm || mainActionBlocked) return;
      if (room) {
        if (actionConfirm.kind === DragKind.Play) dispatchPlayCard(room, actionConfirm.instanceId);
        else if (actionConfirm.kind === "digivolve")
          intents.digivolve(room, actionConfirm.permanentId, actionConfirm.instanceId);
        else if (actionConfirm.kind === "negamon") {
          const entry = handEntries.find((candidate) => candidate.instanceId === actionConfirm.instanceId);
          if (
            entry?.negamonPlayEffectKey === actionConfirm.effectKey &&
            viewer.breeding?.topCard?.instanceId === actionConfirm.sourceInstanceId
          ) {
            intents.activateEffect(room, actionConfirm.sourceInstanceId, actionConfirm.effectKey);
          }
        } else {
          const entry = handEntries.find((candidate) => candidate.instanceId === actionConfirm.instanceId);
          const selected = dnaMaterialPermanentIds;
          const route = entry?.dnaDigivolveRoutes?.find(
            (candidate) =>
              selected &&
              candidate.materialPermanentIds.length === selected.length &&
              candidate.materialPermanentIds.every((id, index) => id === selected[index]),
          );
          if (route && route.materialPermanentIds.every((id) => viewer.battleArea.some((p) => p.permanentId === id)))
            intents.dnaDigivolve(room, [...route.materialPermanentIds], actionConfirm.instanceId);
        }
      }
      close(() => overlays.setActionConfirm(null));
    },
    onDigivolveNormally:
      actionConfirm?.kind === "dna" && actionConfirm.normalPermanentId
        ? () => {
            const pending = actionConfirm;
            const base = findPermanent(pending.normalPermanentId!);
            overlays.setActionConfirm(null);
            if (base) digivolveWithChoice(pending.normalPermanentId!, pending.instanceId, pending.cardId, base);
          }
        : undefined,
    canPlayNormally: handEntries.some(
      (entry) => entry.instanceId === actionConfirm?.instanceId && entry.playableFromHand,
    ),
    onPlayNormally: () => {
      if (!actionConfirm || !["dna", "negamon"].includes(actionConfirm.kind) || mainActionBlocked || !room) {
        return;
      }
      const entry = handEntries.find((candidate) => candidate.instanceId === actionConfirm.instanceId);
      close(() => overlays.setActionConfirm(null));
      if (entry?.playableFromHand) {
        if (actionConfirm.kind === "dna") {
          dispatchPlayCard(room, entry.instanceId);
        } else if (actionConfirm.kind === "negamon") {
          playNormally?.(entry.instanceId, actionConfirm.confirmDrop);
        }
      }
    },
    onConfirmCancel: () => close(() => overlays.setActionConfirm(null)),

    onAppFusion: (linkedInstanceId: string) => {
      if (!appFusionChoice) return;
      const liveEntry = handEntries.find((entry) => entry.instanceId === appFusionChoice.handInstanceId);
      const liveHost = viewer.battleArea.find((candidate) => candidate.permanentId === appFusionChoice.hostPermanentId);
      const liveRoute =
        liveEntry && liveHost
          ? appFusionRoutesForHost(liveEntry.appFusionRoutes ?? [], liveHost).find(
              (route) => route.linkedInstanceId === linkedInstanceId,
            )
          : undefined;
      if (room && appFusionAvailable() && liveEntry && liveHost && liveRoute) {
        intents.appFusion(room, liveHost.permanentId, liveEntry.instanceId, liveRoute.linkedInstanceId);
      }
      close(() => setAppFusionChoice(null));
    },
    onAppFusionNormalEvolution: appFusionRoutes?.normalEvolutionLegal
      ? () => {
          const { entry, host } = appFusionRoutes;
          if (!entry || !host || !appFusionAvailable()) return;
          setAppFusionChoice(null);
          digivolveWithChoice(host.permanentId, entry.instanceId, entry.cardId, host);
        }
      : undefined,
    onAppFusionCancel: () => close(() => setAppFusionChoice(null)),

    onEvoCost: (option: EvoCostOption) => {
      if (!evoCostChoice || mainActionBlocked) return;
      if (room)
        intents.digivolve(
          room,
          evoCostChoice.permanentId,
          evoCostChoice.handInstanceId,
          option.type === "alternate",
          option.alternateRequirementIndex,
        );
      close(() => overlays.setEvoCostChoice(null));
    },
    onEvoCostCancel: () => close(() => overlays.setEvoCostChoice(null)),

    onAssembly: (materialInstanceIds: string[]) => {
      if (!assemblyPick || mainActionBlocked) return;
      if (room) {
        lastPlayAttemptRef.current = assemblyPick.instanceId;
        dispatchPlayCard(room, assemblyPick.instanceId, undefined, undefined, { materialInstanceIds });
      }
      close(() => overlays.setAssemblyPick(null));
    },
    onAssemblySkip: () => {
      if (!assemblyPick || mainActionBlocked) return;
      if (room) {
        lastPlayAttemptRef.current = assemblyPick.instanceId;
        dispatchPlayCard(room, assemblyPick.instanceId);
      }
      close(() => overlays.setAssemblyPick(null));
    },
    onAssemblyCancel: () => close(() => overlays.setAssemblyPick(null)),

    onDigiXros: (materialInstanceIds: string[], expanderPermanentIds: string[]) => {
      if (!digiXrosPick || mainActionBlocked) return;
      if (room)
        dispatchPlayCard(room, digiXrosPick.instanceId, undefined, { materialInstanceIds, expanderPermanentIds });
      close(() => overlays.setDigiXrosPick(null));
    },
    onDigiXrosSkip: () => {
      if (!digiXrosPick || mainActionBlocked) return;
      if (room) dispatchPlayCard(room, digiXrosPick.instanceId);
      close(() => overlays.setDigiXrosPick(null));
    },
    onDigiXrosCancel: () => close(() => overlays.setDigiXrosPick(null)),
  };
}
