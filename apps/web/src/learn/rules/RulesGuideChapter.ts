import type { RulesChapterId } from "@/learn/rules/rulesChapters";

export type RulesGuideChapter = {
  id: RulesChapterId;
  title: string;
  topics: readonly {
    id: string;
    title: string;
    rule: string;
    body: string;
  }[];
};
