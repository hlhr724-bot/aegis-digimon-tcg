import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { GameState, Seat } from "@aegis/shared";
import type { AnimationQueue, AnimationStep } from "../../animationQueue";
import type { MatchNotice } from "../../notices";
import type { SidePanel } from "../../sidePanels";
import { buildSecurityBreakScene, type SecurityBranchScene, type SecurityClashScene } from "../../securityClash";
import {
  CLASH_DOCK_AT_MS,
  CLASH_OUTCOME_AT_MS,
  CLASH_REVEAL_SHOWN_AT_MS,
  SECURITY_BRANCH_IN_MS,
  TIMINGS,
} from "../../timings";
import { CueTrack } from "../enums";
import type { NarrationPlacement } from "../narration/narrationStream";
import type { SecurityBreakCue, SecurityClause } from "../types";
import { shieldBreakStep } from "../steps/shieldBreakStep";
import { CONSEQUENCE_GATE_MAX_MS, createPresentationGate, type PresentationGate } from "../presentationGate";
import { exitSecurityCard } from "./securityCardExit";
import { waitForPaintedAnimation } from "../../paintedAnimationClock";

/** The revealed card `stageSecurityReveal` currently holds on stage. */
export interface RevealOnStage {
  key: number;
  scene: SecurityClashScene;
  /** True once the card has played out and left the centre of the screen on its own. */
  exited?: boolean;
  /** True while the card is parked in the side dock waiting for its check to close. */
  docked?: boolean;
}

export interface SecurityRevealSceneDeps {
  queue: AnimationQueue;
  enqueue: (step: AnimationStep) => void;
  viewerSeat: Seat;
  replayingHistory: boolean;
  /** The server state version of the batch that raised the check. */
  stateVersion: number;
  revealOnStageRef: MutableRefObject<RevealOnStage | null>;
  queuedSecurityKeyRef: MutableRefObject<number | null>;
  securityDockRef: MutableRefObject<{ key: number; closed: boolean } | null>;
  securityHoldRef: MutableRefObject<{ key: number; closed: boolean; handedOver?: boolean } | null>;
  /** Mutated: armed at the reveal, released once the check's battle has been drawn. */
  securityBlowRef: MutableRefObject<{ key: number; landed: boolean; gate: PresentationGate } | null>;
  /** The board this check's battle still needs, held from the reveal until the blow lands. */
  /** The board the battle is fought on; `true` stands the attacker as the reveal found it. */
  blowHoldState: (attackerAsRevealed?: boolean) => GameState | undefined;
  setHeldBlowState: Dispatch<SetStateAction<GameState | undefined>>;
  /** The board at a docked reveal, before the effect it is about to resolve. */
  securityEffectHoldState: () => GameState | undefined;
  /** Mutated: holds the board at a docked reveal until its clause has been read. */
  setHeldSecurityEffectState: Dispatch<SetStateAction<GameState | undefined>>;
  /**
   * Mutated: armed at a docked reveal, its gate opened once the clause is on screen, and
   * cleared once the board it holds has been handed back.
   */
  securityClauseGateRef: MutableRefObject<SecurityClause | null>;
  /** Mutated: pointed at the clause gate, so this batch's consequences wait for it too. */
  causingEffectGateRef: MutableRefObject<PresentationGate | null>;
  /** The latest effect announcement, which a later batch's cause is compared against. */
  effectAnnounceGateRef?: MutableRefObject<PresentationGate | null>;
  heldNoticesRef: MutableRefObject<readonly MatchNotice[]>;
  heldPanelsRef: MutableRefObject<readonly SidePanel[]>;
  setSecurityBreak: Dispatch<SetStateAction<SecurityBreakCue | null>>;
  setSecurityHitSeat: Dispatch<SetStateAction<number | null>>;
  setSecurityClash: Dispatch<SetStateAction<SecurityClashScene | null>>;
  setSecurityBranch: Dispatch<SetStateAction<SecurityBranchScene | null>>;
  setPendingRevealKey: Dispatch<SetStateAction<number | null>>;
  flushHeldNotices: () => void;
  openHeld: (
    ownNotices: readonly MatchNotice[],
    ownPanels: readonly SidePanel[],
    placement?: NarrationPlacement,
  ) => void;
  holdSecurityCard: (key: number, seat: Seat, count: number | undefined) => void;
  releaseSecurityCard: (key: number) => void;
  releaseSecurityCardWhenIdle: (key: number) => void;
  securityCountOf: (seat: Seat) => number | undefined;
}

/**
 * How long a docked security card keeps the centre once its clauses start reading out: one
 * narration beat for each clause after the first, then the read of the last one. Prompts
 * the check asks, and the next centre-stage beat, wait this long after the card docks.
 */
export function securityClauseHoldMs(clauseCount: number): number {
  return TIMINGS.effectSourceHold * Math.max(0, clauseCount - 1) + TIMINGS.securityClauseRead;
}

/** The centre-stage beats a batch can ask of the check currently holding the screen. */
export type SecurityRevealStage = ReturnType<typeof securityRevealScene>;

export function securityRevealScene(deps: SecurityRevealSceneDeps) {
  const {
    queue,
    enqueue,
    viewerSeat,
    replayingHistory,
    stateVersion,
    revealOnStageRef,
    queuedSecurityKeyRef,
    securityDockRef,
    securityHoldRef,
    securityBlowRef,
    blowHoldState,
    setHeldBlowState,
    securityEffectHoldState,
    setHeldSecurityEffectState,
    securityClauseGateRef,
    causingEffectGateRef,
    effectAnnounceGateRef,
    heldNoticesRef,
    heldPanelsRef,
    setSecurityBreak,
    setSecurityHitSeat,
    setSecurityClash,
    setSecurityBranch,
    setPendingRevealKey,
    flushHeldNotices,
    openHeld,
    holdSecurityCard,
    releaseSecurityCard,
    releaseSecurityCardWhenIdle,
    securityCountOf,
  } = deps;

  /**
   * Checks whose battle hold gave the board up. A timed decision does that as soon as it
   * arrives, which can be before the reveal has put the card on screen, so the hold's own
   * clear finds nothing and the card the reveal paints afterwards is left for the close.
   * A close with no battle to restage never clears it, so the card stayed on screen for
   * the rest of the match.
   */
  const handedOver = new Set<number>();

  function stageSecurityReveal(
    key: number,
    scene: SecurityClashScene,
    seat: Seat,
    {
      docking = false,
      countBefore,
      battlePending = true,
    }: { docking?: boolean; countBefore?: number; battlePending?: boolean } = {},
  ) {
    // Only an unfinished check may be replaced. Completed checks still owed to the
    // viewer stay on the serial track, even when their events arrived in one render.
    // Armed with the reveal and released by the outcome, so anything this check deletes
    // in between waits for the blow instead of shattering over a battle not yet drawn.
    //
    // A check with NO battle to draw — a revealed Option, a Tamer, a Digimon whose
    // attacker has already left — arms nothing. Its card docks at the side and the check
    // then runs for as long as the server needs, which for a [Security] effect that asks
    // the viewer a question is until that question is ANSWERED. A gate armed here would
    // be waited on by every deletion in between (deleteBurstStep, under the dock's
    // 45s ceiling) and each of those beats blocks the prompt: the check would be waiting
    // for the answer the client is refusing to ask for. Nothing would draw it either,
    // because there is no blow.
    //
    // Only one check holds the blow at a time, and `releaseSecurityBlow` recognises the
    // current one by key. A check whose outcome lands after the next check has already
    // been staged would therefore find its own gate replaced and never release it, so
    // every deletion it caused would sit under the 45s ceiling with the deleted Digimon
    // still on the board. The superseded check can no longer draw its battle, so its
    // gate is released here as it is retired.
    const superseded = securityBlowRef.current;
    if (superseded !== null && superseded.key !== key) {
      superseded.landed = true;
      superseded.gate.release();
    }
    const blow = { key, landed: !battlePending, gate: createPresentationGate() };
    if (!battlePending) blow.gate.release();
    securityBlowRef.current = blow;
    // The board as it is at the reveal — attacker suspended on the field, cards still in
    // security — is what stays on screen until that battle has been drawn. With no battle
    // coming, holding it would pin the board for the whole check and a Digimon deleted
    // while it runs would stand there as though it had never left.
    setHeldBlowState(battlePending ? blowHoldState() : undefined);
    // A protection cost can trash security immediately before Piercing checks.
    // That paid card must finish its scene before the check takes the centre.
    // A completed earlier check also owes its queued clauses and presentation receipt.
    // Replacing those drops the only narration that releases a nested effect's gate.
    const replace =
      !queue.hasPendingStep(
        (step) =>
          step.id.startsWith("security-destroyed-") ||
          step.id.startsWith("security-notices-late-") ||
          step.id.startsWith("security-presented-"),
      ) &&
      (revealOnStageRef.current !== null || queuedSecurityKeyRef.current === null);
    if (revealOnStageRef.current !== null) flushHeldNotices();
    queuedSecurityKeyRef.current = key;
    // A dock belongs to the check that opened it. Its hold no longer shares a track with
    // the reveal, so a newer check has to retire it by hand rather than by replacement.
    const stale = securityDockRef.current;
    if (stale && stale.key !== key) {
      securityDockRef.current = null;
      setSecurityBranch((current) => (current?.key === stale.key ? null : current));
    }
    // A battle hold is bounded the same way, and for the same reason: it no longer shares
    // a track with the reveal, so a newer check has to retire it by hand.
    const staleHold = securityHoldRef.current;
    if (staleHold && staleHold.key !== key) {
      securityHoldRef.current = null;
      setSecurityClash((current) => (current?.key === staleHold.key ? null : current));
    }
    // The board drops the checked card as soon as its patch lands; the shield keeps the
    // figure that still counts it until the reveal has actually put the card on screen.
    // The server names that figure: one patch can carry a whole run of checks, so the
    // board is already several cards down by the time the first of them is staged.
    holdSecurityCard(key, seat, countBefore ?? securityCountOf(seat));
    enqueue(
      shieldBreakStep({
        queue,
        setSecurityBreak,
        setSecurityHitSeat,
        scene: buildSecurityBreakScene({ key, defenderSeat: seat, viewerSeat }),
        replace,
        ...(replayingHistory ? {} : { clausesThrough: stateVersion }),
        ...(battlePending
          ? {
              afterClauses: () => {
                if (securityBlowRef.current?.key === key && !securityBlowRef.current.landed)
                  setHeldBlowState(blowHoldState(true));
              },
            }
          : {}),
      }),
    );
    void queue.idle().then(() => {
      if (queuedSecurityKeyRef.current === key) queuedSecurityKeyRef.current = null;
    });
    // Everything the check will present is held back from here until the reveal has
    // been seen. Cleared by the presentation step, and by the queue going idle in
    // case a newer cue took the centre of the screen before the scene got there.
    if (!replayingHistory) setPendingRevealKey(key);
    // The scene is two steps, not one, so a click through it collapses the half
    // that is only spectacle. Up to the outcome the cards have to stay legible,
    // motion preference or not; the blow, the shatter and the fade after it are
    // decoration the board can be taken back from at any time.
    enqueue({
      id: `security-clash-${key}`,
      track: CueTrack.CenterStage,
      skippable: false,
      async run(context) {
        try {
          setSecurityClash(scene);
          await context.wait(CLASH_REVEAL_SHOWN_AT_MS);
          // React may mount the card after the queue clock starts. Keep the shield's
          // preceding count through the native reveal, including its CSS lead-in.
          await waitForPaintedAnimation(
            () =>
              typeof document === "undefined" ? null : document.querySelector(`.battle-clash[data-scene-key="${key}"]`),
            "battle-security-reveal",
            TIMINGS.clashReveal,
            context,
          );
          // The card is out of the stack and on the screen, so the shield may drop.
          releaseSecurityCard(scene.key);
          await context.wait((docking ? CLASH_DOCK_AT_MS : CLASH_OUTCOME_AT_MS) - CLASH_REVEAL_SHOWN_AT_MS);
          if (handedOver.has(scene.key)) {
            await exitSecurityCard({ key: scene.key, context, setSecurityClash });
            setSecurityClash((current) => (current?.key === scene.key ? null : current));
            return;
          }
          if (!docking) return;
          // Keep the source geometry mounted through the next step's layout effect.
          // The dock carries the same card directly to its final position, while this
          // scene hides the old art and clears after the transfer finishes.
          setSecurityClash((current) => (current?.key === scene.key ? { ...current, departing: true } : current));
        } finally {
          // A cancelled scene must not leave a card the shield keeps counting for good.
          releaseSecurityCard(scene.key);
          if (context.cancelled) setSecurityClash((current) => (current?.key === scene.key ? null : current));
        }
      },
    });
    releaseSecurityCardWhenIdle(key);
  }

  /**
   * Parks the revealed card at the side of the screen and LEAVES it there. The reference
   * client docks a card with a `[Security]` effect in its brainstorm slot and resolves the
   * effect — every target pick, every optional yes/no — with the card still on screen,
   * closing the slot only once the card is disposed.
   *
   * The dock is therefore open-ended, and the centre-stage track is serial, so it is
   * bounded in every direction it can be: it ends on the matching `securityChecked`, on a
   * newer reveal replacing the track, on cancellation, and at the latest on
   * `TIMINGS.securityDockMax`.
   */
  function dockSecurityReveal(
    key: number,
    dock: SecurityBranchScene,
    own: { notices: readonly MatchNotice[]; panels: readonly SidePanel[] },
  ) {
    securityDockRef.current = { key, closed: false };
    // The server applies the effect straight after the reveal, so what it did would land
    // while the card is still growing into place. Everything it does waits for its clause
    // instead: the board is held as it stands now, and every consequence cue waits on this
    // gate the way it waits on any other effect's announcement.
    const clause: SecurityClause = {
      key,
      gate: createPresentationGate(),
      releaseBoard: () => releaseBoard(),
      own,
      docking: false,
      effectAtDock: effectAnnounceGateRef?.current,
    };
    securityClauseGateRef.current?.releaseBoard();
    securityClauseGateRef.current = clause;
    causingEffectGateRef.current = clause.gate;
    const heldBoard = replayingHistory ? undefined : securityEffectHoldState();
    setHeldSecurityEffectState(heldBoard);
    const releaseClause = () => clause.gate.release();
    const releaseBoard = () => {
      clearTimeout(ceiling);
      releaseClause();
      if (securityClauseGateRef.current === clause) securityClauseGateRef.current = null;
      setHeldSecurityEffectState((current) => (current === heldBoard ? undefined : current));
    };
    // The step below can be dropped or kept waiting behind a long centre-stage beat, and the
    // board must never wait on it longer than the consequences themselves would.
    const ceiling = setTimeout(releaseBoard, CONSEQUENCE_GATE_MAX_MS);
    enqueue({
      id: `security-dock-in-${key}`,
      track: CueTrack.CenterStage,
      // It carries the revealed card, which is the one thing on screen worth reading.
      skippable: false,
      onDiscard() {
        releaseBoard();
        setSecurityClash((current) => (current?.key === key ? null : current));
      },
      async run(context) {
        try {
          clause.docking = true;
          setSecurityBranch(dock);
          await context.wait(SECURITY_BRANCH_IN_MS);
          setSecurityClash((current) => (current?.key === key ? null : current));
          if (context.cancelled) return;
          // Docked and legible: the card's OWN clause may be read out now, and the decision
          // it asks for may open beside it — the reference client opens its panel here.
          // Only its own: anything a card it went on to play caused belongs to a later cue.
          openHeld(own.notices, own.panels, { next: true, beside: true });
          // Its clauses read out one after another ("[Security] Activate [Main]", then the
          // [Main] itself), so what they did waits until the last of them is on screen.
          const holdMs = securityClauseHoldMs(own.notices.length);
          await context.wait(holdMs - TIMINGS.securityClauseRead);
          if (context.cancelled) return;
          releaseClause();
          // The clause reads on its own first; then the board plays out what it did beside
          // the card, which holds the centre until both have had their time.
          await context.wait(TIMINGS.effectAnnounce);
          releaseBoard();
          await context.wait(TIMINGS.securityClauseRead - TIMINGS.effectAnnounce);
        } finally {
          setSecurityClash((current) => (current?.key === key && current.departing ? null : current));
          if (context.cancelled) setSecurityBranch((current) => (current?.key === key ? null : current));
          releaseBoard();
          setPendingRevealKey((current) => (current === key ? null : current));
        }
      },
    });
    // The hold runs on its own track. It ends only when the check closes, which the
    // server may take several batches to reach, and everything the check causes in the
    // meantime — the played card entering the field, its [On Play] notice, the panel of
    // cards it revealed — has to be able to queue behind the dock's ARRIVAL rather than
    // behind its departure.
    enqueue({
      id: `security-dock-hold-${key}`,
      track: CueTrack.SecurityDock,
      skippable: false,
      async run(context) {
        // Replay collapses every wait, so there is no time to hold the card through and
        // a poll would spin: a replayed check goes straight to its final state.
        if (context.mode === "replay") return;
        let waitedMs = 0;
        try {
          while (!context.cancelled && waitedMs < TIMINGS.securityDockMax) {
            const held = securityDockRef.current;
            if (held === null || held.key !== key || held.closed) return;
            await context.wait(TIMINGS.securityDockPoll);
            waitedMs += TIMINGS.securityDockPoll;
          }
          // Cancelled, or the close never came: the card is not left parked for good.
          setSecurityBranch((current) => (current?.key === key ? null : current));
        } finally {
          if (securityDockRef.current?.key === key) securityDockRef.current = null;
          if (context.cancelled) setSecurityBranch((current) => (current?.key === key ? null : current));
        }
      },
    });
  }

  /** The check has closed; remove its execution card after the queued consequences. */
  function undockSecurityReveal(key: number) {
    const held = securityDockRef.current;
    if (held?.key === key) held.closed = true;
    enqueue({
      id: `security-dock-out-${key}`,
      track: CueTrack.CenterStage,
      skippable: false,
      onDiscard() {
        setSecurityBranch((current) => (current?.key === key ? null : current));
      },
      run() {
        setSecurityBranch((current) => (current?.key === key ? null : current));
      },
    });
  }

  /**
   * Plays the reveal out to its end and takes it off the screen. A check the server is
   * still resolving used to keep the card centre-stage the whole time, so its effects —
   * their notices, their prompts — read from behind the card that caused them. The card
   * leaves first instead, and the board it hands over is clear.
   */
  function clearSecurityReveal(key: number) {
    enqueue({
      id: `security-clash-exit-${key}`,
      track: CueTrack.CenterStage,
      // The card is the one thing on screen worth reading, so its last beat keeps its time.
      skippable: false,
      onDiscard() {
        setSecurityClash((current) => (current?.key === key ? null : current));
        setPendingRevealKey((current) => (current === key ? null : current));
      },
      async run(context) {
        try {
          await exitSecurityCard({ key, context, setSecurityClash });
        } finally {
          setSecurityClash((current) => (current?.key === key ? null : current));
          if (context.cancelled) setPendingRevealKey((current) => (current === key ? null : current));
        }
      },
    });
  }

  /**
   * Keeps the revealed Digimon centre-stage until the server says how its battle ended.
   * The engine closes a check only once everything that check caused has resolved, so a
   * removal reaction that stops to ask a question — even a bot's, which took 2.7s in the
   * log this was written from — lands between the reveal and the outcome. Letting the card
   * leave in that gap put the attacker's death on screen seconds before the blow that
   * dealt it, and then flashed the card back for its outcome beat on a board it had
   * already handed over. It waits here instead, and the outcome plays on the card itself.
   *
   * Open-ended, so it is bounded in every direction it can be, exactly as the dock is: it
   * ends on the matching `securityChecked`, on a newer reveal claiming the key, on
   * cancellation, and at the latest on `TIMINGS.securityDockMax`.
   */
  function holdSecurityReveal(key: number) {
    securityHoldRef.current = { key, closed: false };
    enqueue({
      id: `security-clash-hold-${key}`,
      track: CueTrack.SecurityHold,
      skippable: false,
      async run(context) {
        // Replay collapses every wait, so there is no time to hold the card through and
        // a poll would spin: a replayed check goes straight to its final state.
        if (context.mode === "replay") return;
        let waitedMs = 0;
        try {
          while (!context.cancelled && waitedMs < TIMINGS.securityDockMax) {
            const held = securityHoldRef.current;
            if (held === null || held.key !== key) return;
            if (held.closed) return;
            if (held.handedOver) {
              giveUp();
              return;
            }
            await context.wait(TIMINGS.securityDockPoll);
            waitedMs += TIMINGS.securityDockPoll;
          }
          // Cancelled, or the close never came: the card is not left on stage for good.
          giveUp();
        } finally {
          if (securityHoldRef.current?.key === key) securityHoldRef.current = null;
          if (context.cancelled) giveUp();
        }
        // The card has left without its verdict, so the close that eventually arrives has
        // to bring it back for its battle rather than settle a scene no longer on screen.
        function giveUp() {
          handedOver.add(key);
          setSecurityClash((current) => (current?.key === key ? null : current));
          const staged = revealOnStageRef.current;
          if (staged?.key === key) revealOnStageRef.current = { ...staged, exited: true };
        }
      },
    });
  }

  /** Reads out what the check has to say, beside the card it is about. */
  function readOutSecurityNotices(
    key: number,
    own?: { notices: readonly MatchNotice[]; panels: readonly SidePanel[] },
  ) {
    // Reserve this check's notices now so a later check cannot read or flush them.
    const notices = own?.notices ?? heldNoticesRef.current;
    const panels = own?.panels ?? heldPanelsRef.current;
    if (!own) {
      heldNoticesRef.current = [];
      heldPanelsRef.current = [];
    }
    enqueue({
      id: `security-notices-${key}`,
      track: CueTrack.CenterStage,
      skippable: false,
      run() {
        openHeld(notices, panels, { next: true });
      },
    });
  }

  /**
   * Hands the board back. The check has now said everything it has to say: the card was
   * revealed, it fought or took its place at the side, and its clause is on screen. Only
   * here do the decisions it asks for get a surface. Clearing this at the outcome beat
   * instead opened a prompt over a card that had not reached the side yet.
   */
  function releaseSecurityPresentation(key: number) {
    enqueue({
      id: `security-presented-${key}`,
      track: CueTrack.CenterStage,
      skippable: false,
      run() {
        setPendingRevealKey((current) => (current === key ? null : current));
      },
    });
    // A cue that never reached the screen must not leave the check's presentation
    // held back for good, so the flag is dropped at the latest when nothing is running.
    if (!replayingHistory) {
      void queue.idle().then(() => setPendingRevealKey((current) => (current === key ? null : current)));
    }
  }

  /** Reads out what the check has to say, then hands the board back to the player. */
  function presentSecurityReveal(key: number) {
    readOutSecurityNotices(key);
    releaseSecurityPresentation(key);
  }

  /**
   * Let go of whatever this check's battle was holding back. Called from every path that
   * ends a check — the outcome beat, a close with no battle to draw, a cancelled scene —
   * because a gate this one-sided wedges the shatter forever if a path forgets it.
   */
  function releaseSecurityBlow(key: number) {
    const blow = securityBlowRef.current;
    if (blow?.key !== key) return;
    blow.landed = true;
    blow.gate.release();
    setHeldBlowState(undefined);
  }

  return {
    stageSecurityReveal,
    releaseSecurityBlow,
    dockSecurityReveal,
    undockSecurityReveal,
    clearSecurityReveal,
    holdSecurityReveal,
    readOutSecurityNotices,
    releaseSecurityPresentation,
    presentSecurityReveal,
  };
}
