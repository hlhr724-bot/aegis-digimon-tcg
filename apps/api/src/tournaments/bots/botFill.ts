import { createHash } from "node:crypto";
import type { BotProfileName } from "../../bot/profiles.js";
import { BOT_PROFILE_NAMES } from "../../bot/profiles.js";
import { MINIMUM_ELIMINATION_FIELD } from "../elimination/index.js";

/**
 * Whether a short field is completed with bots, and with which ones — decided as pure arithmetic
 * over the numbers, so the policy can be read and tested without a database anywhere near it.
 *
 * The rules this encodes come from the implementation plan's "Bots" section, and the order they are
 * applied in is itself the policy:
 *
 *  1. **Below the minimum, cancel.** A field with fewer than two confirmed people is not an event
 *     with too few players, it is not an event. Filling it would produce a tournament a single
 *     person "wins" against machines, which is worse than not running it.
 *  2. **Only where bots were published.** `allowBots` must be on AND the ruleset must admit bots at
 *     all. Bots have no precedent in the official rules, so an official preset refuses them even if
 *     the flag were somehow set: a competitive event short of players takes byes and no-shows.
 *  3. **Never displace a person.** The plan is expressed as a count of bots to ADD; nothing here
 *     can remove, reorder or replace a confirmed human.
 *  4. **Never an illegal deck.** With no legal deck for the block, no bot is seated at all; the
 *     event runs short rather than seating a bot the server would reject at deal time.
 */

export type PlannedBot = {
  /** 0-based position in the fill, which is what makes the whole plan reproducible. */
  index: number;
  displayName: string;
  profile: BotProfileName;
  deckVersion: string;
};

export type BotFillPlan =
  /** Fewer than two confirmed people: the event must be cancelled, not completed with machines. */
  | { kind: "cancel"; reason: "below_minimum" }
  /** No bot is added, and why. */
  | { kind: "none"; reason: "bots_not_allowed" | "field_already_full" | "no_legal_bot_deck" }
  | { kind: "fill"; targetSize: number; bots: PlannedBot[] };

/** A deck the plan may hand to a bot. Matches the shape `metaDecksForBlock` returns. */
export type FillableDeck = { deckVersion: string; name: string };

export type BotFillInput = {
  allowBots: boolean;
  /** Whether the tournament's ruleset preset admits bots at all (`TournamentRulesPreset.supportsBots`). */
  confirmedHumans: number;
  maxPlayers: number;
  decks: readonly FillableDeck[];
  /** Anything stable per tournament. The draw of names, profiles and decks is derived from it. */
  seed: string;
  randomStyles?: boolean;
  drawStyle?: () => number;
};

/**
 * Themed names for seated bots. Distinct from each other because a room refuses two players with
 * the same display name, and recognisably not people so a bracket never misrepresents who is
 * playing.
 */
export const BOT_DISPLAY_NAMES: readonly string[] = Object.freeze([
  "Agumon Unit",
  "Gabumon Unit",
  "Patamon Unit",
  "Tentomon Unit",
  "Palmon Unit",
  "Gomamon Unit",
  "Biyomon Unit",
  "Veemon Unit",
  "Guilmon Unit",
  "Renamon Unit",
  "Impmon Unit",
  "Terriermon Unit",
  "Hawkmon Unit",
  "Armadillomon Unit",
  "Wormmon Unit",
  "Dorumon Unit",
]);

/** The largest power of two that still fits the advertised capacity. */
function capacityCeiling(maxPlayers: number): number {
  if (maxPlayers < 2) return 0;
  return 2 ** Math.floor(Math.log2(maxPlayers));
}

/** The next power of two at or above the confirmed field. */
function nextPowerOfTwo(participants: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(participants, 1)));
}

export function planBotFill(input: BotFillInput): BotFillPlan {
  if (input.confirmedHumans < MINIMUM_ELIMINATION_FIELD) return { kind: "cancel", reason: "below_minimum" };
  if (!input.allowBots) return { kind: "none", reason: "bots_not_allowed" };

  const ceiling = capacityCeiling(input.maxPlayers);
  const targetSize = Math.min(nextPowerOfTwo(input.confirmedHumans), ceiling);
  const missing = targetSize - input.confirmedHumans;
  if (missing <= 0) return { kind: "none", reason: "field_already_full" };
  if (input.decks.length === 0) return { kind: "none", reason: "no_legal_bot_deck" };

  const offset = rotationOffset(input.seed);
  const bots: PlannedBot[] = [];
  for (let index = 0; index < missing; index += 1) {
    bots.push({
      index,
      displayName: BOT_DISPLAY_NAMES[(offset + index) % BOT_DISPLAY_NAMES.length]!,
      profile: pickProfile({ input, rotation: offset + index }),
      deckVersion: input.decks[(offset + index) % input.decks.length]!.deckVersion,
    });
  }
  return { kind: "fill", targetSize, bots };
}

/**
 * Where the rotations start. Derived from the seed rather than fixed at zero so two events of the
 * same size do not field the identical line-up, and derived rather than random so one event always
 * fields the same one.
 */
function pickProfile({ input, rotation }: { input: BotFillInput; rotation: number }): BotProfileName {
  if (input.randomStyles && input.drawStyle) {
    const index = Math.min(Math.floor(input.drawStyle() * BOT_PROFILE_NAMES.length), BOT_PROFILE_NAMES.length - 1);
    return BOT_PROFILE_NAMES[index]!;
  }
  return BOT_PROFILE_NAMES[rotation % BOT_PROFILE_NAMES.length]!;
}

function rotationOffset(seed: string): number {
  const digest = createHash("sha256").update(`aegis-bot-fill:${seed}`).digest();
  return digest.readUInt32BE(0) % 2 ** 16;
}
