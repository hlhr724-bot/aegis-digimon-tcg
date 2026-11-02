import { buildRulePracticeTranslations } from "@/i18n/learn/buildRulePracticeTranslations";
import { learnLessonsEn } from "@/i18n/learn/lessons.en";

export const rulePracticeEn = {
  ...buildRulePracticeTranslations({ dictionary: learnLessonsEn }),
  "learn.lesson.practice-game-preparation.title": "From the opening hand to a winning battle",
  "learn.lesson.practice-game-preparation.summary":
    "Start at zero memory with legal decks, five-card hands and five security cards, then raise your attacker and win.",
  "learn.lesson.practice-game-preparation.goal1":
    "Recognize the initial hand, security stack, Digi-Egg deck and first-turn draw exception",
  "learn.lesson.practice-game-preparation.goal2":
    "Raise a Digimon and use several turns to clear five security cards before a final direct attack",
  "learn.lesson.practice-game-preparation.done":
    "You played from a normal prepared opening position through raising, digivolution, memory handovers and the final attack.",
  "learn.lesson.practice-game-preparation.step.intro":
    "This match starts with fifty-card decks, five cards in each hand, five security cards and zero memory. You go first and skip the first normal draw. The bot passes so you can practice the entire sequence.",
  "learn.lesson.practice-game-preparation.step.intro.hint":
    "There are forty cards left in each main deck after setting aside five for the hand and five for security. Your Digi-Egg deck is separate.",
  "learn.lesson.practice-game-preparation.step.hatch":
    "Hatch Koromon from your Digi-Egg deck into the empty breeding area.",
  "learn.lesson.practice-game-preparation.step.hatch.hint":
    "Hatching does not cost memory or draw a card. It ends this turn's breeding action.",
  "learn.lesson.practice-game-preparation.step.rookie":
    "Digivolve Koromon into Agumon in the breeding area. This route costs zero memory and draws one card.",
  "learn.lesson.practice-game-preparation.step.rookie.hint":
    "Use Agumon ST1-03 from your hand and select Koromon as its base.",
  "learn.lesson.practice-game-preparation.step.champion":
    "Digivolve the raised Agumon into Greymon. Pay two memory; the bot receives the turn after processing finishes.",
  "learn.lesson.practice-game-preparation.step.champion.hint":
    "Digivolution still draws a card in breeding, even on your first turn. Memory moves from zero to the opponent's two.",
  "learn.lesson.practice-game-preparation.step.move":
    "Wait for the bot to pass. During your next breeding phase, move Greymon to the battle area.",
  "learn.lesson.practice-game-preparation.step.move.hint":
    "Moving is not playing a new Digimon. Greymon can attack this turn after moving.",
  "learn.lesson.practice-game-preparation.step.ultimate":
    "Digivolve Greymon into Garudamon for three memory. Greymon's inherited Security Attack +1 will give Garudamon two checks.",
  "learn.lesson.practice-game-preparation.step.ultimate.hint":
    "The normal effect of a source card is different from its inherited effect. Read Greymon's lower effect box.",
  "learn.lesson.practice-game-preparation.step.first-checks":
    "Attack the player with Garudamon. It checks two of the bot's five security cards one at a time.",
  "learn.lesson.practice-game-preparation.step.first-checks.hint":
    "Garudamon's DP is high enough to survive these security battles. The bot will have three security cards left.",
  "learn.lesson.practice-game-preparation.step.second-attacker":
    "Play Biyomon for two memory. This hands the turn to the bot; save Biyomon for the eventual winning attack.",
  "learn.lesson.practice-game-preparation.step.second-attacker.hint":
    "A newly played Digimon normally cannot attack this turn. Biyomon will be ready after the bot passes.",
  "learn.lesson.practice-game-preparation.step.clear-security":
    "On your turns, attack with Garudamon and pass when it is suspended. Repeat until the bot has zero security; keep Biyomon ready for the final attack.",
  "learn.lesson.practice-game-preparation.step.clear-security.hint":
    "Skip breeding when you have no available action. Garudamon checks two cards per attack. An unused check never becomes an extra direct hit after the last security card.",
  "learn.lesson.practice-game-preparation.step.win":
    "The bot has no security. Attack the player with Biyomon to win the match.",
  "learn.lesson.practice-game-preparation.step.win.hint":
    "You still need this separate successful attack after clearing security. Biyomon was played on an earlier turn and can attack now.",
  "learn.lesson.practice-rule-checks.title": "Rule checks: remove a Digimon at zero DP",
  "learn.lesson.practice-rule-checks.summary":
    "Use a yellow Option to reduce a Blocker's DP below zero, observe rule deletion, then win with Salamon.",
  "learn.lesson.practice-rule-checks.goal1": "Meet an Option's color requirement and resolve its DP reduction",
  "learn.lesson.practice-rule-checks.goal2":
    "Distinguish deletion by a rule check from deletion instructed directly by an effect",
  "learn.lesson.practice-rule-checks.done":
    "Seven Heavens reduced Monochromon's DP; a rule check deleted it, allowing Salamon to deliver the winning attack.",
  "learn.lesson.practice-rule-checks.step.intro":
    "The bot has no security, but Monochromon can block Salamon. Seven Heavens gives -10000 DP; the rules delete a battle-area Digimon at zero DP or less.",
  "learn.lesson.practice-rule-checks.step.intro.hint":
    "Salamon supplies yellow for the Option's color requirement. You have nine memory and the Option costs seven.",
  "learn.lesson.practice-rule-checks.step.reduce-dp":
    "Use Seven Heavens from your hand and choose the bot's Monochromon. Confirm the target and watch it go to the trash after the effect resolves.",
  "learn.lesson.practice-rule-checks.step.reduce-dp.hint":
    "The Option only gives a DP reduction. Rule 17-1-3-1-1 performs the deletion when the resulting DP is zero or less.",
  "learn.lesson.practice-rule-checks.step.win": "The Blocker is gone. Attack the player with Salamon to win.",
  "learn.lesson.practice-rule-checks.step.win.hint":
    "Salamon was already in the battle area before this turn. The Option leaves you two memory, so the turn stays yours.",
} as const;
