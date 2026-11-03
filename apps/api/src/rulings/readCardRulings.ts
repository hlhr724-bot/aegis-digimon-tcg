import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CardErrata, CardRulingQuestion, CardRulings } from "@aegis/shared/cards/CardRulings";

type RulingsSnapshot = {
  questionsByCard: Record<string, CardRulingQuestion[] | undefined>;
  errataByCard: Record<string, CardErrata | undefined>;
};

let snapshot: RulingsSnapshot | undefined;

function readKnowledgeBaseFile(fileName: string): unknown {
  const knowledgeBaseDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "data", "kb");
  return JSON.parse(readFileSync(join(knowledgeBaseDirectory, fileName), "utf8"));
}

function loadSnapshot(): RulingsSnapshot {
  snapshot ??= {
    questionsByCard: readKnowledgeBaseFile("qa.json") as RulingsSnapshot["questionsByCard"],
    errataByCard: readKnowledgeBaseFile("errata.json") as RulingsSnapshot["errataByCard"],
  };
  return snapshot;
}

export function readCardRulings(cardId: string): CardRulings {
  const { questionsByCard, errataByCard } = loadSnapshot();
  const errata = Object.hasOwn(errataByCard, cardId) ? errataByCard[cardId] : undefined;
  const questions = Object.hasOwn(questionsByCard, cardId) ? questionsByCard[cardId] : undefined;
  return {
    cardId,
    errata: errata ? { date: errata.date, changes: errata.changes } : null,
    questions: (questions ?? []).map(({ qno, question, answer, date, related }) => ({
      qno,
      question,
      answer,
      date,
      related,
    })),
  };
}
