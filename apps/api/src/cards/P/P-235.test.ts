import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "./P-235.js";

describe("P-235 Digital Accident Tactics Squad", () => {
  it("requires a DATA SQUAD trait card and reveals three cards", () => {
    const effects = runtimeCompiledCard("P-235")!.effects;
    expect(effects).toContainEqual(
      expect.objectContaining({
        trigger: "Static",
        actions: [
          expect.objectContaining({
            kind: "WaiveColorRequirement",
            condition: expect.objectContaining({ kind: "youHave" }),
          }),
        ],
      }),
    );
    expect(effects).toContainEqual(
      expect.objectContaining({
        trigger: "Main",
        actions: [
          expect.objectContaining({ kind: "RevealAdd", revealCount: 3, rest: "deckBottom" }),
          expect.objectContaining({ kind: "PlaceInBattleAreaSelf" }),
        ],
      }),
    );
  });

  it("gains two memory through Delay", () => {
    expect(runtimeCompiledCard("P-235")!.effects).toContainEqual(
      expect.objectContaining({
        trigger: "Main",
        keywords: [{ keyword: "Delay", raw: "＜Delay＞" }],
        actions: [{ effectTextPart: "Gain 2 memory.", kind: "GainMemory", amount: 2 }],
      }),
    );
  });

  it("places itself in the battle area from Security", () => {
    expect(runtimeCompiledCard("P-235")!.effects).toContainEqual(
      expect.objectContaining({
        trigger: "Security",
        isSecurity: true,
        actions: [{ kind: "PlaceInBattleAreaSelf" }],
      }),
    );
  });
});
describe("P-235 engine behavior", () => {
  it("adds a DATA SQUAD card from the top three and places itself", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "P-235", as: "squad" }],
          deck: [{ card: "AD1-016", as: "dataSquad" }, "BT1-009", "BT1-009"],
          battleArea: ["BT1-063"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 20;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("squad").instanceId })).toEqual({ ok: true });
    await settle();
    expect(s.state.players[0]!.hand.some((c) => c.instanceId === s.inst("dataSquad").instanceId)).toBe(true);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "P-235")).toBe(true);
  });

  it("places itself after resolving its Security reveal", async () => {
    const s = setupEngine(
      { 0: { security: [{ card: "P-235", as: "squad" }], deck: ["AD1-016", "BT1-009", "BT1-009"] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("squad"));
    await settle();
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("squad").instanceId)).toBe(true);
  });

  it("activates its armed Delay through the real effect intent and gains two memory", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "P-235", as: "squad" }] } }, { autoAcceptOptional: true });
    s.state.memory = 0;
    await s.ready();
    const delay = (
      observe(s.engine).activatableEffects(s.perm("squad")) as Array<{ effectKey: string; description?: string }>
    ).find((entry) => /delay/i.test(entry.description ?? ""));
    expect(delay).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.inst("squad").instanceId,
        effectKey: delay!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.state.memory).toBe(2);
  });
});
