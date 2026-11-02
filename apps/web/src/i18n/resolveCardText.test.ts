import { expect, it, vi } from "vitest";
import * as registry from "@aegis/shared/cards/registry";
import { getReviewedCardTextContext } from "@/i18n/getReviewedCardTextContext";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { resolveCardText } from "@/i18n/resolveCardText";
import { loadPrintedCardTranslations } from "@/i18n/loadPrintedCardTranslations";
import { CardTextField } from "@/i18n/CardTextField";
import { normalizePrintedTextKey } from "@/i18n/normalizePrintedTextKey";
import contextOverrides from "@/i18n/cardTextContextOverrides.json";

const translations = await loadPrintedCardTranslations();

it.each(["AD1-011", "BT16-025", "BT16-012", "BT16-063", "BT16-077"])(
  "translates inherited Partition activation independently of the printed field for %s",
  (cardId) => {
    const result = resolveCardText({
      text: "＜Partition＞: you may play the specified digivolution cards without paying their costs.",
      cardId,
      field: CardTextField.INHERITED.value,
      translations,
      allowContext: true,
    });
    expect(result).toMatchObject({
      text: "＜分裂＞：可以不支付费用登场指定的进化源卡牌。",
      status: "complete",
      source: "dictionary",
      unresolvedSegments: [],
    });
  },
);

it("translates an unbracketed security discard clause without its sibling watcher", () => {
  const card = getCardDefinition("BT15-037")!;
  const text = card.effectText!.split("[All Turns]")[0]!.trim();
  const result = resolveCardText({ text, cardId: card.cardId, translations });
  expect(result.status).toBe("complete");
  expect(result.text).toContain("不支付费用登场");
  expect(result.text).toContain("屏障");
  expect(result.text).not.toContain("内存值");
  expect(result.text).not.toContain("When an effect");
  expect(
    resolveCardText({
      text: text.replace("without paying the cost", "by paying the cost"),
      cardId: card.cardId,
      translations,
    }).status,
  ).toBe("missing");
});

it("translates a security removal trigger reason independently of its payoff", () => {
  const result = resolveCardText({
    text: "When your security stack is removed from",
    cardId: "BT27-043",
    translations,
  });
  expect(result).toMatchObject({ text: "当我方的安防卡牌减少时", status: "complete" });
});

it("rejects an unbracketed translation with mismatched sibling timing structure", () => {
  const card = getCardDefinition("BT15-037")!;
  const text = card.effectText!.split("[All Turns]")[0]!.trim();
  const sample = {
    ...translations,
    text: { [normalizePrintedTextKey(card.effectText!)]: "此卡牌被丢弃时，不支付费用登场。[登场时]抽1张卡。" },
  };
  expect(resolveCardText({ text, cardId: card.cardId, translations: sample }).status).toBe("missing");
  expect(
    resolveCardText({ text, cardId: card.cardId, field: CardTextField.INHERITED.value, translations }).status,
  ).toBe("missing");
});

it.each(Object.values(contextOverrides))("validates the reviewed context version for $cardId", (entry) => {
  const card = getCardDefinition(entry.cardId)!;
  const field = entry.field as CardTextField;
  expect(card[field]).toBe(entry.source);
  expect(card[field]).toContain(entry.context);
  const result = resolveCardText({
    text: entry.fragment,
    cardId: entry.cardId,
    field,
    translations,
    allowContext: true,
    timing: entry.timings[0],
  });
  expect(result).toMatchObject({ status: "complete", source: "context" });
  expect(result.text).toMatch(/[\u4e00-\u9fff]/);
  const direct = {
    ...translations,
    byCard: { [entry.cardId]: { [normalizePrintedTextKey(entry.fragment)]: "经过审核的独立译文。" } },
  };
  expect(
    resolveCardText({
      text: entry.fragment,
      cardId: entry.cardId,
      field,
      translations: direct,
      allowContext: true,
      timing: entry.timings[0],
    }).text,
  ).toBe("经过审核的独立译文。");
});

it("rejects a reviewed context when the catalog source version has changed", () => {
  const entry = Object.values(contextOverrides)[0]!;
  const original = registry.getCardDefinition(entry.cardId)!;
  const lookup = vi
    .spyOn(registry, "getCardDefinition")
    .mockReturnValue({ ...original, effectText: `${original.effectText} Changed rule.` });
  try {
    expect(
      getReviewedCardTextContext({
        text: entry.fragment,
        cardId: entry.cardId,
        field: CardTextField.EFFECT.value,
        timing: entry.timings[0],
        translations,
      }),
    ).toBeUndefined();
  } finally {
    lookup.mockRestore();
  }
});

it("translates a granted timed keyword without borrowing the host's printed effect", () => {
  const result = resolveCardText({ text: "[When Digivolving] ＜Blitz＞", cardId: "BT17-018", translations });
  expect(result).toMatchObject({
    text: "[进化时] ＜进击＞",
    status: "complete",
    source: "tokens",
    unresolvedSegments: [],
  });
});

it("shows the complete verified effect when its authored step has no independent translation", () => {
  const text = "Then, you may delete 1 of your opponent's Digimon with 6000 DP or less.";
  const result = resolveCardText({
    text,
    cardId: "AD1-003",
    field: CardTextField.EFFECT.value,
    translations,
    allowContext: true,
  });
  expect(result).toMatchObject({ status: "complete", source: "context", field: "effectText" });
  expect(result.text).toContain("6000");
  expect(result.text).toContain("消灭");
  expect(result.text).toContain("松田启人");
  const changed = text.replace("6000", "7000");
  expect(resolveCardText({ text: changed, cardId: "AD1-003", translations, allowContext: true })).toMatchObject({
    text: changed,
    status: "missing",
  });
  const incomplete = text.slice(0, -8);
  expect(resolveCardText({ text: incomplete, cardId: "AD1-003", translations, allowContext: true }).status).toBe(
    "missing",
  );
});

it("keeps field context authoritative even when another field has an exact translation", () => {
  const card = getCardDefinition("BT1-010")!;
  expect(
    resolveCardText({
      text: card.effectText!,
      cardId: card.cardId,
      field: CardTextField.INHERITED.value,
      translations,
    }),
  ).toMatchObject({ text: card.effectText, status: "missing" });
});

it("keeps unrecognized bodies and referenced timing names intact and reports partial coverage", () => {
  const result = resolveCardText({
    text: "[When Digivolving] Future effect referencing [On Play] and [Main].",
    translations,
  });
  expect(result.text).toBe("[进化时] Future effect referencing [On Play] and [Main].");
  expect(result).toMatchObject({ status: "partial", source: "tokens" });
  expect(result.unresolvedSegments.join("")).toContain("Future effect");
});

it("does not mark a mixed multiline result complete just because one line has a dictionary entry", () => {
  const sample = { ...translations, text: { [normalizePrintedTextKey("[On Play] Draw 1.")]: "[登场时]抽1张卡。" } };
  const result = resolveCardText({ text: "[On Play] Draw 1.\nUnknown future body.", translations: sample });
  expect(result.status).toBe("partial");
  expect(result.unresolvedSegments).toEqual(["Unknown future body."]);
});

it("preserves reviewed full translations, existing Chinese, identifiers and unsupported languages", () => {
  const card = getCardDefinition("EX13-077")!;
  expect(resolveCardText({ text: card.effectText!, cardId: card.cardId, translations }).source).toBe("dictionary");
  expect(resolveCardText({ text: "DP+1000，ACE，BT1-010", translations })).toMatchObject({
    text: "DP+1000，ACE，BT1-010",
    status: "complete",
  });
  expect(resolveCardText({ text: "[When Digivolving] ＜Blitz＞", translations, locale: "en" }).text).toBe(
    "[When Digivolving] ＜Blitz＞",
  );
  expect(
    resolveCardText({
      text: "[When Digivolving] ＜Blitz＞",
      translations: { ...translations, text: {}, keywords: {}, reminders: {} },
      locale: "ja",
    }).status,
  ).toBe("missing");
});

it.each(["pending", "error"] as const)("distinguishes %s dictionaries from missing translations", (loadingStatus) => {
  expect(resolveCardText({ text: "[When Digivolving] ＜Blitz＞", loadingStatus })).toMatchObject({
    status: loadingStatus,
    reason: "printed-dictionary-unavailable",
  });
});

it("does not report unavailable dictionaries or partly translated keywords as complete", () => {
  expect(resolveCardText({ text: "Unknown rule.", loadingStatus: "complete" }).status).toBe("missing");
  expect(resolveCardText({ text: "＜Draw 1, delete another Digimon＞", translations }).status).toBe("partial");
});
