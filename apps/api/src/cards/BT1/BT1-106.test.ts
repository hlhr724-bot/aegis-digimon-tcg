import { getCardDefinition, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT1-106.js";

describe("BT1-106 Symphony No.1 <Polyphony>", () => {
  it("matches the catalog and compiles one opposing Digimon -7000 DP for the turn", () => {
    expect(getCardDefinition("BT1-106")).toMatchObject({
      cardId: "BT1-106",
      set: "BT1",
      nameEn: "Symphony No.1 <Polyphony>",
      colors: ["Yellow"],
      kinds: ["Option"],
      playCost: 5,
      dp: 0,
      evoCosts: [],
      effectText: "[Main] 1 of your opponent's Digimon gets -7000 DP for the turn.",
      rarity: "R",
      maxCountInDeck: 4,
      imageId: "BT1-106",
    });
    expect(compiled).toEqual({
      effects: [
        {
          trigger: "Main",
          actions: [
            {
              effectTextPart: "[Main] 1 of your opponent's Digimon gets -7000 DP for the turn.",
              kind: "ModifyDP",
              target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
              amount: -7000,
              duration: "forTheTurn",
            },
          ],
        },
      ],
      coverage: "full",
      residual: [],
    });
  });

  it("gives exactly 1 opposing Digimon -7000 DP for the turn and then expires", async () => {
    const s = setupEngine(
      {
        0: { battleArea: ["BT1-047"], hand: [{ card: "BT1-106", as: "option" }], deck: ["BT1-009"] },
        1: { battleArea: [{ card: "BT10-028", as: "target" }] },
      },
      { autoSelectCards: true },
    );
    const mainPhase = (s.engine as unknown as { mainPhase: { isOpen: boolean } }).mainPhase;
    const turn = s.engine.runOneTurn();
    await settle(() => mainPhase.isOpen && s.state.phase === Phase.Main);
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("target").currentDP === 5000);
    expect(s.perm("target").currentDP).toBe(5000);

    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await turn;
    expect(s.perm("target").currentDP).toBe(12_000);
  });

  it("deletes a 7000 DP target when the modifier reduces it to 0 DP", async () => {
    const s = setupEngine(
      {
        0: { battleArea: ["BT1-047"], hand: [{ card: "BT1-106", as: "option" }] },
        1: { battleArea: [{ card: "BT1-016", as: "target", dp: 7000 }] },
      },
      { autoSelectCards: true },
    );
    const targetId = s.perm("target").permanentId;
    s.state.memory = 5;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => !s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === targetId));

    expect(s.state.players[1]!.trash.some((card) => card.cardId === "BT1-016")).toBe(true);
  });

  it("targets a moved, legally evolved stack after public hatch and keeps a higher-DP peer untouched", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: ["BT1-047"],
          hand: [{ card: "BT1-106", as: "option" }],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014", "BT1-015", "BT1-016"],
        },
        1: {
          eggDeck: [{ card: "BT1-003", as: "egg" }],
          hand: [
            { card: "BT1-028", as: "level3" },
            { card: "BT1-032", as: "level4" },
            { card: "BT1-042", as: "target" },
            { card: "BT1-009", as: "hold" },
          ],
          battleArea: [{ card: "BT10-028", as: "other" }],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014", "BT1-015", "BT1-016"],
          security: ["BT1-009"],
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    const firstTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await firstTurn;
    s.state.turnSeat = 1;
    s.state.memory = -s.state.memory;

    const secondTurn = s.engine.runOneTurn();
    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 1);
    expect(s.engine.applyIntent(1, { type: "hatchEgg" })).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.breeding?.topCard?.cardId === "BT1-003");
    const permanentId = s.state.players[1]!.breeding!.permanentId;
    await advance(s.engine).waitForMainPhase(1);
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(1, { type: "digivolve", permanentId, instanceId: s.inst("level3").instanceId }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.breeding?.topCard?.cardId === "BT1-028");
    expect(
      s.engine.applyIntent(1, { type: "digivolve", permanentId, instanceId: s.inst("level4").instanceId }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.breeding?.topCard?.cardId === "BT1-032");
    expect(
      s.engine.applyIntent(1, { type: "digivolve", permanentId, instanceId: s.inst("target").instanceId }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.breeding?.topCard?.cardId === "BT1-042");
    advance(s.engine).endMainPhaseIfOpen(1);
    await secondTurn;
    s.state.turnSeat = 0;
    s.state.memory = -s.state.memory;

    const thirdTurn = s.engine.runOneTurn();
    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await thirdTurn;
    s.state.turnSeat = 1;
    s.state.memory = -s.state.memory;

    const fourthTurn = s.engine.runOneTurn();
    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 1);
    expect(s.engine.applyIntent(1, { type: "moveFromBreeding", permanentId })).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.some((p) => p.permanentId === permanentId));
    preferred.push(s.perm("target").topCard!.instanceId);
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await fourthTurn;
    s.state.turnSeat = 0;
    s.state.memory = -s.state.memory;

    const fifthTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 5;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("target").currentDP === 3000);
    expect(s.perm("target").currentDP).toBe(3000);
    expect(s.perm("other").currentDP).toBe(12000);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await fifthTurn;
  });

  it("has no Security effect and is simply trashed after the check", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-010", as: "attacker", dp: 5000 }] },
      1: { security: [{ card: "BT1-106", as: "securityOption" }] },
    });
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0 && !observe(s.engine).isAttacking());

    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("securityOption").instanceId);
  });
});
