import type { rulesLayoutEn } from "@/i18n/learn/rulesLayout.en";

export const rulesLayoutZhCN = {
  "learn.guide.chapterProgress": "第{current}章，共{total}章",
  "learn.guide.topicCount": "{count}个主题",
  "learn.guide.chapterSearch": "查找章节、主题或规则",
  "learn.guide.searchEmpty": "没有符合搜索条件的章节。",
  "learn.guide.groupBasics": "游戏基础",
  "learn.guide.groupFlow": "回合与卡牌操作",
  "learn.guide.groupCombat": "攻击与战斗",
  "learn.guide.groupEffects": "效果与进阶规则",
  "learn.guide.onThisChapter": "本章内容",
  "learn.guide.playBattleLabel": "开始对战：{title}",
  "learn.guide.advancedScenarios": "进阶效果互动",
  "learn.guide.advancedScenariosBody":
    "在真实的机器人对战中选择效果处理顺序，跟进新触发的效果组，并将进化源效果与防止消灭、回合结束时的攻击结合运用。",
} satisfies Record<keyof typeof rulesLayoutEn, string>;
