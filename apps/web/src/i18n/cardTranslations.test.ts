import { describe, expect, it } from "vitest";
import { allCards } from "@aegis/shared/cards/registry";
import { loadPrintedCardTranslations } from "@/i18n/loadPrintedCardTranslations";
import { resolveTranslatedKeyword } from "@/i18n/resolveTranslatedKeyword";
import { loadCardTranslations } from "@/i18n/loadCardTranslations";
import { getTranslatedCardName } from "@/i18n/getTranslatedCardName";
import { getTranslatedCardText } from "@/i18n/getTranslatedCardText";
import { getTranslatedKeyword } from "@/i18n/getTranslatedKeyword";
import { getTranslatedKeywordReminder } from "@/i18n/getTranslatedKeywordReminder";
import { getTranslatedCardMeta } from "@/i18n/getTranslatedCardMeta";
import { normalizePrintedTextKey } from "@/i18n/normalizePrintedTextKey";
import { cardEffectClauseForTiming } from "@/game/overlay/effectText";
import { printedModalBullets } from "@aegis/shared/effects/printedClauses";

const translations = await loadPrintedCardTranslations();

it("translates individual modal bullets from the source card without including sibling effects", () => {
  const cardId = "BT22-013";
  const clause = cardEffectClauseForTiming(cardId, "WhenDigivolving")!;
  const [digivolve, deletion] = printedModalBullets(clause);
  const first = getTranslatedCardText({ text: digivolve!, translations, cardId });
  const second = getTranslatedCardText({ text: deletion!, translations, cardId });
  expect(first).toContain("加布兽");
  expect(first).toContain("钢铁加鲁鲁兽");
  expect(first).not.toContain("消灭");
  expect(second).toContain("消灭");
  expect(second).toContain("DP最低");
  expect(second).not.toContain("加布兽");
});

it("translates the Raid Aegiochusmon printing with its own keywords and digivolve requirement", () => {
  const card = allCards().find((candidate) => candidate.cardId === "P-213")!;
  const result = getTranslatedCardText({ text: card.effectText!, translations, cardId: card.cardId });
  expect(result).toContain("进化");
  expect(result).toContain("“埃癸奥兽”：费用3");
  expect(result).toContain("突进");
  expect(result).not.toContain("安防攻击");
  expect(result).toContain("直到对方的回合结束为止");
});

it("rejects modal bullet translations when the translated option count differs", () => {
  const cardId = "BT22-013";
  const card = allCards().find((candidate) => candidate.cardId === cardId)!;
  const [text] = printedModalBullets(cardEffectClauseForTiming(cardId, "WhenDigivolving")!);
  const sample = {
    ...translations,
    text: {
      [normalizePrintedTextKey(card.effectText!)]: "【手牌】【主要】进化。\n【进化时】选择效果。\n·错误的单个选项。",
    },
  };
  expect(getTranslatedCardText({ text: text!, translations: sample, cardId })).toBe(text);
});

it.each(["ST20-03", "ST21-08"])("keeps name classification notes out of the Adventure activation for %s", (cardId) => {
  const card = allCards().find((candidate) => candidate.cardId === cardId)!;
  for (const text of [card.effectText!, cardEffectClauseForTiming(cardId, "OnPlay")!]) {
    const result = getTranslatedCardText({ text, translations, cardId });
    expect(result).toContain("[登场时][进化时]");
    expect(result).toContain("可以不支付费用");
    expect(result).not.toContain("※");
    expect(result).not.toContain("龙兽");
  }
});

it("removes unrelated name classification notes from every shared translation without a printed rule", () => {
  const entries = Object.entries(translations.text).filter(
    ([source, translated]) => !source.includes("[Rule]") && /※此卡不?属于名称中包含/.test(translated),
  );
  expect(entries.length).toBeGreaterThan(100);
  for (const [text] of entries) {
    expect(getTranslatedCardText({ text, translations })).not.toMatch(/※此卡不?属于名称中包含/);
  }
});

it("preserves a printed name rule in card details while excluding it from the resolving effect", () => {
  const cardId = "BT13-072";
  const card = allCards().find((candidate) => candidate.cardId === cardId)!;
  const full = getTranslatedCardText({ text: card.effectText!, translations, cardId });
  expect(full).toContain("※此卡不属于名称中包含");
  const text = cardEffectClauseForTiming(cardId, "WhenDigivolving")!;
  const clause = getTranslatedCardText({ text, translations, cardId });
  expect(clause).toContain("[进化时]");
  expect(clause).not.toContain("※此卡");
});

it("preserves effect targeting clarifications and Japanese printed rule notes", async () => {
  const text =
    "[Your Turn][Once Per Turn] When you play another Digimon with [Dramon] in its name or [Blue Flare] in its traits, gain 1 memory.";
  expect(getTranslatedCardText({ text, translations })).toContain(
    "※名称中包含“暴龙兽”且没有“蓝色闪耀”特征的数码宝贝卡牌不作为对象",
  );
  const japanese = await loadPrintedCardTranslations("ja");
  const rule =
    "[Rule] Card Number: Also treated as [P-009]. A deck may not have more than 4 total copies of this and [P-009].";
  expect(getTranslatedCardText({ text: rule, translations: japanese })).toContain("※カードナンバー");
});

describe("Chinese resolving clauses from complete card translations", () => {
  it("keeps Assembly separate from the end-of-turn unsuspend clause", () => {
    const assemblyCard = allCards().find((candidate) => candidate.cardId === "EX13-020")!;
    const text = assemblyCard.effectText!.split("\n").at(-1)!;
    const result = getTranslatedCardText({ text, translations, cardId: assemblyCard.cardId });
    expect(result).toBe(
      "[我方的回合结束时][每回合1次]可以将我方1只拥有“自由”/“皇家骑士”特征的数码宝贝转换为活跃状态。",
    );
    expect(
      getTranslatedCardText({ text: assemblyCard.inheritedEffectText!, translations, cardId: assemblyCard.cardId }),
    ).toBe(result);
    const assembly = assemblyCard.effectText!.split(/(?:\r\n|\r|\n)\s*(?=\[)/)[1]!.trim();
    expect(getTranslatedCardText({ text: assembly, translations, cardId: assemblyCard.cardId })).toContain("组装-2");
  });

  const card = allCards().find((candidate) => candidate.cardId === "LM-034")!;
  const clause = card.effectText!.split("\n")[1]!;

  it.each(["AD1-009", "AD1-012", "AD1-025"])("aligns reordered Assembly card effects for %s", (cardId) => {
    const card = allCards().find((candidate) => candidate.cardId === cardId)!;
    const clause = card
      .effectText!.split(/(?:\r\n|\r|\n)\s*(?=\[)/)
      .find((part) => part.startsWith("[On Play]"))!
      .trim();
    const result = getTranslatedCardText({ text: clause, translations, cardId });
    expect(result).toContain("[登场时][进化时]");
    expect(result).not.toContain("[组装");
    if (cardId === "AD1-009") {
      expect(result).toContain("退化3");
    } else if (cardId === "AD1-012") {
      expect(result).toContain("Lv.数值最低");
    } else {
      expect(result).toContain("卡组最下方");
    }
  });

  it("rejects equally sized paragraphs with incompatible timing headers", () => {
    const sample = {
      ...translations,
      text: {
        [normalizePrintedTextKey(card.effectText!)]: "颜色条件。\n【安防】错误时点。\n【主要】《延迟》\n·内存值+2。",
      },
    };
    expect(getTranslatedCardText({ text: clause, translations: sample, cardId: card.cardId })).toBe(clause);
  });

  it("rejects duplicate candidates even when their translated text agrees", () => {
    const sample = {
      ...translations,
      text: {
        [normalizePrintedTextKey(card.effectText!)]:
          "颜色条件。\n【主要】重复译文。\n【主要】重复译文。\n【主要】《延迟》\n·内存值+2。",
      },
    };
    expect(getTranslatedCardText({ text: clause, translations: sample, cardId: card.cardId })).toBe(clause);
  });

  it("keeps unknown timing headers and changed usage limits in the source language", () => {
    for (const header of ["未知时点", "主要】【每回合1次"]) {
      const sample = {
        ...translations,
        text: {
          [normalizePrintedTextKey(card.effectText!)]:
            `颜色条件。\n【${header}】不能确认的译文。\n【主要】《延迟》\n·内存值+2。`,
        },
      };
      expect(getTranslatedCardText({ text: clause, translations: sample, cardId: card.cardId })).toBe(clause);
    }
  });

  it("does not guess between different effects sharing the same timing and usage limit", () => {
    const shared = allCards().find((candidate) => candidate.cardId === "BT17-036")!;
    const text = shared
      .effectText!.split(/(?:\r\n|\r|\n)\s*(?=\[)/)
      .find((part) => part.startsWith("[All Turns]"))!
      .trim();
    const fullKey = normalizePrintedTextKey(shared.effectText!);
    const sample = { ...translations, text: { [fullKey]: translations.text[fullKey]! } };
    expect(getTranslatedCardText({ text, translations: sample, cardId: shared.cardId })).toBe(text);
  });

  it.each(["P-235", "P-236"])("distinguishes Delay with alternative keyword brackets for %s", (cardId) => {
    const shared = allCards().find((candidate) => candidate.cardId === cardId)!;
    const text = shared
      .effectText!.split(/(?:\r\n|\r|\n)\s*(?=\[)/)
      .find((part) => part.startsWith("[Main]") && !part.includes("Delay"))!
      .trim();
    const result = getTranslatedCardText({ text, translations, cardId });
    expect(result).toContain("翻开我方卡组最上方的3张卡牌");
    expect(result).not.toContain("延迟");
  });

  it("matches a breeding clause without losing its trailing standalone keywords", () => {
    const shared = allCards().find((candidate) => candidate.cardId === "EX9-057")!;
    const text = shared
      .effectText!.split(/(?:\r\n|\r|\n)\s*(?=\[)/)
      .find((part) => part.startsWith("[Breeding]"))!
      .trim();
    const result = getTranslatedCardText({ text, translations, cardId: shared.cardId });
    expect(result).toContain("[养成][对方的回合]");
    expect(result).toContain("负面兽");
    expect(result).toContain("冲突");
    expect(result).not.toContain("When one of your opponent");
  });

  it("preserves an exact Assembly clause together with its standalone keywords", () => {
    const shared = allCards().find((candidate) => candidate.cardId === "EX13-020")!;
    const text = shared.effectText!.split(/(?:\r\n|\r|\n)\s*(?=\[)/)[1]!.trim();
    const result = getTranslatedCardText({ text, translations, cardId: shared.cardId });
    expect(result).toContain("组装-2");
    expect(result).toContain("V仔兽");
    expect(result).toContain("阻挡者");
    expect(result).toContain("装甲解除");
    expect(result).not.toContain("我方的回合结束时");
  });

  it("resolves the complete Main clause without including the separate Delay effect", () => {
    const result = getTranslatedCardText({ text: clause, translations, cardId: card.cardId });
    expect(result).toBe(
      "[主要]翻开我方卡组最上方的3张卡牌。将其中的1张蓝色/红色数码宝贝卡牌加入手牌。剩余的卡牌放回到卡组最下方。此后，将此卡牌置于战斗区。",
    );
    expect(result).not.toContain("延迟");
    expect(result).not.toContain("内存值");
  });

  it("keeps the Delay bullet attached to its own timing", () => {
    const text = card.effectText!.split("\n").slice(2).join("\n");
    expect(getTranslatedCardText({ text, translations, cardId: card.cardId })).toBe("[主要]＜延迟＞\n\n·内存值+2。");
  });

  it.each([
    [
      "BT23-045",
      "[On Play] [When Digivolving] By placing 1 [Royal Base] or [Zaxon] trait Digimon card from your hand or trash face up as the bottom security card, return 1 of your opponent's Digimon with as much or less DP as this Digimon to the hand.",
      "[登场时][进化时]可从我方的手牌/废弃区中，将1张拥有“皇家基地”/“Zaxon”特征的数码宝贝卡牌正面朝上置于安防区最下方，并将对方1只DP不高于此数码宝贝DP的数码宝贝放回到其手牌中。",
    ],
    [
      "BT16-085",
      "[Start of Your Main Phase] You may play 1 [Veemon] or [Wormmon] from your hand without paying the cost. At the next end of your opponent’s turn, return it to the hand.",
      "[我方的主要阶段开始时]可以从我方的手牌中，不支付费用登场1张“V仔兽”/“虫虫兽”。当下个对方的回合结束时，将该数码宝贝放回到手牌中。",
    ],
  ])("resolves a timing clause from mismatched translated paragraphs for %s", (cardId, effectClauseText, expected) => {
    const result = getTranslatedCardText({ text: effectClauseText, translations, cardId });
    expect(result).toBe(expected);
    expect(result).not.toMatch(/\b(?:By placing|You may play)\b/);
  });

  it.each([undefined, "ST1-02", "UNKNOWN-CARD"])("does not borrow a clause with card context %s", (cardId) => {
    expect(getTranslatedCardText({ text: clause, translations, cardId })).toBe(clause);
  });

  it("preserves English without Chinese data or for an incomplete source clause", () => {
    expect(getTranslatedCardText({ text: clause, cardId: card.cardId })).toBe(clause);
    const text = clause.slice(0, -10);
    expect(getTranslatedCardText({ text, translations, cardId: card.cardId })).toBe(text);
  });

  it("rejects translations with mismatched paragraph boundaries", () => {
    const sample = { ...translations, text: { [normalizePrintedTextKey(card.effectText!)]: "【主要】不完整的译文。" } };
    expect(getTranslatedCardText({ text: clause, translations: sample, cardId: card.cardId })).toBe(clause);
  });

  it("prefers an explicit clause entry over a translation extracted from a complete card", () => {
    const sample = {
      ...translations,
      text: { ...translations.text, [normalizePrintedTextKey(clause)]: "【主要】独立译文。" },
    };
    expect(getTranslatedCardText({ text: clause, translations: sample, cardId: card.cardId })).toBe("[主要]独立译文。");
  });

  it("rejects conflicting translations of the same clause in different text boxes", () => {
    const sharedCard = allCards().find((candidate) => candidate.cardId === "BT20-089")!;
    const inheritedGroups = sharedCard.inheritedEffectText!.split(/(?:\r\n|\r|\n)\s*(?=\[)/);
    const securityGroups = sharedCard.securityEffectText!.split(/(?:\r\n|\r|\n)\s*(?=\[)/);
    const text = inheritedGroups.find((group) => group.startsWith("[End of All Turns]"))!;
    const sample = {
      ...translations,
      text: {
        [normalizePrintedTextKey(sharedCard.inheritedEffectText!)]: inheritedGroups
          .map(() => "【双方的回合结束时】进化源译文。")
          .join("\n\n"),
        [normalizePrintedTextKey(sharedCard.securityEffectText!)]: securityGroups
          .map(() => "【双方的回合结束时】安防译文。")
          .join("\n\n"),
      },
    };
    expect(getTranslatedCardText({ text, translations: sample, cardId: sharedCard.cardId })).toBe(text);
  });
});

describe("Chinese card translation data against the upstream catalog", () => {
  it("translates a resolving option clause from its own complete card text", () => {
    const card = allCards().find((candidate) => candidate.cardId === "LM-034")!;
    const clause = card.effectText!.split("\n")[1]!;
    const result = getTranslatedCardText({ text: clause, translations, cardId: card.cardId });
    expect(result).toBe(
      "[主要]翻开我方卡组最上方的3张卡牌。将其中的1张蓝色/红色数码宝贝卡牌加入手牌。剩余的卡牌放回到卡组最下方。此后，将此卡牌置于战斗区。",
    );
    expect(result).not.toContain("延迟");
    expect(result).not.toContain("内存值");
    expect(getTranslatedCardText({ text: clause, translations, cardId: "ST1-02" })).toBe(clause);
    expect(getTranslatedCardText({ text: clause, cardId: card.cardId })).toBe(clause);
    expect(getTranslatedCardText({ text: clause.slice(0, -10), translations, cardId: card.cardId })).toBe(
      clause.slice(0, -10),
    );
    const mismatched = {
      ...translations,
      text: { [normalizePrintedTextKey(card.effectText!)]: "【主要】不完整的译文。" },
    };
    expect(getTranslatedCardText({ text: clause, translations: mismatched, cardId: card.cardId })).toBe(clause);
  });

  it("shares a single dictionary load across consumers", async () => {
    const first = loadCardTranslations();
    const second = loadCardTranslations();
    expect(first).toBe(second);
    expect((await first).text).toEqual({});
    expect(loadPrintedCardTranslations()).toBe(loadPrintedCardTranslations());
    expect(await loadPrintedCardTranslations()).toBe(translations);
  });

  it("translates names without replacing upstream card identity", () => {
    const card = allCards().find((candidate) => candidate.nameEn === "Greymon")!;
    const before = JSON.stringify(card);
    expect(getTranslatedCardName({ name: card.nameEn, translations })).toBe("暴龙兽");
    expect(JSON.stringify(card)).toBe(before);
    expect(card.nameEn).toBe("Greymon");
  });

  it("matches full-width keyword brackets, entities and formatting whitespace", () => {
    const text = "[On Play] &lt;Blocker&gt;";
    const sample = { ...translations, text: { "[OnPlay]<Blocker>": "【登场时】《阻挡者》" } };
    expect(getTranslatedCardText({ text, translations: sample })).toBe("[登场时]＜阻挡者＞");
    expect(normalizePrintedTextKey("[On Play]\n＜Blocker＞")).toBe("[OnPlay]<Blocker>");
  });

  it("covers current upstream printed effects while keeping unknown effects readable", () => {
    const matched: string[] = [];
    for (const card of allCards()) {
      for (const text of [
        card.effectText,
        card.inheritedEffectText,
        card.securityEffectText,
        card.optionEffect,
        card.linkEffect,
      ]) {
        if (!text) {
          continue;
        }
        const translated = getTranslatedCardText({ text, translations });
        if (translated !== text) {
          matched.push(translated);
        }
      }
    }
    expect(matched.length).toBeGreaterThan(4000);
    expect(matched.every((text) => /[\u3400-\u9fff]/u.test(text))).toBe(true);
    expect(getTranslatedCardText({ text: "Future card effect", translations })).toBe("Future card effect");
  });

  it("preserves keyword parameters and uses translated reminders", () => {
    expect(getTranslatedKeyword({ keyword: "Reboot", translations })).toBe("重启");
    expect(getTranslatedKeyword({ keyword: "＜Security Attack +2＞", translations })).toBe("＜安防攻击+2＞");
    expect(getTranslatedKeywordReminder({ keyword: "Blocker", fallback: "English", translations })).toBe(
      translations.reminders.Blocker!.text,
    );
    expect(
      getTranslatedKeywordReminder({ keyword: "SecurityAttack", modifier: -2, fallback: "English", translations }),
    ).toContain("减少2张");
    expect(getTranslatedKeywordReminder({ keyword: "Future keyword", fallback: "English", translations })).toBe(
      "English",
    );
  });

  it("keeps English when the caller has no Chinese dictionary", () => {
    expect(getTranslatedCardName({ name: "Greymon" })).toBe("Greymon");
    expect(getTranslatedCardText({ text: "[On Play] Draw 1." })).toBe("[On Play] Draw 1.");
    expect(getTranslatedKeyword({ keyword: "Blocker" })).toBe("Blocker");
    expect(getTranslatedKeywordReminder({ keyword: "Blocker", fallback: "English" })).toBe("English");
    expect(getTranslatedCardMeta({ value: "Champion", group: "forms" })).toBe("Champion");
  });

  it("does not resolve object prototype keys as translations", () => {
    expect(getTranslatedCardName({ name: "constructor", translations })).toBe("constructor");
    expect(getTranslatedCardText({ text: "toString", translations })).toBe("toString");
    expect(getTranslatedKeyword({ keyword: "constructor", translations })).toBe("constructor");
    expect(getTranslatedCardMeta({ value: "__proto__", group: "traits", translations })).toBe("__proto__");
  });
});

it("keeps complete keyword conditions and does not substitute incomplete dictionary fragments", () => {
  expect(getTranslatedKeyword({ keyword: "Decode (Blue Lv.4)", translations })).toBe("解码(Blue Lv.4)");
  expect(getTranslatedKeyword({ keyword: "Decoy ([Xros Heart] trait)", translations })).toBe(
    "诱饵([Xros Heart] trait)",
  );
  expect(getTranslatedKeyword({ keyword: "Partition (blue Lv.4 & green Lv.4)", translations })).toBe(
    "分裂(blue Lv.4 & green Lv.4)",
  );
  expect(getTranslatedKeyword({ keyword: "<Draw 2>", translations })).toBe("<抽2张卡>");
});

it("retains signed modifiers when resolving a translated printed keyword back to its rule", () => {
  const resolved = resolveTranslatedKeyword({ keyword: "＜安防攻击-2＞", translations });
  expect(resolved.base).toBe("SecurityAttack");
  expect(getTranslatedKeywordReminder({ keyword: resolved.reminderKeyword, fallback: "English", translations })).toBe(
    "此数码宝贝进行安防判定的张数减少2张。",
  );
});

it("keeps form, attribute and trait translations in their own namespaces", () => {
  expect(getTranslatedCardMeta({ value: "Entertainment", group: "attributes", translations })).toBe("娱乐");
  expect(getTranslatedCardMeta({ value: "Entertainment", group: "traits", translations })).toBe("文艺娱乐");
});

it("keeps each maintained dictionary entry nonempty and text keys canonical", () => {
  const values = [
    ...Object.values(translations.names),
    ...Object.values(translations.text),
    ...Object.values(translations.keywords),
    ...Object.values(translations.meta).flatMap(Object.values),
    ...Object.values(translations.reminders).flatMap((entry) => [entry.zhName, entry.text]),
  ];
  expect(
    values.every((value) => typeof value === "string" && value.trim().length > 0 && !value.includes("\ufffd")),
  ).toBe(true);
  expect(Object.keys(translations.text).filter((key) => normalizePrintedTextKey(key) !== key)).toEqual([]);
});

it("resolves numbered Chinese draw labels to the upstream Draw rule", () => {
  const resolved = resolveTranslatedKeyword({ keyword: "＜抽2张卡＞", translations });
  expect(resolved.base).toBe("Draw");
  expect(resolved.label).toBe("＜抽2张卡＞");
});

it("reuses complete translated lines on new cards while preserving unfamiliar rules", () => {
  const sample = { ...translations, text: { "[OnPlay]Draw1.": "【登场时】抽1张卡。" } };
  expect(getTranslatedCardText({ text: "[On Play] Draw 1.\n[Future Timing] New rule.", translations: sample })).toBe(
    "[登场时]抽1张卡。\n[Future Timing] New rule.",
  );
  expect(getTranslatedCardText({ text: "[On Play] Draw 1. Then delete 1 Digimon.", translations: sample })).toBe(
    "[On Play] Draw 1. Then delete 1 Digimon.",
  );
});

it("translates both printed faces of the dual card and non-Digimon types", () => {
  const card = allCards().find((candidate) => candidate.cardId === "LM-067")!;
  expect(getTranslatedCardText({ text: card.effectText!, translations })).toContain("每丢弃1张");
  expect(getTranslatedCardText({ text: card.optionEffect!, translations })).toContain("退化3");
  expect(getTranslatedCardMeta({ value: "Option", group: "forms", translations })).toBe("选项");
});

it("keeps every current catalog effect covered when new cards are imported", () => {
  const missing: string[] = [];
  for (const card of allCards()) {
    for (const field of [
      "effectText",
      "inheritedEffectText",
      "securityEffectText",
      "optionEffect",
      "linkEffect",
    ] as const) {
      const text = card[field];
      if (text && getTranslatedCardText({ text, translations }) === text) {
        missing.push(`${card.cardId}:${field}`);
      }
    }
  }
  expect(missing).toEqual([]);
});

it("uses the maintained Chinese names for Arts Digivolve and Assembly", () => {
  expect(getTranslatedKeyword({ keyword: "＜Arts Digivolve＞", translations })).toBe("＜技艺进化＞");
  expect(getTranslatedKeyword({ keyword: "＜Assembly -5＞", translations })).toBe("＜组装-5＞");
  expect(getTranslatedKeyword({ keyword: "＜Assembly -6＞", translations })).toBe("＜组装-6＞");
  const artsCard = allCards().find((card) => card.cardId === "BT27-035")!;
  const assemblyCard = allCards().find((card) => card.cardId === "EX14-054")!;
  expect(getTranslatedCardText({ text: artsCard.optionEffect!, translations })).toContain("技艺进化");
  expect(getTranslatedCardText({ text: assemblyCard.effectText!, translations })).toContain("组装-5");
  expect(Object.values(translations.text).some((text) => /Arts Digivolve|Assembly|拼装/.test(text))).toBe(false);
});

it.each([2, 4, 5, 6, 7, 8, 9])("preserves Assembly's -%i cost reduction and English fallback", (reduction) => {
  const keyword = `＜Assembly -${reduction}＞`;
  expect(getTranslatedKeyword({ keyword, translations })).toBe(`＜组装-${reduction}＞`);
  expect(resolveTranslatedKeyword({ keyword, translations }).reminderKeyword).toBe(`Assembly -${reduction}`);
  expect(getTranslatedKeyword({ keyword })).toBe(keyword);
});

it("preserves Assembly material conditions", () => {
  expect(
    getTranslatedKeyword({ keyword: "<Assembly -5 (3 [Greed] trait cards w/different levels)>", translations }),
  ).toBe("<组装-5 (3 [Greed] trait cards w/different levels)>");
});

it.each(["\n", "\r\n", "\r"])("preserves %j line breaks and unfamiliar rules when reusing lines", (newline) => {
  const sample = { ...translations, text: { "[OnPlay]Draw1.": "【登场时】抽1张卡。" } };
  const text = `  [On Play] Draw 1.${newline}${newline}  [Future Timing] New rule.  `;
  expect(getTranslatedCardText({ text, translations: sample })).toBe(
    `[登场时]抽1张卡。${newline}${newline}  [Future Timing] New rule.  `,
  );
  expect(getTranslatedCardText({ text })).toBe(text);
});

it("prefers a full-field translation over line translations", () => {
  const sample = {
    ...translations,
    text: { "[OnPlay]Draw1.": "单行译文", "[OnPlay]Draw1.<Blocker>": "【登场时】整段译文" },
  };
  expect(getTranslatedCardText({ text: "[On Play] Draw 1.\n<Blocker>", translations: sample })).toBe(
    "[登场时]整段译文",
  );
});
