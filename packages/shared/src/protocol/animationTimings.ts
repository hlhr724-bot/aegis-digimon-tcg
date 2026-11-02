/* The single table of match animation lengths, shared by the client and the server.

   The web client animates to these numbers (apps/web/src/game/timings.ts re-exports the
   table and sets the CSS custom properties from it). The server reads the same numbers to
   decide how long a timed player's clock waits while their screen plays a batch
   (`eventAnimationMs` in ./animationPause.ts). Change a length here and both sides move. */

export const ANIMATION_TIMINGS = {
  /** Card back flying from a deck pile to the hand that just grew. */
  drawFlight: 340,
  /** The same trip on a phone, where a 340ms flicker across the screen went unnoticed. */
  drawFlightTouch: 520,
  /** The drawn card dropping into its hand slot. */
  handDraw: 80,
  /** Draw beside the deck: move, recognition hold, narrowing and upward exit. */
  drawPresentationIn: 60,
  drawPresentationHold: 90,
  drawPresentationOpponentHold: 50,
  drawPresentationNarrow: 70,
  drawPresentationUp: 70,
  drawLightRays: 100,
  drawLightGlow: 190,
  /** The hand starts while the last 80 ms of the temporary card are still visible. */
  drawPresentationHandoff: 60,
  /** The accent ring left on the new hand card on touch, so the eye can find it in the strip. */
  handDrawRing: 900,
  /** A card arriving in the battle area. */
  cardEnter: 320,
  /** The stars that pop over a card that just landed. */
  cardSparkle: 900,
  /** The memory marker landing on its new chip. */
  memoryMarkerPop: 300,
  /** Each chip the memory value travelled across lighting up. */
  memorySweep: 120,
  /** The red arc tracing from the chip memory left to the one it landed on. */
  memoryArc: 520,
  /** One breath of the yellow ring around the chip memory currently sits on. */
  memoryGlow: 1600,
  /** Two 85 ms extensions, two 70 ms holds and a final 70 ms settle. */
  attackArrow: 380,
  attackArrowChevron: 160,
  /** How long the attack call-out stays up. Long enough to read a card name, and no longer. */
  attackAnnounce: 800,
  /** The call-out fading in. */
  attackAnnounceIn: 140,
  /** The security shield flashing when a card is actually checked. */
  securityHit: 350,
  /**
   * The defender's shield arming — the blue glass the reference client switches to.
   * It arms at the declaration there, not at the check, so
   * this is only the beat the web needs for the change of glass to register.
   */
  securityArm: 120,
  /** The glass pane shattering (the reference client's `SecurityBreakGlass`, 250 ms). */
  shieldBreak: 250,
  /** The light that washes in from the defender's edge of the screen as the shield breaks. */
  shieldFlash: 320,
  /**
   * The beat held between the shatter and the reveal. The reference client holds
   * 60 + 170 + 100 ms there, but it
   * spends them spawning a colour burst *after* the glass; the web port fires its burst
   * with the shatter, so those frames would be a stall with the centre of the screen
   * still empty. What is left is the remainder the 350 ms shield shake needs past the
   * 250 ms shatter, so the break phase ends on its own last moving frame.
   */
  securityBreakHold: 100,
  /** The revealed security card sliding out to its own side of the screen. */
  securityBranchIn: 120,
  /** How long the revealed card holds there while its effect notice reads. The notice outlives it. */
  securityBranchHold: 900,
  /** The card leaving for the trash or the field. */
  securityBranchOut: 220,
  /**
   * How long a docked security card keeps the centre of the screen once its [Security]
   * clause is on screen, before the check moves on to the next beat or opens a prompt.
   * What the clause does starts `effectAnnounce` into this hold, so the clause is read
   * first and its result is watched beside the card that caused it.
   */
  securityClauseRead: 1600,
  /** Minimum readable hold for a used Option in the effect dock. */
  optionDockHold: 600,
  /** How often the open-ended dock re-checks whether its check has closed. */
  securityDockPoll: 120,
  /**
   * The ceiling on that wait. The dock ends on the matching `securityChecked`, but the
   * centre-stage track is serial, so a close that never arrives (a dropped event, a
   * server that stopped answering) may not hold the track for the rest of the match.
   */
  securityDockMax: 45_000,
  /**
   * How long a security card an effect trashed is held readable before it breaks
   * (the reference client's 0.5 s between the reveal and `DestroySecurityEffect`).
   * It is the whole beat the player gets to see which card the stack just lost, so
   * it is longer than any hold the check itself takes.
   */
  securityDestroyHold: 500,
  /** The security counter popping as it decrements. */
  securityCountPop: 300,
  /** One permanent's 90° suspend or unsuspend rotation. */
  suspendRotate: 200,
  /** Delay added per board slot so an unsuspend phase sweeps rather than snaps. */
  suspendStagger: 60,
  /** One lap of the stars orbiting a permanent that cannot attack yet. */
  summoningOrbit: 4200,
  /** Centre-stage security check: the attacker sliding in to face the reveal. */
  clashAttackerEnter: 150,
  /** The revealed security card growing into place. */
  clashReveal: 233,
  /** Blue rays at the revealed card, before battle preparation. */
  securityRevealLight: 170,
  /** Recognition after the reveal: 170 ms, then the 300 ms battle preparation. */
  clashHold: 470,
  /**
   * The outcome beat: the reference client's parallel 250ms claw and shake, then its 100ms
   * settle.
   */
  clashOutcome: 350,
  /** The scene fading back out, on the turn banner's 160ms wipe. */
  clashExit: 160,
  /** A checked card narrows for 70 ms, then rises for 70 ms after its result. */
  securityCardExit: 140,
  /** The white card turning face-on before its art appears. */
  showcaseIn: 100,
  /** White into the printed face. */
  showcaseFace: 160,
  /** Brief recognition hold after the face is visible. */
  showcaseHold: 160,
  /** Two equal beats: narrow/stretch, then move upward. */
  showcaseOut: 140,
  /** Multi-card reveals retain their own reading and entrance/exit budgets. */
  revealShowcaseIn: 160,
  revealShowcaseOut: 160,
  /**
   * How long cards an opponent's effect revealed stay centre-screen. Longer than a single
   * played card's hold: the viewer reads a row of cards, not one.
   */
  revealShowcaseHold: 2200,
  /** The six colour-light emitters, including their last continuous-rate birth. */
  cardBurst: 1150,
  /** The starburst at the hand slot where a turn-start draw lands. */
  drawBurst: 600,
  /** Full-width turn announcement, including its entrance and exit. */
  turnBanner: 1000,
  /** How long a framed notice stays readable on its own. Long enough to read a whole clause, not just recognise it. */
  noticeLifetime: 6000,
  /** A notice sliding in from its anchor. */
  noticeIn: 200,
  /** The accepted effect clause slides in over100 ms with OutQuad. */
  effectNoticeIn: 100,
  /** How long a rejected action stays readable. */
  feedEffect: 7200,
  /** How long a side panel stays readable. Nothing on the board shortens it. */
  sidePanelLifetime: 7000,
  /** Cards moved within this window join the panel already open. */
  sidePanelMergeWindow: 1500,
  /** A side panel opening. */
  sidePanelIn: 230,
  /** A match dialog opening. */
  dialogIn: 180,
  /** The board-mode decision rail sliding in from the left edge. */
  boardPromptIn: 200,
  /** Hover intent before an opponent permanent opens its inspector. */
  inspectorOpen: 320,
  /** Grace period before the inspector closes again. */
  inspectorClose: 160,
  /** A pending-fate badge dropping onto the target that just got picked. */
  fateBadgeIn: 180,
  /** The dashed prediction arc fading in under the memory chips. */
  memoryPrediction: 200,
  /** The targeting mask darkening the board around the legal targets. */
  spotlightIn: 220,
  /** One breath of the ring around a lit target inside the mask. */
  spotlightPulse: 1600,
  /** The reference client's 0.25s card shake (`DOShakePosition`), on a refusal and on a lost battle. */
  cardShake: 250,
  /** The beat the reference client holds after a shake before it moves on. */
  cardShakeHold: 100,
  /** The claw sweeping across a permanent that lost its battle (0.25s, ease-in-cubic). */
  clawSlash: 250,
  /** The particles a DP change throws off. */
  dpPulse: 520,
  /** The reference client holds a DP change 0.1s … */
  dpPulseHold: 100,
  /** … and four times as long when the debuff is the one that kills. */
  dpPulseFatalHold: 400,
  /**
   * The beat a phase ribbon needs to be on screen at all, which the demos wait out before
   * they read one. The ribbon's own keyframes (`arena-phase-ribbon`) split `phaseBanner`
   * 25/50/25, so at 1100 ms it enters for 275, holds legible for 550 and leaves for 275.
   */
  phaseBannerIn: 200,
  /** Readable phase announcement, including its entrance and exit. */
  phaseBanner: 1100,
  /** Clear-board pause between consecutive turn and phase announcements. */
  phaseBannerGap: 250,
  /**
   * The beat a clause raised before a phase or turn announcement gets to itself.
   *
   * A notice reads for `noticeLifetime`, but the ribbon that follows it covers the whole
   * column and a turn change queues five of them back to back — long enough for the clause
   * to outlive the ribbons and read as something the NEXT turn did. So the ribbon waits
   * this out and then takes what it would have covered off the screen (useMatchCues.ts).
   */
  phaseBannerNoticeRead: 1600,
  /** One lap of the ring turning around the turn control while it is actionable. */
  turnControlPulse: 3200,
  /** How long the turn control refuses a second click after the first (a UI guard, not a rule). */
  turnControlCover: 1500,
  /** The play log sliding out of, and back into, the right edge. */
  logSidebar: 160,
  /** The jolt a permanent takes when an attack or block lock lands on it (0.2 s). */
  freezeShake: 200,
  /** The glow a permanent shows when an effect grants or takes something other than DP. */
  statusPulse: 600,
  /** One riffle of a deck pile being shuffled. */
  deckRiffle: 180,
  /** A card that just landed settling on its OutBounce drop. */
  landingBounce: 100,
  /** A recovered card spinning back onto the security stack. */
  securityFlight: 200,
  /** The gap between two cards of the opening five-card security deal. Paced in the cue
   * queue rather than in CSS: each card is its own flight. */
  securityDealStagger: 130,
  /** The gap between the card backs of one multi-card effect draw. Paced in the cue queue
   * for the same reason the deal is: each card is its own flight on its own track. */
  drawFlightStagger: 110,
  /** The defender's attack label flashing. */
  arrowFlash: 85,
  /** Each of the target arrow's two extensions. */
  arrowExtend: 85,
  /** The hold after an extension, also used for the final settle. */
  arrowHold: 70,
  /** A card growing to its inspected size. */
  cardMagnify: 120,
  /**
   * The glow and lift a field permanent holds while its effect activates, before its toast
   * appears. Paced to be watched rather than caught: at half a second the rise was over
   * before the eye had found the card it happened on, which is the one thing this beat
   * exists to do. The whole activation family below is pitched to match it.
   */
  effectSourceHold: 720,
  /**
   * One breath of the steady light the source card holds for as long as its clause is on
   * screen. Slow on purpose: it has to stay legible under a toast that reads for seconds
   * without becoming the thing being looked at.
   */
  effectLinkedBreath: 1600,
  /** Short source-local activation halo; the accepted effect's orientation hold continues after it. */
  effectSourcePulse: 360,
  /**
   * How long a security check waits for the clauses the attack already raised.
   *
   * A [When Attacking] effect resolves server-side before the security card is revealed,
   * but its toast spends `effectSourceHold` glowing the source card first, so the shield
   * broke while the clause was still on its way in and the check read as having happened
   * first. The break waits the clauses out, bounded so a column that keeps filling can
   * never hold the check for good.
   */
  securityClauseLead: 1400,
  /**
   * The beat between the two halves of one moment: the clause on the left, then the cards
   * it moved on the right. Both halves used to land in the same frame, which read as two
   * unrelated toasts appearing at once instead of as a sentence and its result.
   */
  narrationCardsLag: 320,
  /**
   * How long a triggered-effect notice — an [On Play], a [When Digivolving] — reads on its
   * own before what it did is played out. The same beat `attackAnnounce` gives an attack
   * call-out, and for the same reason: long enough to read the timing and the card name,
   * and no longer.
   */
  effectAnnounce: 800,
  /**
   * How long a ＜Delay＞ clause waits for the batch that trashes its Option. The server sends
   * that batch right behind the trigger; one that never comes means the clause was declined,
   * and the clause is read without a break to wait for.
   */
  costClauseDeparture: 1200,
  /** Two 250ms enlargements and a 250ms hold before clause reading. */
  effectTrashPreparation: 750,
  /** The final 80ms shrink overlaps clause reading. */
  effectTrashRise: 830,
  /** An Option rising out of the hand fan as it activates. */
  effectHandRise: 540,
  /** Hand source: 250ms enlargement followed by a 250ms hold. */
  effectHandPreparation: 500,
  /** The hand source's pivot adjusts during the enlargement. */
  effectHandPivot: 120,
  /** The card's own art breaking into shards where it was deleted. */
  cardShatter: 250,
  /** All field fragments leave together: 100 ms, then 150 ms at twentyfold velocity. */
  deletionBurst: 250,
  /**
   * The gap between cards one effect takes off the field. Each leaves as the previous card's
   * art finishes breaking, so a board wipe reads one Digimon at a time.
   */
  removalStagger: 350,
  /** Source vignette: 170ms lift +85ms lateral return +170ms hold +170ms fade. */
  stackStripPeel: 595,
  /** Full upright stack moves250ms, then its printed face fades160ms. */
  deckReturn: 410,
  /** A card an effect plays after a paid return waits this long once the stack has landed. */
  deckReturnLanding: 120,
  /** Whole stack approaches the hand250ms, then pauses100ms before hand entry. */
  handReturn: 250,
  handReturnPause: 100,
} as const;

export type AnimationTimingName = keyof typeof ANIMATION_TIMINGS;
