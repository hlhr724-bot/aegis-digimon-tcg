import type { rulesLayoutEn } from "@/i18n/learn/rulesLayout.en";

export const rulesLayoutPtBR = {
  "learn.guide.chapterProgress": "Capítulo {current} de {total}",
  "learn.guide.topicCount": "{count} tópicos",
  "learn.guide.chapterSearch": "Buscar capítulo, assunto ou regra",
  "learn.guide.searchEmpty": "Nenhum capítulo corresponde à busca.",
  "learn.guide.groupBasics": "Fundamentos do jogo",
  "learn.guide.groupFlow": "Turno e ações com cartas",
  "learn.guide.groupCombat": "Ataques e batalhas",
  "learn.guide.groupEffects": "Efeitos e regras avançadas",
  "learn.guide.onThisChapter": "Neste capítulo",
  "learn.guide.playBattleLabel": "Jogar batalha: {title}",
  "learn.guide.advancedScenarios": "Interações avançadas de efeitos",
  "learn.guide.advancedScenariosBody":
    "Escolha a ordem dos efeitos, acompanhe novos grupos de disparos e combine efeitos herdados com prevenção de deleção e ataques no fim do turno em partidas reais contra o bot.",
} satisfies Record<keyof typeof rulesLayoutEn, string>;
