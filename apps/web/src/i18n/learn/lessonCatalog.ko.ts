import type { lessonCatalogEn } from "@/i18n/learn/lessonCatalog.en";

export const lessonCatalogKo = {
  "learn.catalog.introduction":
    "주제별로 배워 보세요. 각 배틀에는 단계별 목표, 가이드 해설, 공식 규칙서의 규칙 번호 링크가 있습니다.",
  "learn.catalog.navigation": "레슨 주제",
  "learn.catalog.officialRules": "공식 규칙",
  "learn.catalog.readChapter": "가이드 해설 읽기",
  "learn.catalog.groupProgress": "{count}개 중 {completed}개 완료",
  "learn.catalog.firstSteps": "첫걸음",
  "learn.catalog.firstStepsBody":
    "승리 조건, 시큐리티 체크, 디지타마 부화, 디지몬을 배틀 에어리어로 이동하는 방법을 배웁니다.",
  "learn.catalog.buildField": "메모리와 진화",
  "learn.catalog.buildFieldBody":
    "공유 메모리 게이지에서 코스트를 지불하고, 턴이 바뀌기 전에 효과를 처리하고, 진화원을 쌓아 보세요.",
  "learn.catalog.defend": "방어와 지원",
  "learn.catalog.defendBody": "어택을 블록하고, DP를 비교하고, 테이머와 진화원 효과로 자신의 필드를 강화합니다.",
  "learn.catalog.rulesPractice": "규칙 실습",
  "learn.catalog.rulesPracticeBody":
    "초기 패부터 시작하거나 DP가 0일 때의 규칙 체크를 연습하세요. 이 배틀은 선행 조건 없이 플레이할 수 있습니다.",
  "learn.catalog.combat": "전투 키워드",
  "learn.catalog.combatBody": "어택 허용 조건, 대상 변경, 추가 체크, 턴 종료 시 어택을 연습합니다.",
  "learn.catalog.protection": "보호와 소재",
  "learn.catalog.protectionBody": "소멸 방지, 시큐리티 방어, 저장한 소재를 나중에 활용하는 방법을 체험합니다.",
  "learn.catalog.evolution": "진화와 자원",
  "learn.catalog.evolutionBody": "특수 진화, 코스트 감소, 링크 카드, 드로우 효과, 진화원 카드를 살펴봅니다.",
} satisfies Record<keyof typeof lessonCatalogEn, string>;
