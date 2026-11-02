import { type CardDefinition } from "@aegis/shared/cards/types";
import { KEYWORD_GLOSSARY } from "@/game/keywordGlossary";
import { keywordBaseName, normalizeKeywordBrackets } from "@/game/keywordReminders";
import {
  SECURITY_ATTACK_KEYWORD,
  SECURITY_ATTACK_MINUS_FILTER,
  SECURITY_ATTACK_PLUS_FILTER,
  type KeywordFilter,
} from "@/screens/KeywordFilter";

type KeywordTextField = keyof Pick<
  CardDefinition,
  "effectText" | "inheritedEffectText" | "securityEffectText" | "optionEffect" | "dualEffect" | "linkEffect"
>;

const KEYWORD_TEXT_FIELDS: readonly KeywordTextField[] = [
  "effectText",
  "inheritedEffectText",
  "securityEffectText",
  "optionEffect",
  "dualEffect",
  "linkEffect",
];

const TOKEN_START = "\uE000";

const TOKEN_END = "\uE001";

const KEYWORD_TOKEN = /<([^<>]+)>/g;

const PLACEHOLDER = new RegExp(`${TOKEN_START}(\\d+)${TOKEN_END}`, "g");

const REMINDER_TEXT = /\([^()]*\)/g;

const REFERENCE_LEAD = /(?:\bwith|\bwithout|\bhas|\bhave|\bhad|\bw\/|\baffected by)\s*$/i;

const LIST_CONTINUATION = /^\s*(?:,|\/|&|\band\b|\bor\b|,\s*and\b|,\s*or\b)?\s*$/i;

const keywordsByCard = new WeakMap<CardDefinition, ReadonlySet<KeywordFilter>>();

function removeReminderText(text: string): string {
  let current = text;
  let previous = "";
  while (current !== previous) {
    previous = current;
    current = current.replace(REMINDER_TEXT, " ");
  }
  return current;
}

function resolveKeywordFilter(token: string): KeywordFilter | undefined {
  const name = keywordBaseName(token);
  if (!Object.hasOwn(KEYWORD_GLOSSARY, name)) {
    return undefined;
  }
  if (name !== SECURITY_ATTACK_KEYWORD) {
    return name;
  }
  if (/-\s*\d*\s*$/.test(token.trim())) {
    return SECURITY_ATTACK_MINUS_FILTER;
  }
  return SECURITY_ATTACK_PLUS_FILTER;
}

type CollectTextKeywordsParams = {
  text: string;
  keywords: Set<KeywordFilter>;
};

function collectTextKeywords({ text, keywords }: CollectTextKeywordsParams): void {
  const tokens: string[] = [];
  const masked = normalizeKeywordBrackets(text).replace(KEYWORD_TOKEN, (_match, token: string) => {
    tokens.push(token);
    return `${TOKEN_START}${tokens.length - 1}${TOKEN_END}`;
  });
  const printed = removeReminderText(masked);
  let previousEnd = -1;
  let previousIsReference = false;
  for (const match of printed.matchAll(PLACEHOLDER)) {
    const gap = printed.slice(Math.max(previousEnd, 0), match.index);
    const continuesList = previousEnd >= 0 && LIST_CONTINUATION.test(gap);
    const isReference: boolean = continuesList ? previousIsReference : REFERENCE_LEAD.test(gap);
    const keyword = resolveKeywordFilter(tokens[Number(match[1])]!);
    if (keyword && !isReference) {
      keywords.add(keyword);
    }
    previousEnd = match.index + match[0].length;
    previousIsReference = isReference;
  }
}

export function findCardKeywords(card: CardDefinition): ReadonlySet<KeywordFilter> {
  const cached = keywordsByCard.get(card);
  if (cached) {
    return cached;
  }
  const keywords = new Set<KeywordFilter>();
  for (const field of KEYWORD_TEXT_FIELDS) {
    const text = card[field];
    if (text) {
      collectTextKeywords({ text, keywords });
    }
  }
  keywordsByCard.set(card, keywords);
  return keywords;
}
