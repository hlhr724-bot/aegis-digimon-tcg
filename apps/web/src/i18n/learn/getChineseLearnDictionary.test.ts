import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import { zhCN } from "@/i18n/zh-CN";
import { getChineseLearnDictionary } from "@/i18n/learn/getChineseLearnDictionary";

describe("Chinese learning terminology", () => {
  it("localizes new learning entries without adding per-message term replacements", () => {
    const dictionary = getChineseLearnDictionary({
      dictionary: {
        "learn.future.summary": "登场Galemon，用Vortex攻击Blocker，并以Progress抵御Cocytus Breath。",
      },
    });
    expect(dictionary["learn.future.summary"]).toBe("登场强风兽，用旋风攻击阻挡者，并以进程抵御冰狱冷冻气。");
  });

  it("prefers complete card names and multiword keywords over shorter terms", () => {
    const dictionary = getChineseLearnDictionary({
      dictionary: { "learn.future.summary": "WarGreymon、Greymon、Armor Purge、Material Save、Puppet" },
    });
    expect(dictionary["learn.future.summary"]).toBe("战斗暴龙兽、暴龙兽、装甲解除、素材保存、玩偶型");
  });

  it("preserves parameters, identifiers, unknown terminology and other pages", () => {
    const dictionary = getChineseLearnDictionary({
      dictionary: {
        "learn.future.summary": "{Raid} {Galemon} BT1-001 DP 12000 RaidMode UnknownTerm Raid",
        "game.future.summary": "Galemon Vortex",
      },
    });
    expect(dictionary["learn.future.summary"]).toBe("{Raid} {Galemon} BT1-001 DP 12000 RaidMode UnknownTerm 突进");
    expect(dictionary["game.future.summary"]).toBe("Galemon Vortex");
  });

  it("keeps the reported lesson titles and descriptions fully localized", () => {
    expect(zhCN["learn.lesson.drill-raid.title"]).toBe("突进：挑战最强的未休息数码宝贝");
    expect(zhCN["learn.lesson.drill-vortex.summary"]).toBe("登场强风兽，并用旋风在同一回合攻击一只数码宝贝。");
    expect(zhCN["learn.lesson.drill-progress.summary"]).toBe("借助进程，穿过冰狱冷冻气的效果并保住攻击者。");
    expect(zhCN["learn.lesson.drill-overclock.summary"]).toContain("玩偶型");
  });

  it("requires Chinese prose for every learning message added to English", () => {
    const fallback = getChineseLearnDictionary({ dictionary: en });
    const missing = Object.keys(en)
      .filter((key) => key.startsWith("learn."))
      .filter((key) => {
        const value = zhCN[key as keyof typeof en];
        return (
          !/[\u4e00-\u9fff]/.test(value) ||
          (value === fallback[key as keyof typeof en] && /[A-Za-z]/.test(value.replace(/\b(?:Lv|DP)\b/g, "")))
        );
      });
    expect(missing).toEqual([]);
  });
});
