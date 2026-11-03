import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = decodeURIComponent(new URL("..", import.meta.url).pathname);
const INDIVIDUAL_TRANSFORMS = new Set(["translate", "scale", "rotate"]);

function listStylesheets(): string[] {
  return readdirSync(SOURCE_ROOT, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".css"))
    .map((path) => join(SOURCE_ROOT, path));
}

function blankComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
}

function findMixedTransformRules(path: string): string[] {
  const source = blankComments(readFileSync(path, "utf8"));
  const offenders: string[] = [];
  for (const rule of source.matchAll(/(?<selector>[^{}]*)\{(?<body>[^{}]*)\}/g)) {
    const { selector = "", body = "" } = rule.groups ?? {};
    const properties = body
      .split(";")
      .map((declaration) => declaration.split(":", 1).join("").trim())
      .filter(Boolean);
    if (!properties.includes("transform")) continue;
    const individual = properties.filter((property) => INDIVIDUAL_TRANSFORMS.has(property));
    if (individual.length === 0) continue;
    const line = source.slice(0, rule.index + selector.length).split("\n").length;
    offenders.push(`${path.slice(SOURCE_ROOT.length)}:${line} ${selector.trim()} (${individual.join(", ")})`);
  }
  return offenders;
}

describe("stylesheet transforms", () => {
  it("never declares transform beside translate, scale, or rotate in one rule", () => {
    const offenders = listStylesheets().flatMap(findMixedTransformRules);
    expect(offenders).toEqual([]);
  });
});
