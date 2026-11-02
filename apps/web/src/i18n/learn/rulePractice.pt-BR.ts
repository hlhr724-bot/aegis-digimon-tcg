import { buildRulePracticeTranslations } from "@/i18n/learn/buildRulePracticeTranslations";
import { learnPtBR } from "@/i18n/learn/learn.pt-BR";
import type { rulePracticeEn } from "@/i18n/learn/rulePractice.en";

export const rulePracticePtBR = {
  ...buildRulePracticeTranslations({ dictionary: learnPtBR }),
  "learn.lesson.practice-game-preparation.title": "Da mão inicial à batalha vencedora",
  "learn.lesson.practice-game-preparation.summary":
    "Comece com zero memória, decks legais, cinco cartas na mão e cinco seguranças; desenvolva seu atacante e vença.",
  "learn.lesson.practice-game-preparation.goal1":
    "Reconhecer mão inicial, segurança, deck de Digi-Ovos e a exceção da compra no primeiro turno",
  "learn.lesson.practice-game-preparation.goal2":
    "Desenvolver um Digimon e usar vários turnos para remover cinco seguranças antes do ataque direto final",
  "learn.lesson.practice-game-preparation.done":
    "Você jogou desde a preparação normal, passando por criação, digievolução, passagem de memória e o ataque final.",
  "learn.lesson.practice-game-preparation.step.intro":
    "Esta partida começa com decks de cinquenta cartas, cinco cartas em cada mão, cinco seguranças e zero memória. Você começa e pula a primeira compra normal. O bot passa para você praticar toda a sequência.",
  "learn.lesson.practice-game-preparation.step.intro.hint":
    "Restam quarenta cartas em cada deck principal depois de separar cinco para a mão e cinco para a segurança. O deck de Digi-Ovos é separado.",
  "learn.lesson.practice-game-preparation.step.hatch":
    "Choque Koromon do deck de Digi-Ovos para a área de criação vazia.",
  "learn.lesson.practice-game-preparation.step.hatch.hint":
    "Chocar não custa memória nem compra carta. Isso encerra a ação de criação deste turno.",
  "learn.lesson.practice-game-preparation.step.rookie":
    "Digievolua Koromon em Agumon na área de criação. Essa rota custa zero memória e compra uma carta.",
  "learn.lesson.practice-game-preparation.step.rookie.hint":
    "Use o Agumon ST1-03 da sua mão e escolha Koromon como base.",
  "learn.lesson.practice-game-preparation.step.champion":
    "Digievolua o Agumon em Greymon na criação. Pague duas memórias; o bot recebe o turno quando o processamento terminar.",
  "learn.lesson.practice-game-preparation.step.champion.hint":
    "Digievoluir compra carta mesmo na criação e no primeiro turno. A memória passa de zero para duas do oponente.",
  "learn.lesson.practice-game-preparation.step.move":
    "Espere o bot passar. Na sua próxima fase de criação, mova Greymon para a área de batalha.",
  "learn.lesson.practice-game-preparation.step.move.hint":
    "Mover não é jogar um novo Digimon. Greymon pode atacar neste turno depois de sair da criação.",
  "learn.lesson.practice-game-preparation.step.ultimate":
    "Digievolua Greymon em Garudamon por três memórias. O Security Attack +1 herdado de Greymon dará duas checagens a Garudamon.",
  "learn.lesson.practice-game-preparation.step.ultimate.hint":
    "O efeito normal de uma fonte difere do seu efeito herdado. Leia a caixa inferior de efeitos de Greymon.",
  "learn.lesson.practice-game-preparation.step.first-checks":
    "Ataque o jogador com Garudamon. Ele checa duas das cinco seguranças do bot, uma por vez.",
  "learn.lesson.practice-game-preparation.step.first-checks.hint":
    "Garudamon tem DP para sobreviver a essas batalhas de segurança. O bot ficará com três seguranças.",
  "learn.lesson.practice-game-preparation.step.second-attacker":
    "Jogue Biyomon por duas memórias. Isso passa o turno ao bot; reserve Biyomon para o ataque vencedor.",
  "learn.lesson.practice-game-preparation.step.second-attacker.hint":
    "Um Digimon recém-jogado normalmente não pode atacar neste turno. Biyomon estará pronto depois que o bot passar.",
  "learn.lesson.practice-game-preparation.step.clear-security":
    "Nos seus turnos, ataque com Garudamon e passe quando ele estiver suspenso. Repita até o bot ficar sem segurança; mantenha Biyomon pronto para o ataque final.",
  "learn.lesson.practice-game-preparation.step.clear-security.hint":
    "Pule a criação quando não houver ação disponível. Garudamon checa duas cartas por ataque. Uma checagem restante não vira um ataque direto extra após a última segurança.",
  "learn.lesson.practice-game-preparation.step.win":
    "O bot está sem segurança. Ataque o jogador com Biyomon para vencer a partida.",
  "learn.lesson.practice-game-preparation.step.win.hint":
    "Ainda é necessário este ataque separado depois de remover a segurança. Biyomon foi jogado em um turno anterior e já pode atacar.",
  "learn.lesson.practice-rule-checks.title": "Checagens de regra: remova um Digimon com zero DP",
  "learn.lesson.practice-rule-checks.summary":
    "Use uma Option amarela para reduzir o DP de um Blocker abaixo de zero, veja a deleção por regra e vença com Salamon.",
  "learn.lesson.practice-rule-checks.goal1": "Cumprir a condição de cor de uma Option e resolver sua redução de DP",
  "learn.lesson.practice-rule-checks.goal2":
    "Distinguir deleção por checagem de regra de uma deleção instruída diretamente por efeito",
  "learn.lesson.practice-rule-checks.done":
    "Seven Heavens reduziu o DP de Monochromon; a checagem de regra o deletou e permitiu o ataque vencedor de Salamon.",
  "learn.lesson.practice-rule-checks.step.intro":
    "O bot está sem segurança, mas Monochromon pode bloquear Salamon. Seven Heavens dá -10000 DP; as regras deletam um Digimon na batalha com zero DP ou menos.",
  "learn.lesson.practice-rule-checks.step.intro.hint":
    "Salamon fornece amarelo para a condição de cor da Option. Você tem nove memórias e a Option custa sete.",
  "learn.lesson.practice-rule-checks.step.reduce-dp":
    "Use Seven Heavens da mão e escolha o Monochromon do bot. Confirme o alvo e veja-o ir para o lixo depois que o efeito terminar.",
  "learn.lesson.practice-rule-checks.step.reduce-dp.hint":
    "A Option apenas reduz DP. A regra 17-1-3-1-1 faz a deleção quando o DP resultante é zero ou menos.",
  "learn.lesson.practice-rule-checks.step.win": "O Blocker saiu do campo. Ataque o jogador com Salamon para vencer.",
  "learn.lesson.practice-rule-checks.step.win.hint":
    "Salamon já estava na batalha antes deste turno. Restam duas memórias após a Option; o turno continua seu.",
} satisfies Record<keyof typeof rulePracticeEn, string>;
