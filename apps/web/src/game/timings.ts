/* Every duration the match screen animates to, in one table. The table lives in
   @aegis/shared so the server computes timed-match clock pauses from the same numbers.
   TypeScript reads the numbers directly; CSS reads them as custom properties set on the battle
   root (see `BATTLE_TIMING_STYLE`), so a keyframe and the timeout that unmounts
   its element can never drift apart.

   Each `var(--t-*)` in game.css carries the same number as its literal fallback,
   because overlays portalled to `document.body` sit outside the battle root and
   would otherwise animate with no duration at all. `timings.test.ts` fails if a
   fallback stops matching the table. */

import type { CSSProperties } from "react";
import { ANIMATION_TIMINGS } from "@aegis/shared";

/** The shared table of animation lengths (packages/shared, protocol/animationTimings.ts). */
export const TIMINGS = ANIMATION_TIMINGS;

export type TimingName = keyof typeof TIMINGS;

/** The revealed card enters once the attacker has taken its place. */
export const CLASH_REVEAL_AT_MS = TIMINGS.clashAttackerEnter;

/** The outcome beat starts when the hold is over. */
export const CLASH_OUTCOME_AT_MS = CLASH_REVEAL_AT_MS + TIMINGS.clashReveal + TIMINGS.clashHold;

/**
 * When the revealed card has finished growing into place. The card has left the stack by
 * then, so this is the beat the defender's shield finally drops its figure — the reference
 * client reduces the stack right after the same clip.
 */
export const CLASH_REVEAL_SHOWN_AT_MS = CLASH_REVEAL_AT_MS + TIMINGS.clashReveal;

/** End to end, which is also how long the scene stays mounted. */
export const CLASH_TOTAL_MS = CLASH_OUTCOME_AT_MS + TIMINGS.clashOutcome + TIMINGS.clashExit;

/**
 * A card bound for its effect dock moves once the reveal's 170 ms light/recognition
 * beat finishes. The additional 300 ms battle preparation belongs only to the compare.
 */
export const CLASH_DOCK_AT_MS = CLASH_REVEAL_SHOWN_AT_MS + TIMINGS.securityRevealLight;

/** The revealed card has reached the dock; there is no intervening fade or second entrance. */
export const CLASH_DOCK_LEAVE_MS = CLASH_DOCK_AT_MS + TIMINGS.securityBranchIn;

/** Shield break, end to end: the arm, the shatter, and the held frames after it. */
export const SECURITY_BREAK_TOTAL_MS = TIMINGS.securityArm + TIMINGS.shieldBreak + TIMINGS.securityBreakHold;

/** How long the revealed card takes to slide out to the side it reads out from. */
export const SECURITY_BRANCH_IN_MS = TIMINGS.securityBranchIn;

/**
 * When a destroyed security card breaks. It faces no attacker, so the beat starts as
 * soon as the card has grown into place and been held.
 */
export const SECURITY_DESTROY_OUTCOME_AT_MS =
  TIMINGS.clashAttackerEnter + TIMINGS.clashReveal + TIMINGS.securityDestroyHold;

/** One destroyed security card, end to end: the reveal, the hold, the break and the fade. */
export const SECURITY_DESTROY_TOTAL_MS = SECURITY_DESTROY_OUTCOME_AT_MS + TIMINGS.cardShatter + TIMINGS.clashExit;

/** A resolved execution slot closes directly; its clause and consequences have already read. */
export const SECURITY_DOCK_CLOSE_MS = 0;

/** The security-effect branch, end to end: the slide out, the hold, and the exit. */
export const SECURITY_BRANCH_TOTAL_MS =
  TIMINGS.securityBranchIn + TIMINGS.securityBranchHold + TIMINGS.securityBranchOut;

/** The centre-screen showcase, end to end: how long it stays mounted. */
export const SHOWCASE_TOTAL_MS = TIMINGS.showcaseIn + TIMINGS.showcaseFace + TIMINGS.showcaseHold + TIMINGS.showcaseOut;

/**
 * The ceiling on how long the beats that explain a play may hold back what the play
 * caused: the deletions it dealt out, and the viewer's own prompt.
 *
 * A showcase and an [On Play] clause add up past what anyone will sit through,
 * and each thing held back pays for the wait differently. The deletion cue is drawn where
 * the permanent used to stand — the board drops it with the server's patch, not with the
 * cue — so the longer the cue waits, the further it drifts from the card leaving. The
 * prompt has the harder requirement: it must open even when a beat never runs at all (a
 * replaced track, an event that never arrived), which is why its hold is a wall clock
 * rather than a queued step, and why that clock needs a ceiling.
 */
export const PLAY_LEAD_IN_BUDGET_MS = 4000;

/**
 * How long the viewer's prompt may stay closed with the queue making no progress at all.
 *
 * `PLAY_LEAD_IN_BUDGET_MS` bounds how far the *board* may lag behind the question. It does
 * not bound the other gate: the prompt also waits for every finite beat to finish, and that
 * wait has no clock. A beat that starts and never finishes — a main thread that stalls, a
 * transition whose end event never fires — therefore holds the prompt closed forever, and
 * the match is stuck, because the server cannot move until the answer arrives.
 *
 * So the wait is on progress, not on total time: every queue change restarts this clock, and
 * only a queue that has gone this long without a single change is treated as stalled. A long
 * but healthy sequence of beats keeps its full run; a frozen one hands the prompt over.
 *
 * Ten seconds, because no single beat comes close to it — the longest hold in `TIMINGS` is
 * `noticeLifetime`, and narration reads outside the queue. Anything past this is broken, not
 * slow, so the clock never cuts a beat that was going to finish.
 */
export const DECISION_STALL_BUDGET_MS = 10_000;

/** When the card begins its narrow upward exit. The field waits until that exit finishes. */
export const SHOWCASE_OUT_AT_MS = TIMINGS.showcaseIn + TIMINGS.showcaseFace + TIMINGS.showcaseHold;

/** The revealed-cards showcase, end to end: how long it stays mounted. */
export const REVEAL_SHOWCASE_TOTAL_MS =
  TIMINGS.revealShowcaseIn + TIMINGS.revealShowcaseHold + TIMINGS.revealShowcaseOut;

/** When the revealed-cards showcase starts clearing out. */
export const REVEAL_SHOWCASE_OUT_AT_MS = TIMINGS.revealShowcaseIn + TIMINGS.revealShowcaseHold;

/**
 * The landing/draw handoff remains 200ms while the independent particles continue.
 * This is a presentation gate, not the peak of every emitter's alpha curve.
 */
export const CARD_BURST_PEAK_MS = 200;

/** A shake and the beat held after it — how long a shake cue owns its track. */
export const CARD_SHAKE_TOTAL_MS = TIMINGS.cardShake + TIMINGS.cardShakeHold;

/** The claw and the shake run together, so the impact ends when the held beat does. */
export const COMBAT_IMPACT_TOTAL_MS = Math.max(TIMINGS.clawSlash, TIMINGS.cardShake) + TIMINGS.cardShakeHold;

/** The accepted arrow extends twice, then stays attached to its live endpoints. */
export const ARROW_SWEEP_COUNT = 2;

/** Each extension and its readable hold share one CSS animation cycle. */
export const ARROW_SWEEP_CYCLE_MS = TIMINGS.arrowExtend + TIMINGS.arrowHold;

/** Both sweeps and the final settle before the next attack beat. */
export const ARROW_SWEEP_TOTAL_MS = ARROW_SWEEP_CYCLE_MS * ARROW_SWEEP_COUNT + TIMINGS.arrowHold;

/** The cards stay in their slots; the blow follows the target-arrow sequence. */
export const FIELD_CLASH_IMPACT_AT_MS = ARROW_SWEEP_TOTAL_MS;

/** A board battle end to end: target arrow followed by claw, shake and settle. */
export const FIELD_CLASH_TOTAL_MS = FIELD_CLASH_IMPACT_AT_MS + COMBAT_IMPACT_TOTAL_MS;

/** A DP pulse, end to end: the particles plus the beat the new figure is held on. */
export function dpPulseTotalMs(fatal: boolean): number {
  return TIMINGS.dpPulse + (fatal ? TIMINGS.dpPulseFatalHold : TIMINGS.dpPulseHold);
}

/** The custom properties game.css reads, and the milliseconds behind each one. */
export const BATTLE_TIMING_VARIABLES: Readonly<Record<string, number>> = {
  "--t-draw-flight": TIMINGS.drawFlight,
  "--t-hand-draw": TIMINGS.handDraw,
  "--t-hand-draw-ring": TIMINGS.handDrawRing,
  "--t-card-enter": TIMINGS.cardEnter,
  "--t-card-sparkle": TIMINGS.cardSparkle,
  "--t-memory-marker-pop": TIMINGS.memoryMarkerPop,
  "--t-memory-sweep": TIMINGS.memorySweep,
  "--t-memory-arc": TIMINGS.memoryArc,
  "--t-memory-glow": TIMINGS.memoryGlow,
  "--t-attack-arrow-chevron": TIMINGS.attackArrowChevron,
  "--t-attack-announce-in": TIMINGS.attackAnnounceIn,
  "--t-security-hit": TIMINGS.securityHit,
  "--t-security-arm": TIMINGS.securityArm,
  "--t-shield-break": TIMINGS.shieldBreak,
  "--t-shield-flash": TIMINGS.shieldFlash,
  "--t-security-branch": SECURITY_BRANCH_TOTAL_MS,
  "--t-security-branch-in": TIMINGS.securityBranchIn,
  "--t-security-branch-hold": TIMINGS.securityBranchHold,
  "--t-security-branch-out": TIMINGS.securityBranchOut,
  "--t-security-count-pop": TIMINGS.securityCountPop,
  "--t-summoning-orbit": TIMINGS.summoningOrbit,
  "--t-clash-enter": TIMINGS.clashAttackerEnter,
  "--t-clash-reveal": TIMINGS.clashReveal,
  "--t-security-reveal-light": TIMINGS.securityRevealLight,
  "--t-clash-outcome": TIMINGS.clashOutcome,
  "--t-clash-outcome-at": CLASH_OUTCOME_AT_MS,
  "--t-clash-exit": TIMINGS.clashExit,
  "--t-security-card-exit": TIMINGS.securityCardExit,
  "--t-showcase-total": SHOWCASE_TOTAL_MS,
  "--t-showcase-in": TIMINGS.showcaseIn,
  "--t-showcase-face": TIMINGS.showcaseFace,
  "--t-showcase-out": TIMINGS.showcaseOut,
  "--t-reveal-showcase-in": TIMINGS.revealShowcaseIn,
  "--t-reveal-showcase-out": TIMINGS.revealShowcaseOut,
  "--t-showcase-out-at": SHOWCASE_OUT_AT_MS,
  "--t-reveal-showcase-out-at": REVEAL_SHOWCASE_OUT_AT_MS,
  "--t-card-burst": TIMINGS.cardBurst,
  "--t-draw-burst": TIMINGS.drawBurst,
  "--t-turn-banner": TIMINGS.turnBanner,
  "--t-side-panel-in": TIMINGS.sidePanelIn,
  "--t-notice-in": TIMINGS.noticeIn,
  "--t-effect-notice-in": TIMINGS.effectNoticeIn,
  "--t-dialog-in": TIMINGS.dialogIn,
  "--t-board-prompt-in": TIMINGS.boardPromptIn,
  "--t-fate-badge-in": TIMINGS.fateBadgeIn,
  "--t-memory-prediction": TIMINGS.memoryPrediction,
  "--t-spotlight-in": TIMINGS.spotlightIn,
  "--t-spotlight-pulse": TIMINGS.spotlightPulse,
  "--t-card-shake": TIMINGS.cardShake,
  "--t-claw-slash": TIMINGS.clawSlash,
  "--t-dp-pulse": TIMINGS.dpPulse,
  "--t-phase-banner": TIMINGS.phaseBanner,
  "--t-turn-control-pulse": TIMINGS.turnControlPulse,
  "--t-log-sidebar": TIMINGS.logSidebar,
  "--t-freeze-shake": TIMINGS.freezeShake,
  "--t-status-pulse": TIMINGS.statusPulse,
  "--t-deck-riffle": TIMINGS.deckRiffle,
  "--t-landing-bounce": TIMINGS.landingBounce,
  "--t-security-flight": TIMINGS.securityFlight,
  "--t-arrow-flash": TIMINGS.arrowFlash,
  "--t-arrow-sweep-cycle": ARROW_SWEEP_CYCLE_MS,
  "--t-card-magnify": TIMINGS.cardMagnify,
  "--t-effect-source-hold": TIMINGS.effectSourceHold,
  "--t-effect-linked-breath": TIMINGS.effectLinkedBreath,
  "--t-effect-source-pulse": TIMINGS.effectSourcePulse,
  "--t-effect-trash-rise": TIMINGS.effectTrashRise,
  "--t-effect-hand-rise": TIMINGS.effectHandRise,
  "--t-card-shatter": TIMINGS.cardShatter,
  "--t-deletion-burst": TIMINGS.deletionBurst,
  "--t-stack-strip-peel": TIMINGS.stackStripPeel,
  "--t-deck-return": TIMINGS.deckReturn,
  "--t-hand-return": TIMINGS.handReturn,
};

/**
 * Spread onto the battle root so every keyframe below it reads its duration from
 * this table.
 */
export const BATTLE_TIMING_STYLE: CSSProperties = Object.fromEntries(
  Object.entries(BATTLE_TIMING_VARIABLES).map(([name, ms]) => [name, `${ms}ms`]),
) as CSSProperties;
