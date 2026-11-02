import { type RulesChapterId, rulesChapters } from "@/learn/rules/rulesChapters";

export function isRulesChapterId(value: unknown): value is RulesChapterId {
  return typeof value === "string" && rulesChapters.some((chapter) => chapter.id === value);
}
