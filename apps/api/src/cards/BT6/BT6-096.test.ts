import { EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "./BT6-002.js";
import "./BT6-096.js";

const FILLER = ["BT1-009", "BT1-013", "BT1-009", "BT1-013"];
const SECURITY = ["BT1-009", "BT1-013", "BT1-009"];

describe("BT6-096 Forbidden Trident", () => {
  it("delegates the printed stack cleanup to Return instead of effect-driven trash", () => {
    const main = runtimeCompiledCard("BT6-096")!.effects.find((effect) => effect.trigger === "Main")!;
    const grant = main.actions.find((action) => action.kind === "GainTriggeredEffect");
    if (!grant || grant.kind !== "GainTriggeredEffect") throw new Error("missing When Attacking grant");

    expect(grant.gainedActions.map((action) => action.kind)).toEqual(["SelectBind", "Return"]);
  });

  it("adds itself to hand from security", async () => {
    const s = setupEngine({ 0: { security: [{ card: "BT6-096", as: "security", faceUp: true }] } });
    const instanceId = s.inst("security").instanceId;

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("security"));

    expect(s.state.players[0]!.hand.some((card) => card.instanceId === instanceId)).toBe(true);
  });

  it("keeps the granted bounce off another Digimon's attack on the same turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT6-019", as: "boosted" },
            { card: "BT6-044", as: "otherAttacker" },
          ],
          hand: [{ card: "BT6-096", as: "option" }],
          deck: [...FILLER, ...FILLER],
          security: [...SECURITY],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "rookie" }],
          deck: [...FILLER, ...FILLER],
          security: [...SECURITY],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 6;
    const rookieId = s.perm("rookie").permanentId;
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("boosted").currentDP === 4000);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("otherAttacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === SECURITY.length - 1);
    await settle();

    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.permanentId)).toEqual([rookieId]);

    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("ends the granted bounce with the turn so the opponent's next attack does not trigger it", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT6-019", as: "boosted" }],
          hand: [
            { card: "BT6-096", as: "option" },
            { card: "BT1-009", as: "spare" },
          ],
          deck: [...FILLER, ...FILLER],
          security: [...SECURITY],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "rookie" },
            { card: "BT6-044", as: "opponentAttacker" },
          ],
          deck: [...FILLER, ...FILLER],
          security: [...SECURITY],
          hand: [{ card: "BT1-009", as: "opponentSpare" }],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 6;
    const rookieId = s.perm("rookie").permanentId;
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("boosted").currentDP === 4000);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });

    await advance(s.engine).waitForMainPhase(1);
    await s.ready();
    expect(s.perm("boosted").currentDP).toBe(2000);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("opponentAttacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === SECURITY.length - 1);
    await settle();

    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === rookieId)).toBe(true);

    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("gives one Digimon +2000 DP and the printed When Attacking bounce for the turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT6-019", under: ["BT6-002"], as: "attacker" }],
          deck: [{ card: "BT1-010", as: "notDrawn" }],
          hand: [{ card: "BT6-096", as: "option" }],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "rookie", under: ["BT1-010", "BT1-011"] },
            { card: "BT6-044", as: "tooHigh" },
          ],
          security: ["BT1-001"],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    const rookieInstanceId = s.perm("rookie").topCard!.instanceId;
    const sourceInstanceIds = s.perm("rookie").stack.map((card) => card.instanceId);
    const tooHighId = s.perm("tooHigh").permanentId;

    await advance(s.engine).fire(EffectTiming.OnStartTurn, s.perm("attacker"));
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("attacker").currentDP === 4000);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.hand.some((card) => card.instanceId === rookieInstanceId));

    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toEqual(expect.arrayContaining(sourceInstanceIds));
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === tooHighId)).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("notDrawn").instanceId)).toBe(false);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([s.inst("notDrawn").instanceId]);
  });
});
