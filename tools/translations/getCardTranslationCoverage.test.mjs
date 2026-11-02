import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { getCardTranslationCoverage } from "./getCardTranslationCoverage.mjs";

function createInput() {
  return {
    cards: [
      {
        cardId: "sample",
        nameEn: "Greymon",
        effectText: "[On Play] Draw 1.",
        forms: ["Champion"],
        attributes: ["Vaccine"],
        types: ["Dinosaur"],
      },
    ],
    names: { Greymon: "暴龙兽" },
    texts: { "[OnPlay]Draw1.": "【登场时】抽1张卡。" },
    meta: { forms: { Champion: "成熟期" }, attributes: { Vaccine: "疫苗种" }, traits: { Dinosaur: "恐龙型" } },
  };
}

test("covers complete fields with the runtime's entity, whitespace and bracket normalization", () => {
  const input = createInput();
  input.cards[0].effectText = "[On Play] &lt;Blocker&gt;\n＜Draw 1＞";
  input.texts = { "[OnPlay]<Blocker><Draw1>": "【登场时】《阻挡者》《抽1张卡》" };
  assert.equal(getCardTranslationCoverage(input).missingCount, 0);
});

for (const newline of ["\n", "\r\n", "\r"]) {
  test(`accepts fully translated complete lines separated by ${JSON.stringify(newline)}`, () => {
    const input = createInput();
    input.cards[0].effectText += newline + "  " + newline + "<Blocker>";
    input.texts["<Blocker>"] = "《阻挡者》";
    assert.equal(getCardTranslationCoverage(input).translatedCount, 1);
    assert.equal(getCardTranslationCoverage(input).missingCount, 0);
  });
}

test("reports each effect field with its card ID, original text and untranslated lines", () => {
  const input = createInput();
  for (const field of ["effectText", "inheritedEffectText", "securityEffectText", "optionEffect", "linkEffect"]) {
    input.cards[0][field] = "[On Play] Draw 1.\nFuture rule.";
  }
  const report = getCardTranslationCoverage(input);
  assert.equal(report.effectCount, 5);
  assert.equal(report.missingCount, 5);
  for (const missing of report.missing) {
    assert.equal(missing.cardId, "sample");
    assert.equal(missing.text, "[On Play] Draw 1.\nFuture rule.");
    assert.deepEqual(missing.untranslatedLines, ["Future rule."]);
  }
});

test("rejects partial sentence matches and empty translation values", () => {
  const input = createInput();
  input.cards[0].effectText += " Then delete 1 Digimon.";
  assert.equal(getCardTranslationCoverage(input).missingCount, 1);
  input.cards[0].effectText = "[On Play] Draw 1.";
  input.texts["[OnPlay]Draw1."] = " ";
  assert.equal(getCardTranslationCoverage(input).missingCount, 1);
});

test("reports missing names and metadata independently and ignores absent effects", () => {
  const input = createInput();
  input.names = {};
  input.meta = { forms: {}, attributes: {}, traits: {} };
  delete input.cards[0].effectText;
  const report = getCardTranslationCoverage(input);
  assert.equal(report.effectCount, 0);
  assert.deepEqual(
    report.missing.map(({ field }) => field),
    ["nameEn", "forms", "attributes", "types"],
  );
});

test("does not treat inherited dictionary properties as translations", () => {
  const input = createInput();
  input.cards[0].nameEn = "constructor";
  input.cards[0].effectText = "toString";
  assert.equal(getCardTranslationCoverage(input).missingCount, 2);
});

test("rejects ACE suffixes in shared names for both ordinary and ACE cards", () => {
  for (const isAce of [false, true]) {
    for (const suffix of ["ACE", " ACE", "ＡＣＥ", "ace "]) {
      const input = createInput();
      input.cards[0].isAce = isAce;
      input.names.Greymon += suffix;
      const report = getCardTranslationCoverage(input);
      assert.equal(report.missingCount, 1);
      assert.equal(report.missing[0].field, "nameEn");
      assert.equal(report.missing[0].translation, input.names.Greymon);
    }
  }
});

test("writes the report before failing strict checks, while audit mode remains usable", (context) => {
  const root = mkdtempSync(join(tmpdir(), "aegis-translations-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const input = createInput();
  input.cards[0].effectText = "New untranslated rule.";
  const files = {
    "packages/shared/src/cards/data/cards.json": input.cards,
    "apps/web/src/i18n/cardNames.zh.json": input.names,
    "apps/web/src/i18n/cardText.zh.json": input.texts,
    "apps/web/src/i18n/cardMeta.zh.json": input.meta,
  };
  for (const [path, value] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), JSON.stringify(value));
  }
  const script = fileURLToPath(new URL("./audit-card-translations.mjs", import.meta.url));
  const strict = spawnSync(process.execPath, [script, "--root", root, "--check"], { encoding: "utf8" });
  assert.equal(strict.status, 1, strict.stderr);
  const report = JSON.parse(readFileSync(join(root, ".local/card-translation-coverage.json"), "utf8"));
  assert.deepEqual(report.missing[0], {
    cardId: "sample",
    field: "effectText",
    text: "New untranslated rule.",
    untranslatedLines: ["New untranslated rule."],
  });
  const audit = spawnSync(process.execPath, [script, "--root", root], { encoding: "utf8" });
  assert.equal(audit.status, 0, audit.stderr);
  files["apps/web/src/i18n/cardText.zh.json"]["Newuntranslatedrule."] = "新的规则。";
  writeFileSync(join(root, "apps/web/src/i18n/cardText.zh.json"), JSON.stringify(input.texts));
  const complete = spawnSync(process.execPath, [script, "--root", root, "--check"], { encoding: "utf8" });
  assert.equal(complete.status, 0, complete.stderr);
});
