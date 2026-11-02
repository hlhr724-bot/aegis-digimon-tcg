import { Profanity, profaneWords } from "@2toad/profanity";
import { allCards } from "@aegis/shared/cards/registry";
import naughtyWords from "naughty-words";
import {
  englishRecommendedBlacklistMatcherTransformers,
  englishRecommendedTransformers,
  pattern,
  RegExpMatcher,
  skipNonAlphabeticTransformer,
} from "obscenity";
import { hasBlockedWord } from "#api/moderation/blockedWords";

function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .replace(/[\u00c0-\u024f]/gu, (character) => character.normalize("NFD").replace(/\p{Diacritic}/gu, ""))
    .toLowerCase();
}

const profanity = new Profanity({
  languages: ["en"],
  wholeWord: true,
  unicodeWordBoundaries: true,
});

profanity.addWords(Object.values(naughtyWords).flat().map(normalizeText));
profanity.removeWords(["보지"]);
profanity.addWords([
  "morte",
  "mortes",
  "muerte",
  "muertes",
  "death",
  "deaths",
  "mort",
  "morts",
  "tod",
  "смерть",
  "сука",
  "موت",
  "الموت",
  "मौत",
  "मृत्यु",
  "死亡",
  "死ね",
  "죽음",
  "죽어",
]);

const nativeProfanity = new Profanity({ languages: ["en"], wholeWord: false });
nativeProfanity.removeWords(profaneWords.get("en") ?? []);
nativeProfanity.addWords(["去死", "死亡", "死ね", "くたばれ", "죽음", "죽어", "씨발", "씨팔", "개새끼"]);

const deathPatterns = [
  pattern`|morte[s]|`,
  pattern`|muerte[s]|`,
  pattern`|death[s]|`,
  pattern`|mort[s]|`,
  pattern`|tod|`,
];
const deathMatcher = new RegExpMatcher({
  blacklistedTerms: deathPatterns.map((term, id) => ({ id, pattern: term })),
  ...englishRecommendedTransformers,
  blacklistMatcherTransformers: [...englishRecommendedBlacklistMatcherTransformers, skipNonAlphabeticTransformer()],
});

const cardNames = [
  ...new Set(
    allCards()
      .map((card) => normalizeText(card.nameEn))
      .filter((name) => profanity.exists(name) || nativeProfanity.exists(name) || deathMatcher.hasMatch(name)),
  ),
];
const cardPattern = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${cardNames
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})(?![\\p{L}\\p{N}])`,
  "gu",
);

export function hasBlockedCommunityText(text: string): boolean {
  const normalized = normalizeText(text).replace(cardPattern, " ");
  return (
    hasBlockedWord(normalized) ||
    profanity.exists(normalized) ||
    nativeProfanity.exists(normalized) ||
    deathMatcher.hasMatch(normalized)
  );
}
