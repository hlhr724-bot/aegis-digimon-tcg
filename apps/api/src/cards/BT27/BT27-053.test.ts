import { describe, expect, it } from "vitest";
import { requireCardDefinition } from "@aegis/shared/cards/registry";
import { advance } from "#api/engine/testkit/advance";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { compiled } from "#api/cards/BT27/BT27-053";
import "#api/cards/index";

type Session = ReturnType<typeof setupEngine>;

function findBancho(s: Session) {
  return s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === "BT27-053");
}

function optionalPrompts(s: Session) {
  return s.decisions.filter(({ req }) => req.kind === "optional" && req.sourceCardId === "BT27-053").length;
}

async function digivolveInto(s: Session, useAlternateCost: boolean) {
  const result = s.engine.applyIntent(0, {
    type: "digivolve",
    permanentId: s.perm("base").permanentId,
    instanceId: s.inst("bancho").instanceId,
    useAlternateCost,
  });
  if (result.ok) {
    await settle(() => s.perm("base").topCard.cardId === "BT27-053" && !s.state.pendingDecision);
  }
  return result;
}

describe("BanchoLeomon cost reduction, shared battle limit, and Boss or DATA SQUAD deletion reward", () => {
  it("prints green and yellow Mega traits with both level 5 digivolution costs", () => {
    expect(requireCardDefinition("BT27-053")).toMatchObject({
      nameEn: "BanchoLeomon",
      colors: ["Green", "Yellow"],
      level: 6,
      playCost: 13,
      dp: 13000,
      evoCosts: [
        { color: "Green", level: 5, memoryCost: 5 },
        { color: "Yellow", level: 5, memoryCost: 5 },
      ],
      forms: ["Mega"],
      attributes: ["Vaccine"],
      types: ["Beastkin", "Boss", "DATA SQUAD"],
      rarity: "SR",
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.digivolutionRequirement).toEqual([
      { level: 5, names: ["Leomon"], cost: 4, isAlternate: true },
      { level: 5, traits: ["DATA SQUAD"], cost: 4, isAlternate: true },
    ]);
  });

  it.each([
    ["off-color Lv.5 with Leomon in its name", "BT11-014", true, true, 4],
    ["off-color Lv.5 DATA SQUAD", "BT25-027", true, true, 4],
    ["green Lv.5 Leomon by its printed cost", "EX5-032", false, true, 5],
    ["Lv.4 Leomon", "BT1-035", true, false, 0],
    ["Lv.6 BanchoLeomon", "BT23-036", true, false, 0],
    ["red Lv.5 without the name or trait", "BT1-020", true, false, 0],
  ])("digivolves from a %s", async (_label, base, useAlternateCost, allowed, cost) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: base, as: "base" }], hand: [{ card: "BT27-053", as: "bancho" }], deck: ["BT1-009"] },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 5;
    await s.ready();
    expect((await digivolveInto(s, useAlternateCost)).ok).toBe(allowed);
    expect(s.state.memory).toBe(5 - cost);
    expect(s.perm("base").topCard.cardId).toBe(allowed ? "BT27-053" : base);
  });

  it.each([
    ["an opposing 11000 DP Digimon", "BT4-061", undefined, 11000, 6],
    ["an opposing 10000 DP Digimon", "BT1-024", undefined, 10000, 0],
    ["only its own 11000 DP Digimon", undefined, "BT4-061", 11000, 0],
  ] as const)("reduces the play cost by 6 only with %s", async (_label, opposing, own, dp, remaining) => {
    const threshold = (card: string) => [{ card, as: "threshold" }];
    const s = setupEngine(
      {
        0: { hand: [{ card: "BT27-053", as: "bancho" }], battleArea: own ? threshold(own) : [] },
        1: { battleArea: opposing ? threshold(opposing) : [] },
      },
      { autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 13;
    expect(s.perm("threshold").currentDP).toBe(dp);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("bancho").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => findBancho(s) !== undefined && !s.state.pendingDecision);
    expect(s.state.memory).toBe(remaining);
  });

  it("has Blocker and Fortitude in play", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT27-053", as: "bancho" }] } });
    await s.ready();
    expect([...s.perm("bancho").keywords]).toEqual(expect.arrayContaining(["Blocker", "Fortitude"]));
  });

  it.each([true, false])("may battle the chosen opposing Digimon on play (accept: %s)", async (accept) => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: { hand: [{ card: "BT27-053", as: "bancho" }] },
        1: {
          battleArea: [
            { card: "BT1-060", as: "spared" },
            { card: "BT1-019", as: "chosen" },
          ],
          security: ["BT1-009"],
        },
      },
      { autoAcceptOptional: accept, autoDeclineOptional: !accept, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("chosen").permanentId, s.perm("chosen").topCard.instanceId);
    s.state.memory = 13;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("bancho").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => optionalPrompts(s) === 1 && !s.state.pendingDecision && findBancho(s) !== undefined);
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.permanentId)).toEqual(
      accept ? [s.perm("spared").permanentId] : [s.perm("spared").permanentId, s.perm("chosen").permanentId],
    );
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(false);
    expect(findBancho(s)?.isSuspended).toBe(false);
  });

  it("shares one battle per turn between digivolving and attacking", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT11-014", as: "base" }],
          hand: [{ card: "BT27-053", as: "bancho" }],
          deck: ["BT1-009"],
        },
        1: { battleArea: ["BT1-019", "BT1-019"], security: ["BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 4;
    await s.ready();
    expect((await digivolveInto(s, true)).ok).toBe(true);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 1 && !s.state.pendingDecision);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(optionalPrompts(s)).toBe(1);
  });

  it("may battle when attacking if the turn's battle is unused", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-053", as: "bancho" }] },
        1: { battleArea: ["BT1-019"], security: ["BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("bancho").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 1 && !s.state.pendingDecision);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(optionalPrompts(s)).toBe(1);
  });

  it.each([
    ["DATA SQUAD Tamer", "BT26-091", true],
    ["traitless Tamer", "BT1-085", false],
    ["DATA SQUAD Digimon", "BT25-027", false],
  ])("plays a %s from hand for free on deletion: %s", async (_label, reward, played) => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT27-053", as: "bancho" }], hand: [{ card: reward, as: "reward" }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("bancho").permanentId]);
    await settle(() => !s.state.pendingDecision && findBancho(s) === undefined);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === reward)).toBe(played);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("reward").instanceId)).toBe(!played);
    expect(s.state.memory).toBe(3);
  });

  it("keeps the reward in hand when the optional play is declined", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT27-053", as: "bancho" }], hand: [{ card: "BT26-091", as: "reward" }] } },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("bancho").permanentId]);
    await settle(() => !s.state.pendingDecision && findBancho(s) === undefined);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("reward").instanceId]);
  });

  it.each([
    ["a Leomon waives its colors", "BT1-042", true],
    ["no Leomon or matching colors leaves it unusable", "BT1-019", false],
  ])("uses a Boss Option for free on deletion when %s", async (_label, ally, used) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-053", as: "bancho" },
            { card: ally, as: "ally" },
          ],
          hand: [{ card: "EX5-068", as: "punch" }],
        },
        1: { battleArea: [{ card: "BT1-060", as: "target" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoDeclineOptional: false },
    );
    s.state.memory = 3;
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("bancho").permanentId]);
    await settle(() => !s.state.pendingDecision && findBancho(s) === undefined);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("punch").instanceId)).toBe(used);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("punch").instanceId)).toBe(!used);
    expect(s.state.memory).toBe(3);
  });

  it.each([
    ["an off-color DATA SQUAD ally meets its Use Req.", "EX13-032", true],
    ["an off-color ally without DATA SQUAD leaves it unusable", "BT1-019", false],
  ])(
    "uses a DATA SQUAD DUAL card's Option side, then Arts Digivolves, on deletion when %s",
    async (_label, ally, used) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT27-053", as: "bancho" },
              { card: ally, as: "ally" },
            ],
            hand: [{ card: "BT27-032", as: "dual" }],
          },
          1: { battleArea: [{ card: "BT1-060", as: "target" }] },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.memory = 3;
      await s.ready();
      await advance(s.engine).verb.deletePermanent([s.perm("bancho").permanentId]);
      await settle(() => !s.state.pendingDecision && findBancho(s) === undefined);
      expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("dual").instanceId)).toBe(!used);
      expect(s.perm("ally").topCard.cardId).toBe(used ? "BT27-032" : ally);
      expect(s.state.players[1]!.battleArea).toHaveLength(used ? 0 : 1);
      expect(s.state.memory).toBe(3);
    },
  );

  it("returns through Fortitude, battles again on play, and still offers the deletion reward", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-053", as: "bancho", under: [{ card: "BT11-014", as: "source" }] }],
          hand: [{ card: "BT26-091", as: "reward" }],
        },
        1: { battleArea: ["BT1-060"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("bancho").permanentId]);
    await settle(
      () =>
        findBancho(s) !== undefined &&
        s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT26-091") &&
        !s.state.pendingDecision,
    );
    expect(findBancho(s)?.stack).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([s.inst("source").instanceId]);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  });

  it("keeps the turn's battle after declining it when digivolving", async () => {
    const options = { autoDeclineOptional: true, autoAcceptOptional: false, autoSelectCards: true };
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT11-014", as: "base" }],
          hand: [{ card: "BT27-053", as: "bancho" }],
          deck: ["BT1-009"],
        },
        1: { battleArea: ["BT1-019", "BT1-019"], security: ["BT1-009", "BT1-009"] },
      },
      options,
    );
    s.state.memory = 4;
    await s.ready();
    expect((await digivolveInto(s, true)).ok).toBe(true);
    expect(s.state.players[1]!.battleArea).toHaveLength(2);
    options.autoDeclineOptional = false;
    options.autoAcceptOptional = true;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 1 && !s.state.pendingDecision);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(optionalPrompts(s)).toBe(2);
  });

  it("pays the printed digivolution cost even when an opposing Digimon has 11000 DP", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX5-032", as: "base" }],
          hand: [{ card: "BT27-053", as: "bancho" }],
          deck: ["BT1-009"],
        },
        1: { battleArea: ["BT4-061"] },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 5;
    await s.ready();
    expect((await digivolveInto(s, false)).ok).toBe(true);
    expect(s.state.memory).toBe(0);
  });

  it("blocks without a battle offer and uses a Boss Option for free when deleted on the opponent's turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT8-017", as: "attacker" },
            { card: "BT1-019", as: "target" },
          ],
        },
        1: {
          battleArea: [
            { card: "BT27-053", as: "bancho" },
            { card: "BT1-042", as: "loader" },
          ],
          hand: [{ card: "EX5-068", as: "punch" }],
          security: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).blockingSeat() === 1);
    expect(s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: s.perm("bancho").permanentId })).toEqual(
      {
        ok: true,
      },
    );
    await settle(() => !observe(s.engine).isAttacking() && !s.state.pendingDecision);
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT27-053")).toBe(false);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("punch").instanceId]),
    );
    expect(optionalPrompts(s)).toBe(1);
  });

  it("battles again on play after Fortitude returns it in the same turn", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-053", as: "bancho", under: ["BT11-014"] }] },
        1: {
          battleArea: [
            { card: "BT8-017", as: "tie" },
            { card: "BT1-019", as: "second" },
          ],
          security: ["BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("tie").permanentId, s.perm("tie").topCard.instanceId);
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("bancho").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && !s.state.pendingDecision);
    expect(findBancho(s)?.stack).toHaveLength(0);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(optionalPrompts(s)).toBe(2);
  });

  it("spends the turn's battle when activated without an opposing Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT11-014", as: "base" }],
          hand: [{ card: "BT27-053", as: "bancho" }],
          deck: ["BT1-009"],
        },
        1: { security: ["BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 4;
    await s.ready();
    expect((await digivolveInto(s, true)).ok).toBe(true);
    expect(optionalPrompts(s)).toBe(1);
    s.putOnBoard(1, "BT1-019");
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 1 && !s.state.pendingDecision);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(optionalPrompts(s)).toBe(1);
  });
});
