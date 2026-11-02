import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseOfficialCardPrintings } from "./parseOfficialCardPrintings.mjs";
import { buildOfficialCardTranslations } from "./buildOfficialCardTranslations.mjs";

const directory = resolve(process.argv[2] ?? ".local/card-language/sources");
const manifest = JSON.parse(await readFile(resolve(directory, "sources.json"), "utf8"));
const cards = JSON.parse(await readFile("packages/shared/src/cards/data/cards.json", "utf8"));
const files = (await readdir(directory)).sort();
for (const language of ["ja", "ko"]) {
  const printings = [];
  const expected = language === "ja" ? manifest.categories.length : manifest.koreanPages;
  const pages = files.filter(
    (name) => name.startsWith(language === "ja" ? "ja-category-" : "ko-page-") && name.endsWith(".html"),
  );
  if (pages.length !== expected) {
    throw new Error(`Incomplete ${language} download: ${pages.length}/${expected}`);
  }
  for (const name of pages) {
    const id = name.match(/(\d+)\.html$/)[1];
    const source =
      language === "ja"
        ? `https://digimoncard.com/cards/?search=true&category=${id}`
        : `https://digimoncard.co.kr/index.php?mid=cardlist&page=${id}`;
    printings.push(
      ...parseOfficialCardPrintings({ html: await readFile(resolve(directory, name), "utf8"), language, source }),
    );
  }
  const result = buildOfficialCardTranslations({ cards, printings, language });
  for (const [prefix, data] of [
    ["cardNames", result.names],
    ["cardText", result.text],
    ["cardTextByCard", result.byCard],
    ["cardMeta", result.meta],
  ]) {
    await writeFile(`apps/web/src/i18n/${prefix}.${language}.json`, JSON.stringify(data, null, 2) + "\n");
  }
  await writeFile(
    `tools/translations/official-card-text.${language}.json`,
    JSON.stringify({ fetchedAt: manifest.fetchedAt, ...result.report }, null, 2) + "\n",
  );
  console.log(
    `${language}: ${result.report.sourceCards} source cards, ${result.report.translatedFields} translated fields, ${result.report.missing.length} unavailable fields`,
  );
}
