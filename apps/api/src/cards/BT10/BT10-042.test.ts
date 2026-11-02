import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { assertNoLoudGap, setupEngine, settle, type EngineSetup } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../BT6/BT6-067.js";
import "../BT9/BT9-015.js";
import "../BT12/BT12-017.js";
import "../AD1/AD1-001.js";
import "../BT1/BT1-010.js";
import "../BT6/BT6-082.js";
import "../BT6/BT6-111.js";
import "../BT24/BT24-020.js";
import "../BT24/BT24-025.js";
import "../BT24/BT24-040.js";
import "../EX1/EX1-059.js";
import "./BT10-013.js";
import "./BT10-068.js";
import "./BT10-110.js";
import "./BT10-112.js";
import { compiled } from "./BT10-042.js";
import "#api/cards/BT21/BT21-071";
import "#api/cards/BT25/BT25-083";
import "#api/cards/BT25/BT25-092";
import "#api/cards/EX7/EX7-070";

describe("BT10-042 Venusmon", () => {
  it("encodes the global debuff and Security Attack-gated opponent-turn restrictions", () => {
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects).toEqual([
      expect.objectContaining({
        trigger: "WhenDigivolving",
        actions: [
          expect.objectContaining({
            kind: "GainKeyword",
            target: expect.objectContaining({
              count: "all",
              filter: expect.objectContaining({ controller: "opponent" }),
            }),
            keyword: expect.objectContaining({ keyword: "SecurityAttack", amount: -1 }),
            duration: "untilOpponentTurnEnd",
          }),
        ],
      }),
      expect.objectContaining({
        trigger: "OpponentsTurn",
        actions: [
          expect.objectContaining({
            kind: "Restrict",
            restriction: "attack",
            specificTarget: "source",
            target: expect.objectContaining({ filter: expect.objectContaining({ keywords: ["SecurityAttack"] }) }),
          }),
          expect.objectContaining({
            kind: "DisableTimingEffect",
            timings: ["whenDigivolving", "whenAttacking"],
            target: expect.objectContaining({ filter: expect.objectContaining({ keywords: ["SecurityAttack"] }) }),
          }),
        ],
      }),
    ]);
  });

  it("gives every opponent -1 and still gates a printed +1 attacker whose numeric total is zero (Q1963-Q1966)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT10-038", as: "base" }],
        hand: [{ card: "BT10-042", as: "venusmon" }],
        deck: ["BT1-001", "BT1-002"],
      },
      1: {
        battleArea: [
          { card: "BT10-013", as: "printedPlus" },
          { card: "BT1-010", as: "plain" },
        ],
        security: ["BT1-001", "BT1-002", "BT1-003"],
        deck: ["BT1-004", "BT1-005"],
      },
    });
    s.state.memory = 4;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("venusmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).keywordAmount(s.perm("plain"), "SecurityAttack") === -1);
    expect(observe(s.engine).keywordAmount(s.perm("printedPlus"), "SecurityAttack")).toBe(0);
    // CR 15-11-2-2: a Digimon that enters afterwards gains it too.
    const lateKeywordEntrant1 = s.putOnBoard(1, "BT1-083");
    expect(observe(s.engine).keywordAmount(lateKeywordEntrant1, "SecurityAttack")).toBe(
      observe(s.engine).keywordAmount(s.perm("plain"), "SecurityAttack"),
    );

    s.state.turnSeat = 1;
    await advance(s.engine).recompute();
    expect(observe(s.engine).timingEffectDisabled(s.perm("printedPlus"), "whenAttacking")).toBe(true);
    expect(observe(s.engine).timingEffectDisabled(s.perm("plain"), "whenDigivolving")).toBe(true);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("printedPlus").permanentId,
        target: { kind: "permanent", permanentId: s.perm("base").permanentId },
      }),
    ).toEqual({ ok: false, reason: "illegal-target" });
    assertNoLoudGap(s);
  });

  it("activates pending LadyDevimon effects after Der Blitz removes Venusmon during Asuna evolution", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT21-071", as: "scopemon", under: [{ card: "EX7-070", as: "derBlitz" }] },
            { card: "BT25-092", as: "asuna" },
          ],
          hand: [{ card: "BT25-083", as: "ladyDevimon" }],
          deck: ["BT1-010", "BT1-010", "BT1-010"],
        },
        1: {
          battleArea: [{ card: "BT10-038", as: "venusBase" }],
          hand: [{ card: "BT10-042", as: "venusmon" }],
          deck: ["BT1-010", "BT1-010"],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoChooseOption: true,
        autoOrderTriggers: true,
        preferInstanceIds: preferred,
      },
    );
    s.state.turnSeat = 1;
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: s.perm("venusBase").permanentId,
        instanceId: s.inst("venusmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle();
    s.state.turnSeat = 0;
    s.state.memory = 10;
    await advance(s.engine).recompute();
    expect(observe(s.engine).timingEffectDisabled(s.perm("scopemon"), "whenDigivolving")).toBe(true);
    preferred.push(s.inst("derBlitz").instanceId, s.perm("scopemon").permanentId, s.inst("ladyDevimon").instanceId);
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.inst("asuna").instanceId,
        effectKey: "BT25-092/ir-27-0",
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.perm("venusBase").topCard.cardId).toBe("BT10-038");
    expect(observe(s.engine).timingEffectDisabled(s.perm("scopemon"), "whenDigivolving")).toBe(false);
    expect(s.perm("scopemon").topCard.cardId).toBe("BT25-083");
    expect(s.state.players[0]!.deck).toHaveLength(1);
    expect(s.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT25-083")).toBe(true);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("does not affect a Digimon without active Security Attack and only protects Venusmon as an attack target", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT10-042", as: "venusmon", suspended: true },
          { card: "BT1-043", as: "other", suspended: true },
        ],
        security: ["BT1-001", "BT1-002"],
      },
      1: {
        battleArea: [
          { card: "BT10-013", as: "withKeyword" },
          { card: "BT1-010", as: "plain" },
        ],
        security: ["BT1-001", "BT1-002"],
      },
    });
    s.state.turnSeat = 1;
    await s.ready();

    expect(observe(s.engine).timingEffectDisabled(s.perm("withKeyword"), "whenAttacking")).toBe(true);
    expect(observe(s.engine).timingEffectDisabled(s.perm("plain"), "whenAttacking")).toBe(false);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("withKeyword").permanentId,
        target: { kind: "permanent", permanentId: s.perm("other").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("plain").permanentId,
        target: { kind: "permanent", permanentId: s.perm("venusmon").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    assertNoLoudGap(s);
  });

  it("suppresses a printed-Security-Attack card's When Digivolving before activation (Q1964)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT10-042", as: "venusmon" },
          { card: "BT1-009", as: "deleteTarget" },
        ],
      },
      1: {
        battleArea: [{ card: "BT1-020", as: "base" }],
        hand: [{ card: "BT12-017", as: "emperor" }],
        deck: ["BT1-001"],
      },
    });
    s.state.turnSeat = 1;
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("emperor").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT12-017");

    expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === s.perm("deleteTarget").permanentId)).toBe(true);
    expect(observe(s.engine).timingEffectDisabled(s.perm("base"), "whenDigivolving")).toBe(true);
    assertNoLoudGap(s);
  });

  it("allows the current When Digivolving to grant Security Attack, then suppresses later timings (Q1967)", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT10-042", as: "venusmon" }] },
      1: {
        battleArea: [{ card: "BT1-021", as: "metalgreymon" }],
        hand: [{ card: "BT9-015", as: "xAntibody" }],
        deck: ["BT1-001"],
      },
    });
    s.state.turnSeat = 1;
    await s.ready();

    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: s.perm("metalgreymon").permanentId,
        instanceId: s.inst("xAntibody").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("metalgreymon").currentDP === 11_000);

    expect(observe(s.engine).keywordAmount(s.perm("metalgreymon"), "SecurityAttack")).toBe(1);
    await advance(s.engine).recompute();
    expect(observe(s.engine).timingEffectDisabled(s.perm("metalgreymon"), "whenAttacking")).toBe(true);
    assertNoLoudGap(s);
  });

  it("tracks a conditional Security Attack only while its condition is active (Q1968)", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT10-042", as: "venusmon", suspended: true }] },
      1: { battleArea: [{ card: "BT6-067", as: "gankoomon" }] },
    });
    s.state.turnSeat = 1;
    await s.ready();

    expect(observe(s.engine).hasKeyword(s.perm("gankoomon"), "SecurityAttack")).toBe(false);
    expect(observe(s.engine).timingEffectDisabled(s.perm("gankoomon"), "whenAttacking")).toBe(false);
    await advance(s.engine).verb.unsuspend([s.perm("venusmon").permanentId]);
    await advance(s.engine).recompute();
    expect(observe(s.engine).hasKeyword(s.perm("gankoomon"), "SecurityAttack")).toBe(true);
    expect(observe(s.engine).timingEffectDisabled(s.perm("gankoomon"), "whenAttacking")).toBe(true);
    assertNoLoudGap(s);
  });
});

function isOnBoard(s: EngineSetup, seat: 0 | 1, permanentId: string): boolean {
  return s.state.players[seat]!.battleArea.some((permanent) => permanent.permanentId === permanentId);
}

describe("BT10-042 Venusmon — KB Q&A rulings", () => {
  it("treats a Digimon given <Security Attack -1> by an effect as a Digimon with <Security Attack> (Q1965)", async () => {
    async function opponentTurnBoard(digivolveVenusmon: boolean): Promise<EngineSetup> {
      const s = setupEngine({
        0: {
          battleArea: digivolveVenusmon
            ? [{ card: "BT10-038", as: "venusmon" }]
            : [{ card: "BT10-042", as: "venusmon", suspended: true }],
          hand: [{ card: "BT10-042", as: "venusmonCard" }],
          deck: ["BT1-001", "BT1-002"],
        },
        1: {
          battleArea: [{ card: "BT1-010", as: "plain" }],
          security: ["BT1-001", "BT1-002", "BT1-003"],
          deck: ["BT1-004", "BT1-005"],
        },
      });
      s.state.memory = 4;
      await s.ready();
      if (digivolveVenusmon) {
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("venusmon").permanentId,
          instanceId: s.inst("venusmonCard").instanceId,
        });
        await settle(() => observe(s.engine).keywordAmount(s.perm("plain"), "SecurityAttack") === -1);
        // Only a suspended Digimon is a legal attack target, so both boards expose Venusmon the same way.
        s.perm("venusmon").isSuspended = true;
      }
      expect(s.perm("venusmon").topCard.cardId).toBe("BT10-042");
      s.state.turnSeat = 1;
      await advance(s.engine).recompute();
      return s;
    }

    const debuffed = await opponentTurnBoard(true);
    expect(observe(debuffed.engine).hasKeyword(debuffed.perm("plain"), "SecurityAttack")).toBe(true);
    expect(observe(debuffed.engine).timingEffectDisabled(debuffed.perm("plain"), "whenAttacking")).toBe(true);
    expect(
      debuffed.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: debuffed.perm("plain").permanentId,
        target: { kind: "permanent", permanentId: debuffed.perm("venusmon").permanentId },
      }),
    ).toEqual({ ok: false, reason: "illegal-target" });

    const untouched = await opponentTurnBoard(false);
    expect(observe(untouched.engine).hasKeyword(untouched.perm("plain"), "SecurityAttack")).toBe(false);
    expect(observe(untouched.engine).timingEffectDisabled(untouched.perm("plain"), "whenAttacking")).toBe(false);
    expect(
      untouched.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: untouched.perm("plain").permanentId,
        target: { kind: "permanent", permanentId: untouched.perm("venusmon").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(untouched.engine).isAttacking());
    assertNoLoudGap(debuffed);
    assertNoLoudGap(untouched);
  });

  it("continues an attack whose attacker gains <Security Attack> from its own [When Attacking] effect (Q1969)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT10-042", as: "venusmon", suspended: true, dp: 1000 }],
          security: ["BT1-001", "BT1-002"],
        },
        1: {
          battleArea: [{ card: "EX1-059", as: "ogremon" }],
          hand: [{ card: "BT1-001", as: "fodder" }],
          security: ["BT1-001", "BT1-002"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    const venusmonId = s.perm("venusmon").permanentId;
    const ogremonId = s.perm("ogremon").permanentId;
    expect(observe(s.engine).hasKeyword(s.perm("ogremon"), "SecurityAttack")).toBe(false);

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("ogremon").permanentId,
        target: { kind: "permanent", permanentId: s.perm("venusmon").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());

    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("fodder").instanceId);
    expect(observe(s.engine).keywordAmount(s.perm("ogremon"), "SecurityAttack")).toBe(1);
    expect(isOnBoard(s, 0, venusmonId)).toBe(false);
    expect(isOnBoard(s, 1, ogremonId)).toBe(true);
    assertNoLoudGap(s);
  });

  it("does not stop <Raid> of a Digimon with <Security Attack>, since Raid is not a [When Attacking] effect (Q1970)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT10-042", as: "venusmon", suspended: true },
            { card: "BT1-010", as: "raidTarget" },
          ],
          security: ["BT1-001", "BT1-002", "BT1-003"],
        },
        1: {
          battleArea: [{ card: "BT10-013", as: "attacker", under: ["AD1-001"] }],
          security: ["BT1-001", "BT1-002"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    const raidTargetId = s.perm("raidTarget").permanentId;
    expect(observe(s.engine).keywordAmount(s.perm("attacker"), "SecurityAttack")).toBe(1);
    expect(observe(s.engine).hasKeyword(s.perm("attacker"), "Raid")).toBe(true);
    expect(observe(s.engine).timingEffectDisabled(s.perm("attacker"), "whenAttacking")).toBe(true);

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());

    expect(isOnBoard(s, 0, raidTargetId)).toBe(false);
    expect(s.state.players[0]!.security).toHaveLength(3);
    assertNoLoudGap(s);
  });

  it("stops Seiken Meppa from activating a [When Digivolving] effect of a Jesmon GX with <Security Attack> (Q2039)", async () => {
    async function playSeikenMeppa(withVenusmon: boolean): Promise<EngineSetup> {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT10-112", as: "jesmon", suspended: true, under: ["BT6-111"] }],
            hand: [
              { card: "BT10-110", as: "option" },
              { card: "BT10-068", as: "royalKnight" },
              { card: "BT6-082", as: "sister" },
            ],
          },
          1: {
            battleArea: withVenusmon ? ["BT10-042"] : ["BT1-010"],
            security: ["BT1-001", "BT1-002", "BT1-003"],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.memory = 10;
      await s.ready();
      expect(observe(s.engine).keywordAmount(s.perm("jesmon"), "SecurityAttack")).toBeGreaterThan(0);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
        ok: true,
      });
      await settle();
      return s;
    }

    const royalKnightPlaced = (s: EngineSetup) =>
      s.perm("jesmon").stack.some((card) => card.instanceId === s.inst("royalKnight").instanceId);

    const suppressed = await playSeikenMeppa(true);
    expect(suppressed.perm("jesmon").isSuspended).toBe(false);
    expect(royalKnightPlaced(suppressed)).toBe(false);

    const unsuppressed = await playSeikenMeppa(false);
    await settle(() => royalKnightPlaced(unsuppressed));
    expect(royalKnightPlaced(unsuppressed)).toBe(true);
  });

  it("cannot be digivolved into from Shellmon ignoring level, because its yellow requirement is unmet (Q5603)", async () => {
    async function shellmonMainPhase(venusmonCardId: string) {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT24-025", as: "shellmon" },
              { card: "BT24-020", as: "trigger", suspended: true },
            ],
            hand: [{ card: venusmonCardId, as: "venusmon" }],
            deck: ["BT1-009", "BT1-009"],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
      );
      s.state.memory = 10;
      await s.ready();
      s.state.isFirstPlayersFirstTurn = false;
      const turn = s.engine.runOneTurn();
      await advance(s.engine).waitForMainPhase(0);
      const endTurn = async () => {
        advance(s.engine).endMainPhaseIfOpen(0);
        await turn;
      };
      return { s, endTurn };
    }

    const yellow = await shellmonMainPhase("BT10-042");
    await settle();
    expect(yellow.s.perm("trigger").isSuspended).toBe(false);
    expect(yellow.s.perm("shellmon").topCard.cardId).toBe("BT24-025");
    expect(yellow.s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(
      yellow.s.inst("venusmon").instanceId,
    );
    expect(yellow.s.state.memory).toBe(10);
    await yellow.endTurn();

    const blue = await shellmonMainPhase("BT24-040");
    await settle(() => blue.s.perm("shellmon").topCard.cardId === "BT24-040");
    expect(blue.s.perm("shellmon").topCard.cardId).toBe("BT24-040");
    await blue.endTurn();
  });
});
