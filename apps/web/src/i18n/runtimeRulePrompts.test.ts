import { expect, it } from "vitest";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import ts from "typescript-api";
import { loadPrintedCardTranslations } from "@/i18n/loadPrintedCardTranslations";
import { resolveCardText } from "@/i18n/resolveCardText";

const translations = await loadPrintedCardTranslations();
const templates = [
  "＜Material Save 2＞: When this Digimon would be deleted, you may place up to 2 of its specified digivolution cards under one of your Tamers.",
  "＜Fragment (2)＞: trash 2 of this Digimon's digivolution cards to prevent its deletion?",
  "＜Fragment (3)＞: choose 3 of this Digimon's digivolution cards to trash.",
  "＜Digisorption -3＞: suspend 1 Digimon to reduce the digivolution cost by 3?",
  "＜Material Save 2＞: place up to 2 of this Digimon's specified digivolution cards under 1 of your Tamers?",
  "＜Material Save 2＞: choose 1 specified digivolution card to place under the Tamer, in order.",
  "＜Material Save 3＞: choose 2 specified digivolution cards to place under the Tamer, in order.",
  "＜Overclock [Puppet]＞: at the end of this turn, by deleting 1 of your Tokens or other [Puppet] trait Digimon, this Digimon attacks a player without suspending.",
  "＜Arts Digivolve＞: digivolve one of your Digimon into [Alphamon: Ouryuken] (BT27-103) instead of trashing it?",
  "＜Detach＞: trash 1 link card so Alphamon: Ouryuken doesn't leave the battle area.",
  "＜Detach ([Puppet] trait)＞: trash 1 link card so Alphamon: Ouryuken doesn't leave the battle area.",
];

it("covers engine-authored keyword descriptions separately from printed card text", () => {
  const literals = new Set<string>();
  const templateSources: Record<string, string[]> = {};
  function inspectDirectory(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        inspectDirectory(path);
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
        function visit(node: ts.Node) {
          if (ts.isStringLiteralLike(node) && /^＜[^＞]+＞:/.test(node.text)) {
            literals.add(node.text);
          }
          if (ts.isTemplateExpression(node) && /^＜/.test(node.head.text)) {
            const key = path.replace("../api/", "apps/api/");
            (templateSources[key] ??= []).push(node.getText(source));
          }
          ts.forEachChild(node, visit);
        }
        visit(source);
      }
    }
  }
  inspectDirectory("../api/src/engine");
  for (const entries of Object.values(templateSources)) {
    entries.sort();
  }
  expect(templateSources).toEqual(
    JSON.parse(readFileSync("../../tools/translations/runtime-rule-template-sources.json", "utf8")),
  );
  const results = [...literals, ...templates].map((text) => ({
    input: text,
    ...resolveCardText({ text, translations, cardId: "BT27-103" }),
  }));
  mkdirSync("../../.local", { recursive: true });
  writeFileSync(
    "../../.local/runtime-rule-prompt-coverage.json",
    JSON.stringify({ fixed: literals.size, templates: templates.length, results }, null, 2),
  );
  expect(literals.size).toBeGreaterThan(20);
  expect(results.filter((result) => result.status !== "complete")).toEqual([]);
  for (const result of results) {
    expect(result.text).toMatch(/[\u4e00-\u9fff]/);
  }
}, 30000);

it.each([
  "＜Material Save 2＞: When this Digimon would be deleted, you may place up to 3 of its specified digivolution cards under one of your Tamers.",
  "＜Fragment (2)＞: trash 3 of this Digimon's digivolution cards to prevent its deletion?",
  "＜Fragment (-2)＞: trash -2 of this Digimon's digivolution cards to prevent its deletion?",
  "＜Digisorption -3＞: suspend 2 Digimon to reduce the digivolution cost by 3?",
  "＜Material Save 2＞: choose 3 specified digivolution cards to place under the Tamer, in order.",
  "＜Overclock [Unknown Trait]＞: at the end of this turn, by deleting 1 of your Tokens or other [Unknown Trait] trait Digimon, this Digimon attacks a player without suspending.",
  "＜Arts Digivolve＞: digivolve one of your Digimon into [Wrong card] (BT27-103) instead of trashing it?",
])("keeps unsupported or inconsistent template parameters visible: %s", (text) => {
  const result = resolveCardText({ text, translations, cardId: "BT27-103" });
  expect(result.status).not.toBe("complete");
  expect(result.unresolvedSegments.length).toBeGreaterThan(0);
});
