/**
 * The game's motion vocabulary and its engine contract. Recipes remain small modules in
 * match/present and match/steps; this is their index, timing source and event coverage.
 * The presentation gate and the effects lab both read it, so a new engine event must make
 * an explicit choice about the board and the family that presents it.
 */
import type { ServerEvent, ServerEventKind } from "@aegis/shared";
import type { AnimationStep } from "./animationQueue";
import { activePacing } from "./pacing";
import { TIMINGS, type TimingName } from "./timings";

export const ANIMATION_FAMILIES = {
  opening: {
    label: "Opening deal",
    owner: "match/flights.ts",
    timings: ["securityDealStagger", "securityFlight"],
    sequence: "Deck → security, one hidden card at a time",
  },
  phase: {
    label: "Turn and phase",
    owner: "match/queue/usePhaseBanners.ts",
    timings: ["turnBanner", "phaseBanner", "phaseBannerGap"],
    sequence: "Finish prior action → announce turn/phase → open actions",
  },
  draw: {
    label: "Draw and hand addition",
    owner: "match/flights.ts",
    timings: ["drawFlight", "drawFlightTouch", "drawFlightStagger", "handDraw"],
    sequence: "Cause → draw presentation or public reveal → physical hand entry → count",
  },
  play: {
    label: "Play and landing",
    owner: "match/present/arrivals.ts",
    timings: ["cardEnter", "showcaseIn", "showcaseFace", "showcaseHold", "showcaseOut", "landingBounce", "cardBurst"],
    sequence: "Server accepts → white turn → face → read → narrow exit → field light → On Play",
  },
  evolve: {
    label: "Digivolution and fusion",
    owner: "match/present/arrivals.ts",
    timings: ["showcaseIn", "showcaseFace", "showcaseHold", "showcaseOut", "cardBurst"],
    sequence: "Accept route/materials → reveal card → change stack → burst → bonus draw/triggered clause",
  },
  breeding: {
    label: "Hatch and promote",
    owner: "match/present/arrivals.ts",
    timings: ["cardEnter", "cardBurst"],
    sequence: "Hatch in raising area; promote once the destination can land",
  },
  effect: {
    label: "Effect activation",
    owner: "match/narration/narrationStream.ts",
    timings: [
      "effectSourceHold",
      "effectTrashRise",
      "effectHandRise",
      "effectAnnounce",
      "effectNoticeIn",
      "effectLinkedBreath",
    ],
    sequence: "Accept optional effect → focus source → clause → consequences → settle",
  },
  choice: {
    label: "Effect and combat choices",
    owner: "match/queue/useDecisionBarrier.ts",
    timings: ["dialogIn", "boardPromptIn"],
    sequence: "Reach requested board → ask → confirm/decline → resume",
  },
  attack: {
    label: "Attack declaration",
    owner: "screen/hooks/useTrackingArrow.ts",
    timings: ["attackAnnounce", "attackArrow", "arrowExtend", "arrowHold", "suspendRotate"],
    sequence: "Declare → suspend → two source-to-target sweeps → attack effects",
  },
  battle: {
    label: "Field battle",
    owner: "match/present/combatImpact.ts",
    timings: ["clawSlash", "cardShake", "cardShakeHold", "cardShatter"],
    sequence: "Target → compare → impact → losing cards depart",
  },
  security: {
    label: "Security check",
    owner: "match/present/securityRevealScene.ts",
    timings: [
      "securityArm",
      "shieldBreak",
      "clashReveal",
      "securityRevealLight",
      "securityCardExit",
      "clashHold",
      "clashOutcome",
      "securityClauseRead",
    ],
    sequence: "Arm → break → white face/reveal → light/recognition → battle or effect dock → route card",
  },
  securityChange: {
    label: "Recover and destroy security",
    owner: "match/present/securityDestructions.ts",
    timings: ["securityFlight", "securityDestroyHold", "securityCountPop"],
    sequence: "Clause → add hidden card, or reveal/shatter public loss → count",
  },
  removal: {
    label: "Delete, trash and return",
    owner: "match/present/deletionBursts.ts",
    timings: [
      "cardShatter",
      "deletionBurst",
      "removalStagger",
      "deckReturn",
      "deckReturnLanding",
      "handReturn",
      "handReturnPause",
    ],
    sequence: "Clause/impact → retain field card → shatter or return flight → remove → paid play enters",
  },
  stack: {
    label: "Digivolution cards and links",
    owner: "match/present/stackStripPeels.ts",
    timings: ["stackStripPeel", "drawFlight", "cardEnter"],
    sequence: "Clause → source lift/sway → hold → rim off/face fade, or attach link card → update stack",
  },
  zone: {
    label: "Reveal and zone movement",
    owner: "match/present/revealShowcases.ts",
    timings: ["revealShowcaseHold", "drawFlight", "narrationCardsLag"],
    sequence: "Reveal public identities → read → move to destination",
  },
  memory: {
    label: "Memory change",
    owner: "match/present/memoryHold.ts",
    timings: ["memoryMarkerPop", "memorySweep", "memoryArc"],
    sequence: "Pay/gain cause → marker sweep → new memory value",
  },
  dp: {
    label: "DP change",
    owner: "match/watchers/useDpPulses.ts",
    timings: ["dpPulse", "dpPulseHold", "dpPulseFatalHold"],
    sequence: "Clause → pulse signed delta → settle badge → rule deletion",
  },
  restriction: {
    label: "Suspend and restrictions",
    owner: "match/watchers/useRestrictionPulses.ts",
    timings: ["freezeShake", "statusPulse", "suspendRotate", "suspendStagger"],
    sequence: "Clause/action → rotate or lock pulse → persistent state",
  },
  shuffle: {
    label: "Shuffle",
    owner: "match/present/deckRiffles.ts",
    timings: ["deckRiffle"],
    sequence: "Zone movement → one deck riffle",
  },
  refusal: {
    label: "Rejected action",
    owner: "useMatchCues.ts",
    timings: ["cardShake", "noticeIn"],
    sequence: "Server refusal → restore optimistic hand → shake and explain",
  },
  result: {
    label: "Match result",
    owner: "overlay/match/GameOverOverlay.tsx",
    timings: [],
    sequence: "Finish outcome → queued playback drains (bounded) → reveal the winner/draw, reason and actions",
  },
  interaction: {
    label: "Selection and inspection",
    owner: "piece/PermanentView.tsx",
    timings: ["spotlightIn", "spotlightPulse", "fateBadgeIn", "cardMagnify", "inspectorOpen"],
    sequence: "Inspect/select → highlight legal targets → confirm intent",
  },
} as const satisfies Record<string, { label: string; owner: string; timings: readonly TimingName[]; sequence: string }>;

export type AnimationFamily = keyof typeof ANIMATION_FAMILIES;
/** Entry points for actual rules, scripted visual recipes and component-only motion. */
export const ANIMATION_HARNESSES = [
  {
    label: "Animation frame reference",
    href: "/dev/motion-reference",
    kind: "decoded reference / live comparison",
    families: ["effect", "evolve", "play", "attack", "security", "removal"],
  },
  {
    label: "Engine chains and queue trace",
    href: "/dev/effects-lab",
    kind: "live engine",
    families: [
      "phase",
      "play",
      "evolve",
      "effect",
      "choice",
      "draw",
      "memory",
      "dp",
      "restriction",
      "removal",
      "security",
      "securityChange",
      "zone",
    ],
  },
  {
    label: "Real field battle and counter",
    href: "/dev/battle",
    kind: "live engine",
    families: ["attack", "battle", "choice", "removal", "effect"],
  },
  {
    label: "Real security with nested decisions",
    href: "/dev/battle?scenario=security-chain",
    kind: "live engine",
    families: ["security", "effect", "choice", "removal", "securityChange"],
  },
  {
    label: "Arena keyword playback",
    href: "/dev/arena?mode=visual",
    kind: "scripted visuals",
    families: [
      "attack",
      "battle",
      "breeding",
      "evolve",
      "draw",
      "security",
      "securityChange",
      "removal",
      "stack",
      "zone",
      "memory",
      "dp",
      "restriction",
      "play",
    ],
  },
  {
    label: "Card effect choices",
    href: "/dev/card-effects/EX3-074",
    kind: "scripted visuals",
    families: ["effect", "choice", "zone", "stack", "interaction"],
  },
  {
    label: "Piece motion specimens",
    href: "/dev/board",
    kind: "component specimens",
    families: ["play", "breeding", "restriction", "memory", "interaction", "result", "shuffle"],
  },
  {
    label: "Mobile decisions and controls",
    href: "/dev/mobile",
    kind: "component specimens",
    families: ["choice", "interaction", "refusal", "result"],
  },
] as const satisfies readonly { label: string; href: string; kind: string; families: readonly AnimationFamily[] }[];

type EventPresentation = { families: readonly AnimationFamily[]; changesBoard: boolean; note?: string };

/** Every engine event has an explicit presentation; administrative closes stay silent. */
export const EVENT_ANIMATIONS = {
  manualAction: { families: [], changesBoard: true },
  matchStarted: { families: ["opening"], changesBoard: true },
  phaseChanged: { families: ["phase", "restriction"], changesBoard: true },
  cardPlayed: { families: ["play", "effect"], changesBoard: true },
  digivolved: { families: ["evolve", "draw", "effect"], changesBoard: true },
  hatched: { families: ["breeding"], changesBoard: true },
  movedFromBreeding: { families: ["breeding"], changesBoard: true },
  memoryChanged: { families: ["memory"], changesBoard: true },
  attackDeclared: { families: ["attack", "restriction"], changesBoard: true },
  blockWindowOpened: { families: ["choice"], changesBoard: true },
  blocked: { families: ["attack", "restriction"], changesBoard: true },
  blockDeclined: { families: ["choice"], changesBoard: true },
  counterWindowOpened: { families: ["choice"], changesBoard: true },
  counterResolved: { families: ["choice", "evolve"], changesBoard: true },
  alliancePrompt: { families: ["choice"], changesBoard: true },
  allianceResolved: { families: ["restriction", "dp"], changesBoard: true },
  evadePrompt: { families: ["choice"], changesBoard: true },
  evadeResolved: { families: ["restriction"], changesBoard: true },
  barrierPrompt: { families: ["choice"], changesBoard: true },
  barrierResolved: { families: ["securityChange"], changesBoard: true },
  battleCompared: { families: ["battle"], changesBoard: false },
  combatResolved: { families: ["battle", "removal"], changesBoard: true },
  attackEnded: { families: ["attack"], changesBoard: true },
  deletionPrevented: { families: ["choice", "stack", "restriction"], changesBoard: true },
  securityRevealed: { families: ["security"], changesBoard: true },
  securityChecked: { families: ["security"], changesBoard: true },
  securityRecovered: { families: ["securityChange"], changesBoard: true },
  deckShuffled: { families: ["shuffle"], changesBoard: true },
  cardRevealed: { families: ["zone"], changesBoard: true },
  effectActivated: { families: ["effect"], changesBoard: false },
  effectTargetsSelected: { families: ["effect"], changesBoard: false },
  effectTriggered: { families: ["effect"], changesBoard: false },
  resolutionOrderChosen: { families: ["choice", "effect"], changesBoard: false },
  effectOptionChosen: { families: ["choice"], changesBoard: false },
  effectClauseAdvanced: { families: ["choice"], changesBoard: false },
  effectResolved: { families: ["effect"], changesBoard: false },
  effectHadNoEffect: { families: [], changesBoard: false, note: "Match log line only; the effect did nothing" },
  dpModifierApplied: { families: ["dp"], changesBoard: true },
  cardsMoved: { families: ["zone"], changesBoard: true },
  stackTopResolved: { families: ["removal", "dp"], changesBoard: true },
  turnEnded: { families: ["phase"], changesBoard: true },
  actionRejected: { families: ["refusal"], changesBoard: true },
  gameOver: { families: ["result"], changesBoard: true },
  finalReveal: { families: [], changesBoard: false, note: "Post-match data for the board review; nothing moves" },
  batchClosed: { families: [], changesBoard: false, note: "Transport boundary; no player-facing motion" },
} as const satisfies Record<ServerEventKind, EventPresentation>;

/** Used by the board snapshot gate; announcements alone never advance the field. */
export function eventChangesPresentedBoard(event: ServerEvent): boolean {
  return EVENT_ANIMATIONS[event.kind].changesBoard;
}

/** Generic moves describe the actual route; never inspect hidden card identities here. */
export function animationFamiliesForEvent(event: ServerEvent): readonly AnimationFamily[] {
  if (event.kind !== "cardsMoved") return EVENT_ANIMATIONS[event.kind].families;
  const families = new Set<AnimationFamily>(["zone"]);
  if (event.to === "hand" && event.handAddition !== "staging") families.add("draw");
  if (event.from === "security" || event.to === "security") families.add("securityChange");
  if (event.deletedPermanents?.length || event.trashedPermanents?.length || event.returnedPermanents?.length)
    families.add("removal");
  if (event.battleDeletion) families.add("battle");
  if (event.strippedStackTops || event.trashedSources || event.placedUnder || event.deckToUnder) families.add("stack");
  return [...families];
}

/** Shared by the live trace and the harness to group recipes independently of track ids. */
export function animationFamilyForStep(step: Pick<AnimationStep, "id" | "track">): AnimationFamily | undefined {
  const id = step.id;
  if (/^(security-deal)/.test(id)) return "opening";
  if (/^(turn-banner|phase-banner)/.test(id)) return "phase";
  if (/^(draw-flight|draw-burst)/.test(id)) return "draw";
  if (/^(zone-change|play-flight|burst-|arrival-light)/.test(id)) return "play";
  if (/^(effect-unit|effect-source|effect-resume|narration-step)/.test(id)) return "effect";
  if (/^attack-/.test(id)) return "attack";
  if (/^(combat-|field-clash)/.test(id)) return "battle";
  if (/^(security-gain|security-destroyed|security-flight|security-destruction)/.test(id)) return "securityChange";
  if (/^(security-|option-dock)/.test(id)) return "security";
  if (/^(delete-burst|delete-light|deck-return|hand-return)/.test(id)) return "removal";
  if (/^(stack-strip|deck-under|option-under)/.test(id)) return "stack";
  if (/^(reveal-showcase)/.test(id)) return "zone";
  if (/^(memory-)/.test(id)) return "memory";
  if (/^(dp-pulse)/.test(id)) return "dp";
  if (/^(freeze-pulse|restriction)/.test(id)) return "restriction";
  if (/^(deck-riffle)/.test(id)) return "shuffle";
  return undefined;
}

/** Both timing tables are read live, so the inventory reflects the lab's current tuning. */
export function animationFamilyTiming(family: AnimationFamily): string {
  const base = ANIMATION_FAMILIES[family].timings.map((name) => `${name} ${TIMINGS[name]} ms`).join(" · ");
  if (family !== "effect") return base;
  const pacing = activePacing();
  return `${base} · paced focus ${pacing.sourceHoldMs} / announce ${pacing.announceMs} / settle ${pacing.settleMs} ms`;
}
