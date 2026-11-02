import { assemblyRequirementFor, digiXrosRequirementFor, type Intent } from "@aegis/shared";
import type { PlayCardCheck } from "../actions/index.js";

export const NO_DIGIVOLVE_TARGETS: readonly string[] = [];

export const NO_LINK_TARGETS: readonly string[] = [];

/** `CardInstance.projectedPlayCost` sentinel: this card has no projectable play cost right now. */
export const NO_PROJECTED_COST = -1;

/**
 * The verbs refused while an attack is resolving. Everything a seat does to its own board
 * belongs to a Main-phase action window, and CR section 11 gives the attack the board until
 * the battle ends. The combat responses (`declareBlock`, `declineBlock`, `respondCounter`,
 * `respondAlliance`, `respondEvade`, `respondBarrier`), `respondDecision`, `ready` and
 * `surrender` are deliberately absent: they drive the attack forward or end the match.
 */
export const ATTACK_BLOCKED_INTENTS: ReadonlySet<Intent["type"]> = new Set([
  "playCard",
  "appFusion",
  "digivolve",
  "dnaDigivolve",
  "linkCard",
  "attack",
  "activateEffect",
  "endPhase",
  "hatchEgg",
  "moveFromBreeding",
]);

/**
 * A ＜Blast Digivolve＞ / ＜Blast DNA Digivolve＞ declaration, the one digivolve that belongs to
 * the defending seat's §11-3 Counter Timing window rather than to a Main-phase action window.
 * Its own validator enforces the open window, so {@link ATTACK_BLOCKED_INTENTS} exempts it
 * instead of refusing the keyword outright.
 */
export function isBlastDigivolve(intent: Intent): boolean {
  return (intent.type === "digivolve" || intent.type === "dnaDigivolve") && intent.useBlastDigivolve === true;
}

/** A hand card reads as playable when it validates, or when only memory is short of a material-cost route. */
export function playableFromHand(check: PlayCardCheck, cardId: string, playCostReductionBlocked: boolean): boolean {
  if (check.ok) return true;
  return check.reason === "insufficient-memory" && !playCostReductionBlocked && hasMaterialCostRoute(cardId);
}

/**
 * Whether this card can be played through a material declaration (DigiXros §7-2 or
 * Assembly §7-3) that lowers its cost. The reduction depends on materials the player
 * has not chosen yet, so the plain play cost is not the price such a card actually
 * pays — see {@link GameEngine.syncHandAffordances}.
 */
export function hasMaterialCostRoute(cardId: string): boolean {
  return (digiXrosRequirementFor(cardId)?.length ?? 0) > 0 || (assemblyRequirementFor(cardId)?.length ?? 0) > 0;
}
