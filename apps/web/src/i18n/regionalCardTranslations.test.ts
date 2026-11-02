import { describe, expect, it } from "vitest";
import { allCards } from "@aegis/shared/cards/registry";
import { loadPrintedCardTranslations } from "@/i18n/loadPrintedCardTranslations";
import { getTranslatedCardText } from "@/i18n/getTranslatedCardText";
import { normalizePrintedTextKey } from "@/i18n/normalizePrintedTextKey";

describe("official Japanese and Korean printed text", () => {
  it("translates the complete Japanese inherited effect from the reported card", async () => {
    const translations = await loadPrintedCardTranslations("ja");
    const card = allCards().find((entry) => entry.cardId === "EX13-004")!;
    const result = getTranslatedCardText({ text: card.inheritedEffectText!, translations, cardId: card.cardId });
    expect(result).toBe(
      "[アタック時][ターン1回]このデジモンを手札の「ウィッチェルニー」の記述があるデジモンカードに支払うコスト-1で進化できる。この効果で進化したなら、自分のセキュリティを上から1枚破棄する。",
    );
  });

  it("keeps Japanese, Korean and Chinese caches separate when switching", async () => {
    const card = allCards().find((entry) => entry.cardId === "BT1-010")!;
    const japanese = await loadPrintedCardTranslations("ja");
    const korean = await loadPrintedCardTranslations("ko");
    const chinese = await loadPrintedCardTranslations();
    const resolve = (translations: typeof japanese) =>
      getTranslatedCardText({ text: card.effectText!, translations, cardId: card.cardId });
    expect(resolve(japanese)).toContain("自分のデッキの上から5枚");
    expect(resolve(korean)).toContain("자신의 덱 위에서 5장");
    expect(resolve(chinese)).not.toBe(resolve(korean));
    expect(await loadPrintedCardTranslations("ja")).toBe(japanese);
  });

  it("translates MetalGarurumon main and inherited effects into Korean", async () => {
    const translations = await loadPrintedCardTranslations("ko");
    const card = allCards().find((entry) => entry.cardId === "BT17-027")!;
    const main = getTranslatedCardText({ text: card.effectText!, translations, cardId: card.cardId });
    const inherited = getTranslatedCardText({ text: card.inheritedEffectText!, translations, cardId: card.cardId });
    expect(main).toContain("[등장 시][진화 시]");
    expect(main).toContain("워그레이몬");
    expect(inherited).toContain("오메가몬");
    expect(inherited).toContain("액티브");
  });

  it("preserves unavailable Korean text instead of borrowing another language", async () => {
    const translations = await loadPrintedCardTranslations("ko");
    const card = allCards().find((entry) => entry.cardId === "EX13-004")!;
    expect(getTranslatedCardText({ text: card.inheritedEffectText!, translations, cardId: card.cardId })).toBe(
      card.inheritedEffectText,
    );
  });

  it.each(["ja", "ko"] as const)("keeps %s per-card keys tied to actual catalog fields", async (locale) => {
    const translations = await loadPrintedCardTranslations(locale);
    const catalog = new Map(allCards().map((card) => [card.cardId, card]));
    for (const [cardId, fields] of Object.entries(translations.byCard!)) {
      const card = catalog.get(cardId)!;
      expect(card).toBeDefined();
      const keys = [
        card.effectText,
        card.inheritedEffectText,
        card.securityEffectText,
        card.optionEffect,
        card.linkEffect,
      ]
        .filter((value): value is string => Boolean(value))
        .map(normalizePrintedTextKey);
      for (const [key, text] of Object.entries(fields)) {
        expect(keys).toContain(key);
        expect(text.trim()).not.toBe("");
        expect(text).not.toContain("\ufffd");
      }
    }
  });
});

it("preserves nested Japanese usage-condition brackets", async () => {
  const translations = await loadPrintedCardTranslations("ja");
  const card = allCards().find((entry) => entry.cardId === "BT25-043")!;
  const result = getTranslatedCardText({ text: card.optionEffect!, translations, cardId: card.cardId });
  expect(result).toContain("＜使用条件《特徴「グローイングドーン」》＞");
  expect(result).not.toContain("＞≫");
});
