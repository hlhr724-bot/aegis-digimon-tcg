import type { CardDefinition } from "./types.js";

/**
 * Cards whose source `CardNames` list carries more than the printed `nameEn`. Digivolution
 * name gates read that list, so "[Digivolve] [Takuya Kanbara]" must also accept a Tamer such as
 * AD1-020 ("Tommy, Takuya, & Zoe") whose entry includes "Takuya Kanbara".
 */
const STATIC_NAME_ALIASES_BY_CARD_ID: Record<string, string[]> = {
  // Q1033: a Diaboromon token has the same name as the printed Digimon.
  "TOKEN-Diaboromon-Token": ["Diaboromon"],
  // Same rule for BT19-091's three tokens: the registry name carries a " Token"
  // suffix the printed text never uses, so without these a gate on [WarGrowlmon]
  // misses the token it just played and the card plays a duplicate.
  "TOKEN-WarGrowlmon-Token": ["WarGrowlmon"],
  "TOKEN-Taomon-Token": ["Taomon"],
  "TOKEN-Rapidmon-Token": ["Rapidmon"],
  "AD1-020": ["Tommy Himi", "Takuya Kanbara", "Zoe Orimoto"],
  "AD1-023": ["J.P. Shibayama", "Koji Minamoto", "Koichi Kimura"],
  "BT18-088": ["Takuya Kanbara", "Koji Minamoto"],
  "ST24-13": ["Marcus Damon", "Thomas H. Norstein"],
  "BT20-089": ["Eiji Nagasumi", "Leon Alexander"],
  // Special rule text is phrased "Also treat as if name is...", outside the
  // generic "this card is also treated" parser. KB Q759: applies in every zone.
  "ST12-13": ["Sistermon Noir"],
  // BT6-084's Q1470 erratum makes the alias universal even though the committed
  // catalog effect text predates the standardized (Rule) wording.
  "BT6-084": ["Sistermon Noir"],
  // The committed BT11-009 text predates standardized `(Rule) Name:` wording.
  // Q2054 confirms both aliases apply unconditionally in every zone.
  "BT11-009": ["Shoutmon", "Starmons"],
  // Printed `(Rule) Also treated as Name:` uses a different word order from
  // the generic parser. Q5674 confirms the alias includes digivolution cards.
  "BT24-086": ["Shuu Yulin"],
};

/**
 * Aliases split by how strongly the printed text grants them.
 *
 * `exact` answers a full-name gate ("[Digivolve] [Shoutmon]"): the card is treated AS having
 * that name. `substring` answers only a "with [X] in its name" gate: the card is treated as
 * having that name IN its name, which is strictly weaker (KB Q2868 — EX4-030 Kuzuhamon carries
 * [Sakuyamon] in its name and must be refused by an exact [Sakuyamon] route).
 */
interface StaticNameAliases {
  exact: string[];
  substring: string[];
}

const staticNameAliasCache = new WeakMap<CardDefinition, Readonly<StaticNameAliases>>();

/**
 * Names granted by printed "this card is also treated as [X]" text. Name gates call this for
 * every candidate on every rules check, so the regex scan is cached per definition object.
 */
function parsedStaticNameAliases(def: CardDefinition): Readonly<StaticNameAliases> {
  const cached = staticNameAliasCache.get(def);
  if (cached !== undefined) return cached;
  const aliases = scanStaticNameAliases(def);
  const frozen = Object.freeze({ exact: Object.freeze(aliases.exact), substring: Object.freeze(aliases.substring) });
  staticNameAliasCache.set(def, frozen as Readonly<StaticNameAliases>);
  return frozen as Readonly<StaticNameAliases>;
}

const GRANTS_LEVEL_OR_TRAIT = /treated\s+as\s+(?:level\b|having\s+the\s+\[[^\]]+\]\s+trait)/i;

function scanStaticNameAliases(def: CardDefinition): StaticNameAliases {
  // BT15-060's Omnimon alias is explicitly limited to the card while it is revealed
  // from a deck. It is supplied by the reveal-context definition projection instead
  // of the universal static-name list.
  if (def.cardId === "BT15-060") return { exact: [], substring: [] };
  const text = def.effectText ?? "";
  const result: StaticNameAliases = { exact: [], substring: [] };
  const aliasPhrases = [
    ...(text.match(
      /(?:When you would DigiXros,\s*(?:the\s+)?)?(?:name of )?this card(?:\/(?:Digimon|Tamer))?[^.。]*also treated[^.。]*/gi,
    ) ?? []),
    // BT9-051 predates the standard wording: "Treat this card/Digimon as if it also has [Leomon] in its name."
    ...(text.match(/Treat this card(?:\/(?:Digimon|Tamer))? as if it also has[^.。]*/gi) ?? []),
    // The catalog prints both "(Rule) Name:" and "[Rule] Name:"; KB Q759 applies either in every
    // zone. Only the tail after "Name:" is scanned: the bracketed "[Rule]" marker itself is not
    // an alias, and scanning the whole phrase emitted a spurious "Rule" name.
    ...[...text.matchAll(/[[(]Rule[\])]\s*Name:\s*((?:Also\s+)?[Tt]reated as(?:\s+having)?[^.。]*)/g)].map(
      (match) => match[1]!,
    ),
    // EX13-066 prints "[Rule] Also has Name: [X] and Trait: [Y]"; only the name part is an alias.
    ...[...text.matchAll(/[[(]Rule[\])]\s*Also has Name:\s*([^.。]*?)(?:\s+and\s+Trait:|[.。]|$)/g)].map(
      (match) => `treated as ${match[1]!}`,
    ),
  ];
  for (const phrase of aliasPhrases) {
    // A material-only alias must not satisfy ordinary evolution or name gates.
    if (/(?:for\s+(?:a\s+)?|When you would\s+)DigiXros\b/i.test(phrase)) continue;
    if (GRANTS_LEVEL_OR_TRAIT.test(phrase)) continue;
    // "treated as HAVING [X]" / "[X] IN ITS NAME" is a substring grant only; the bare
    // "treated as [X]" (and "as if its name is [X]") is a full-name identity.
    // "treated as INCLUDING [X]" is the same inclusion grant (EX13-053, Q7377).
    const substringOnly =
      /treated as (?:having|including)\b/i.test(phrase) || /in (?:its|their) names?\b/i.test(phrase);
    for (const match of phrase.matchAll(/\[([^\]]+)\]/g)) {
      (substringOnly ? result.substring : result.exact).push(match[1]!.trim());
    }
  }
  return result;
}

const dedupe = (names: string[]): string[] => [...new Set(names.filter((name) => name.length > 0))];

/**
 * The names a card answers to for an EXACT name gate (`match: "nameExact"` / `namesExact`):
 * its printed `nameEn` plus the aliases the printed text grants as a full identity. A
 * "treated as having [X] in its name" alias is deliberately excluded — see
 * {@link effectiveSubstringOnlyNames}.
 */
export function effectiveExactNames(def: CardDefinition): string[] {
  return dedupe([
    def.nameEn,
    ...(STATIC_NAME_ALIASES_BY_CARD_ID[def.cardId] ?? []),
    ...parsedStaticNameAliases(def).exact,
  ]);
}

/**
 * The aliases a card carries only INSIDE its name. They satisfy a substring gate
 * ("with [X] in its name") and must never satisfy an exact-name gate.
 */
export function effectiveSubstringOnlyNames(def: CardDefinition): string[] {
  return dedupe(parsedStaticNameAliases(def).substring);
}

/**
 * Every name a card answers to for a name gate: its printed `nameEn` plus any alias from the
 * table above or from its own "also treated as [X]" text. Server legality and client
 * highlighting both read this so they cannot disagree about which bases a name gate accepts.
 */
export function effectiveStaticNames(def: CardDefinition): string[] {
  return dedupe([...effectiveExactNames(def), ...effectiveSubstringOnlyNames(def)]);
}

// English-name exceptions in the official Language Standardization reference list.
// This table excludes the specified substring gate, never the card's full identity.
// https://world.digimoncard.com/rule/pdf/lang-standardization-01.pdf
const EXCLUDED_NAME_TOKENS: Record<string, readonly string[]> = {
  pagumon: ["agumon"],
  demiveemon: ["vee", "veemon"],
  kendogarurumon: ["garurumon"],
  burninggreymon: ["greymon"],
  dorugreymon: ["greymon"],
  dexdorugreymon: ["greymon"],
  indramon: ["dramon"],
  beelstarmon: ["starmon"],
  "beelstarmon x antibody": ["starmon"],
  blimpmon: ["impmon"],
  masterblimpmon: ["impmon"],
  gargomon: ["argomon"],
  megagargomon: ["argomon"],
  blackgargomon: ["argomon"],
  blackmegagargomon: ["argomon"],
};

function normalizeSubstringName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// The English reference list explicitly includes this name for Kimeramon gates.
// This is a substring reference rule, not an additional full-name identity.
const INCLUDED_NAME_TOKENS: Record<string, readonly string[]> = {
  marinechimairamon: ["kimeramon"],
};

/** Match an English name token while respecting standardized name references. */
export function nameIncludesToken(name: string, token: string): boolean {
  const normalizedName = normalizeSubstringName(name);
  const normalizedToken = normalizeSubstringName(token);
  return (
    normalizedToken.length > 0 &&
    !EXCLUDED_NAME_TOKENS[normalizedName]?.includes(normalizedToken) &&
    (normalizedName.includes(normalizedToken) ||
      INCLUDED_NAME_TOKENS[normalizedName]?.includes(normalizedToken) === true)
  );
}
