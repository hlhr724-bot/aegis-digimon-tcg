import type { MutableRefObject } from "react";
import type { GameState, Seat, SequencedServerEvent } from "@aegis/shared";
import {
  activeBlockWindow,
  activeCounterWindow,
  lastRejectedCombatAnswer,
  type MirroredCombatWindow,
  type OpenCombatWindow,
} from "../../combatWindowModel";
import { findPermanentInState } from "../../decisionModel";
import { trackOpenAttack } from "../../fieldClash";

function openAttackTargetPermanentId(events: readonly SequencedServerEvent[]): string | undefined {
  let declared = events.length - 1;
  while (declared >= 0 && events[declared]!.kind !== "attackDeclared") declared -= 1;
  if (declared < 0) return undefined;
  return events.slice(declared).reduce(trackOpenAttack, null)?.targetPermanentId ?? undefined;
}

/** The five combat prompts, each present only when this viewer still owes it an answer. */
export type CombatWindows = {
  blockWindow: ReturnType<typeof activeBlockWindow>;
  counterWindow: (NonNullable<ReturnType<typeof activeCounterWindow>> & { attackTargetPermanentId?: string }) | null;
  allianceWindow: { permanentId: string; eligibleAllyIds: readonly string[]; stateVersion?: number } | null;
  evadeWindow: { permanentId: string; stateVersion?: number } | null;
  barrierWindow: { permanentId: string; stateVersion?: number } | null;
  /**
   * Mark the open combat window as answered, so it cannot render (or be clicked) again until a
   * new one opens. Every onBlock/onDecline/onActivate/onPass/onChoose/onAccept handler calls
   * it alongside dispatching the intent.
   */
  markCombatWindowAnswered: () => void;
};

/**
 * Which combat prompt, if any, this viewer is being asked.
 *
 * Each window is event-driven and shown only to the seat that owes the answer: the block and
 * counter windows to the defender, and alliance, evade and barrier to whoever controls the
 * named permanent. The Alliance/Evade/Barrier scans run backwards from the log tail and are
 * dismissed by the resolution, the battle ending, the phase turning over or the game ending.
 *
 * A window the viewer has already answered stays closed until a new one opens. A server that
 * rejects the answer reopens it, which is what the rejection sequence guards.
 */
export function combatWindowsFor({
  events,
  state,
  viewerSeat,
  isMyTurn,
  mirroredWindow,
  decision,
  openCombatWindow,
  answeredCombatWindowKeyRef,
  rolledBackRejectionSeqRef,
}: {
  events: readonly SequencedServerEvent[];
  state: GameState;
  viewerSeat: Seat;
  isMyTurn: boolean;
  mirroredWindow: MirroredCombatWindow | null;
  /** The direct decision message, which can arrive before its synchronized state patch. */
  decision?: { seat: Seat; stateVersion?: number } | undefined;
  /** The window the server currently has open, which is what an answer is recorded against. */
  openCombatWindow: OpenCombatWindow | null;
  /** Mutated: the window key this viewer has answered, cleared when the window closes. */
  answeredCombatWindowKeyRef: MutableRefObject<string | undefined>;
  /** Mutated: the rejection already rolled back, so one rejection reopens the window once. */
  rolledBackRejectionSeqRef: MutableRefObject<number | undefined>;
}): CombatWindows {
  const blockWindowRaw = activeBlockWindow(events, isMyTurn, mirroredWindow);
  const counterWindowRaw = activeCounterWindow(events, viewerSeat, isMyTurn, mirroredWindow);
  const allianceWindowRaw = (() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const e = events[i]!;
      if (e.kind === "alliancePrompt") {
        const perm = findPermanentInState(state, e.permanentId);
        if (perm?.controllerSeat !== viewerSeat) return null;
        return { permanentId: e.permanentId, eligibleAllyIds: e.eligibleAllyIds, stateVersion: e.stateVersion };
      }
      if (
        e.kind === "allianceResolved" ||
        e.kind === "combatResolved" ||
        e.kind === "gameOver" ||
        e.kind === "phaseChanged"
      )
        return null;
    }
    return mirroredWindow?.kind === "alliance"
      ? { permanentId: mirroredWindow.permanentId, eligibleAllyIds: mirroredWindow.eligiblePermanentIds }
      : null;
  })();
  const evadeWindowRaw = (() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const e = events[i]!;
      if (e.kind === "evadePrompt") {
        const perm = findPermanentInState(state, e.permanentId);
        if (perm?.controllerSeat !== viewerSeat) return null;
        return { permanentId: e.permanentId, stateVersion: e.stateVersion };
      }
      if (
        e.kind === "evadeResolved" ||
        e.kind === "combatResolved" ||
        e.kind === "gameOver" ||
        e.kind === "phaseChanged"
      )
        return null;
    }
    return mirroredWindow?.kind === "evade" ? { permanentId: mirroredWindow.permanentId } : null;
  })();
  const barrierWindowRaw = (() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const e = events[i]!;
      if (e.kind === "barrierPrompt") {
        const perm = findPermanentInState(state, e.permanentId);
        if (perm?.controllerSeat !== viewerSeat) return null;
        return { permanentId: e.permanentId, stateVersion: e.stateVersion };
      }
      if (
        e.kind === "barrierResolved" ||
        e.kind === "combatResolved" ||
        e.kind === "gameOver" ||
        e.kind === "phaseChanged"
      )
        return null;
    }
    return mirroredWindow?.kind === "barrier" ? { permanentId: mirroredWindow.permanentId } : null;
  })();

  if (openCombatWindow === null) answeredCombatWindowKeyRef.current = undefined;
  const lastCombatRejection = lastRejectedCombatAnswer(events);
  if (lastCombatRejection !== undefined && lastCombatRejection !== rolledBackRejectionSeqRef.current) {
    rolledBackRejectionSeqRef.current = lastCombatRejection;
    answeredCombatWindowKeyRef.current = undefined;
  }
  const answerKey = (key: string) =>
    `${key}:${openCombatWindow?.promptSeq ?? openCombatWindow?.stateVersion ?? "mirror"}`;
  const answeredCombatWindow = (key: string) => answeredCombatWindowKeyRef.current === answerKey(key);
  // Counter closes only after its asynchronous effect resolves. A nested decision proves
  // its answer was accepted, including after reconnect when the local answer ref is lost.
  // Keep that answer between successive effect decisions until counterResolved arrives.
  // Only a decision the viewer owes and that was raised after the Counter opened counts. The
  // event can arrive before the patch that clears an answered decision, whether the opponent's
  // or the viewer's own (a declined "change the attack target" prompt), and that stale
  // decision must not hide the window. A revision that is unknown counts as nested.
  const counterOpenedAt = counterWindowRaw?.stateVersion;
  const raisedAfterCounter = (raisedAt: number | undefined) =>
    counterOpenedAt === undefined || raisedAt === undefined || raisedAt > counterOpenedAt;
  const viewerDecisionPending =
    (decision?.seat === viewerSeat && raisedAfterCounter(decision.stateVersion)) ||
    (state.pendingDecision?.seat === viewerSeat && raisedAfterCounter(state.stateVersion));
  if (counterWindowRaw && viewerDecisionPending) {
    answeredCombatWindowKeyRef.current = answerKey(`counter:${counterWindowRaw.attackerPermanentId}`);
  }

  return {
    blockWindow:
      blockWindowRaw && !answeredCombatWindow(`block:${blockWindowRaw.attackerPermanentId}`) ? blockWindowRaw : null,
    counterWindow:
      counterWindowRaw && !answeredCombatWindow(`counter:${counterWindowRaw.attackerPermanentId}`)
        ? { ...counterWindowRaw, attackTargetPermanentId: openAttackTargetPermanentId(events) }
        : null,
    allianceWindow:
      allianceWindowRaw && !answeredCombatWindow(`alliance:${allianceWindowRaw.permanentId}`)
        ? allianceWindowRaw
        : null,
    evadeWindow: evadeWindowRaw && !answeredCombatWindow(`evade:${evadeWindowRaw.permanentId}`) ? evadeWindowRaw : null,
    barrierWindow:
      barrierWindowRaw && !answeredCombatWindow(`barrier:${barrierWindowRaw.permanentId}`) ? barrierWindowRaw : null,
    markCombatWindowAnswered() {
      if (openCombatWindow !== null) answeredCombatWindowKeyRef.current = answerKey(openCombatWindow.key);
    },
  };
}
