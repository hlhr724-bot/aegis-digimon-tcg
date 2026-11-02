import type { Locale } from "@/i18n/locales";

const englishLabels = {
  source: "Official Comprehensive Rules · Ver. 4.3 · September 18, 2026",
  introduction:
    "Explore every section of the official manual, with printed rule numbers and guided battles against the bot. Open a chapter's example match to practice its rules with real cards.",
  battles: "Example battles against the bot",
  playBattle: "Play battle",
  practice: "Rules practice",
  rule: "Official rule",
  attackFlow: {
    declare: "Suspend the attacker and choose a legal target",
    triggers: "Resolve attack triggers",
    defend: "Defender: Counter timing, then block timing",
    confirm: "Confirm the attack can continue with its current target",
    battle: "Digimon target: battle",
    security: "Player with security: check cards one at a time",
    win: "Player with 0 security and at least 1 allowed check: win",
    caution:
      "A check that removes the last security card ends without an extra direct hit. Resolve each [Security] effect before any security battle.",
  },
  fallback:
    "The detailed rules guide is currently available in English and Brazilian Portuguese. Its explanations are shown in English; battle coaching follows your selected language.",
};

const portugueseLabels: typeof englishLabels = {
  source: "Manual completo oficial · Ver. 4.3 · 18 de setembro de 2026",
  introduction:
    "Explore todas as seções do manual oficial, com os números das regras e batalhas guiadas contra o bot. Abra a partida de exemplo de um capítulo para praticar suas regras com cartas reais.",
  battles: "Batalhas de exemplo contra o bot",
  playBattle: "Jogar batalha",
  practice: "Treino de regras",
  rule: "Regra oficial",
  attackFlow: {
    declare: "Suspenda o atacante e escolha um alvo permitido",
    triggers: "Resolva os efeitos disparados pelo ataque",
    defend: "Defensor: timing de Counter, depois timing de bloqueio",
    confirm: "Confirme se o ataque continua com o alvo atual",
    battle: "Alvo Digimon: batalha",
    security: "Jogador com segurança: cheque uma carta por vez",
    win: "Jogador com 0 segurança e ao menos 1 check permitido: vitória",
    caution:
      "O check que remove a última segurança termina sem um golpe direto extra. Resolva cada efeito [Security] antes de uma eventual batalha de segurança.",
  },
  fallback:
    "O guia detalhado de regras está disponível em inglês e português brasileiro. Suas explicações são exibidas em inglês; o guia das batalhas acompanha o idioma selecionado.",
};

export function getRulesGuideLabels(locale: Locale): typeof englishLabels {
  return locale === "pt-BR" ? portugueseLabels : englishLabels;
}
