export const BotLine = {
  GREETING: { name: "GREETING", value: "greeting", isRepeatable: false, text: "Let's battle! Show me your best." },
  BOSS_GREETING: {
    name: "BOSS_GREETING",
    value: "bossGreeting",
    isRepeatable: false,
    text: "You made it this far. Now face my full strength!",
  },
  BIG_DIGIVOLVE: { name: "BIG_DIGIVOLVE", value: "bigDigivolve", isRepeatable: true, text: "Digivolve! Go, {card}!" },
  PRESSURE: { name: "PRESSURE", value: "pressure", isRepeatable: false, text: "Your security is gone. One more hit!" },
  LAST_STAND: {
    name: "LAST_STAND",
    value: "lastStand",
    isRepeatable: false,
    text: "No security left... I'm not done yet!",
  },
  VICTORY: { name: "VICTORY", value: "victory", isRepeatable: false, text: "Good game! Train hard and try again." },
  DEFEAT: { name: "DEFEAT", value: "defeat", isRepeatable: false, text: "You were stronger this time. Good game!" },
} as const;

export type BotLine = (typeof BotLine)[keyof typeof BotLine]["value"];

export type BotLineEntry = (typeof BotLine)[keyof typeof BotLine];
