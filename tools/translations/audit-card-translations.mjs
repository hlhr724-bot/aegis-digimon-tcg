import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { getCardTranslationCoverage } from "./getCardTranslationCoverage.mjs";

const { values } = parseArgs({ options: { check: { type: "boolean" }, root: { type: "string" } } });
const root = values.root ? resolve(values.root) : fileURLToPath(new URL("../../", import.meta.url));
function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}
const report = getCardTranslationCoverage({
  cards: readJson("packages/shared/src/cards/data/cards.json"),
  texts: readJson("apps/web/src/i18n/cardText.zh.json"),
  names: readJson("apps/web/src/i18n/cardNames.zh.json"),
  meta: readJson("apps/web/src/i18n/cardMeta.zh.json"),
});
mkdirSync(resolve(root, ".local"), { recursive: true });
const reportPath = resolve(root, ".local/card-translation-coverage.json");
writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ ...report, missing: undefined }));
console.log(`Report: ${reportPath}`);
if (values.check && report.missingCount > 0) {
  process.exitCode = 1;
}
