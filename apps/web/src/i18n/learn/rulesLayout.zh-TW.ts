import type { rulesLayoutEn } from "@/i18n/learn/rulesLayout.en";

export const rulesLayoutZhTW = {
  "learn.guide.chapterProgress": "第{current}章，共{total}章",
  "learn.guide.topicCount": "{count}個主題",
  "learn.guide.chapterSearch": "尋找章節、主題或規則",
  "learn.guide.searchEmpty": "沒有符合搜尋條件的章節。",
  "learn.guide.groupBasics": "遊戲基礎",
  "learn.guide.groupFlow": "回合與卡牌操作",
  "learn.guide.groupCombat": "攻擊與戰鬥",
  "learn.guide.groupEffects": "效果與進階規則",
  "learn.guide.onThisChapter": "本章內容",
  "learn.guide.playBattleLabel": "開始對戰：{title}",
  "learn.guide.advancedScenarios": "進階效果互動",
  "learn.guide.advancedScenariosBody":
    "在實際的機器人對戰中選擇效果處理順序，跟進新觸發的效果組，並將進化源效果與防止消滅、回合結束時的攻擊結合運用。",
} satisfies Record<keyof typeof rulesLayoutEn, string>;
