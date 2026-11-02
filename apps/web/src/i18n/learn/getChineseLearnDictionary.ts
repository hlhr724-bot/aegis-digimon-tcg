import names from "@/i18n/cardNames.zh.json";
import keywords from "@/i18n/cardKeywords.zh.json";
import meta from "@/i18n/cardMeta.zh.json";
import reminders from "@/i18n/keywordReminders.zh.json";

type Params<T extends Record<string, string>> = { dictionary: T };

function getTermPattern(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const terms = new Map<string, string>([
  ...Object.entries(meta.traits),
  ...Object.entries(names),
  ...Object.entries(keywords),
]);

for (const [term, entry] of Object.entries(reminders.reminders)) {
  terms.set(term, entry.zhName);
  terms.set(term.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").replace(/([a-z])([A-Z])/g, "$1 $2"), entry.zhName);
}

const translatedTerms = [...terms.entries()].filter(
  ([term, translation]) => term !== translation && /[A-Za-z]/.test(term),
);
const pattern = new RegExp(
  `\\{[^{}]*\\}|(?<![A-Za-z0-9_])(?:${translatedTerms
    .map(([term]) => term)
    .sort((left, right) => right.length - left.length)
    .map(getTermPattern)
    .join("|")})(?![A-Za-z0-9_])`,
  "g",
);

export function getChineseLearnDictionary<T extends Record<string, string>>({
  dictionary,
}: Params<T>): Record<keyof T, string> {
  return Object.fromEntries(
    Object.entries(dictionary).map(([key, value]) => [
      key,
      key.startsWith("learn.") ? value.replace(pattern, (term) => terms.get(term) ?? term) : value,
    ]),
  ) as Record<keyof T, string>;
}
