/* The reminder text for each keyword the Comprehensive Rules explain, for the field
   badges and the card text. A keyword the glossary does not cover points at the card's
   own effect text instead. */

import { translator, type Translate } from "../i18n";
import { KEYWORD_GLOSSARY, OFFICIAL_COMPREHENSIVE_RULES_URL } from "./keywordGlossary";

const english = translator("en");
const glossaryNames = new Map(Object.keys(KEYWORD_GLOSSARY).map((name) => [name.toLowerCase(), name]));

/** Card data writes keywords in full-width brackets (＜Blocker＞); the UI prints ASCII ones. */
export function normalizeKeywordBrackets(text: string): string {
  return text.replace(/＜/g, "<").replace(/＞/g, ">");
}

/**
 * The keyword's name as the glossary keys it: "Armor Purge", "De-Digivolve 1" and
 * "Security A. +1" all reduce to the bare compact name.
 */
export function keywordBaseName(keyword: string): string {
  const name = normalizeKeywordBrackets(keyword)
    .replace(/[<>]/g, "")
    .replace(/^\s*S(?=\s+Attack\b)/, "Security")
    .replace(/\bA\.(?=\s|$)/, "Attack")
    .replace(/\./g, "")
    .replace(/\(.*\)/, "")
    .replace(/[+-]?\d+/g, "")
    .replace(/[\s-]/g, "");
  return glossaryNames.get(name.toLowerCase()) ?? name;
}

/**
 * How the glossary explains a keyword. A Security Attack is explained with the
 * modifier the permanent carries, or else the one its printed text names.
 */
export function keywordReminder(keyword: string, t: Translate, securityAttackModifier?: number): string {
  const name = keywordBaseName(keyword);
  const modifier = securityAttackModifier || Number(/[+-]\d+/.exec(keyword)?.[0] ?? 0);
  if (name === "SecurityAttack" && modifier) {
    return english(
      modifier > 0 ? "redesign.arena.keyword.SecurityAttackUp" : "redesign.arena.keyword.SecurityAttackDown",
      {
        count: Math.abs(modifier),
      },
    );
  }
  return KEYWORD_GLOSSARY[name]?.reminder ?? t("redesign.arena.keyword.unlisted");
}

/** Where the official Comprehensive Rules define a keyword, or nothing for one they don't. */
export function keywordRuleLink(keyword: string): { rule: string; href: string } | undefined {
  const entry = KEYWORD_GLOSSARY[keywordBaseName(keyword)];
  return entry ? { rule: entry.rule, href: OFFICIAL_COMPREHENSIVE_RULES_URL } : undefined;
}

/** The rule link as a hint prints it, in English like the reminder above it. */
export function keywordRuleHintLink(keyword: string): { label: string; href: string } | undefined {
  const link = keywordRuleLink(keyword);
  return link ? { label: `Comprehensive Rules ${link.rule}`, href: link.href } : undefined;
}
