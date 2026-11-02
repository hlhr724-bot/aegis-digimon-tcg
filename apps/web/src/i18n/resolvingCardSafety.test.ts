import { getPrintedClauseGroupTexts } from "@/game/getPrintedClauseGroupTexts";
import { expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { noticeEffectClause } from "@/game/overlay/effectText";
import { getTranslatedCardText } from "@/i18n/getTranslatedCardText";
import { loadPrintedCardTranslations } from "@/i18n/loadPrintedCardTranslations";
import { normalizePrintedTextKey } from "@/i18n/normalizePrintedTextKey";

const translations = await loadPrintedCardTranslations();

it("keeps referenced timing labels inside the resolving effect rather than making extra clauses", () => {
  const text = noticeEffectClause({ cardId: "BT24-102", timing: "EndOfYourTurn", description: undefined })!;
  const result = getTranslatedCardText({ text, cardId: "BT24-102", translations });
  expect(result).toContain("[我方的回合结束时]");
  expect(result).toContain("1个[登场时]/[进化时]效果");
  expect(result).not.toContain("DP+1000");
  expect(result).not.toContain("内存值+1");
});

it("uses reviewed complete entries to distinguish two effects with the same timing", () => {
  const card = getCardDefinition("BT17-036")!;
  const clauses = getPrintedClauseGroupTexts(card.effectText!).filter((text) => text.startsWith("[All Turns]"));
  const first = getTranslatedCardText({ text: clauses[0]!, cardId: card.cardId, translations });
  const second = getTranslatedCardText({ text: clauses[1]!, cardId: card.cardId, translations });
  expect(first).toContain("此数码宝贝不会离开");
  expect(first).not.toContain("列昂·亚历山大");
  expect(second).toContain("列昂·亚历山大");
  expect(second).not.toContain("此数码宝贝不会离开");
});

it("preserves changed conditions even when a similar reviewed clause exists", () => {
  const text = getPrintedClauseGroupTexts(getCardDefinition("BT24-018")!.effectText!).at(-1)!;
  const changed = text.replace("lowest DP", "highest DP");
  expect(changed).not.toBe(text);
  expect(getTranslatedCardText({ text: changed, cardId: "BT24-018", translations })).toBe(changed);
});

it.each(["remove-limit", "change-timing"])("refuses unsafe whole-card alignment after %s", (mutation) => {
  const card = getCardDefinition("BT19-048")!;
  const fullKey = normalizePrintedTextKey(card.effectText!);
  const original = translations.text[fullKey]!;
  const changed =
    mutation === "remove-limit"
      ? original.replace("［每回合1次］", "")
      : original.replace("【双方的回合】", "【我方的回合】");
  expect(changed).not.toBe(original);
  const sample = { ...translations, text: { [fullKey]: changed } };
  const text = noticeEffectClause({ cardId: card.cardId, timing: "AllTurns", description: undefined })!;
  expect(getTranslatedCardText({ text, cardId: card.cardId, translations: sample })).toBe(text);
});

it("handles curly apostrophes and twice-per-turn limits without losing their timing", () => {
  const opponent = noticeEffectClause({ cardId: "BT13-077", timing: "EndOfOpponentsTurn", description: undefined })!;
  const twice = noticeEffectClause({ cardId: "BT1-081", timing: "EndOfAttack", description: undefined })!;
  expect(getTranslatedCardText({ text: opponent, cardId: "BT13-077", translations })).toContain("[对方的回合结束时]");
  expect(getTranslatedCardText({ text: twice, cardId: "BT1-081", translations })).toContain("[每回合2次]");
});

it("keeps the English catalog immutable while resolving a translated clause", () => {
  const card = getCardDefinition("EX5-030")!;
  const before = JSON.stringify(card);
  const text = noticeEffectClause({ cardId: card.cardId, timing: "WhenAttacking", description: undefined })!;
  expect(getTranslatedCardText({ text, cardId: card.cardId, translations })).toContain("[攻击时]");
  expect(JSON.stringify(card)).toBe(before);
});
