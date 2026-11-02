import type { rulesLayoutEn } from "@/i18n/learn/rulesLayout.en";

export const rulesLayoutFr = {
  "learn.guide.chapterProgress": "Chapitre {current} sur {total}",
  "learn.guide.topicCount": "{count} sujets",
  "learn.guide.chapterSearch": "Rechercher un chapitre, un sujet ou une règle",
  "learn.guide.searchEmpty": "Aucun chapitre ne correspond à cette recherche.",
  "learn.guide.groupBasics": "Les bases du jeu",
  "learn.guide.groupFlow": "Tours et actions avec les cartes",
  "learn.guide.groupCombat": "Attaques et combats",
  "learn.guide.groupEffects": "Effets et règles avancées",
  "learn.guide.onThisChapter": "Dans ce chapitre",
  "learn.guide.playBattleLabel": "Jouer la bataille : {title}",
  "learn.guide.advancedScenarios": "Interactions avancées entre effets",
  "learn.guide.advancedScenariosBody":
    "Choisissez l’ordre des effets, suivez les nouveaux groupes d’effets déclenchés et combinez les effets hérités avec la prévention de la suppression et les attaques de fin de tour dans de vraies parties contre le bot.",
} satisfies Record<keyof typeof rulesLayoutEn, string>;
