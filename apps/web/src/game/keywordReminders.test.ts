import { describe, expect, it } from "vitest";
import { translator } from "../i18n";
import { KEYWORD_GLOSSARY, OFFICIAL_COMPREHENSIVE_RULES_URL } from "./keywordGlossary";
import { keywordBaseName, keywordReminder, keywordRuleLink, normalizeKeywordBrackets } from "./keywordReminders";

const t = translator("en");

describe("keyword reminders", () => {
  it("reduces printed and server spellings to one glossary name", () => {
    expect(keywordBaseName("＜Armor Purge＞")).toBe("ArmorPurge");
    expect(keywordBaseName("De-Digivolve 1")).toBe("DeDigivolve");
    expect(keywordBaseName("Security A. +1")).toBe("SecurityAttack");
    expect(keywordBaseName("＜S Attack +1＞")).toBe("SecurityAttack");
    expect(keywordBaseName("Decoy (Black)")).toBe("Decoy");
    expect(keywordBaseName("<Use Req.>")).toBe("UseReq");
    expect(keywordBaseName("<Link +1>")).toBe("Link");
    expect(keywordBaseName("<Partition (blue Lv.4 & green Lv.4)>")).toBe("Partition");
    expect(keywordBaseName("<Blast DNA Digivolve>")).toBe("BlastDNADigivolve");
    expect(keywordBaseName("＜Ice Clad＞")).toBe("Iceclad");
    expect(keywordBaseName("<Iceclad>")).toBe("Iceclad");
  });

  it("explains Security Attack with the modifier the permanent carries or the card prints", () => {
    expect(keywordReminder("SecurityAttack", t, -2)).toBe("This Digimon checks 2 fewer security card(s).");
    expect(keywordReminder("Security Attack +1", t)).toBe("This Digimon checks 1 additional security card(s).");
  });

  it("points a keyword the glossary does not cover at the card text", () => {
    expect(keywordReminder("Not A Keyword", t)).toBe(t("redesign.arena.keyword.unlisted"));
    expect(keywordRuleLink("Not A Keyword")).toBeUndefined();
  });

  it("covers every keyword in section 16 of the Comprehensive Rules", () => {
    const rules = Object.values(KEYWORD_GLOSSARY).map((entry) => entry.rule);
    expect(rules).toEqual(Array.from({ length: 44 }, (_, index) => `16-${index + 4}`));
  });

  it("links a keyword to its official rule", () => {
    expect(keywordRuleLink("＜Evade＞")).toEqual({ rule: "16-22", href: OFFICIAL_COMPREHENSIVE_RULES_URL });
  });

  it("keeps keyword rules in English when the interface uses Portuguese", () => {
    const portuguese = translator("pt-BR");
    for (const keyword of ["Blocker", "Rush", "Jamming", "Piercing", "Recovery", "Armor Purge", "Security Attack +1"])
      expect(keywordReminder(keyword, portuguese)).toBe(keywordReminder(keyword, t));
    expect(keywordReminder("SecurityAttack", portuguese, -2)).toBe("This Digimon checks 2 fewer security card(s).");
  });

  it("prints full-width brackets as ASCII ones", () => {
    expect(normalizeKeywordBrackets("＜Draw 1＞")).toBe("<Draw 1>");
  });
});
