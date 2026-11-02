/**
 * The centre-screen showcase and the security clash share one track, so the
 * board never holds two cards up at once — a security check replaces whatever
 * showcase was mid-flight rather than painting over it.
 *
 * The used Option's own dock (`OptionDock`, `OptionDockHold`): its entrance, and
 * the open-ended hold that keeps the card on screen until the Option finishes
 * resolving. Open-ended for the same reason the security dock is — the Option
 * finishes by the viewer ANSWERING its decisions — so these two tracks are
 * exempt from the same barriers. A phase ribbon that waits for them waits for
 * an answer that cannot arrive until the ribbon lets the prompt through, and
 * every other cue is gated behind the ribbon: one docked Option freezes the
 * whole screen until the dock's failsafe ceiling.
 *
 * `SecurityDock` is the open-ended wait that keeps a `[Security]` card parked
 * in its dock until the check closes. It is deliberately NOT the centre-stage
 * track: the dock stays up across whole batches, and the cues the docked
 * card's effect provokes must be able to follow its arrival on the
 * centre-stage track instead of waiting for it to leave.
 *
 * `SecurityHold` is the open-ended wait that keeps a revealed Digimon
 * centre-stage until the battle it is in has actually been decided. Same
 * reasoning as the dock, and for the same reason not the centre-stage track:
 * the deletion the battle causes, and everything that reacts to it, has to be
 * able to play while the card is still up.
 *
 * String values are compared against live queue state and must not change.
 */
export enum CueTrack {
  CenterStage = "centerStage",
  /** Serial visual ownership after independent arrival/reveal gates have opened. */
  CardReveal = "cardReveal",
  /** One temporary deck presentation after its owner's causal gates have opened. */
  DrawPresentation = "drawPresentation",
  SecurityDock = "securityDock",
  OptionDock = "optionDock",
  OptionDockHold = "optionDockHold",
  SecurityHold = "securityHold",
  Finale = "finale",
}

/** The attack orientation relative to the viewer’s side of the board. */
export enum AttackDirection {
  Up = "up",
  Down = "down",
}

/** Which of the shield's two beats a security break is currently playing. */
export enum SecurityBreakPhase {
  Arm = "arm",
  Break = "break",
}

/** Whether the opening security deal is still to be observed, or already accounted for. */
export enum OpeningDealState {
  Pending = "pending",
  Done = "done",
}
