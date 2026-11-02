import { BotDifficulty } from "#shared/bot/BotDifficulty";
import { BotStyle } from "#shared/bot/BotStyle";

export const StoryDifficulty = {
  INTRO: {
    name: "INTRO",
    value: "intro",
    playerSecurity: 5,
    opponentSecurity: 5,
    opponentLevel: null,
    botDifficulty: BotDifficulty.CASUAL.value,
    botStyle: null,
  },
  CHALLENGE: {
    name: "CHALLENGE",
    value: "challenge",
    playerSecurity: 5,
    opponentSecurity: 5,
    opponentLevel: 3,
    botDifficulty: BotDifficulty.STANDARD.value,
    botStyle: null,
  },
  ELITE: {
    name: "ELITE",
    value: "elite",
    playerSecurity: 5,
    opponentSecurity: 5,
    opponentLevel: 4,
    botDifficulty: BotDifficulty.STANDARD.value,
    botStyle: null,
  },
  BOSS: {
    name: "BOSS",
    value: "boss",
    playerSecurity: 4,
    opponentSecurity: 6,
    opponentLevel: 5,
    botDifficulty: BotDifficulty.STANDARD.value,
    botStyle: BotStyle.AGGRESSIVE.value,
  },
} as const;

export type StoryDifficulty = (typeof StoryDifficulty)[keyof typeof StoryDifficulty]["value"];

export type StoryDifficultyEntry = (typeof StoryDifficulty)[keyof typeof StoryDifficulty];
