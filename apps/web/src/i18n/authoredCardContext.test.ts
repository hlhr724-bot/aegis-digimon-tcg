import { expect, it, vi } from "vitest";
import * as registry from "@aegis/shared/cards/registry";
import * as compiled from "@aegis/shared/effects/data";
import { normalizePrintedTextKey } from "@/i18n/normalizePrintedTextKey";
import overrides from "@/i18n/cardTextContextOverrides.json";
import { getReviewedCardTextContext } from "@/i18n/getReviewedCardTextContext";
import { resolveCardText } from "@/i18n/resolveCardText";
import { loadPrintedCardTranslations } from "@/i18n/loadPrintedCardTranslations";
import { CardTextField } from "@/i18n/CardTextField";
import { getCardTextField } from "@/i18n/getCardTextField";

const translations = await loadPrintedCardTranslations();

it.each(Object.values(overrides))("binds the reviewed exception to its timing and source version: $cardId", (entry) => {
  const params = { text: entry.fragment, cardId: entry.cardId, field: entry.field as CardTextField, translations };
  expect(getReviewedCardTextContext(params)).toBeUndefined();
  expect(getReviewedCardTextContext({ ...params, timing: "UnknownFutureTiming" })).toBeUndefined();
  for (const timing of entry.timings) {
    expect(getReviewedCardTextContext({ ...params, timing })).toBeDefined();
  }
  const original = registry.getCardDefinition(entry.cardId)!;
  const lookup = vi
    .spyOn(registry, "getCardDefinition")
    .mockReturnValue({ ...original, effectText: `${original.effectText} Changed condition.` });
  try {
    expect(getReviewedCardTextContext({ ...params, timing: entry.timings[0] })).toBeUndefined();
  } finally {
    lookup.mockRestore();
  }
});

it.each([
  ["BT10-008", "Add 1 Digimon card"],
  ["BT3-093", "Add 1 blue"],
  ["EX6-025", "[Sagomon]"],
  ["EX6-025", "[Cho-Hakkaimon]"],
  ["BT18-060", "place 1 [Vemmon] among them as the bottom digivolution card of 1 of your Digimon."],
])("shows the complete Chinese On Play context for an authored hint on %s", (cardId, text) => {
  const params = { cardId, text, translations, timing: "OnPlay", allowContext: true };
  const result = resolveCardText(params);
  expect(result.status).toBe("complete");
  expect(result.source).toBe("context");
  expect(result.text).toContain("登场时");
  expect(result.text).toMatch(/[\u4e00-\u9fff]/);
  expect(result.text).not.toMatch(/Add |among them|On Play|All Turns|DigiXros/);
});

it.each([
  { text: "Add 2 Digimon cards", cardId: "BT10-008", timing: "OnPlay" },
  { text: "Add 1 Digimon", cardId: "BT10-008", timing: "OnPlay" },
  { text: "Add 1 Digimon card", cardId: "BT10-008", timing: "OnDeletion" },
  { text: "Add 1 Digimon card", cardId: "BT10-008", field: CardTextField.INHERITED.value, timing: "OnPlay" },
  { text: "[Sagomon]", cardId: "EX6-025", timing: "AllTurns" },
  { text: "[Sagomon]", cardId: "EX6-025", timing: "UnknownFutureTiming" },
  { text: "Add 1 blue", cardId: "BT10-008", timing: "OnPlay" },
  { text: "Add 1 blue", cardId: "BT3-093", timing: "OnDeletion" },
])("rejects an unverified authored hint: $text / $timing", (input) => {
  const result = resolveCardText({ ...input, translations, allowContext: true });
  expect(result.status).not.toBe("complete");
});

it.each([
  ["Security", CardTextField.SECURITY.value, "安防"],
  ["Main", CardTextField.EFFECT.value, "主要"],
])("keeps the same authored option hint in its %s source field", (timing, expectedField, label) => {
  const text = "add 1 card with the [Machine]/[Cyborg] trait to the hand";
  const field = getCardTextField({ cardId: "BT15-096", timing, text });
  expect(field).toBe(expectedField);
  const result = resolveCardText({ text, cardId: "BT15-096", field, timing, translations, allowContext: true });
  expect(result.status).toBe("complete");
  expect(result.field).toBe(expectedField);
  expect(result.text).toContain(label);
  expect(result.text).not.toContain("延迟");
});

it("does not expand ambiguous short names without an effect timing", () => {
  expect(
    resolveCardText({ text: "[Cho-Hakkaimon]", cardId: "EX6-025", translations, allowContext: true }).status,
  ).not.toBe("complete");
});

it("keeps inherited provenance authoritative when a hint exists only in the main effect", () => {
  const text = "Add 1 Digimon card";
  const field = getCardTextField({ cardId: "BT10-008", timing: "OnPlay", isInherited: true, text });
  expect(field).toBe(CardTextField.INHERITED.value);
  expect(
    resolveCardText({ text, cardId: "BT10-008", field, timing: "OnPlay", translations, allowContext: true }).status,
  ).not.toBe("complete");
});

it("refuses a hint after it no longer exists in the compiled effect", () => {
  const original = compiled.getCompiledCard("BT10-008")!;
  const lookup = vi.spyOn(compiled, "getCompiledCard").mockReturnValue({ ...original, effects: [] });
  try {
    expect(
      resolveCardText({
        text: "Add 1 Digimon card",
        cardId: "BT10-008",
        timing: "OnPlay",
        translations,
        allowContext: true,
      }).status,
    ).not.toBe("complete");
  } finally {
    lookup.mockRestore();
  }
});

it("refuses an authored hint when two printed clauses remain possible", () => {
  const original = registry.getCardDefinition("BT10-008")!;
  const first = "[On Play] Add 1 Digimon card to your hand.";
  const second = "[On Play] Add 1 Digimon card to your security.";
  const source = `${first}\n${second}`;
  const lookup = vi.spyOn(registry, "getCardDefinition").mockReturnValue({ ...original, effectText: source });
  const dictionary = {
    ...translations,
    text: {
      ...translations.text,
      [normalizePrintedTextKey(source)]: "[登场时]将1张数码宝贝卡牌加入手牌。\n[登场时]将1张数码宝贝卡牌加入安防区。",
    },
  };
  try {
    expect(
      resolveCardText({
        text: "Add 1 Digimon card",
        cardId: "BT10-008",
        timing: "OnPlay",
        translations: dictionary,
        allowContext: true,
      }).status,
    ).not.toBe("complete");
  } finally {
    lookup.mockRestore();
  }
});
