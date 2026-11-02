import fixture from "#api/engine/scenarios/trait-card-trash-return.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle, type EngineSetup } from "../../engine/testkit/harness.js";
import "../BT5/BT5-091.js";
import "../BT12/BT12-088.js";
import "../BT13/BT13-007.js";
import { compiled } from "./BT18-011.js";

describe("BT18-011 Agunimon", () => {
  it("returns a Hybrid Digimon from trash when digivolving", async () => {
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(compiled.effects[0]).toMatchObject({
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "Return",
          to: "hand",
          optional: true,
          target: {
            filter: {
              zone: "trash",
              controller: "mine",
              or: [
                { nameOrTrait: [{ tokens: ["Hybrid", "Ten Warriors"], match: "trait" }] },
                { kind: ["Tamer"], hasInheritedEffects: true },
              ],
            },
          },
        },
      ],
    });
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT12-013", as: "burning" }],
          hand: [{ card: "BT18-011", as: "agunimon" }],
          trash: ["BT12-009"],
          deck: ["BT1-009"],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("burning").permanentId,
        instanceId: s.inst("agunimon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("burning").topCard?.cardId === "BT18-011");
    expect(s.state.players[0]!.hand.some((card) => card.cardId === "BT12-009")).toBe(true);
  });

  it("returns a Ten Warriors Option alongside eligible Digimon and inherited Tamers", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: true });
    const turn = s.engine.runOneTurn();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("burning").permanentId,
          instanceId: s.inst("agunimon").instanceId,
          useAlternateCost: true,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      const choice = s.decisions.findLast(({ req }) => req.kind === "selectCards")!.req;
      const candidates = [...(choice.options?.candidateInstanceIds ?? [])];
      expect(candidates).toEqual(
        expect.arrayContaining(
          ["ancientGuardian", "hybrid", "tenWarriors", "inheritedTamer"].map((alias) => s.inst(alias).instanceId),
        ),
      );
      expect(candidates).toHaveLength(4);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: choice.decisionId,
          response: { kind: "selectCards", instanceIds: [s.inst("ancientGuardian").instanceId] },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision === undefined);

      expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(
        s.inst("ancientGuardian").instanceId,
      );
      expect(s.perm("burning").topCard.instanceId).toBe(s.inst("agunimon").instanceId);
      expect(s.perm("burning").stack.at(-1)?.cardId).toBe("BT12-013");
      expect(s.state.players[0]!.trash).toHaveLength(6);
      expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toContain(
        s.inst("opponentAncientGuardian").instanceId,
      );
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await turn;
    }
  });

  it("returns a Ten Warriors Digimon from trash when digivolving", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT12-013", as: "burning" }],
          hand: [{ card: "BT18-011", as: "agunimon" }],
          trash: [{ card: "BT18-017", as: "tenWarriors" }],
          deck: ["BT1-009"],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    s.state.memory = 10;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("burning").permanentId,
        instanceId: s.inst("agunimon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("burning").topCard?.cardId === "BT18-011");

    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("tenWarriors").instanceId)).toBe(true);
  });

  it("returns a Tamer with inherited effects but not a plain Tamer", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT12-013", as: "burning" }],
          hand: [{ card: "BT18-011", as: "agunimon" }],
          trash: [
            { card: "BT18-087", as: "plainTamer" },
            { card: "BT18-088", as: "inheritedTamer" },
          ],
          deck: ["BT1-009"],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("burning").permanentId,
        instanceId: s.inst("agunimon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("burning").topCard?.cardId === "BT18-011");
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("inheritedTamer").instanceId);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("plainTamer").instanceId);
  });

  it("may decline the trash return", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT12-013", as: "burning" }],
          hand: [{ card: "BT18-011", as: "agunimon" }],
          trash: [{ card: "BT12-009", as: "hybrid" }],
          deck: ["BT1-009"],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: false },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("burning").permanentId,
        instanceId: s.inst("agunimon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("hybrid").instanceId);
  });

  it.each([
    ["Takuya Kanbara", "BT12-088", 3],
    ["BurningGreymon", "BT12-013", 5],
  ])("digivolves from %s with the printed alternate cost", async (_name, baseCard, expectedMemory) => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: baseCard, as: "base" }],
        hand: [{ card: "BT18-011", as: "agunimon" }],
        deck: [{ card: "BT1-009", as: "draw" }],
      },
    });
    s.state.memory = 5;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("agunimon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT18-011");
    expect(s.state.memory).toBe(expectedMemory);
    expect(s.perm("base").stack.at(-1)?.cardId).toBe(baseCard);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toContain("BT1-009");
  });

  it("grants its host 2000 DP only during its controller's turn", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT1-030", as: "host", under: ["BT18-011"] }] } });
    await s.ready();
    expect(s.perm("host").currentDP).toBe(5000);
    s.state.turnSeat = 1;
    await s.engine.recomputeContinuousEffects();
    expect(s.perm("host").currentDP).toBe(3000);
  });
});

describe("BT18-011 Agunimon — KB Q&A rulings", () => {
  const FILLER = ["BT1-009", "BT1-013", "BT1-009", "BT1-013"];

  function digivolveFromTakuya(s: EngineSetup) {
    return s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("takuya").permanentId,
      instanceId: s.inst("agunimon").instanceId,
      useAlternateCost: true,
    });
  }

  function digivolveRookie(s: EngineSetup) {
    return s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("rookie").permanentId,
      instanceId: s.inst("champion").instanceId,
    });
  }

  it("digivolves from the Tamer as-is: Digimon digivolve watchers stay silent and Digimon can't-digivolve locks do not apply (Q2913)", async () => {
    function boardWithTakumiAiba() {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT12-088", as: "takuya" },
              { card: "BT1-010", as: "rookie" },
              { card: "BT5-091", as: "takumi" },
            ],
            hand: [
              { card: "BT18-011", as: "agunimon" },
              { card: "BT1-018", as: "champion" },
            ],
            deck: [...FILLER],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.memory = 10;
      return s;
    }

    const digimonControl = boardWithTakumiAiba();
    expect(digivolveRookie(digimonControl)).toEqual({ ok: true });
    await settle(() => digimonControl.perm("rookie").topCard.cardId === "BT1-018");
    await settle();
    expect(digimonControl.perm("takumi").isSuspended).toBe(true);
    expect(digimonControl.state.players[0]!.hand).toHaveLength(3);

    const fromTamer = boardWithTakumiAiba();
    expect(digivolveFromTakuya(fromTamer)).toEqual({ ok: true });
    await settle(() => fromTamer.perm("takuya").topCard.cardId === "BT18-011");
    await settle();
    expect(fromTamer.perm("takumi").isSuspended).toBe(false);
    expect(fromTamer.state.players[0]!.hand.map(({ cardId }) => cardId).sort()).toEqual(["BT1-009", "BT1-018"]);

    const locked = setupEngine(
      {
        0: {
          breeding: "BT13-007",
          battleArea: [
            { card: "BT12-088", as: "takuya" },
            { card: "BT1-010", as: "rookie" },
          ],
          hand: [
            { card: "BT18-011", as: "agunimon" },
            { card: "BT1-018", as: "champion" },
          ],
          deck: [...FILLER],
        },
      },
      { autoDeclineOptional: true },
    );
    locked.state.memory = 10;
    await locked.ready();
    expect(digivolveRookie(locked)).toMatchObject({ ok: false });
    expect(locked.perm("rookie").topCard.cardId).toBe("BT1-010");
    expect(digivolveFromTakuya(locked)).toEqual({ ok: true });
    await settle(() => locked.perm("takuya").topCard.cardId === "BT18-011");
    expect(locked.state.memory).toBe(8);
  });

  it("performs the digivolution bonus draw when digivolving from a Tamer (Q2914)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT12-088", as: "takuya" }],
          hand: [{ card: "BT18-011", as: "agunimon" }],
          deck: [{ card: "BT1-009", as: "drawn" }, ...FILLER],
        },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 10;
    expect(digivolveFromTakuya(s)).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.hand.length === 1);

    expect(s.perm("takuya").topCard.cardId).toBe("BT18-011");
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("drawn").instanceId]);
    expect(s.state.players[0]!.deck).toHaveLength(FILLER.length);
  });

  it("cannot attack the turn it digivolves from a Tamer played that turn (Q2915)", async () => {
    async function digivolvedFromTakuya(enteredThisTurn: boolean) {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT12-088", as: "takuya", enteredThisTurn }],
            hand: [{ card: "BT18-011", as: "agunimon" }],
            deck: [...FILLER],
          },
          1: { security: 3, deck: [...FILLER] },
        },
        { autoDeclineOptional: true },
      );
      s.state.memory = 10;
      expect(digivolveFromTakuya(s)).toEqual({ ok: true });
      await settle(() => s.perm("takuya").topCard.cardId === "BT18-011");
      return s;
    }
    function attackPlayer(s: EngineSetup) {
      return s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("takuya").permanentId,
        target: { kind: "player" },
      });
    }

    const fresh = await digivolvedFromTakuya(true);
    expect(attackPlayer(fresh)).toMatchObject({ ok: false });
    expect(fresh.perm("takuya").isSuspended).toBe(false);
    expect(fresh.state.players[1]!.security).toHaveLength(3);

    const established = await digivolvedFromTakuya(false);
    expect(attackPlayer(established)).toEqual({ ok: true });
    await settle(() => established.state.players[1]!.security.length === 2);
    expect(established.perm("takuya").isSuspended).toBe(true);
  });

  it("keeps the Tamer as a digivolution card that is trashed when the Digimon leaves the field (Q6574)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT12-088", as: "takuya" }],
          hand: [{ card: "BT18-011", as: "agunimon" }],
          deck: [...FILLER],
        },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 10;
    const takuyaCard = s.perm("takuya").topCard.instanceId;
    expect(digivolveFromTakuya(s)).toEqual({ ok: true });
    await settle(() => s.perm("takuya").topCard.cardId === "BT18-011");
    expect(s.perm("takuya").stack.map(({ instanceId }) => instanceId)).toEqual([takuyaCard]);

    await advance(s.engine).verb.deletePermanent([s.perm("takuya").permanentId]);
    await settle(() => s.state.players[0]!.trash.length === 2);

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([takuyaCard, s.inst("agunimon").instanceId]),
    );
  });

  it("does not gain the [Security] effect of a Tamer in its digivolution cards (Q6575)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT12-088", as: "takuya" }],
          hand: [{ card: "BT18-011", as: "agunimon" }],
          security: [{ card: "BT12-088", as: "securityTakuya" }],
          deck: [...FILLER],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    expect(digivolveFromTakuya(s)).toEqual({ ok: true });
    await settle(() => s.perm("takuya").topCard.cardId === "BT18-011");
    await s.ready();

    await advance(s.engine).fire(EffectTiming.SecuritySkill, s.perm("takuya"));
    await settle();
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.perm("takuya").stack.map(({ cardId }) => cardId)).toEqual(["BT12-088"]);

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("securityTakuya"));
    await settle(() => s.state.players[0]!.battleArea.length === 2);
    expect(s.perm("securityTakuya").topCard.cardId).toBe("BT12-088");
  });

  it("gains the inherited effects of a Tamer in its digivolution cards (Q6576)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT12-088", as: "takuya" }],
          hand: [{ card: "BT18-011", as: "agunimon" }],
          deck: [...FILLER],
        },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 10;
    expect(digivolveFromTakuya(s)).toEqual({ ok: true });
    await settle(() => s.perm("takuya").topCard.cardId === "BT18-011");
    await s.ready();
    expect(s.perm("takuya").currentDP).toBe(7000);

    async function attackWithTakuyaUnder(baseDP: number) {
      const board = setupEngine({
        0: {
          battleArea: [{ card: "BT18-011", as: "agunimon", dp: baseDP, under: ["BT12-088"] }],
          deck: [...FILLER],
        },
        1: { security: 3, deck: [...FILLER] },
      });
      board.state.memory = 3;
      await board.ready();
      expect(
        board.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: board.perm("agunimon").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => board.state.players[1]!.security.length === 2);
      await settle();
      return board;
    }

    const boosted = await attackWithTakuyaUnder(8000);
    expect(boosted.perm("agunimon").currentDP).toBe(10000);
    expect(boosted.state.memory).toBe(5);

    const belowThreshold = await attackWithTakuyaUnder(7000);
    expect(belowThreshold.perm("agunimon").currentDP).toBe(9000);
    expect(belowThreshold.state.memory).toBe(3);
  });
});
