import { describe, expect, it } from "vitest";
import { EffectTiming, digivolutionRequirementsFor, getCardDefinition } from "@aegis/shared";
import { effectiveStaticTraits } from "@aegis/shared/cards/effectiveTraits";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, setupEngine } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { compiled } from "./BT27-028.js";
import "#api/cards/index";

const cardId = "BT27-028";

describe("BT27-028 Shaujinmon", () => {
  it("compiles the alternate evolution, both Decodes, the suspension lock, and the Aquatic rule", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      nameEn: "Shaujinmon",
      colors: ["Blue"],
      level: 5,
      playCost: 7,
      dp: 7000,
      types: ["Wizard", "DATA SQUAD"],
    });
    expect(digivolutionRequirementsFor(cardId)).toContainEqual({
      level: 4,
      traits: ["DATA SQUAD"],
      cost: 3,
      isAlternate: true,
    });
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(compiled.effects.filter((effect) => effect.isInherited).map((effect) => effect.trigger)).toEqual([
      "Static",
      "AllTurns",
    ]);
    expect(effectiveStaticTraits(getCardDefinition(cardId)!)).toEqual(
      expect.arrayContaining(["Aquatic", "DATA SQUAD"]),
    );
  });

  it.each(["OnPlay", "WhenDigivolving"] as const)(
    "%s stops 1 opponent Tamer from suspending by effects and by attacks",
    async (trigger) => {
      const s = setupEngine(
        {
          0: { battleArea: [{ card: cardId, as: "shaujinmon" }] },
          1: { battleArea: [{ card: "BT1-086", as: "tamer" }] },
        },
        { autoSelectCards: true },
      );
      await s.ready();
      const tamerId = s.perm("tamer").permanentId;

      await advance(s.engine).fire(EffectTiming[trigger], s.perm("shaujinmon"));

      expect(observe(s.engine).isRestricted(tamerId, "beSuspended")).toBe(true);
      expect(observe(s.engine).isRestricted(tamerId, "suspend")).toBe(true);
      assertNoLoudGap(s);
    },
  );

  it.each([
    ["an Aquatic level 4", "BT2-024", "byEffect", true],
    ["a DATA SQUAD level 4", "ST24-03", "byEffect", true],
    ["a DATA SQUAD level 5", "BT25-027", "byEffect", false],
    ["a level 4 without either trait", "BT1-019", "byEffect", false],
    ["an Aquatic level 4 after battle", "BT2-024", "byBattle", false],
  ] as const)("Decode plays %s from its sources when deleted %s: %s", async (_label, source, cause, played) => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: cardId, as: "shaujinmon", under: [{ card: source, as: "decode" }] }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(await advance(s.engine).verb.deletePermanent([s.perm("shaujinmon").permanentId], cause)).toBe(1);

    expect(
      s.state.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === s.inst("decode").instanceId),
    ).toBe(played);
  });

  it("gives its inherited Decode to the Digimon it is under", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "BT1-024",
              as: "host",
              under: [{ card: cardId }, { card: "BT2-024", as: "decode" }],
            },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(await advance(s.engine).verb.deletePermanent([s.perm("host").permanentId], "byEffect")).toBe(1);

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.instanceId)).toEqual([
      s.inst("decode").instanceId,
    ]);
  });

  it("digivolves from a DATA SQUAD level 4 through the alternate requirement only", () => {
    const legal = setupEngine({
      0: { battleArea: [{ card: "ST24-03", as: "host" }], hand: [{ card: cardId, as: "shaujinmon" }] },
    });
    legal.state.memory = 3;
    expect(
      legal.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: legal.perm("host").permanentId,
        instanceId: legal.inst("shaujinmon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });

    const invalid = setupEngine({
      0: { battleArea: [{ card: "BT1-019", as: "host" }], hand: [{ card: cardId, as: "shaujinmon" }] },
    });
    invalid.state.memory = 3;
    expect(
      invalid.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: invalid.perm("host").permanentId,
        instanceId: invalid.inst("shaujinmon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
  });
});
