import { Phase } from "@aegis/shared/schema/enums";
import fixture from "#api/engine/scenarios/purge-places-bottom-source.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT13-110.js";
import "./BT13-007.js";
import "./BT13-040.js";
import "../BT20/BT20-091.js";
import "../BT20/BT20-102.js";

function activatableEffects(s: ReturnType<typeof setupEngine>, instanceId: string) {
  const permanent = s.state.players[0]!.battleArea.find((candidate) => candidate.topCard?.instanceId === instanceId);
  if (permanent === undefined) throw new Error(`Permanent not found for ${instanceId}`);
  return observe(s.engine).activatableEffects(permanent);
}

describe("BT13-110 Royal Knights of the Purge", () => {
  it("has complete compiled coverage and registers a live Option", async () => {
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    const s = setupEngine({ 0: { hand: [{ card: "BT13-110", as: "option" }] } });
    await s.ready();
    expect(s.state.players[0]!.hand.some((card) => card.cardId === "BT13-110")).toBe(true);
  });

  it("draws, may place a Digimon from hand under a breeding-area King Drasil, then places itself", () => {
    const actions =
      compiled.effects?.find((entry) => entry.trigger === "Main" && entry.actions?.[0]?.kind === "Draw")?.actions ?? [];
    expect(actions[0]).toMatchObject({ kind: "Draw", controller: "mine", amount: 1 });
    expect(actions[1]).toMatchObject({
      kind: "PlaceUnder",
      from: ["hand"],
      optional: true,
      underFilter: {
        controller: "mine",
        zone: "breeding",
        nameOrTrait: [{ match: "nameExact", tokens: ["King Drasil_7D6"] }],
      },
    });
    expect(actions[2]).toMatchObject({ kind: "PlaceInBattleAreaSelf" });
  });

  it("has a Delay branch that plays one Royal Knight from breeding digivolution cards with Rush", () => {
    const delay = compiled.effects?.find(
      (entry) => entry.trigger === "Main" && entry.keywords?.some((keyword) => keyword.keyword === "Delay"),
    );
    expect(delay).toBeDefined();
    expect(delay?.actions?.[0]).toMatchObject({
      kind: "PlayWithoutCost",
      from: ["digivolutionCards"],
      payCost: false,
      suppressOnPlayEffects: true,
      bindResultAs: "playedDigimon",
      target: {
        filter: {
          controller: "mine",
          hostFilter: { zone: "breeding" },
          nameOrTrait: [{ match: "trait", tokens: ["Royal Knight"] }],
        },
        count: 1,
      },
    });
    expect(delay?.actions?.[0]).not.toHaveProperty("optional");
    expect(delay?.actions?.[1]).toMatchObject({
      kind: "GainKeyword",
      keyword: { keyword: "Rush" },
      duration: "forTheTurn",
      target: { filter: { boundRef: "playedDigimon" } },
    });
  });

  it("draws, places the hand Digimon below existing breeding sources, and enters the battle area", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true });
    await s.ready();
    s.state.phase = Phase.Main;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.perm("drasil").stack.some((card) => card.cardId === "BT1-045") &&
        s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT13-110"),
    );

    expect(s.state.players[0]!.hand.some((card) => card.cardId === "BT1-045")).toBe(false);
    expect(s.perm("drasil").stack.map((card) => card.cardId)).toEqual(["BT1-045", "BT13-040", "BT13-028"]);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT13-110")).toBe(true);
  });

  it("may decline placing a Digimon under King Drasil while still placing itself", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "BT13-007", as: "drasil" },
          hand: [
            { card: "BT13-110", as: "option" },
            { card: "BT1-045", as: "material" },
          ],
          deck: [],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT13-110"));

    expect(s.state.players[0]!.hand.some((card) => card.cardId === "BT1-045")).toBe(true);
    expect(s.perm("drasil").stack.some((card) => card.cardId === "BT1-045")).toBe(false);
  });

  it("uses Delay to play a Royal Knight from breeding materials without its On Play effect and grants Rush", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT13-110", as: "option" }],
          breeding: { card: "BT13-007", as: "drasil", under: ["BT13-040"] },
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.turnCount += 1;
    const optionId = s.perm("option").topCard!.instanceId;
    const materialId = s.perm("drasil").stack.find((card) => card.cardId === "BT13-040")!.instanceId;
    const entry = activatableEffects(s, optionId).find(
      (effect) => effect.instanceId === optionId && effect.description?.toLowerCase().includes("delay"),
    );
    expect(entry).toBeDefined();
    expect(
      s.engine.applyIntent(0, { type: "activateEffect", sourceInstanceId: optionId, effectKey: entry!.effectKey }),
    ).toEqual({ ok: true });
    await settle();

    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT13-110")).toBe(false);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === optionId)).toBe(true);
    expect(s.state.players[0]!.breeding?.stack.some((card) => card.instanceId === materialId)).toBe(false);
    const played = s.state.players[0]!.battleArea.find((p) => p.topCard?.cardId === "BT13-040");
    expect(played).toBeDefined();
    expect(played!.topCard!.instanceId).toBe(materialId);
    expect(observe(s.engine).hasKeyword(played!.permanentId, "Rush")).toBe(true);
  });

  it("publishes the Delay Rush so the client can attack with the played Royal Knight (Discord 1554301049614110770)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT13-110", as: "option" },
            { card: "BT20-091", as: "firstTamer" },
            { card: "BT20-091", as: "secondTamer" },
          ],
          breeding: { card: "BT13-007", as: "drasil", under: ["BT13-007", "BT20-102"] },
          deck: ["BT1-009", "BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "enemy" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.turnCount += 1;
    const optionId = s.perm("option").topCard!.instanceId;
    const entry = activatableEffects(s, optionId).find((effect) => effect.description?.toLowerCase().includes("delay"));
    expect(
      s.engine.applyIntent(0, { type: "activateEffect", sourceInstanceId: optionId, effectKey: entry!.effectKey }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "effectActivated"));

    const played = s.state.players[0]!.battleArea.find((p) => p.topCard?.cardId === "BT20-102")!;
    expect(
      s.decisions.some((decision) => decision.req.promptText === "reduce the play cost by 4"),
      "King Drasil's play-cost replacement interrupts the Delay play",
    ).toBe(true);
    expect(
      s.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT20-102"),
      "the played Digimon's [On Play] does not activate",
    ).toBe(false);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(observe(s.engine).hasKeyword(played, "Rush")).toBe(true);
    expect([...played.keywords]).toContain("Rush");
    expect(played.summoningSick).toBe(false);
    expect(played.canAttackPlayer).toBe(true);
    expect([...played.attackablePermanentIds]).toEqual([]);
  });

  it("places itself in the battle area when revealed from security", async () => {
    const s = setupEngine({
      0: { security: [{ card: "BT13-110", as: "option" }] },
      1: { battleArea: [{ card: "BT1-009", as: "attacker" }] },
    });
    s.state.turnSeat = 1;
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("option").instanceId),
    );
    expect(s.state.players[0]!.security.some((card) => card.instanceId === s.inst("option").instanceId)).toBe(false);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT13-110")).toBe(true);
  });
});
