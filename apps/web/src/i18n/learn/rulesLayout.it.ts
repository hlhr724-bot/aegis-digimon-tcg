import type { rulesLayoutEn } from "@/i18n/learn/rulesLayout.en";

export const rulesLayoutIt = {
  "learn.guide.chapterProgress": "Capitolo {current} di {total}",
  "learn.guide.topicCount": "{count} argomenti",
  "learn.guide.chapterSearch": "Cerca un capitolo, un argomento o una regola",
  "learn.guide.searchEmpty": "Nessun capitolo corrisponde a questa ricerca.",
  "learn.guide.groupBasics": "Fondamenti del gioco",
  "learn.guide.groupFlow": "Turni e azioni con le carte",
  "learn.guide.groupCombat": "Attacchi e battaglie",
  "learn.guide.groupEffects": "Effetti e regole avanzate",
  "learn.guide.onThisChapter": "In questo capitolo",
  "learn.guide.playBattleLabel": "Gioca la battaglia: {title}",
  "learn.guide.advancedScenarios": "Interazioni avanzate tra effetti",
  "learn.guide.advancedScenariosBody":
    "Scegli l’ordine degli effetti, segui i nuovi gruppi di effetti innescati e combina gli effetti ereditati con la prevenzione dell’eliminazione e gli attacchi di fine turno in vere partite contro il bot.",
} satisfies Record<keyof typeof rulesLayoutEn, string>;
