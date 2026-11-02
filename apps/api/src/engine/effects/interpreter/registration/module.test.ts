import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compiledEffects, digiXrosRequirementFor, type Action, type CompiledCard } from "@aegis/shared";
import { setupEngine, settle } from "../../../testkit/harness.js";
import { advance } from "../../../testkit/advance.js";
import { getEffectModule, registerCard, unregisterCard } from "../../registry.js";
import { registeredCompiledCards, registeredIrModules } from "../compiledCards.js";
import { registerIrCard } from "./module.js";
import "../../../../cards/BT1/BT1-090.js";

const CARD_ID = "BT1-090";
const originalModule = getEffectModule(CARD_ID);
const originalCompiled = compiledEffects[CARD_ID];
const originalRegisteredCompiled = registeredCompiledCards.get(CARD_ID);
const originalRegisteredIrModule = registeredIrModules.get(CARD_ID);

beforeEach(() => {
  unregisterCard(CARD_ID);
  delete compiledEffects[CARD_ID];
});

afterEach(() => {
  unregisterCard(CARD_ID);
  if (originalModule === undefined) throw new Error(`Expected original ${CARD_ID} module`);
  registerCard(originalModule);
  if (originalCompiled === undefined) delete compiledEffects[CARD_ID];
  else compiledEffects[CARD_ID] = originalCompiled;
  if (originalRegisteredCompiled === undefined) registeredCompiledCards.delete(CARD_ID);
  else registeredCompiledCards.set(CARD_ID, originalRegisteredCompiled);
  if (originalRegisteredIrModule === undefined) registeredIrModules.delete(CARD_ID);
  else registeredIrModules.set(CARD_ID, originalRegisteredIrModule);
  if (getEffectModule(CARD_ID) !== originalModule) throw new Error(`Failed to restore ${CARD_ID} module`);
});

describe("registerIrCard", () => {
  it("builds and registers the compiled module without an undefined implementation override", () => {
    const module = registerIrCard(CARD_ID, { effects: [], coverage: "none", residual: [] });

    expect(module.cardId).toBe(CARD_ID);
    expect(getEffectModule(CARD_ID)).toBe(module);
  });

  it("freezes the normalized registered IR before exposing it to runtime readers", () => {
    const source: CompiledCard = {
      coverage: "full",
      residual: [],
      effects: [{ trigger: "Main", actions: [{ kind: "GainMemory", amount: 1 }] }],
    };
    registerIrCard(CARD_ID, source);
    const normalized = registeredCompiledCards.get(CARD_ID)!;
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.effects)).toBe(true);
    expect(Object.isFrozen(normalized.effects[0]!.actions)).toBe(true);
    expect(Object.isFrozen(source)).toBe(false);
    expect(() => normalized.effects[0]!.actions.push({ kind: "GainMemory", amount: 2 })).toThrow(TypeError);
  });

  it("publishes the direct module's normalized structural requirements to shared rule readers", () => {
    registerIrCard(CARD_ID, {
      effects: [],
      coverage: "full",
      residual: [],
      digiXrosRequirement: [{ materials: [{ traits: ["Save"] }], count: 2 }],
    });

    expect(digiXrosRequirementFor(CARD_ID)).toEqual([{ materials: [{ traits: ["Save"] }], count: 2 }]);
  });

  it("applies intrinsic Delay to action-level reactive metadata", async () => {
    // FAILS-WHEN-REVERTED: if registration/module.ts only checks enclosing-effect
    // keywords, this action-level Delay watcher resolves its memory payload while
    // leaving the source Option in play instead of paying the intrinsic trash cost.
    registerIrCard(CARD_ID, {
      coverage: "full",
      residual: [],
      effects: [
        { trigger: "Main", actions: [{ kind: "PlaceInBattleAreaSelf" }] },
        {
          trigger: "YourTurn",
          actions: [
            {
              kind: "SubTrigger",
              event: "whenPlayed",
              keywords: [{ keyword: "Delay", raw: "＜Delay＞" }],
              sourceFilter: { controller: "mine", nameOrTrait: [{ tokens: ["Elizamon"], match: "nameExact" }] },
              actions: [{ kind: "GainMemory", amount: 1 }],
            } as unknown as Extract<Action, { kind: "SubTrigger" }>,
          ],
        },
      ],
    });
    const s = setupEngine(
      { 0: { battleArea: [{ card: CARD_ID, as: "delay" }], hand: [{ card: "BT24-008", as: "elizamon" }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("elizamon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("delay").instanceId));
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("delay").instanceId);
    expect(s.state.memory).toBe(8);
  });

  it("suppresses action-level reactive Delay on the source entry turn", async () => {
    registerIrCard(CARD_ID, {
      coverage: "full",
      residual: [],
      effects: [
        { trigger: "Main", actions: [{ kind: "PlaceInBattleAreaSelf" }] },
        {
          trigger: "YourTurn",
          actions: [
            {
              kind: "SubTrigger",
              event: "whenPlayed",
              keywords: [{ keyword: "Delay", raw: "＜Delay＞" }],
              sourceFilter: { controller: "mine", nameOrTrait: [{ tokens: ["Elizamon"], match: "nameExact" }] },
              actions: [{ kind: "GainMemory", amount: 1 }],
            } as unknown as Extract<Action, { kind: "SubTrigger" }>,
          ],
        },
      ],
    });
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-009", as: "source" }],
          hand: [
            { card: CARD_ID, as: "delay" },
            { card: "BT24-008", as: "elizamon" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("delay").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === CARD_ID));
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("elizamon").instanceId })).toEqual({
      ok: true,
    });
    await settle();
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toContain(CARD_ID);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).not.toContain(CARD_ID);
    expect(s.state.memory).toBe(7);
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
  });
});
