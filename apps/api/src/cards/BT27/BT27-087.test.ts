import { EffectTiming, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, setupEngine } from "#api/engine/testkit/harness";
import { compiled } from "#api/cards/BT27/BT27-087";
import "#api/cards/index";

const REVEAL = 0;
const BREEDING = 1;

describe("BT27-087 Yuji Musya", () => {
  it("preserves the printed card and complete compiled coverage", () => {
    expect(getCardDefinition("BT27-087")).toMatchObject({
      nameEn: "Yuji Musya",
      colors: ["Red"],
      kinds: ["Tamer"],
      playCost: 4,
      types: ["Chronicle"],
      rarity: "R",
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects.map((effect) => effect.trigger)).toEqual(["StartOfYourMainPhase", "OnPlay", "Security"]);
  });

  it("gains 1 memory at the start of its owner's main phase with a [Chronicle] Digimon in the battle area", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT27-087", as: "yuji" },
          { card: "BT20-010", as: "ryudamon" },
        ],
      },
    });
    s.state.memory = 2;

    await advance(s.engine).fire(EffectTiming.OnStartMainPhase, s.perm("yuji"));

    expect(s.state.memory).toBe(3);
  });

  it.each([
    ["only a non-[Chronicle] Digimon", ["BT1-009"], undefined],
    ["a [Chronicle] Digimon only in the breeding area", [], "BT20-010"],
    ["a [Chronicle] Tamer but no [Chronicle] Digimon", ["EX13-072"], undefined],
  ])("gains no memory with %s", async (_, others: string[], breeding: string | undefined) => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT27-087", as: "yuji" }, ...others.map((card) => ({ card }))],
        ...(breeding === undefined ? {} : { breeding: { card: breeding } }),
      },
    });
    s.state.memory = 2;

    await advance(s.engine).fire(EffectTiming.OnStartMainPhase, s.perm("yuji"));

    expect(s.state.memory).toBe(2);
  });

  it("does not gain memory at the start of the opponent's main phase", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT27-087", as: "yuji" },
          { card: "BT20-010", as: "ryudamon" },
        ],
      },
    });
    s.state.turnSeat = 1;
    s.state.memory = -2;

    await advance(s.engine).fire(EffectTiming.OnStartMainPhase, s.perm("yuji"));

    expect(s.state.memory).toBe(-2);
  });

  it("reveals 3, adds the card named [X Antibody], and trashes the rest", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-087", as: "yuji" }],
          deck: [
            { card: "BT11-062", as: "agumonXAntibody" },
            { card: "BT9-109", as: "xAntibody" },
            { card: "BT1-009", as: "miss" },
            { card: "BT20-095", as: "unrevealed" },
          ],
        },
      },
      { preferOptionIndex: REVEAL, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("yuji"));

    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("xAntibody").instanceId]);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId).sort()).toEqual(
      [s.inst("agumonXAntibody").instanceId, s.inst("miss").instanceId].sort(),
    );
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([s.inst("unrevealed").instanceId]);
    assertNoLoudGap(s);
  });

  it("offers [Chronicle] trait cards of any kind, but not other [X Antibody]-named cards", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-087", as: "yuji" }],
          deck: [
            { card: "BT20-095", as: "chronicleOption" },
            { card: "BT11-062", as: "agumonXAntibody" },
            { card: "BT20-012", as: "chronicleDigimon" },
          ],
        },
      },
      { preferOptionIndex: REVEAL, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("yuji"));

    const offered = s.decisions
      .filter(({ req }) => req.kind === "selectCards")
      .flatMap(({ req }) => req.options?.candidateInstanceIds ?? []);
    expect(offered).toEqual(
      expect.arrayContaining([s.inst("chronicleOption").instanceId, s.inst("chronicleDigimon").instanceId]),
    );
    expect(offered).not.toContain(s.inst("agumonXAntibody").instanceId);
    expect(s.state.players[0]!.hand).toHaveLength(1);
    expect(s.state.players[0]!.trash).toHaveLength(2);
    expect(s.state.players[0]!.deck).toHaveLength(0);
  });

  it("trashes all 3 revealed cards when none matches", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-087", as: "yuji" }],
          deck: ["BT1-009", "BT1-010", "BT11-062"],
        },
      },
      { preferOptionIndex: REVEAL, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("yuji"));

    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.trash).toHaveLength(3);
    expect(s.state.players[0]!.deck).toHaveLength(0);
  });

  it("plays a level 3 [Chronicle] Digimon from hand to the empty breeding area for free", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-087", as: "yuji" }],
          hand: [
            { card: "BT20-010", as: "ryudamon" },
            { card: "BT20-012", as: "levelFourChronicle" },
            { card: "BT1-009", as: "levelThreeOther" },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011"],
        },
      },
      { preferOptionIndex: BREEDING, autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    await s.ready();

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("yuji"));

    expect(s.state.players[0]!.breeding?.topCard.instanceId).toBe(s.inst("ryudamon").instanceId);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId).sort()).toEqual(
      [s.inst("levelFourChronicle").instanceId, s.inst("levelThreeOther").instanceId].sort(),
    );
    expect(s.state.players[0]!.deck).toHaveLength(3);
    expect(s.state.memory).toBe(0);
    assertNoLoudGap(s);
  });

  it("keeps the Digimon in hand when the breeding play is declined", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-087", as: "yuji" }],
          hand: [{ card: "BT20-010", as: "ryudamon" }],
        },
      },
      { preferOptionIndex: BREEDING, autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("yuji"));

    expect(s.state.players[0]!.breeding).toBeUndefined();
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("ryudamon").instanceId]);
  });

  it("cannot play into an occupied breeding area", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-087", as: "yuji" }],
          breeding: { card: "EX13-006", as: "egg" },
          hand: [{ card: "BT20-010", as: "ryudamon" }],
        },
      },
      { preferOptionIndex: BREEDING, autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("yuji"));

    expect(s.state.players[0]!.breeding?.topCard.instanceId).toBe(s.inst("egg").instanceId);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("ryudamon").instanceId]);
  });

  it("plays itself from security without paying the cost", async () => {
    const s = setupEngine(
      { 0: { security: [{ card: "BT27-087", as: "securityYuji" }], deck: ["BT1-009", "BT1-010", "BT1-011"] } },
      { preferOptionIndex: REVEAL, autoSelectCards: true },
    );
    s.state.memory = 0;
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("securityYuji"));

    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.instanceId)).toEqual([
      s.inst("securityYuji").instanceId,
    ]);
    expect(s.state.memory).toBe(0);
  });
});
