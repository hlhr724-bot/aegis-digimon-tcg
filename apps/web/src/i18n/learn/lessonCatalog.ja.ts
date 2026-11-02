import type { lessonCatalogEn } from "@/i18n/learn/lessonCatalog.en";

export const lessonCatalogJa = {
  "learn.catalog.introduction":
    "テーマ別に学べます。各バトルにはガイド付きの目標、ガイドの解説、公式ルールマニュアルのルール番号へのリンクがあります。",
  "learn.catalog.navigation": "レッスンのテーマ",
  "learn.catalog.officialRules": "公式ルール",
  "learn.catalog.readChapter": "ガイドの解説を読む",
  "learn.catalog.groupProgress": "{count}件中{completed}件完了",
  "learn.catalog.firstSteps": "はじめの一歩",
  "learn.catalog.firstStepsBody":
    "勝利条件、セキュリティチェック、デジタマの孵化、デジモンをバトルエリアに移す手順を学びます。",
  "learn.catalog.buildField": "メモリーと進化",
  "learn.catalog.buildFieldBody":
    "共通のメモリーゲージでコストを支払い、ターン交代前に効果を処理し、進化元を重ねます。",
  "learn.catalog.defend": "防御とサポート",
  "learn.catalog.defendBody": "アタックをブロックし、DPを比べ、テイマーと進化元効果で自分の場を強化します。",
  "learn.catalog.rulesPractice": "ルールの実践",
  "learn.catalog.rulesPracticeBody":
    "初期手札から始めるか、DPが0のルールチェックを練習できます。これらのバトルには前提条件がありません。",
  "learn.catalog.combat": "アタック関連のキーワード",
  "learn.catalog.combatBody": "アタックの許可、対象変更、追加チェック、ターン終了時のアタックを練習します。",
  "learn.catalog.protection": "防御と素材",
  "learn.catalog.protectionBody": "消滅の防止、セキュリティの防御、保存した素材を後で使う手順を試します。",
  "learn.catalog.evolution": "進化とリソース",
  "learn.catalog.evolutionBody": "特殊な進化、コスト軽減、リンクカード、ドロー効果、進化元カードを学びます。",
} satisfies Record<keyof typeof lessonCatalogEn, string>;
