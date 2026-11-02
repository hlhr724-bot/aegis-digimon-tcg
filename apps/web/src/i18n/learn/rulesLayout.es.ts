import type { rulesLayoutEn } from "@/i18n/learn/rulesLayout.en";

export const rulesLayoutEs = {
  "learn.guide.chapterProgress": "Capítulo {current} de {total}",
  "learn.guide.topicCount": "{count} temas",
  "learn.guide.chapterSearch": "Buscar un capítulo, tema o regla",
  "learn.guide.searchEmpty": "Ningún capítulo coincide con esta búsqueda.",
  "learn.guide.groupBasics": "Fundamentos del juego",
  "learn.guide.groupFlow": "Turnos y acciones con cartas",
  "learn.guide.groupCombat": "Ataques y combates",
  "learn.guide.groupEffects": "Efectos y reglas avanzadas",
  "learn.guide.onThisChapter": "En este capítulo",
  "learn.guide.playBattleLabel": "Jugar batalla: {title}",
  "learn.guide.advancedScenarios": "Interacciones avanzadas entre efectos",
  "learn.guide.advancedScenariosBody":
    "Elige el orden de los efectos, sigue los nuevos grupos de efectos que se disparan y combina efectos heredados con la prevención de eliminación y los ataques de final de turno en partidas reales contra el bot.",
} satisfies Record<keyof typeof rulesLayoutEn, string>;
