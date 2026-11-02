import type { rulesLayoutEn } from "@/i18n/learn/rulesLayout.en";

export const rulesLayoutDe = {
  "learn.guide.chapterProgress": "Kapitel {current} von {total}",
  "learn.guide.topicCount": "{count} Themen",
  "learn.guide.chapterSearch": "Kapitel, Thema oder Regel suchen",
  "learn.guide.searchEmpty": "Keine Kapitel entsprechen dieser Suche.",
  "learn.guide.groupBasics": "Spielgrundlagen",
  "learn.guide.groupFlow": "Spielzüge und Kartenaktionen",
  "learn.guide.groupCombat": "Angriffe und Kämpfe",
  "learn.guide.groupEffects": "Effekte und fortgeschrittene Regeln",
  "learn.guide.onThisChapter": "In diesem Kapitel",
  "learn.guide.playBattleLabel": "Kampf spielen: {title}",
  "learn.guide.advancedScenarios": "Fortgeschrittene Effektinteraktionen",
  "learn.guide.advancedScenariosBody":
    "Bestimmen Sie in echten Kämpfen gegen Bots die Effektreihenfolge, verfolgen Sie neu ausgelöste Effektgruppen und kombinieren Sie vererbte Effekte mit Schutz vor Löschung und Angriffen am Zugende.",
} satisfies Record<keyof typeof rulesLayoutEn, string>;
