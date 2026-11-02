import { BotStyle } from "@aegis/shared/bot/BotStyle";
import { isBotStyle } from "@aegis/shared/bot/isBotStyle";

/**
 * Bot personalities, expressed purely as data.
 *
 * Every profile drives the SAME evaluation function (`evaluate.ts`); a personality is
 * a set of weights and thresholds, never a code branch. Adding a personality therefore
 * means adding an entry here, and a behavior difference between two personalities is
 * always explainable as a weight difference.
 *
 * Units: one point is roughly "one memory". A weight multiplies a quantity already
 * normalised into those points (see `bodyValue` in `evaluate.ts`).
 */

export interface BotWeights {
  // --- Attacking ------------------------------------------------------------
  /** Value of stripping one card off the opponent's security stack. */
  securityAttack: number;
  /** Score awarded to an attack that wins the game outright. Dominates everything. */
  lethal: number;
  /** How much the chance of the checked security card killing the attacker matters. */
  securityRisk: number;
  /** Assumed probability [0,1] that a ＜Blocker＞ big enough to win actually blocks. */
  blockerRisk: number;
  /** How much being left suspended in front of bigger Digimon deters the attack. */
  retaliation: number;
  /** Value of deleting an opposing Digimon. */
  removal: number;
  /** Cost of losing one of our own Digimon. */
  loss: number;

  // --- Development ----------------------------------------------------------
  /** Per 1000 DP gained by a digivolution. */
  dpGain: number;
  /** Per level gained by a digivolution. */
  levelGain: number;
  /** Value of the card a digivolution draws. */
  digivolveDraw: number;
  /** Extra value for growing the Digimon that is safe in the breeding area. */
  breedingGrowth: number;
  /** Penalty for a digivolution that gains neither DP nor level. */
  downgrade: number;
  /** Multiplier on a freshly played Digimon's body value. */
  playBody: number;
  /** Flat value of resolving a Tamer. */
  tamer: number;
  /** Flat value of resolving an Option. */
  option: number;
  /** Discount applied to an Option while the opponent has no board to answer. */
  optionIdleDiscount: number;
  /** Flat value of firing an available [Main] activated ability. */
  activate: number;

  // --- Memory discipline ----------------------------------------------------
  /** Per point of memory spent that we already had. */
  memorySpend: number;
  /** Per point of memory handed to the opponent by overspending. */
  memoryHandover: number;
  /** Flat cost of crossing zero at all — it ends our turn. */
  crossZero: number;
  /** Extra cost of crossing zero per still-unspent attacker (min 3 counted). */
  crossZeroPerReadyAttacker: number;

  // --- Blocking -------------------------------------------------------------
  /** Value of preventing one security check by blocking. */
  securityDefend: number;
  /** Multiplier on `securityDefend` while our security is nearly gone. */
  criticalSecurityMultiplier: number;
  /** A block is declared only when its score clears this bar. */
  blockThreshold: number;
  /** ＜Barrier＞ trashes a security card; the saved Digimon must be worth this much. */
  barrierThreshold: number;

  // --- Breeding -------------------------------------------------------------
  /** Lowest level the bot is willing to move out of the raising area. */
  deployLevel: number;

  // --- Search ---------------------------------------------------------------
  /** An action is only taken when it beats passing by this margin. */
  actionThreshold: number;
}

export interface BotProfile {
  readonly name: BotProfileName;
  readonly weights: BotWeights;
}

export type BotProfileName = BotStyle;

const BALANCED_WEIGHTS: BotWeights = {
  securityAttack: 5,
  lethal: 1_000,
  securityRisk: 0.35,
  blockerRisk: 0.8,
  retaliation: 0.25,
  removal: 1,
  loss: 1.1,

  dpGain: 0.8,
  levelGain: 1.5,
  digivolveDraw: 2,
  breedingGrowth: 1.5,
  downgrade: 8,
  playBody: 0.9,
  tamer: 3.5,
  option: 2.5,
  optionIdleDiscount: 0.4,
  activate: 2,

  memorySpend: 0.3,
  memoryHandover: 1,
  crossZero: 1,
  crossZeroPerReadyAttacker: 2,

  securityDefend: 4.5,
  criticalSecurityMultiplier: 2.5,
  blockThreshold: 0,
  barrierThreshold: 6,

  deployLevel: 4,

  actionThreshold: 0,
};

/**
 * Races the opponent's security: attacks earlier and into worse odds, spends memory
 * freely to develop threats, and keeps blockers back only when the block is clearly
 * profitable.
 */
const AGGRESSIVE_WEIGHTS: BotWeights = {
  ...BALANCED_WEIGHTS,
  securityAttack: 8,
  securityRisk: 0.12,
  blockerRisk: 0.4,
  retaliation: 0.08,
  loss: 0.8,

  playBody: 1.1,
  memoryHandover: 0.7,

  securityDefend: 2.5,
  criticalSecurityMultiplier: 2,
  blockThreshold: 2,
  barrierThreshold: 9,

  deployLevel: 3,
};

/**
 * Develops the board and protects its security: attacks only when the maths is clearly
 * favourable, keeps ＜Blocker＞ bodies up, and rarely hands the opponent memory.
 */
const DEFENSIVE_WEIGHTS: BotWeights = {
  ...BALANCED_WEIGHTS,
  securityAttack: 3,
  securityRisk: 0.7,
  blockerRisk: 1,
  retaliation: 0.3,
  removal: 2.5,
  loss: 1.5,

  dpGain: 1.2,
  levelGain: 2.2,
  playBody: 1.2,
  memoryHandover: 1.3,
  crossZero: 1.8,
  crossZeroPerReadyAttacker: 2.6,

  securityDefend: 7,
  criticalSecurityMultiplier: 3,
  blockThreshold: -4,
  barrierThreshold: 4,

  deployLevel: 4,
};

export const BOT_PROFILES: Readonly<Record<BotProfileName, BotProfile>> = {
  balanced: { name: "balanced", weights: BALANCED_WEIGHTS },
  aggressive: { name: "aggressive", weights: AGGRESSIVE_WEIGHTS },
  defensive: { name: "defensive", weights: DEFENSIVE_WEIGHTS },
};

export const DEFAULT_BOT_PROFILE = BOT_PROFILES.balanced;

export const BOT_PROFILE_NAMES: readonly BotProfileName[] = Object.values(BotStyle).map((entry) => entry.value);

/** Resolve a profile by name, or hand back an explicit profile unchanged. */
export function resolveBotProfile(profile: BotProfileName | BotProfile | undefined): BotProfile {
  if (profile === undefined) return DEFAULT_BOT_PROFILE;
  if (typeof profile === "string") return BOT_PROFILES[profile] ?? DEFAULT_BOT_PROFILE;
  return profile;
}

export function isBotProfileName(value: string): value is BotProfileName {
  return isBotStyle(value);
}
