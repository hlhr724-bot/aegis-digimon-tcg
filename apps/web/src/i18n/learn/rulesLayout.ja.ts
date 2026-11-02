import type { rulesLayoutEn } from "@/i18n/learn/rulesLayout.en";

export const rulesLayoutJa = {
  "learn.guide.chapterProgress": "全{total}章中の第{current}章",
  "learn.guide.topicCount": "{count}件のトピック",
  "learn.guide.chapterSearch": "章・トピック・ルールを検索",
  "learn.guide.searchEmpty": "検索条件に一致する章はありません。",
  "learn.guide.groupBasics": "ゲームの基本",
  "learn.guide.groupFlow": "ターンとカードの操作",
  "learn.guide.groupCombat": "アタックとバトル",
  "learn.guide.groupEffects": "効果と応用ルール",
  "learn.guide.onThisChapter": "この章の内容",
  "learn.guide.playBattleLabel": "バトルを開始：{title}",
  "learn.guide.advancedScenarios": "効果の応用と相互作用",
  "learn.guide.advancedScenariosBody":
    "実際のボット対戦で効果の処理順を選び、新たに誘発した効果のまとまりを追いながら、進化元効果を消滅の防止やターン終了時のアタックと組み合わせましょう。",
} satisfies Record<keyof typeof rulesLayoutEn, string>;
