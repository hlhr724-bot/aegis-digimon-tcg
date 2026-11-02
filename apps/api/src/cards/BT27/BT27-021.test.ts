import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { Phase } from "@aegis/shared/schema/enums";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { compiled } from "#api/cards/BT27/BT27-021";
import "#api/cards/index";

const filler = Array.from({ length: 8 }, () => "BT1-009");

async function playAndReveal(deck: { card: string; as: string }[]) {
  const s = setupEngine(
    { 0: { hand: [{ card: "BT27-021", as: "dracomonX" }], deck } },
    { autoSelectCards: true, autoOrderCards: true },
  );
  s.state.memory = 6;
  await s.ready();
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("dracomonX").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => s.state.players[0]!.deck.every(({ faceUp }) => !faceUp) && !s.state.pendingDecision);
  return s;
}

describe("Dracomon (X Antibody) Examon reveal and inherited DNA", () => {
  it("matches the printed catalog entry and IR contract", () => {
    expect(getCardDefinition("BT27-021")).toMatchObject({
      nameEn: "Dracomon (X Antibody)",
      nameJp: "ドラコモンX抗体",
      colors: ["Blue", "Red", "Green"],
      kinds: ["Digimon"],
      level: 3,
      playCost: 4,
      dp: 3000,
      evoCosts: [
        { color: "Blue", level: 2, memoryCost: 1 },
        { color: "Red", level: 2, memoryCost: 1 },
        { color: "Green", level: 2, memoryCost: 1 },
      ],
      forms: ["Rookie"],
      attributes: ["Data"],
      types: ["Dragon", "X Antibody"],
      rarity: "R",
    });
    expect(compiled.effects.map(({ trigger, isInherited }) => [trigger, isInherited ?? false])).toEqual([
      ["OnPlay", false],
      ["WhenDigivolving", false],
      ["EndOfYourTurn", true],
    ]);
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
  });

  it("adds one Examon text Digimon and one Examon text Option, and bottoms the rest", async () => {
    const s = await playAndReveal([
      { card: "EX13-018", as: "digimonMatch" },
      { card: "BT20-093", as: "optionMatch" },
      { card: "BT21-046", as: "dracomonOnly" },
      { card: "BT1-010", as: "unrevealed" },
    ]);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId).sort()).toEqual(
      [s.inst("digimonMatch").instanceId, s.inst("optionMatch").instanceId].sort(),
    );
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("unrevealed").instanceId,
      s.inst("dracomonOnly").instanceId,
    ]);
    expect(s.state.memory).toBe(2);
  });

  it("takes only one Digimon when both Examon text matches are Digimon", async () => {
    const s = await playAndReveal([
      { card: "EX13-018", as: "firstDigimon" },
      { card: "EX13-008", as: "secondDigimon" },
      { card: "BT1-009", as: "miss" },
      { card: "BT1-010", as: "unrevealed" },
    ]);
    expect(s.state.players[0]!.hand).toHaveLength(1);
    expect([s.inst("firstDigimon").instanceId, s.inst("secondDigimon").instanceId]).toContain(
      s.state.players[0]!.hand[0]!.instanceId,
    );
    expect(s.state.players[0]!.deck).toHaveLength(3);
    expect(s.state.players[0]!.deck[0]!.instanceId).toBe(s.inst("unrevealed").instanceId);
  });

  it("rejects a Dracomon-only Digimon and an Option without Examon text", async () => {
    const s = await playAndReveal([
      { card: "BT21-046", as: "dracomonOnly" },
      { card: "BT1-108", as: "optionMiss" },
      { card: "BT1-009", as: "digimonMiss" },
    ]);
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.deck).toHaveLength(3);
    expect(s.decisions.some(({ req }) => req.kind === "selectCards")).toBe(false);
  });

  it.each([
    { base: "EX13-008", ok: true },
    { base: "BT1-009", ok: false },
  ])("digivolves for 0 only from [Dracomon] and reveals when digivolving: $base", async ({ base, ok }) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: base, as: "base" }],
          hand: [{ card: "BT27-021", as: "dracomonX" }],
          deck: [
            { card: "EX13-018", as: "digimonMatch" },
            { card: "BT20-093", as: "optionMatch" },
            { card: "BT1-009", as: "miss" },
          ],
        },
      },
      { autoSelectCards: true, autoOrderCards: true },
    );
    s.state.memory = 3;
    await s.ready();
    const result = s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("base").permanentId,
      instanceId: s.inst("dracomonX").instanceId,
      useAlternateCost: true,
    });
    expect(result.ok).toBe(ok);
    if (!ok) return;
    await settle(() => s.state.players[0]!.hand.length === 2 && !s.state.pendingDecision);
    expect(s.state.memory).toBe(3);
    expect(s.perm("base").stack.map(({ cardId }) => cardId)).toEqual(["EX13-008"]);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId).sort()).toEqual(
      [s.inst("digimonMatch").instanceId, s.inst("optionMatch").instanceId].sort(),
    );
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual([s.inst("miss").instanceId]);
  });

  it.each([
    { host: "BT1-080", accept: true, dna: true },
    { host: "BT1-080", accept: false, dna: false },
    { host: "BT1-071", accept: true, dna: false },
  ])(
    "at end of turn DNA digivolves its own host with another Digimon: host $host, accept $accept",
    async ({ host, accept, dna }) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: host, under: ["BT27-021"], as: "host" },
              { card: "BT1-080", as: "greenPartner" },
              { card: "BT1-044", as: "bluePartner" },
            ],
            hand: [{ card: "BT20-045", as: "examon" }],
            deck: filler,
          },
          1: { deck: filler, security: filler.slice(0, 5) },
        },
        {
          autoSelectCards: true,
          autoOrderCards: true,
          declinePrompts: ["attack"],
          ...(accept ? { autoAcceptOptional: true } : { autoDeclineOptional: true }),
        },
      );
      const loop = s.engine.startTurnLoop();
      try {
        await advance(s.engine).waitForMainPhase(0);
        await s.ready();
        expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
        await settle(() => s.state.turnSeat === 1 && s.state.phase === Phase.Breeding && !s.state.pendingDecision);
        const battleArea = s.state.players[0]!.battleArea;
        const examon = battleArea.find(({ topCard }) => topCard.instanceId === s.inst("examon").instanceId);
        expect(battleArea).toHaveLength(dna ? 2 : 3);
        expect((examon?.stack.map(({ cardId }) => cardId) ?? []).sort()).toEqual(
          dna ? ["BT1-044", "BT1-080", "BT27-021"] : [],
        );
        expect(s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("examon").instanceId)).toBe(
          !dna,
        );
      } finally {
        s.engine.applyIntent(0, { type: "surrender" });
        await loop;
      }
    },
  );
});
