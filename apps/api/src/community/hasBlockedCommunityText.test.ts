import { describe, expect, it } from "vitest";
import { hasBlockedCommunityText } from "#api/community/hasBlockedCommunityText";

describe("community content moderation", () => {
  it.each([
    "Muerte a la Royal Base",
    "Morte ao jogador",
    "Death to you",
    "Mort",
    "Tod",
    "смерть",
    "موت",
    "मौत",
    "死亡",
    "死ね",
    "죽음",
    "fuck",
    "caralho",
    "pendejo",
    "cazzo",
    "merde",
    "scheiße",
    "сука",
    "씨발",
    "你去死吧",
    "お前は死ね",
    "씨발놈",
    "ＭＵＥＲＴＥ",
    "mu\u200berte",
    "muérte",
    "mu3rte",
    "m.u.e.r.t.e",
    "muuuerte",
    "sh1t",
  ])("blocks %s", (text) => {
    expect(hasBlockedCommunityText(text)).toBe(true);
  });

  it.each([
    "El Caballero de las Rosas",
    "Jesmon Blitz",
    "Vulcanusmon",
    "Immortality",
    "Mortemon",
    "Use Death Claw to delete a Digimon.",
    "Boa sorte, bom jogo!",
    "Die Karten sind gut.",
    "数码兽的属性",
    "デジタマは卵です",
    "효과를 사용해 보지 않았습니다",
  ])("allows %s", (text) => {
    expect(hasBlockedCommunityText(text)).toBe(false);
  });

  it("does not let a card reference exempt unrelated blocked words", () => {
    expect(hasBlockedCommunityText("Death Claw. Muerte a la Royal Base")).toBe(true);
    expect(hasBlockedCommunityText("Death Claw. Death to you")).toBe(true);
  });
});
