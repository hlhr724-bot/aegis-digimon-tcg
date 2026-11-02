import { EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle, type EngineSetup } from "../../engine/testkit/harness.js";
import { compiled as BT24_101 } from "./BT24-101.js";
import "../index.js";

async function paidToEvolveFromAegiochusmon(securityCount: number): Promise<number> {
  const s = setupEngine({
    0: {
      battleArea: [{ card: "BT24-014", as: "base" }],
      hand: [{ card: "BT24-101", as: "jupitermon" }],
      security: Array.from({ length: securityCount }, () => "AD1-001"),
    },
  });
  s.state.memory = 10;
  await s.engine.recomputeContinuousEffects();
  const before = s.state.memory;
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("base").permanentId,
      instanceId: s.inst("jupitermon").instanceId,
    }),
  ).toEqual({ ok: true });
  await settle(() => s.perm("base").topCard?.cardId === "BT24-101");
  return before - s.state.memory;
}

describe("BT24-101 Jupitermon", () => {
  it("sets the Aegiochusmon evolution cost to 1 per own security, including zero (Q5714)", async () => {
    expect(await paidToEvolveFromAegiochusmon(3)).toBe(3);
    expect(await paidToEvolveFromAegiochusmon(0)).toBe(0);
  });

  it("charges the printed 5 on the [TS] path when no [Aegiochusmon] base rewrites it", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT24-039", as: "base" }],
        hand: [{ card: "BT24-101", as: "jupitermon" }],
        security: ["AD1-001", "AD1-001", "AD1-001"],
      },
    });
    s.state.memory = 10;
    await s.engine.recomputeContinuousEffects();
    const before = s.state.memory;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("jupitermon").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard?.cardId === "BT24-101");
    expect(before - s.state.memory).toBe(5);
  });

  it("prices every projected route at what it charges, not at the printed figure", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT24-014", as: "base" }],
        hand: [{ card: "BT24-101", as: "jupitermon" }],
        security: ["AD1-001", "AD1-001", "AD1-001"],
      },
    });
    s.state.memory = 10;
    await s.engine.recomputeContinuousEffects();

    const routes = [...s.inst("jupitermon").digivolveRoutes];
    const basePermanentId = s.perm("base").permanentId;
    expect(routes.map((route) => route.permanentId)).toEqual(routes.map(() => basePermanentId));
    expect(routes.map((route) => route.alternateRequirementIndex).sort()).toEqual([-1, 0, 1]);
    expect(routes.map((route) => route.projectedCost)).toEqual([3, 3, 3]);
  });

  it("prices every projected route at 0 with an empty security stack (Q5714)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT24-014", as: "base" }],
        hand: [{ card: "BT24-101", as: "jupitermon" }],
        security: [],
      },
    });
    s.state.memory = 10;
    await s.engine.recomputeContinuousEffects();

    const routes = [...s.inst("jupitermon").digivolveRoutes];
    expect(routes.map((route) => route.alternateRequirementIndex).sort()).toEqual([-1, 0, 1]);
    expect(routes.map((route) => route.projectedCost)).toEqual([0, 0, 0]);
  });

  it("naturally plays and resolves the full On Play security/DP/recovery sequence", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT24-101", as: "jupitermon" }],
          security: [
            { card: "BT4-022", as: "payment" },
            { card: "BT4-023", as: "remaining" },
          ],
          deck: [
            { card: "BT4-024", as: "recovery1" },
            { card: "BT4-025", as: "recovery2" },
          ],
        },
        1: { battleArea: [{ card: "BT1-080", as: "target", dp: 13000 }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 12;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("jupitermon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("target").instanceId));

    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("payment").instanceId);
    expect(s.state.players[0]!.security).toHaveLength(3);
    expect(s.state.players[0]!.security.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([
        s.inst("remaining").instanceId,
        s.inst("recovery1").instanceId,
        s.inst("recovery2").instanceId,
      ]),
    );
  });

  it("naturally digivolves and resolves the When Digivolving sequence", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT24-014", as: "base" }],
          hand: [{ card: "BT24-101", as: "jupitermon" }],
          security: [
            { card: "BT4-022", as: "payment" },
            { card: "BT4-023", as: "remaining" },
          ],
          deck: [
            { card: "BT4-024", as: "recovery1" },
            { card: "BT4-025", as: "recovery2" },
          ],
        },
        1: { battleArea: [{ card: "BT1-080", as: "target", dp: 13000 }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("jupitermon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("target").instanceId));

    expect(s.perm("base").topCard.cardId).toBe("BT24-101");
    expect(s.state.memory).toBe(8);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("payment").instanceId);
    expect(s.state.players[0]!.security).toHaveLength(2);
    expect(s.state.players[0]!.security.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("remaining").instanceId, s.inst("recovery2").instanceId]),
    );
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("recovery1").instanceId);
  });

  it("trashes opponent security once per turn only for removal from its controller's security", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT24-101", as: "jupitermon" }] },
      1: { security: ["AD1-001", "AD1-001"] },
    });
    await advance(s.engine).fireSubTrigger("whenSecurityRemoved", { removedFromSecuritySeat: 1 });
    expect(s.state.players[1]!.security).toHaveLength(2);
    await advance(s.engine).fireSubTrigger("whenSecurityRemoved", { removedFromSecuritySeat: 0 });
    await advance(s.engine).fireSubTrigger("whenSecurityRemoved", { removedFromSecuritySeat: 0 });
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("naturally trashes the opponent's top security after an own security removal", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT24-101", as: "jupitermon" }],
        security: [
          { card: "BT4-022", as: "ownTop" },
          { card: "BT4-023", as: "ownRemaining" },
        ],
      },
      1: {
        battleArea: [{ card: "BT1-009", as: "attacker" }],
        security: [
          { card: "BT4-024", as: "opponentTop" },
          { card: "BT4-025", as: "opponentRemaining" },
        ],
      },
    });
    s.state.turnSeat = 1;
    s.state.memory = 0;
    await s.ready();

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 1 && s.state.players[1]!.security.length === 1);

    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("ownTop").instanceId);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("opponentTop").instanceId);
  });

  it("trashes the correct security cards and protects TS Digimon/Tamers", () => {
    for (const trigger of ["OnPlay", "WhenDigivolving"] as const) {
      const effect = BT24_101.effects?.find((entry) => entry.trigger === trigger);
      expect(effect?.actions?.[0]).toMatchObject({
        kind: "SecurityManipulation",
        op: "trashTop",
        controller: "mine",
        amount: 1,
      });
      expect(effect?.actions?.[1]).toMatchObject({
        kind: "ModifyDP",
        amount: -13000,
        duration: "untilOpponentTurnEnd",
        target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
      });
      expect(effect?.actions?.[2]).toMatchObject({
        kind: "SecurityManipulation",
        op: "addTop",
        source: "deck",
        amount: 2,
        condition: { kind: "zoneCount", seat: "mine", zone: "security", op: "lte", value: 1 },
      });
    }
    const securityWatcher = BT24_101.effects?.find(
      (entry) => entry.trigger === "AllTurns" && !entry.isInherited && entry.actions?.[0]?.kind === "SubTrigger",
    );
    expect(securityWatcher).toMatchObject({ frequency: "OncePerTurn" });
    expect(securityWatcher?.actions?.[0]).toMatchObject({
      kind: "SubTrigger",
      event: "whenSecurityRemoved",
      fireCondition: { kind: "triggerRemovedSecuritySeat", seat: "mine" },
    });
    const watcherAction = securityWatcher?.actions?.[0] as { actions?: unknown[] } | undefined;
    expect(watcherAction?.actions?.[0]).toMatchObject({
      kind: "trashSecurityTop",
      controller: "opponent",
      count: 1,
    });
    const replacement = BT24_101.effects?.find(
      (entry) => entry.trigger === "AllTurns" && entry.actions?.[0]?.kind === "Replacement",
    );
    expect(replacement).toMatchObject({ frequency: "OncePerTurn" });
    const replacementAction = replacement?.actions?.[0] as
      | { affectsAll?: boolean; sourceFilter?: unknown; actions?: Array<{ cost?: { target?: { filter?: unknown } } }> }
      | undefined;
    expect(replacementAction?.affectsAll).toBe(true);
    expect(replacementAction?.sourceFilter).toMatchObject({
      controller: "mine",
      kind: ["Digimon", "Tamer"],
      nameOrTrait: [{ tokens: ["TS"], match: "trait" }],
    });
    expect(replacementAction?.actions?.[0]?.cost?.target?.filter).toMatchObject({
      controller: "mine",
      zone: "security",
      position: "top",
    });
    expect(replacementAction?.actions?.[0]).toMatchObject({
      kind: "Prevent",
      mode: "leavePlay",
      optional: true,
      abortOnDecline: true,
    });
  });

  it.each(["OnPlay", "WhenDigivolving"] as const)(
    "%s reduces DP and recovers 2 even when there was no security card to trash (Q5715)",
    async (timing) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT24-101", as: "jupitermon" }],
            deck: [
              { card: "BT4-022", as: "recovery1" },
              { card: "BT4-023", as: "recovery2" },
            ],
          },
          1: { battleArea: [{ card: "BT1-080", as: "target", dp: 13000 }] },
        },
        { autoSelectCards: true },
      );
      await s.ready();

      await advance(s.engine).fire(
        timing === "OnPlay" ? EffectTiming.OnPlay : EffectTiming.WhenDigivolving,
        s.perm("jupitermon"),
      );
      await settle(() => s.state.players[0]!.security.length === 2);

      expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("target").instanceId);
      expect(s.state.players[0]!.security.map((card) => card.instanceId)).toEqual(
        expect.arrayContaining([s.inst("recovery1").instanceId, s.inst("recovery2").instanceId]),
      );
    },
  );

  it("prevents every simultaneously leaving TS Digimon and Tamer with one security payment (Q5718)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT24-101", as: "jupitermon" },
            { card: "BT24-009", as: "digimon" },
            { card: "BT24-088", as: "tamer" },
          ],
          security: [
            { card: "BT4-022", as: "payment" },
            { card: "BT4-023", as: "remaining" },
          ],
        },
        1: { security: ["BT4-024", "BT4-025"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).verb.deletePermanent(
      [s.perm("digimon").permanentId, s.perm("tamer").permanentId],
      "byEffect",
    );

    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.permanentId)).toEqual(
      expect.arrayContaining([s.perm("digimon").permanentId, s.perm("tamer").permanentId]),
    );
    expect(s.state.players[0]!.security.map((card) => card.instanceId)).toEqual([s.inst("remaining").instanceId]);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("shows the leave-prevention clause when Jupitermon protects itself", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT24-101", as: "jupitermon" }],
          security: ["BT4-022"],
        },
      },
      { autoAcceptOptional: true },
    );
    await s.ready();

    await advance(s.engine).verb.deletePermanent([s.perm("jupitermon").permanentId], "byEffect");

    const decision = s.decisions.find(({ req }) => req.kind === "optional");
    expect(decision?.req.options?.effectText).toBe(
      "[All Turns] [Once Per Turn] When any of your [TS] trait Digimon or Tamers would leave the battle area, by trashing your top security card, they don't leave.",
    );
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.state.players[0]!.security).toHaveLength(0);
  });

  it("naturally protects a TS Digimon from battle deletion by paying the top security", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT24-101", as: "jupitermon" },
            { card: "BT24-009", as: "tsTarget", suspended: true },
          ],
          security: [
            { card: "BT4-022", as: "payment" },
            { card: "BT4-023", as: "remaining" },
          ],
        },
        1: { battleArea: [{ card: "BT1-009", as: "attacker", dp: 13000 }] },
      },
      { autoAcceptOptional: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 0;
    await s.ready();

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("tsTarget").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 1);

    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.permanentId)).toContain(
      s.perm("tsTarget").permanentId,
    );
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("payment").instanceId);
  });
});

describe("BT24-101 Jupitermon — KB Q&A rulings", () => {
  it("keeps a Digimon at 0 DP on the field until the whole effect resolves, then deletes it in the rule check (Q5716)", async () => {
    let setup: EngineSetup | undefined;
    const targetOnFieldAtRecovery: boolean[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT24-101", as: "jupitermon" }],
          security: [{ card: "BT4-022", as: "payment" }],
          deck: [
            { card: "BT4-024", as: "recovery1" },
            { card: "BT4-025", as: "recovery2" },
          ],
        },
        1: { battleArea: [{ card: "BT1-080", as: "target", dp: 13000 }] },
      },
      {
        autoSelectCards: true,
        onEvent(event) {
          if (event.kind !== "securityRecovered" || setup === undefined) return;
          const target = setup.state.players[1]!.battleArea.find(
            (permanent) => permanent.topCard.instanceId === setup!.inst("target").instanceId,
          );
          targetOnFieldAtRecovery.push(target !== undefined && target.currentDP === 0);
        },
      },
    );
    setup = s;
    await s.ready();

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("jupitermon"));
    await settle(() => s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("target").instanceId));

    expect(targetOnFieldAtRecovery).toEqual([true]);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.security.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("recovery1").instanceId, s.inst("recovery2").instanceId]),
    );
  });

  it("resolves a revealed [Security] effect first, then the turn player's removal trigger, then Jupitermon's (Q5717)", async () => {
    let setup: EngineSetup | undefined;
    const order: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT24-101", as: "jupitermon" }],
          security: [{ card: "BT24-084", as: "securityTamer" }, "BT4-023"],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "attacker", under: ["BT24-012"] }],
          security: [{ card: "BT4-024", as: "opponentTop" }, "BT4-025"],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        onEvent() {
          if (setup === undefined) return;
          const mark = (label: string, reached: boolean) => {
            if (reached && !order.includes(label)) order.push(label);
          };
          mark(
            "security effect",
            setup.state.players[0]!.battleArea.some(
              (permanent) => permanent.topCard.instanceId === setup!.inst("securityTamer").instanceId,
            ),
          );
          mark("turn player's trigger", setup.state.memory === 1);
          mark(
            "Jupitermon's trigger",
            setup.state.players[1]!.trash.some((card) => card.instanceId === setup!.inst("opponentTop").instanceId),
          );
        },
      },
    );
    setup = s;
    s.state.turnSeat = 1;
    s.state.memory = 0;
    await s.ready();

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("opponentTop").instanceId) &&
        s.state.pendingDecision === undefined,
    );

    expect(order).toEqual(["security effect", "turn player's trigger", "Jupitermon's trigger"]);
  });
});
