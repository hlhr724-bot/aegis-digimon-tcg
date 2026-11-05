import { describe, expect, it } from "vitest";
import { storyBattles } from "@aegis/shared/story/storyBattles";
import { storyCatalogCampaigns } from "@aegis/shared/story/storyCatalogCampaigns";
import { storyCharacters } from "@/story/storyCharacters";
import { getTranslatedStoryText } from "@/i18n/getTranslatedStoryText";
import cardNamesZh from "@/i18n/cardNames.zh.json";
import cardMetaZh from "@/i18n/cardMeta.zh.json";
import storyTextZh from "@/i18n/storyText.zh.json";

describe("Chinese story text", () => {
  const texts = new Set([
    "Digimon Liberator",
    ...storyCatalogCampaigns.flatMap((campaign) => [campaign.title, campaign.medium]),
    ...storyCharacters.map((person) => person.name),
    ...storyBattles.flatMap((battle) => [
      battle.title,
      battle.character,
      battle.opponent,
      ...(battle.chapterId ? [battle.chapterId] : []),
      ...battle.chapters.map((chapter) => chapter.title),
    ]),
  ]);

  it("covers every current battle, character, opponent and chapter", () => {
    const missing = [...texts].filter((text) => !Object.hasOwn(storyTextZh, text));
    expect(missing).toEqual([]);
  });

  it.each([
    ["Beelzemon Blast Mode", "Beelzemon: Blast Mode"],
    ["Belphemon Sleep Mode", "Belphemon: Sleep Mode"],
    ["Agumon Bond of Courage + Gabumon Bond of Friendship", "Agumon - Bond of Bravery", "Gabumon - Bond of Friendship"],
    ["VictoryGreymon + Z'dGarurumon, with MarinAngemon and DigiSouls,", "ZeedGarurumon", "MarineAngemon"],
    ["A.o.A Attacker: Monzaemon, Datamon/Nanomon", "Datamon"],
    ["Galacticmon/Ragnamon, tail", "Galacticmon"],
    ["DoneDevimon", "DanDevimon"],
    ["Parrotmon + Crossmon", "Eaglemon"],
  ])("uses the card dictionary for alternate spellings in %s", (text, ...names) => {
    const cardNames: Record<string, string> = cardNamesZh;
    const translated = getTranslatedStoryText({ text, locale: "zh-CN" });
    for (const name of names) {
      expect(translated).toContain(cardNames[name]);
    }
  });

  it("keeps names consistent with the maintained card dictionary", () => {
    const cardNames: Record<string, string> = cardNamesZh;
    const names = Object.entries(storyTextZh).filter(([text]) => cardNames[text] && cardNames[text] !== text);
    for (const [text, translation] of names) {
      expect(translation).toBe(cardNames[text]);
    }
  });

  it("uses maintained organization terms when card names retain English", () => {
    expect(getTranslatedStoryText({ text: "Glowing Dawn", locale: "zh-CN" })).toBe(cardMetaZh.traits["Glowing Dawn"]);
    expect(getTranslatedStoryText({ text: "Shoutmon X5 and Blue Flare", locale: "zh-CN" })).toContain(
      cardMetaZh.traits["Blue Flare"],
    );
  });

  it("distinguishes species aliases, complete forms and uncertain proper names", () => {
    expect(
      getTranslatedStoryText({ text: "Game Master: Minotarumon variant, Gargoylemon, Persiamon", locale: "zh-CN" }),
    ).toBe("游戏管理员：牛人兽 变体，石像鬼兽，芭丝特兽");
    expect(getTranslatedStoryText({ text: "Creepymon / Demon", locale: "zh-CN" })).toBe("究极魔兽 / 究极魔兽");
    expect(getTranslatedStoryText({ text: "Apollomon Whispered", locale: "zh-CN" })).toBe("阿波罗兽：低吟");
    expect(getTranslatedStoryText({ text: "Yggdrasil 7D6", locale: "zh-CN" })).toBe("世界树_7D6");
    expect(getTranslatedStoryText({ text: "Regulumon", locale: "zh-CN" })).toBe("Regulumon");
    expect(getTranslatedStoryText({ text: "NeoMyotismon Darkness Mode", locale: "zh-CN" })).toBe(
      "新种吸血魔兽 Darkness Mode",
    );
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

  it.each([
    ["C01 — Asuka, after receiving partners", "C01 — 明日香，获得搭档后"],
    ["Glowing Dawn; Tomoro and Asuka", "光辉黎明；天马友朗与 飞鸟"],
    ["Bulk Swamp", "毒虫沼泽"],
    ["Bulk Bridge", "毒虫桥"],
    ["Grimmon", "残酷兽"],
    ["ChaosGrimmon", "混沌残酷兽"],
    ["ExoGrimmon", "ExoGrimmon"],
  ])("keeps reviewed community names scoped to the original identity in %s", (text, expected) => {
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
