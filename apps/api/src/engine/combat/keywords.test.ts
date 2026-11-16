import { CardInstance, getCardDefinition, Permanent, type Seat } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { digiXrosMatches, materialSaveCountOf, printedKeywordsOf, resolveKeywords } from "./keywords.js";
import { setupEngine, settle } from "../testkit/harness.js";
import "../../cards/index.js";

const printedKeywordCases = [
  ["AD1-009", "Alliance"],
  ["BT10-012", "Armor Purge"],
  ["BT25-034", "Ascension"],
  ["BT13-041", "Barrier"],
  ["BT17-078", "BlastDNADigivolve"],
  ["AD1-005", "BlastDigivolve"],
  ["BT10-014", "Blitz"],
  ["AD1-005", "Blocker"],
  ["BT3-075", "Blocker"],
  ["EX2-034", "Blocker"],
  ["BT16-032", "Collision"],
  ["AD1-009", "DeDigivolve"],
  ["BT19-024", "Decode"],
  ["BT11-082", "Decoy"],
  ["BT10-097", "Delay"],
  ["BT4-012", "DigiBurst"],
  ["BT10-052", "Digisorption"],
  ["AD1-010", "Draw"],
  ["AD1-012", "Evade"],
  ["BT20-072", "Execute"],
  ["BT20-034", "Fortitude"],
  ["BT22-061", "Fragment"],
  ["BT18-026", "IceClad"],
  ["AD1-015", "Jamming"],
  ["AD1-005", "Link"],
  ["BT10-009", "MaterialSave"],
  ["BT14-086", "Mind Link"],
  ["BT19-101", "Overclock"],
  ["AD1-011", "Partition"],
  ["AD1-004", "Piercing"],
  ["BT21-025", "Progress"],
  ["AD1-003", "Raid"],
  ["AD1-013", "Reboot"],
  ["BT1-060", "Recovery"],
  ["AD1-002", "Rush"],
  ["BT10-008", "Save"],
  ["BT20-080", "Scapegoat"],
  ["EX9-008", "Training"],
  ["BT25-093", "UseReq"],
  ["BT20-101", "Vortex"],
] as const;

function permanent(cardId: string, seat: Seat = 0): Permanent {
  const card = new CardInstance();
  card.instanceId = `instance-${cardId}`;
  card.cardId = cardId;
  card.ownerSeat = seat;
  card.faceUp = true;
  const result = new Permanent();
  result.permanentId = `permanent-${cardId}`;
  result.controllerSeat = seat;
  result.topCard = card;
  return result;
}

describe("resolved keyword contract", () => {
  it("matches trait-based DigiXros materials for Material Save", () => {
    expect(digiXrosMatches("BT10-111", "BT10-049")).toBe(true);
    expect(digiXrosMatches("BT10-111", "BT1-009")).toBe(false);
    expect(materialSaveCountOf("BT10-111")).toBe(1);
  });

  it("matches a DigiXros material named only by its [Rule] name for Material Save (GitHub #5181 sweep)", () => {
    expect(digiXrosMatches("BT10-009", "BT15-012")).toBe(true);
    expect(digiXrosMatches("BT10-009", "BT1-009")).toBe(false);
  });

  it("reads Material Save count from IR when catalog text contains only reminder text", () => {
    expect(materialSaveCountOf("BT15-012")).toBe(2);
  });

  it.each(printedKeywordCases)("surfaces %s as the canonical %s keyword", (cardId, keyword) => {
    expect(resolveKeywords(permanent(cardId), { grantedKeywords: () => [] })).toContain(keyword);
  });

  it("deduplicates a printed keyword and an equivalent continuous grant", () => {
    const target = permanent("AD1-002");
    expect(
      resolveKeywords(target, {
        grantedKeywords: () => [{ keyword: "Rush" }],
      }).filter((keyword) => keyword === "Rush"),
    ).toHaveLength(1);
  });

  it.each([
    ["BT6-082", "Blocker"],
    ["BT10-057", "Piercing"],
    ["BT10-078", "Retaliation"],
    ["AD1-004", "SecurityAttack"],
    ["EX6-031", "SecurityAttack"],
  ] as const)("does not publish %s's conditional %s grant before it is active", (cardId, keyword) => {
    expect(resolveKeywords(permanent(cardId), { grantedKeywords: () => [] })).not.toContain(keyword);
  });

  it.each(["Blocker", "Rush", "Vortex", "Collision", "Guard"] as const)(
    "does not treat a prose grant of %s as an intrinsic keyword",
    (keyword) => {
      expect(printedKeywordsOf(`[All Turns] All of your Digimon gain ＜${keyword}＞.`)).not.toContain(keyword);
      expect(printedKeywordsOf(`＜${keyword}＞`)).toContain(keyword);
    },
  );

  it.each([
    ["EX10-008", "Collision"],
    ["BT21-077", "Collision"],
    ["BT22-031", "SecurityAttack"],
    ["EX13-026", "SecurityAttack"],
  ] as const)("does not treat the keyword %s gives an opponent's Digimon as its own %s", (cardId, keyword) => {
    const definition = getCardDefinition(cardId);
    expect(printedKeywordsOf(definition?.effectText)).not.toContain(keyword);
    expect(printedKeywordsOf(definition?.inheritedEffectText)).not.toContain(keyword);
  });

  it.each([
    ["BT1-094", "Blocker"],
    ["BT1-095", "Blocker"],
    ["BT1-103", "Blocker"],
    ["BT1-023", "Blocker"],
    ["BT2-104", "Blocker"],
    ["BT3-095", "Blocker"],
    ["BT3-106", "Blocker"],
    ["BT3-106", "Reboot"],
    ["BT4-087", "Rush"],
    ["BT4-109", "Blocker"],
    ["BT4-109", "Reboot"],
    ["BT5-016", "Blocker"],
    ["BT5-103", "Blocker"],
    ["BT5-103", "Reboot"],
    ["BT6-054", "Blocker"],
    ["BT6-077", "Blocker"],
    ["BT6-082", "Blocker"],
    ["BT7-062", "Blocker"],
    ["BT8-048", "Blocker"],
    ["BT9-031", "Blocker"],
    ["BT9-075", "Blocker"],
    ["BT9-089", "Blocker"],
    ["BT9-102", "Rush"],
    ["BT10-024", "Rush"],
    ["BT10-031", "Blocker"],
    ["BT10-049", "Blocker"],
    ["BT10-084", "Blocker"],
    ["BT10-092", "Blocker"],
    ["BT10-105", "Blocker"],
    ["BT10-105", "Reboot"],
    ["BT10-112", "Blocker"],
    ["EX1-009", "Blocker"],
    ["EX1-065", "Blocker"],
    ["EX1-067", "Blocker"],
    ["EX1-070", "Blocker"],
    ["EX2-017", "Blocker"],
    ["EX2-050", "Blocker"],
    ["EX2-052", "Rush"],
    ["ST5-09", "Blocker"],
    ["ST5-14", "Blocker"],
    ["ST10-07", "Blocker"],
  ] as const)("does not promote %s's referenced or granted %s to an intrinsic keyword", (cardId, keyword) => {
    expect(resolveKeywords(permanent(cardId), { grantedKeywords: () => [] })).not.toContain(keyword);
  });

  it.each(["BT1-023", "BT5-016", "BT6-054", "BT8-048", "BT10-112", "EX1-009", "ST5-14"])(
    "%s can't block merely because its text references or conditionally grants Blocker",
    async (cardId) => {
      const s = setupEngine(
        {
          0: { battleArea: [{ card: "BT1-010", as: "attacker" }] },
          1: {
            battleArea: [{ card: cardId, as: "nonBlocker" }],
            security: ["BT1-011"],
          },
        },
        { autoSelectCards: true },
      );
      await s.ready();

      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("attacker").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[1]!.security.length === 0);

      expect(s.events.some((event) => event.kind === "blockWindowOpened")).toBe(false);
    },
  );

  it.each(["BT3-075", "EX2-034"])(
    "%s keeps its printed Blocker even though later text also references Blocker",
    async (cardId) => {
      const s = setupEngine({
        0: { battleArea: [{ card: "BT1-010", as: "attacker" }] },
        1: {
          battleArea: [{ card: cardId, as: "blocker" }],
          security: ["BT1-011"],
        },
      });
      await s.ready();

      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("attacker").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));

      expect(s.events.find((event) => event.kind === "blockWindowOpened")).toMatchObject({
        eligibleBlockerIds: [s.perm("blocker").permanentId],
      });
      expect(s.state.players[1]!.security).toHaveLength(1);

      expect(s.engine.applyIntent(1, { type: "declineBlock" })).toEqual({ ok: true });
      await settle(() => s.state.players[1]!.security.length === 0);
    },
  );

  it("EX2-052 can't use a conditional Rush mention without Mother D-Reaper", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "EX2-052", as: "striker" }] } });
    await s.ready();
    s.state.turnCount = 1;
    s.perm("striker").enterFieldTurnCount = s.state.turnCount;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("striker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: false, reason: "illegal-target" });
  });

  it("publishes canonical keyword names through the synchronized GameState", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT10-009", dp: 0, as: "target" }] } });
    const target = s.perm("target");

    await s.engine.recomputeContinuousEffects();

    expect([...target.keywords]).toContain("MaterialSave");
    expect([...target.keywords]).not.toContain("Material Save");
  });
});
