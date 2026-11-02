/* Everything the viewer can ask the server to do, and what the screen does around it.

   Every sender is guarded by `mainActionBlocked` and no-ops safely when the room has
   dropped, so a refused or impossible action costs nothing. A play that needs something
   settled first — which half of a dual card, which materials, which cost, a confirmation
   the player asked for — opens that prompt instead of sending, and the prompt answers
   back through the sender it names.

   The optimistic hide lives here too: a play leaves the hand at the instant the intent is
   dispatched, and the sequence it was dispatched at is what a later rejection is measured
   against. */

import { shouldConfirmCardPlay } from "@/game/cardConfirmation/shouldConfirmCardPlay";
import { CardConfirmationMode } from "@/game/cardConfirmation/CardConfirmationMode";

import type { MutableRefObject } from "react";
import {
  type AssemblyPlan,
  type AttackTarget,
  type DecisionRequest,
  type DecisionResponse,
  type DigiXrosPlan,
  type Permanent,
  type PlayerState,
  type SequencedServerEvent,
} from "@aegis/shared";
import { playSound, type SoundKind } from "../../design/sound";
import { intents } from "../../net/intents";
import { getDigivolveCostOptions, type ProjectedDigivolveRoute } from "../digivolveModel";
import type { HandEntry } from "../piece";
import { DragKind } from "./enums";
import { prePlayPromptFor } from "./model/prePlayPrompt";
import type { OverlayControls, SelectionControls } from "./types";

type Room = Parameters<typeof intents.playCard>[0];

export function matchIntents({
  room,
  localConnection,
  decision,
  acknowledgeDecision,
  events,
  viewer,
  opponent,
  handEntries,
  digivolveRoutesOf,
  mainActionBlocked,
  cardConfirmationMode,
  lastPlayAttemptRef,
  playAttemptEventSeqRef,
  setOptimisticPlayedInstanceId,
  selection,
  overlays,
  onDecisionAnswered,
}: {
  room: Room | undefined;
  /** A fabricated connection stands in for the room and may answer its own decisions. */
  localConnection: { respondDecision?: (response: DecisionResponse) => void } | undefined;
  decision: DecisionRequest | undefined;
  acknowledgeDecision: ((decisionId: string) => void) | undefined;
  events: SequencedServerEvent[];
  viewer: PlayerState;
  opponent: PlayerState;
  handEntries: HandEntry[];
  digivolveRoutesOf: (instanceId: string) => readonly ProjectedDigivolveRoute[] | undefined;
  mainActionBlocked: boolean;
  cardConfirmationMode: CardConfirmationMode;
  playGameCue: (kind: SoundKind) => void;
  lastPlayAttemptRef: MutableRefObject<string | undefined>;
  playAttemptEventSeqRef: MutableRefObject<number>;
  setOptimisticPlayedInstanceId: (instanceId: string | undefined) => void;
  selection: SelectionControls;
  overlays: OverlayControls;
  /** Told about every answer this seat sends, after it is sent. */
  onDecisionAnswered?: (decision: DecisionRequest, response: DecisionResponse) => void;
}) {
  const { clearSel, setHandSel, setHandPreview, setSelPerm, setVortexMode, setLinkSel } = selection;

  const dispatchPlayCard = (
    activeRoom: Room,
    instanceId: string,
    targetSlot?: number,
    digiXros?: DigiXrosPlan,
    assembly?: AssemblyPlan,
    useAs?: "digimon" | "option",
  ) => {
    lastPlayAttemptRef.current = instanceId;
    playAttemptEventSeqRef.current = events.reduce((latest, event, index) => Math.max(latest, event.seq ?? index), -1);
    setOptimisticPlayedInstanceId(instanceId);
    intents.playCard(activeRoom, instanceId, targetSlot, digiXros, assembly, useAs);
  };

  const playCard = (instanceId: string, confirmDrop = false, preferDna = false, skipNegamon = false) => {
    if (mainActionBlocked) return;
    const entry = handEntries.find((candidate) => candidate.instanceId === instanceId);
    const breedingCard = viewer.breeding?.topCard;
    if (!skipNegamon && !preferDna && entry?.negamonPlayEffectKey && breedingCard) {
      overlays.setActionConfirm({
        kind: "negamon",
        instanceId,
        cardId: entry.cardId,
        sourceInstanceId: breedingCard.instanceId,
        effectKey: entry.negamonPlayEffectKey,
        confirmDrop,
      });
      return;
    }
    const prompt = prePlayPromptFor({
      entry: handEntries.find((h) => h.instanceId === instanceId),
      viewer,
      confirmDrop,
      preferDna,
      actionConfirmationsEnabled: shouldConfirmCardPlay({ entry, mode: cardConfirmationMode }),
    });
    if (prompt?.kind === "dual") {
      overlays.setDualPlay({ instanceId, cardId: prompt.cardId });
      return;
    }
    if (prompt?.kind === "dna") {
      overlays.setActionConfirm({
        kind: "dna",
        instanceId,
        cardId: prompt.cardId,
        materialPermanentIds: [...prompt.routes[0]!.materialPermanentIds],
      });
      return;
    }
    if (prompt?.kind === "digiXros") {
      overlays.setDigiXrosPick(prompt);
      return;
    }
    if (prompt?.kind === "assembly") {
      overlays.setAssemblyPick(prompt);
      return;
    }
    if (prompt?.kind === DragKind.Play) {
      overlays.setActionConfirm({ kind: DragKind.Play, instanceId, cardId: prompt.cardId });
      return;
    }
    if (room) {
      dispatchPlayCard(room, instanceId);
    }
    clearSel();
  };

  /** Arm a link declaration for `instanceId`; the next tap on a projected target sends it. */
  const beginLink = (instanceId: string, cardId: string, targetPermanentIds: readonly string[]) => {
    if (mainActionBlocked || targetPermanentIds.length === 0) return;
    playSound("select");
    setHandSel(null);
    setSelPerm(null);
    setVortexMode(false);
    overlays.setCardMenu(null);
    setHandPreview(null);
    overlays.setStackView(null);
    setLinkSel({ instanceId, cardId, targetPermanentIds });
  };

  const linkCard = (instanceId: string, targetPermanentId: string) => {
    if (mainActionBlocked) return;
    if (room) {
      playSound("confirm");
      intents.linkCard(room, instanceId, targetPermanentId);
    }
    clearSel();
  };

  const digivolve = (
    permanentId: string,
    instanceId: string,
    useAlternateCost?: boolean,
    alternateRequirementIndex?: number,
  ) => {
    if (mainActionBlocked) return;
    if (room) {
      lastPlayAttemptRef.current = instanceId;
      intents.digivolve(room, permanentId, instanceId, useAlternateCost, alternateRequirementIndex);
    }
    clearSel();
  };

  const attack = (attackerPermanentId: string, target: AttackTarget, vortex?: boolean) => {
    if (mainActionBlocked) return;
    if (room) {
      intents.attack(room, attackerPermanentId, target, vortex);
    }
    setSelPerm(null);
    setVortexMode(false);
  };

  const respondDecision = (response: DecisionResponse) => {
    if (decision && (room || localConnection)) {
      playSound("confirm");
      if (room) intents.respondDecision(room, decision.decisionId, response);
      else localConnection?.respondDecision?.(response);
      acknowledgeDecision?.(decision.decisionId);
      onDecisionAnswered?.(decision, response);
    }
    overlays.setPicks([]);
  };

  const respondMulligan = (keep: boolean) => {
    if (room && decision?.kind === "mulligan") {
      playSound("confirm");
      intents.mulligan(room, keep);
      acknowledgeDecision?.(decision.decisionId);
    }
  };

  const activateEffect = (instanceId: string, effectKey: string) => {
    if (mainActionBlocked) return;
    if (room) {
      playSound("confirm");
      intents.activateEffect(room, instanceId, effectKey);
    }
  };

  /** Several cost paths at different costs need a choice; identical costs do not. */
  const digivolveWithChoice = (
    permanentId: string,
    instanceId: string,
    cardId: string,
    base: Permanent,
    confirmDrop = false,
  ) => {
    if (mainActionBlocked) return;
    const options = getDigivolveCostOptions(cardId, base, viewer, opponent, digivolveRoutesOf(instanceId));
    const distinctCosts = new Set(options.map((o) => o.cost));
    if (options.length > 1 && distinctCosts.size > 1) {
      overlays.setEvoCostChoice({
        handInstanceId: instanceId,
        permanentId,
        handCardId: cardId,
        baseCardId: base.topCard?.cardId ?? "",
        options,
      });
      return;
    }
    const targetsBreeding = viewer.breeding?.permanentId === permanentId;
    if ((confirmDrop || targetsBreeding) && cardConfirmationMode !== CardConfirmationMode.NEVER.value) {
      overlays.setActionConfirm({
        kind: "digivolve",
        instanceId,
        cardId,
        permanentId,
        baseCardId: base.topCard?.cardId ?? "",
      });
      return;
    }
    digivolve(permanentId, instanceId);
  };

  return {
    dispatchPlayCard,
    playCard,
    beginLink,
    linkCard,
    digivolve,
    attack,
    respondDecision,
    respondMulligan,
    activateEffect,
    digivolveWithChoice,
  };
}
