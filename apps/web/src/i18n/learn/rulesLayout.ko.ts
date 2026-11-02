import type { rulesLayoutEn } from "@/i18n/learn/rulesLayout.en";

export const rulesLayoutKo = {
  "learn.guide.chapterProgress": "전체 {total}장 중 {current}장",
  "learn.guide.topicCount": "주제 {count}개",
  "learn.guide.chapterSearch": "장, 주제 또는 규칙 찾기",
  "learn.guide.searchEmpty": "검색 조건에 맞는 장이 없습니다.",
  "learn.guide.groupBasics": "게임의 기본",
  "learn.guide.groupFlow": "턴과 카드 행동",
  "learn.guide.groupCombat": "어택과 배틀",
  "learn.guide.groupEffects": "효과와 고급 규칙",
  "learn.guide.onThisChapter": "이 장의 내용",
  "learn.guide.playBattleLabel": "배틀 시작: {title}",
  "learn.guide.advancedScenarios": "고급 효과 상호작용",
  "learn.guide.advancedScenariosBody":
    "실제 봇 배틀에서 효과 처리 순서를 선택하고, 새로 유발된 효과 그룹을 따라가며, 진화원 효과를 소멸 방지 및 턴 종료 시 어택과 조합해 보세요.",
} satisfies Record<keyof typeof rulesLayoutEn, string>;
