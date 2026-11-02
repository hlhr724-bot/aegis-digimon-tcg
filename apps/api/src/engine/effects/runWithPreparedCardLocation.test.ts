import { describe, expect, it, vi } from "vitest";
import "#api/cards/BT2/BT2-031";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import { createCardStateLookup } from "#api/engine/effects/context";
import { runWithPreparedCardLocation } from "#api/engine/effects/runWithPreparedCardLocation";
import { getEffectModule } from "#api/engine/effects/registry";
import { clearBattleArea, placePermanent } from "#api/engine/state/access";
import type { EffectContext } from "#api/engine/effects/EffectContext";

function prepareLookupScenario() {
  return setupScenario({
    memory: 3,
    turnSeat: 0,
    turnCount: 2,
    isFirstPlayersFirstTurn: false,
    board: {
      0: {
        battleArea: [{ card: "BT1-019", as: "field", under: [{ card: "BT1-009", as: "source" }] }],
      },
      1: { breeding: { card: "BT1-001", as: "egg" } },
    },
  });
}

describe("card location during synchronous effect preparation", () => {
  it("refreshes source placement during both synchronous and resumed continuous resolution", async () => {
    const setup = setupScenario({
      memory: 3,
      turnSeat: 0,
      turnCount: 2,
      isFirstPlayersFirstTurn: false,
      board: {
        0: { battleArea: [{ card: "BT2-031", as: "continuous-source" }] },
        1: { battleArea: [{ card: "BT1-019", as: "opponent" }] },
      },
    });
    await setup.ready();
    const permanent = setup.state.players[0]!.battleArea[0]!;
    const module = getEffectModule(permanent.topCard.cardId)!;
    const effectsForTiming = module.effectsForTiming.bind(module);
    let resolutions = 0;
    const spy = vi.spyOn(module, "effectsForTiming").mockImplementation((timing, source) => {
      const effects = effectsForTiming(timing, source);
      if (timing !== EffectTiming.None) {
        return effects;
      }
      return effects.map((effect) => ({
        ...effect,
        resolve: async (ctx: EffectContext) => {
          resolutions++;
          expect(ctx.source.isOnBattleArea()).toBe(true);
          permanent.inBreeding = true;
          expect(ctx.source.isOnBattleArea()).toBe(false);
          expect(ctx.source.isOnBreedingArea?.()).toBe(true);
          await Promise.resolve();
          permanent.inBreeding = false;
          expect(ctx.source.isOnBattleArea()).toBe(true);
          await effect.resolve(ctx);
        },
      }));
    });
    try {
      await setup.engine.recomputeContinuousEffects();
      expect(resolutions).toBeGreaterThan(0);
    } finally {
      permanent.inBreeding = false;
      spy.mockRestore();
    }
  });

  it("observes moved cards and changed breeding flags after preparation ends", async () => {
    const setup = prepareLookupScenario();
    await setup.ready();
    const { state } = setup;
    const player = state.players[0]!;
    const permanent = player.battleArea[0]!;
    const lookup = createCardStateLookup(state);
    const id = permanent.topCard.instanceId;
    runWithPreparedCardLocation({
      state,
      execute: () => {
        expect(lookup.permanentOf(id)).toBe(permanent);
        expect(lookup.isOnBattleArea(id)).toBe(true);
        expect(lookup.isOnBreedingArea?.(id)).toBe(false);
        expect(lookup.permanentOf(permanent.stack[0]!.instanceId)).toBe(permanent);
        const breeding = state.players[1]!.breeding!;
        expect(lookup.permanentOf(breeding.topCard.instanceId)).toBe(breeding);
        expect(lookup.isOnBattleArea(breeding.topCard.instanceId)).toBe(false);
        expect(lookup.isOnBreedingArea?.(breeding.topCard.instanceId)).toBe(true);
      },
    });
    permanent.inBreeding = true;
    expect(lookup.isOnBattleArea(id)).toBe(false);
    expect(lookup.isOnBreedingArea?.(id)).toBe(true);
    runWithPreparedCardLocation({ state, execute: () => expect(lookup.isOnBattleArea(id)).toBe(false) });
    clearBattleArea(player);
    expect(lookup.permanentOf(id)).toBeUndefined();
    runWithPreparedCardLocation({ state, execute: () => expect(lookup.permanentOf(id)).toBeUndefined() });
    placePermanent(player, permanent);
    expect(lookup.permanentOf(id)).toBe(permanent);
  });

  it("isolates nested states even when fixture instance identities coincide", async () => {
    const outer = prepareLookupScenario();
    const inner = prepareLookupScenario();
    await outer.ready();
    await inner.ready();
    const outerPermanent = outer.state.players[0]!.battleArea[0]!;
    const innerPermanent = inner.state.players[0]!.battleArea[0]!;
    const outerLookup = createCardStateLookup(outer.state);
    const innerLookup = createCardStateLookup(inner.state);
    const id = outerPermanent.topCard.instanceId;
    expect(innerPermanent.topCard.instanceId).toBe(id);
    runWithPreparedCardLocation({
      state: outer.state,
      execute: () => {
        expect(outerLookup.permanentOf(id)).toBe(outerPermanent);
        runWithPreparedCardLocation({
          state: inner.state,
          execute: () => {
            expect(innerLookup.permanentOf(id)).toBe(innerPermanent);
            expect(outerLookup.permanentOf(id)).toBe(outerPermanent);
            expect(innerLookup.permanentOf(id)).toBe(innerPermanent);
          },
        });
        expect(outerLookup.permanentOf(id)).toBe(outerPermanent);
      },
    });
    clearBattleArea(outer.state.players[0]!);
    expect(outerLookup.permanentOf(id)).toBeUndefined();
  });

  it("cleans up failed preparation and restores a nested negative lookup", async () => {
    const setup = prepareLookupScenario();
    await setup.ready();
    const { state } = setup;
    const permanent = state.players[0]!.battleArea[0]!;
    const id = permanent.topCard.instanceId;
    const lookup = createCardStateLookup(state);
    runWithPreparedCardLocation({
      state,
      execute: () => {
        expect(lookup.permanentOf("absent-card")).toBeUndefined();
        expect(() =>
          runWithPreparedCardLocation({
            state,
            execute: () => {
              expect(lookup.permanentOf(id)).toBe(permanent);
              throw new Error("preparation failed");
            },
          }),
        ).toThrow("preparation failed");
        expect(lookup.permanentOf("absent-card")).toBeUndefined();
      },
    });
    expect(() =>
      runWithPreparedCardLocation({
        state,
        execute: () => {
          expect(lookup.permanentOf(id)).toBe(permanent);
          throw new Error("outer preparation failed");
        },
      }),
    ).toThrow("outer preparation failed");
    clearBattleArea(state.players[0]!);
    expect(lookup.permanentOf(id)).toBeUndefined();
  });
});
