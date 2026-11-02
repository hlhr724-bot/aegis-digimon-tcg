import { describe, expect, it } from "vitest";
import { translator } from "../../../i18n";
import { choiceLabel } from "./decisionChoiceLabels";
import { readFileSync } from "node:fs";

it("covers every explicit modal label in the shared card effect catalog", () => {
  const catalog: unknown = JSON.parse(
    readFileSync(new URL("../../../../../../packages/shared/src/effects/effects.json", import.meta.url), "utf8"),
  );
  const labels = getModalLabels(catalog);
  expect(labels.size).toBeGreaterThan(50);
  const untranslated = [...labels].filter((choice) => choiceLabel({ choice, t: translator("zh-CN") }) === choice);
  expect(untranslated).toEqual([]);
  const changedEnglish = [...labels].filter((choice) => choiceLabel({ choice, t: translator("en") }) !== choice);
  expect(changedEnglish).toEqual([]);
});

function getModalLabels(value: unknown, labels = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((entry: unknown) => getModalLabels(entry, labels));
  } else if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (key === "labels" && Array.isArray(entry)) {
        entry
          .filter((label: unknown): label is string => typeof label === "string")
          .forEach((label) => labels.add(label));
      }
      getModalLabels(entry, labels);
    }
  }
  return labels;
}

it.each([
  ["Top of deck", "卡组顶", "Top of the deck"],
  ["Bottom of security", "安防区堆底", "Bottom of the security stack"],
  ["Pay 0 memory", "支付0点内存"],
  ["Pay 12 memory", "支付12点内存"],
  ["Trash 0 security", "丢弃0张安防卡牌"],
  ["Trash 3 security cards", "丢弃3张安防卡牌"],
  ["Trash 2 cards", "丢弃2张卡牌"],
  ["Trash 3", "丢弃3张卡牌"],
  ["1 card", "1张卡牌"],
  ["Declare category: Option", "宣言类别：选项"],
  ["Blue", "蓝"],
  ["Play a matching card", "登场1张符合条件的卡牌"],
])("localizes the generated choice %s", (choice, expected, english = choice) => {
  expect(choiceLabel({ choice, t: translator("zh-CN") })).toBe(expected);
  expect(choiceLabel({ choice, t: translator("en") })).toBe(english ?? choice);
});

it("localizes combined action choices without combining their response identities", () => {
  const choice = "Draw 2 · Gain 1 memory";
  expect(choiceLabel({ choice, t: translator("zh-CN") })).toBe("抽2张卡 · 内存值+1");
  expect(choiceLabel({ choice, t: translator("en") })).toBe(choice);
});

it("preserves unfamiliar and partially matching choices instead of guessing their meaning", () => {
  const t = translator("zh-CN");
  for (const choice of ["Unknown future choice", "Trash 3 cards from hand instead", "Pay -3 memory", "Red Dragon"]) {
    expect(choiceLabel({ choice, t })).toBe(choice);
  }
});

it.each([
  ["Trash your top security card", "丢弃我方最上方的1张安防卡牌"],
  ["Trash the bottom face-down card from under 1 of your Tamers", "丢弃我方1只驯兽师下方最下方的1张背面表示卡牌"],
  ["Delete this Digimon", "消灭此数码宝贝"],
  ["Trash 2 bottom face-down cards from under your Tamers", "丢弃我方驯兽师下方最下方的2张背面表示卡牌"],
])("localizes the payment choice %s while preserving its English label", (choice, expected) => {
  expect(choiceLabel({ choice, t: translator("zh-CN") })).toBe(expected);
  expect(choiceLabel({ choice, t: translator("en") })).toBe(choice);
});

describe("choiceLabel top and bottom", () => {
  const pt = translator("pt-BR");
  const en = translator("en");

  it("names the digivolution-card ends when the choice places digivolution cards (Discord 1555224478416633927)", () => {
    expect(choiceLabel({ choice: "top", t: pt, topBottomZone: "digivolutionCards" })).toBe(
      "Topo das cartas de digievolução",
    );
    expect(choiceLabel({ choice: "bottom", t: pt, topBottomZone: "digivolutionCards" })).toBe(
      "Fundo das cartas de digievolução",
    );
    expect(choiceLabel({ choice: "bottom", t: en, topBottomZone: "digivolutionCards" })).toBe(
      "Bottom of the digivolution cards",
    );
  });

  it("names the security-stack ends for a security choice", () => {
    expect(choiceLabel({ choice: "top", t: pt, topBottomZone: "security" })).toBe("Topo da pilha de segurança");
    expect(choiceLabel({ choice: "bottom", t: en, topBottomZone: "security" })).toBe("Bottom of the security stack");
  });

  it("keeps the deck ends for a deck choice and for a decision without a zone", () => {
    expect(choiceLabel({ choice: "top", t: pt, topBottomZone: "deck" })).toBe("Topo do deck");
    expect(choiceLabel({ choice: "bottom", t: pt })).toBe("Fundo do deck");
  });
});
