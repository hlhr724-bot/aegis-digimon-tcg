import { describe, expect, it } from "vitest";
import { storyBattles } from "@aegis/shared/story/storyBattles";
import { storyCharacters } from "@/story/storyCharacters";
import { getTranslatedStoryText } from "@/i18n/getTranslatedStoryText";
import cardNamesZh from "@/i18n/cardNames.zh.json";
import storyTextZh from "@/i18n/storyText.zh.json";

describe("Chinese story text", () => {
  const texts = new Set([
    "Digimon Liberator",
    ...storyCharacters.map((person) => person.name),
    ...storyBattles
      .filter((battle) => !battle.campaignId)
      .flatMap((battle) => [
        battle.title,
        battle.character,
        battle.opponent,
        ...battle.chapters.map((chapter) => chapter.title),
      ]),
  ]);

  it("covers every current battle, character, opponent and chapter", () => {
    const missing = [...texts].filter(
      (text) => !/[\u4e00-\u9fff]/.test(getTranslatedStoryText({ text, locale: "zh-CN" })),
    );
    expect(missing).toEqual([]);
  });

  it("keeps names consistent with the maintained card dictionary", () => {
    const cardNames: Record<string, string> = cardNamesZh;
    const names = Object.entries(storyTextZh).filter(([text]) => cardNames[text]);
    for (const [text, translation] of names) {
      expect(translation).toBe(cardNames[text]);
    }
  });

  it.each([
    ["Battle Coverage [3] VS. The Crystal Sea Palace", "对战收录 [3] VS. 水晶海宫"],
    ["DEBUG.5-2 Shinjuku Giant", "调试 5-2 新宿巨人"],
    ["DEBUG.5-1 Altea", "调试 5-1 阿尔提亚"],
    ["DEBUG.14 Freedom - Part 2", "调试 14 自由（后篇）"],
    ["Episode 02 [Pt.1]", "第2话・前篇"],
    ["Episode 08[Pt.1]", "第8话・前篇"],
    ["Chitose Horaiji", "蓬来寺千岁"],
    ["Ice Knight rogue NPC", "冰之骑士（野怪 NPC）"],
  ])("uses the reviewed reference wording for %s", (text, expected) => {
    expect(getTranslatedStoryText({ text, locale: "zh-CN" })).toBe(expected);
  });

  it("preserves original text for other locales and unknown future content", () => {
    for (const text of texts) {
      expect(getTranslatedStoryText({ text, locale: "en" })).toBe(text);
      expect(getTranslatedStoryText({ text, locale: "zh-TW" })).toBe(text);
    }
    expect(getTranslatedStoryText({ text: "Future chapter", locale: "zh-CN" })).toBe("Future chapter");
    expect(getTranslatedStoryText({ text: "toString", locale: "zh-CN" })).toBe("toString");
  });
});
