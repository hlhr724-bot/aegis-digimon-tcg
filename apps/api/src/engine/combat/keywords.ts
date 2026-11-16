import {
  digiXrosRequirementFor,
  effectiveExactNames,
  getCardDefinition,
  getCompiledCard,
  sameTrait,
} from "@aegis/shared";
import type { CardColor, CardDefinition, Keyword, Permanent } from "@aegis/shared";

const PRINTED_MATCHERS: ReadonlyArray<readonly [Keyword, RegExp]> = [
  ["Blocker", /[<＜]\s*Blocker/i],
  ["Piercing", /[<＜]\s*Piercing/i],
  ["Rush", /[<＜]\s*Rush/i],
  ["Raid", /[<＜]\s*Raid/i],
  ["Reboot", /[<＜]\s*Reboot/i],
  ["Jamming", /[<＜]\s*Jamming/i],
  ["Retaliation", /[<＜]\s*Retaliation/i],
  ["Barrier", /[<＜]\s*Barrier/i],
  ["Evade", /[<＜]\s*Evade/i],
  ["Save", /[<＜]\s*Save/i],
  ["Delay", /[<＜]\s*Delay/i],
  ["Alliance", /[<＜]\s*Alliance/i],
  ["Fortitude", /[<＜]\s*Fortitude/i],
  ["Blitz", /[<＜]\s*Blitz/i],
  ["Collision", /[<＜]\s*Collision/i],
  ["Vortex", /[<＜]\s*Vortex/i],
  ["Decoy", /[<＜]\s*Decoy/i],
  ["Scapegoat", /[<＜]\s*Scapegoat/i],
  ["Execute", /[<＜]\s*Execute/i],
  ["Progress", /[<＜]\s*Progress/i],
  ["IceClad", /[<＜]\s*Ice\s*Clad/i],
  ["Training", /[<＜]\s*Training/i],
  ["Armor Purge", /[<＜]\s*Armor\s+Purge/i],
  ["Mind Link", /[<＜]\s*Mind\s+Link/i],
  ["Ascension", /[<＜]\s*Ascension/i],
  ["BlastDNADigivolve", /[<＜]\s*Blast\s+DNA\s+Digivolve/i],
  ["BlastDigivolve", /[<＜]\s*Blast\s+Digivolve/i],
  ["Draw", /[<＜]\s*Draw(?:\s+\d+)?/i],
  ["SecurityAttack", /[<＜]\s*Security\s+(?:Attack|A\.)/i],
  ["DeDigivolve", /[<＜]\s*De-?Digivolve/i],
  ["Recovery", /[<＜]\s*Recovery/i],
  ["DigiBurst", /[<＜]\s*Digi-?Burst/i],
  ["Digisorption", /[<＜]\s*Digisorption/i],
  ["MaterialSave", /[<＜]\s*Material\s+Save/i],
  ["Link", /[<＜]\s*Link(?:\s|[+＞>])/i],
  ["Fragment", /[<＜]\s*Fragment/i],
  ["Partition", /[<＜]\s*Partition/i],
  ["Decode", /[<＜]\s*Decode/i],
  ["Overclock", /[<＜]\s*Overclock/i],
  ["UseReq", /[<＜]\s*Use\s+Req\./i],
  ["Engage", /[<＜]\s*Engage/i],
  ["Detach", /[<＜]\s*Detach/i],
  ["Guard", /[<＜]\s*Guard/i],
];

/**
 * The global twin of each printed matcher, built once.
 *
 * `matchAll` demands the `g` flag, and rebuilding these 40-odd RegExp objects per call showed up
 * as 5% of engine CPU under load: the scan runs on every keyword read, and keyword reads run on
 * every continuous-effect recomputation.
 */
const GLOBAL_PRINTED_MATCHERS: ReadonlyArray<readonly [Keyword, RegExp]> = PRINTED_MATCHERS.map(
  ([name, matcher]) =>
    [name, new RegExp(matcher.source, matcher.flags.includes("g") ? matcher.flags : `${matcher.flags}g`)] as const,
);

/**
 * Printed keywords are a pure function of the card's printed text, and a match reads the same
 * few thousand card texts over and over, so the scan is memoized on the text itself. The key
 * space is bounded by the card pool; entries are immutable and shared, so callers must treat
 * the returned array as read-only.
 */
const printedKeywordCache = new Map<string, readonly string[]>();

const GRANT_CLAUSE = /\b(?:gain|gains|gained|getting|gets|has|give|gives|giving)\b/i;
/** "Change ＜Security Attack -＞ to ＜Security Attack +＞" (EX6-031) rewrites other Digimon's keywords. */
const CHANGE_CLAUSE = /\]\s*Change\b/;
const CONDITIONAL_CLAUSE = /\b(?:if|unless|as long as|while)\b/i;
const FILTER_CLAUSE = /\bwith(?:out)?\s+[^.!?\n]{0,80}$/i;
const USE_CLAUSE = /\b(?:use|using)\s*$/i;

/** Keywords printed as abilities, excluding prose that grants them conditionally. */
export function printedKeywordsOf(effectText: string | undefined): readonly string[] {
  if (effectText === undefined || effectText === "") return [];
  const cached = printedKeywordCache.get(effectText);
  if (cached !== undefined) return cached;
  const found = scanPrintedKeywords(effectText);
  printedKeywordCache.set(effectText, found);
  return found;
}

/**
 * Blank out each keyword's reminder text ("＜Alliance＞ (When this Digimon attacks, [...] for
 * the attack.)") without shifting indices. Its periods would otherwise end the grant clause
 * early (BT20-089 "gains ＜Alliance＞ (...), ＜Piercing＞ and ＜Barrier＞"), and keywords it
 * mentions are explanation, not printed abilities.
 */
function maskReminders(effectText: string): string {
  return effectText.replace(
    /(＞\s*)(\([^()]*\))/g,
    (_match, lead: string, reminder: string) => lead + " ".repeat(reminder.length),
  );
}

function scanPrintedKeywords(printedText: string): readonly string[] {
  const found: string[] = [];
  const effectText = maskReminders(printedText);
  for (const [name, everyOccurrence] of GLOBAL_PRINTED_MATCHERS) {
    everyOccurrence.lastIndex = 0;
    for (const match of effectText.matchAll(everyOccurrence)) {
      const prefix = effectText.slice(0, match.index);
      const clauseStart = Math.max(prefix.lastIndexOf("."), prefix.lastIndexOf("\n")) + 1;
      const clausePrefix = prefix.slice(clauseStart);
      const abilityStart = prefix.lastIndexOf("[");
      const abilityPrefix = prefix.slice(abilityStart >= 0 ? abilityStart : clauseStart);
      // A marker referenced by a target filter ("Digimon with <Blocker>") or
      // produced by a grant clause isn't an intrinsic currently-active keyword.
      // Inspect the whole current clause so chained grants such as "gains
      // <Piercing> and <Blocker>" reject both markers, not only the first one.
      // The continuous ledger publishes those keywords only while their actual
      // conditions/durations are active.
      if (GRANT_CLAUSE.test(clausePrefix) || CHANGE_CLAUSE.test(clausePrefix)) continue;
      // A token's keyword specification belongs to the token, not to the card that creates it.
      if (/\btoken\b/i.test(clausePrefix) || /\btoken\b/i.test(abilityPrefix)) continue;
      if (FILTER_CLAUSE.test(clausePrefix)) continue;
      if (USE_CLAUSE.test(clausePrefix)) continue;
      // A keyword chained after a conditional clause (for example, "If DNA
      // digivolving ... Then, ＜Blitz＞") is granted by that effect; it is not
      // an intrinsic keyword available on every copy of the card.
      if (CONDITIONAL_CLAUSE.test(abilityPrefix)) continue;
      found.push(name);
      break;
    }
  }
  return found;
}

/** The granted-keyword reader the resolver needs (the continuous ledger keyword store). */
export interface KeywordGrantReader {
  grantedKeywords(permanentId: string): { keyword: string; amount?: number }[];
}

/**
 * The resolved active keyword names on a permanent: the keywords printed on its top
 * card unioned with every active continuous grant. Mirrors how combat legality reads
 * keywords (printed text OR ledger grant; combat/legality.ts hasVortex/hasBlocker),
 * surfaced as a flat list for the client.
 */
export function resolveKeywords(permanent: Permanent, reader: KeywordGrantReader): string[] {
  const names = new Set<string>();
  const def = permanent.topCard !== undefined ? getCardDefinition(permanent.topCard.cardId) : undefined;
  for (const keyword of printedKeywordsOf(def?.effectText)) names.add(keyword);
  for (const grant of reader.grantedKeywords(permanent.permanentId)) names.add(grant.keyword);
  return [...names];
}

/** The parenthesized specifier text on a printed ＜Decoy (...)＞ marker, e.g. "[Bagra Army]". */
const DECOY_TEXT = /[<＜]\s*Decoy\s*\(([^)]+)\)/i;

const KNOWN_COLORS = new Set(["red", "blue", "yellow", "green", "black", "white", "purple", "colorless"]);

/**
 * Parse a Decoy holder's own specifier into its `/`-separated alternatives (Comprehensive
 * Rules §16-18-1's "shown on cards using text such as ＜Decoy (Black)＞"). Each alternative is
 * either a bracketed trait (`[Bagra Army]`, `[Xros Heart] trait`), a bare color (`Black`,
 * `Red/Black`), or a bare trait name without brackets (`Deva/Four Sovereigns`). Undefined when
 * `holderCardId`'s printed text carries no ＜Decoy＞ marker at all.
 */
export function decoySpecOf(holderCardId: string): string[] | undefined {
  const def = getCardDefinition(holderCardId);
  return decoySpecFromText(def?.effectText);
}

/** Parse a Decoy specifier from the exact main/inherited clause that granted it. */
export function decoySpecFromText(text: string | undefined): string[] | undefined {
  const match = DECOY_TEXT.exec(text ?? "");
  if (match === null) return undefined;
  return match[1]!.split("/").map((s) => s.trim());
}

/**
 * Whether `targetDef` (the endangered Digimon's card) is one of the specified Digimon a
 * ＜Decoy＞ holder (`holderCardId`) protects — matched by trait (bracketed or bare) or by
 * color, per whichever the holder's own printed specifier uses.
 */
export function decoyMatches(holderCardId: string, targetDef: CardDefinition): boolean {
  const alternatives = decoySpecOf(holderCardId);
  if (alternatives === undefined) return false;
  return decoySpecMatches(alternatives, targetDef);
}

/** Whether explicit Decoy parameter alternatives accept the endangered Digimon. */
export function decoySpecMatches(alternatives: readonly string[], targetDef: CardDefinition): boolean {
  for (const alt of alternatives) {
    const bracket = /^\[([^\]]+)\]/.exec(alt);
    const name = (bracket?.[1] ?? alt.replace(/\btrait\b/i, "")).trim().toLowerCase();
    if (name === "") continue;
    if (bracket === null && KNOWN_COLORS.has(name)) {
      if (targetDef.colors.some((c) => c.toLowerCase() === name)) return true;
      continue;
    }
    if ((targetDef.types ?? []).some((t) => t.toLowerCase() === name)) return true;
  }
  return false;
}

/** The printed count on a ＜Fragment (N)＞ marker (Comprehensive Rules §16-37-1), e.g. 3. */
const FRAGMENT_COUNT = /[<＜]\s*Fragment\s*\((\d+)\)/i;

/** How many of this Digimon's own digivolution cards a ＜Fragment＞ trash-cost requires. */
export function fragmentCountOf(
  holderCardId: string,
  grants: readonly { keyword: string; amount?: number }[] = [],
): number | undefined {
  const def = getCardDefinition(holderCardId);
  const match = FRAGMENT_COUNT.exec(def?.effectText ?? "");
  const amounts = grants
    .filter((grant) => grant.keyword === "Fragment" && grant.amount !== undefined)
    .map((grant) => grant.amount!);
  if (match !== null) amounts.push(Number(match[1]));
  const valid = amounts.filter((amount) => Number.isInteger(amount) && amount > 0);
  return valid.length === 0 ? undefined : Math.min(...valid);
}

/** The printed count on a ＜Material Save N＞ marker (Comprehensive Rules §16-21-1), e.g. 4. */
const MATERIAL_SAVE_COUNT = /[<＜]\s*Material\s+Save\s+(\d+)/i;

/** How many DigiXros-requirement cards a ＜Material Save＞ holder may place under a Tamer. */
export function materialSaveCountOf(holderCardId: string): number | undefined {
  const def = getCardDefinition(holderCardId);
  const match = MATERIAL_SAVE_COUNT.exec(def?.effectText ?? "");
  if (match !== null) return Number(match[1]);
  // Some catalog exports retain only Material Save's reminder text and omit the
  // keyword marker itself (BT15-012). The committed IR remains authoritative for
  // the printed amount in that shape, so the execution seam must read it too.
  for (const effect of getCompiledCard(holderCardId)?.effects ?? []) {
    const keyword = effect.keywords?.find((entry) => entry.keyword === "MaterialSave");
    if (keyword?.amount !== undefined) return keyword.amount;
  }
  return undefined;
}

/**
 * The card names bracketed in a Digimon's own printed DigiXros requirement line. Two
 * printed forms exist: a bracketed marker ("[DigiXros -2] [SkullKnightmon] x
 * [DeadlyAxemon]") and a colon-suffixed marker ("DigiXros -2: [Shoutmon] + [Ballistamon]
 * + [Dorulumon] + [Starmons]", e.g. BT10-009) — both -> ["Shoutmon", "Ballistamon", ...].
 * These are the "cards specified in the top card's DigiXros requirements" that
 * ＜Material Save＞ (§16-21-1) draws its eligible set from. Undefined when the card
 * prints no DigiXros requirement at all.
 */
export function digiXrosRequirementNamesOf(cardId: string): string[] | undefined {
  const def = getCardDefinition(cardId);
  const text = def?.effectText ?? "";
  const bracket = /\[DigiXros[^\]]*\]([\s\S]*)$/i.exec(text);
  if (bracket !== null) {
    const names = [...bracket[1]!.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]!.trim());
    if (names.length > 0) return names;
  }
  // Colon form has no closing bracket to anchor on, so capture only the run of
  // consecutive "[Name] +"/"[Name] x" clauses right after the colon — stopping at the
  // first non-clause text (e.g. "When you would play this card...") keeps unrelated
  // later brackets in the effect text out of the requirement set.
  const colon = /DigiXros\s*-?\d*\s*:\s*((?:\[[^\]]+\]\s*[+x]?\s*)+)/i.exec(text);
  if (colon !== null) {
    const names = [...colon[1]!.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]!.trim());
    if (names.length > 0) return names;
  }
  return undefined;
}

/**
 * Whether `stackCardId` is one of `hostCardId`'s own specified DigiXros-requirement cards —
 * the eligibility test ＜Material Save＞ applies to the digivolution cards under its holder.
 */
export function digiXrosMatches(hostCardId: string, stackCardId: string): boolean {
  const stack = getCardDefinition(stackCardId);
  if (stack === undefined) return false;
  const stackNames = effectiveExactNames(stack).map((name) => name.toLowerCase());
  const slots = digiXrosRequirementFor(hostCardId)?.[0]?.materials;
  if (slots !== undefined && slots.length > 0) {
    return slots.some((slot) => {
      if (slot.names?.length && !slot.names.some((name) => stackNames.includes(name.toLowerCase()))) return false;
      if (
        slot.traits?.length &&
        !slot.traits.some((trait) => (stack.types ?? []).some((type) => sameTrait(type, trait)))
      )
        return false;
      if (slot.colors?.length && !slot.colors.some((color) => stack.colors.includes(color as CardColor))) return false;
      if (slot.level !== undefined && stack.level !== slot.level) return false;
      if (slot.levelMin !== undefined && (stack.level === undefined || stack.level < slot.levelMin)) return false;
      if (slot.levelMax !== undefined && (stack.level === undefined || stack.level > slot.levelMax)) return false;
      return true;
    });
  }

  // Backward-compatible fallback for a legacy card whose compiled recipe is absent.
  const names = digiXrosRequirementNamesOf(hostCardId);
  return names?.some((name) => stackNames.includes(name.toLowerCase())) ?? false;
}

/**
 * One clause of a printed ＜Partition (...)＞ specifier (Comprehensive Rules §16-29-1),
 * e.g. "blue Lv.4" or "[WarGreymon]". Cards print either a color+level pair (the color
 * itself may carry "/"-separated alternatives, e.g. "Yellow/Black Lv.6") or a bracketed
 * card name.
 */
export type PartitionClause = { kind: "colorLevel"; colors: string[]; level: number } | { kind: "name"; name: string };

const PARTITION_TEXT = /[<＜]\s*Partition\s*\(([^)]+)\)/i;
const PARTITION_COLOR_LEVEL = /^([A-Za-z/]+)\s+Lv\.?\s*(\d+)/i;

/**
 * Parse a ＜Partition＞ holder's own specifier into its "&"/"+"-separated clauses
 * (Comprehensive Rules §16-29-1: "shown on cards using text such as
 * ＜Partition (blue Lv.4 & green Lv.4)＞"). Undefined when the card prints no
 * ＜Partition＞ marker, or when a clause can't be parsed.
 */
export function partitionSpecOf(holderCardId: string): PartitionClause[] | undefined {
  const def = getCardDefinition(holderCardId);
  // The marker is printed in the holder's own text, and repeated in its INHERITED text with the
  // reminder wording — that is the copy a digivolution card carries when it grants ＜Partition＞
  // to a host whose own top card has no marker (BT16-025 under BT12-030, Q2889).
  const match = PARTITION_TEXT.exec(def?.effectText ?? "") ?? PARTITION_TEXT.exec(def?.inheritedEffectText ?? "");
  if (match === null) return undefined;
  const rawClauses = match[1]!
    .split(/[&+]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const clauses: PartitionClause[] = [];
  for (const raw of rawClauses) {
    const bracket = /^\[([^\]]+)\]/.exec(raw);
    if (bracket !== null) {
      clauses.push({ kind: "name", name: bracket[1]!.trim().toLowerCase() });
      continue;
    }
    const colorLevel = PARTITION_COLOR_LEVEL.exec(raw);
    if (colorLevel === null) return undefined;
    const colors = colorLevel[1]!
      .split("/")
      .map((c) => c.trim().toLowerCase())
      .filter((c) => KNOWN_COLORS.has(c));
    if (colors.length === 0) return undefined;
    clauses.push({ kind: "colorLevel", colors, level: Number(colorLevel[2]) });
  }
  return clauses.length > 0 ? clauses : undefined;
}

/** Whether `cardId` satisfies one clause of a ＜Partition＞ holder's specifier. */
export function partitionClauseMatches(clause: PartitionClause, cardId: string): boolean {
  const def = getCardDefinition(cardId);
  if (def === undefined) return false;
  if (clause.kind === "name") return (def.nameEn ?? "").trim().toLowerCase() === clause.name;
  return def.level === clause.level && def.colors.some((c) => clause.colors.includes(c.toLowerCase()));
}
