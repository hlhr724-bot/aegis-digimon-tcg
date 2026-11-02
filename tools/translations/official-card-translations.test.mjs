import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { parseOfficialCardPrintings } from "./parseOfficialCardPrintings.mjs";
import { buildOfficialCardTranslations } from "./buildOfficialCardTranslations.mjs";

const cards = [
  {
    cardId: "BT1-001",
    nameEn: "Test",
    effectText: "[On Play] Draw 1.",
    inheritedEffectText: "Inherited",
    forms: [],
    attributes: [],
    types: [],
  },
];

test("parses Japanese printed sections without mixing effect boxes", () => {
  const html =
    '<li class="image_lists_item"><li class="cardNo">BT1-001</li><div class="cardTitle">テスト</div><dt>[効果]</dt><dd>【登場時】<br>1 &amp; 2</dd><dt>[進化元効果]</dt><dd>継承</dd><dt>[セキュリティ効果]</dt><dd>-</dd>';
  const [printing] = parseOfficialCardPrintings({ html, language: "ja", source: "source" });
  assert.equal(printing.main, "【登場時】\n1 & 2");
  assert.equal(printing.inherited, "継承");
  assert.equal(printing.security, undefined);
});

test("ignores commented Korean sections and strips card number from name", () => {
  const html =
    '<li class="image_lists_item"><li class="cardno">BT1-001</li><div class="card_name">BT1-001R 테스트</div><dt>상단 텍스트</dt><dd>효과</dd><!-- <dt>하단 텍스트</dt><dd>잘못된</dd> --><dt>하단 텍스트</dt><dd>계승</dd>';
  const [printing] = parseOfficialCardPrintings({ html, language: "ko", source: "source" });
  assert.equal(printing.name, "테스트");
  assert.equal(printing.bottom, "계승");
});

test("withholds conflicting printings and records their missing coverage", () => {
  const printings = ["一", "二"].map((main) => ({ cardId: "BT1-001", main, source: "source" }));
  const result = buildOfficialCardTranslations({ cards, printings, language: "ja" });
  assert.deepEqual(result.text, {});
  assert.deepEqual(result.report.conflicts, [{ cardId: "BT1-001", field: "effectText" }]);
});

test("retains card-specific wording without creating ambiguous global translations", () => {
  const second = { ...cards[0], cardId: "BT1-002" };
  const printings = [
    { cardId: "BT1-001", main: "一", source: "one" },
    { cardId: "BT1-002", main: "二", source: "two" },
  ];
  const result = buildOfficialCardTranslations({ cards: [...cards, second], printings, language: "ja" });
  assert.deepEqual(result.text, {});
  assert.equal(result.byCard["BT1-001"]["[OnPlay]Draw1."], "一");
  assert.equal(result.byCard["BT1-002"]["[OnPlay]Draw1."], "二");
});

test("does not assign an ambiguous Korean lower box to multiple effect types", () => {
  const printings = [{ cardId: "BT1-001", main: "효과", bottom: "계승", source: "source" }];
  const result = buildOfficialCardTranslations({
    cards: [{ ...cards[0], securityEffectText: "Security" }],
    printings,
    language: "ko",
  });
  assert.equal(result.report.translatedFields, 1);
  assert.equal(result.report.missing.length, 2);
});

test("accounts for every catalog effect with official provenance or an explicit coverage gap", async () => {
  const { readFile } = await import("node:fs/promises");
  const catalog = JSON.parse(await readFile("packages/shared/src/cards/data/cards.json", "utf8"));
  for (const language of ["ja", "ko"]) {
    const report = JSON.parse(await readFile(`tools/translations/official-card-text.${language}.json`, "utf8"));
    const dictionary = JSON.parse(await readFile(`apps/web/src/i18n/cardTextByCard.${language}.json`, "utf8"));
    const { normalizePrintedTextKey } = await import("../../apps/web/src/i18n/normalizePrintedTextKey.ts");
    const missing = new Set(report.missing.map(({ cardId, field }) => `${cardId}:${field}`));
    let translated = 0;
    for (const card of catalog) {
      for (const field of ["effectText", "inheritedEffectText", "securityEffectText", "optionEffect", "linkEffect"]) {
        if (!card[field]) continue;
        const value = dictionary[card.cardId]?.[normalizePrintedTextKey(card[field])];
        if (value) {
          const source = report.provenance[card.cardId][field];
          const japaneseCardImage = `data/card-images/${card.cardId}-J.webp`;
          if (language === "ja" && source === japaneseCardImage) {
            assert.ok(existsSync(japaneseCardImage), japaneseCardImage);
          } else {
            assert.match(
              source,
              language === "ja"
                ? /^(?:https:\/\/digimoncard\.com\/|https:\/\/x\.com\/digimon_tcg\/status\/\d+$)/
                : /^https:\/\/digimoncard\.co\.kr\//,
            );
          }
          translated++;
        } else {
          assert.ok(missing.has(`${card.cardId}:${field}`), `${language}:${card.cardId}:${field}`);
        }
      }
    }
    assert.equal(translated, report.translatedFields);
  }
});

test("keeps Chiropmon reveal transcriptions linked to the official Japanese announcement", async () => {
  const { readFile } = await import("node:fs/promises");
  const catalog = JSON.parse(await readFile("packages/shared/src/cards/data/cards.json", "utf8"));
  const report = JSON.parse(await readFile("tools/translations/official-card-text.ja.json", "utf8"));
  const dictionary = JSON.parse(await readFile("apps/web/src/i18n/cardTextByCard.ja.json", "utf8"));
  const { normalizePrintedTextKey } = await import("../../apps/web/src/i18n/normalizePrintedTextKey.ts");
  for (const cardId of ["BT27-073", "BT27-077", "BT27-080"]) {
    const card = catalog.find((entry) => entry.cardId === cardId);
    for (const field of ["effectText", "inheritedEffectText"]) {
      assert.ok(dictionary[cardId][normalizePrintedTextKey(card[field])]);
      assert.equal(report.provenance[cardId][field], "https://x.com/digimon_tcg/status/2111615804068483363");
    }
  }
});
