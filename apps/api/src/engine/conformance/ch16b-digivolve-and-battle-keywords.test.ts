import { beforeEach, describe, it, expect } from "vitest";
import type { PlayerState, Seat } from "@aegis/shared";
import { advance } from "../testkit/advance.js";
import { observe } from "../testkit/observe.js";
import { cite } from "./_kb.js";
import "./not-testable.js";
import {
  setupEngine as setup,
  makeInstance as instance,
  makeDigimon as digimon,
  drainMicrotasks,
  settle,
  type EngineSetup,
} from "../testkit/harness.js";
import type { Primitives } from "../effects/EffectContext.js";
import "../../cards/index.js";

/**
 * Comprehensive Rules chapter 16 "Keyword Effects", part B (comprehensive-0228-0237):
 * <Digisorption>, <Reboot>, <De-Digivolve>, <Retaliation>, <Digi-Burst>, <Rush>,
 * <Blitz>, <Delay>, then two CONFIRMED DIVERGENCES: <Decoy> and <Armor Purge>.
 *
 * Real cards used:
 *   - BT1-069 (Green Lv.4) -> BT10-052 (Cherrymon, printed <Digisorption -2>).
 *   - AD1-013: printed <Reboot>.
 *   - AD1-009: [On Play] <De-Digivolve 3> on an opponent Digimon.
 *   - BT10-078: gains <Retaliation> while a [Gammamon] digivolution card is stacked.
 *   - BT4-012: [Main] <Digi-Burst 2> (cost: trash 2 own digivolution cards).
 *   - BT4-038 and BT8-077: printed <Rush>, played and attacked through public intents.
 *   - BT10-097: [Main] <Delay> (activatable only after the card's first turn on the field).
 *   - BT11-082: printed <Decoy ([Bagra Army])>.
 *   - BT10-012: printed <Armor Purge>.
 */

const NON_KEYWORD_CARD = "AD1-001";

interface ActivatableEntry {
  instanceId: string;
  effectKey: string;
  description: string;
}

/** Local copy of mechanic.test.ts's activatableEffects helper — not exported from there. */
function activatableEffects(s: EngineSetup, perm: { activatableEffectsJson?: string }): ActivatableEntry[] {
  (s.engine as unknown as { projection: { syncActivatableEffects(): void } }).projection.syncActivatableEffects();
  return perm.activatableEffectsJson ? (JSON.parse(perm.activatableEffectsJson) as ActivatableEntry[]) : [];
}

describe("§16-10 <Digisorption> (comprehensive-0228)", () => {
  it("16-10-1: suspending 1 Digimon reduces the digivolution cost by the printed amount", async () => {
    cite(
      "comprehensive-0228",
      "16-10-1 <Digisorption -N>: when digivolving into this card from hand, you may suspend " +
        "1 of your Digimon to reduce the digivolution cost by N",
      "fb3cf997ad710f41a2b3f9edefce642154150d56585e230a2021af4e286b2f0d",
    );

    // BT10-052's own printed <Digisorption -2> registers into the side registry the digivolve
    // cost path reads (digisorptionDigivolve.ts) — the exact seam GameEngine.payDigisorption
    // consults.
    const { digisorptionAmountFor } = await import("../cards/digisorptionDigivolve.js");
    expect(digisorptionAmountFor("BT10-052")).toBe(2);

    const s = setup({ autoAcceptOptional: true, autoSelectCards: true });
    const p0 = s.state.players[0] as PlayerState;
    const base = digimon(0, 4000, "BT1-069"); // Green Lv.4
    const suspendCandidate = digimon(0, 5000, NON_KEYWORD_CARD);
    p0.battleArea.push(base, suspendCandidate);
    const digivolveCard = instance("BT10-052", 0, false); // Cherrymon: <Digisorption -2>, printed cost 3
    p0.hand.push(digivolveCard);
    // Exactly the REDUCED cost (3 - 2 = 1) — this only affords the digivolve if the intent's
    // own affordability gate (actions/digivolve.ts's validateDigivolve) actually accounts for
    // the potential Digisorption reduction BEFORE any interactive suspend prompt resolves.
    s.state.memory = 1;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: base.permanentId,
        instanceId: digivolveCard.instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => base.topCard?.cardId === "BT10-052", 5000);

    expect(base.topCard?.cardId).toBe("BT10-052");
  });
});

describe("§16-11 <Reboot> (comprehensive-0229)", () => {
  it("16-11-1: an opponent's <Reboot> permanent unsuspends during the turn player's own unsuspend phase", async () => {
    cite(
      "comprehensive-0229",
      "16-11-1 <Reboot>: a Digimon with this effect is unsuspended during the OPPONENT's unsuspend phase",
      "755d3250951980c2b8d7a31192167c2b74789570c06b57081c2e35679c45e785",
    );

    const s = setup();
    const p1 = s.state.players[1] as PlayerState;
    const rebooter = digimon(1, 11000, "AD1-013"); // printed <Reboot>, controlled by seat 1
    rebooter.isSuspended = true;
    p1.battleArea.push(rebooter);
    await s.engine.recomputeContinuousEffects(); // pick up AD1-013's printed <Reboot>

    // Seat 0's active/unsuspend phase is "the opponent's unsuspend phase" from seat 1's side.
    await (s.engine as unknown as { unsuspendForActivePhase(seat: Seat): Promise<string[]> }).unsuspendForActivePhase(
      0 as Seat,
    );

    expect(rebooter.isSuspended).toBe(false);
  });

  it("NEGATIVE CONTROL: without Reboot, an opponent's suspended permanent stays suspended through the turn player's unsuspend phase", async () => {
    const s = setup();
    const p1 = s.state.players[1] as PlayerState;
    const plain = digimon(1, 11000, NON_KEYWORD_CARD);
    plain.isSuspended = true;
    p1.battleArea.push(plain);

    await (s.engine as unknown as { unsuspendForActivePhase(seat: Seat): Promise<string[]> }).unsuspendForActivePhase(
      0 as Seat,
    );

    expect(plain.isSuspended).toBe(true); // unchanged — only the turn player's OWN permanents unsuspend
  });
});

describe("§16-13 <Retaliation> (comprehensive-0231)", () => {
  it("a Digimon deleted in battle with <Retaliation> also deletes the opponent's battled Digimon", async () => {
    cite(
      "comprehensive-0231",
      "Retaliation triggers when its holder is deleted in battle and deletes the battled opponent by effect. " +
        "Resolve the holder's optional On Deletion effect before asserting the mandatory Retaliation result.",
      "9fa675c87ec50b4575c9c464804c403e19fd1247cadf8ed144268d60d23801f7",
    );

    const s = setup({ autoDeclineOptional: true });
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const attacker = digimon(0, 9000, NON_KEYWORD_CARD); // no Retaliation
    p0.battleArea.push(attacker);
    const retaliator = digimon(1, 4000, "BT10-078"); // GulusGammamon: HAS <Retaliation> here
    retaliator.isSuspended = true;
    retaliator.stack.push(instance("BT21-010", 1, true)); // a real card named Gammamon — satisfies the Aura's "while" gate
    p1.battleArea.push(retaliator);
    await s.engine.recomputeContinuousEffects(); // pick up the Aura-granted <Retaliation>

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "permanent", permanentId: retaliator.permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => !p0.battleArea.some((p) => p.permanentId === attacker.permanentId));

    // The defender (4000 DP, HAS Retaliation) lost to the attacker (9000 DP) as usual...
    expect(p1.battleArea.some((p) => p.permanentId === retaliator.permanentId)).toBe(false);
    // The losing holder triggers Retaliation even though the winner has no such keyword.
    expect(p0.battleArea.some((p) => p.permanentId === attacker.permanentId)).toBe(false);
  });
});

describe("§16-14 <Digi-Burst> (comprehensive-0232)", () => {
  it("16-14-1: trashing the specified number of digivolution cards activates the attached effect", async () => {
    cite(
      "comprehensive-0232",
      "16-14-1 <Digi-Burst N>: trash N of this Digimon's digivolution cards to activate the specified effect",
      "6aef42a5c090e8124386365a9cb8b7035b25ac52979537f770eadd5d54e807f2",
    );

    const s = setup({ autoAcceptOptional: true, autoSelectCards: true });
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const burster = digimon(0, 5000, "BT4-012"); // [Main] <Digi-Burst 2>: delete an opponent Digimon (DP<=4000)
    burster.stack.push(instance(NON_KEYWORD_CARD, 0, true), instance(NON_KEYWORD_CARD, 0, true));
    p0.battleArea.push(burster);
    const weakTarget = digimon(1, 3000, NON_KEYWORD_CARD);
    p1.battleArea.push(weakTarget);
    const sourceInstanceId = burster.topCard!.instanceId;

    const entry = activatableEffects(s, burster).find((e) => e.instanceId === sourceInstanceId);
    expect(entry, "BT4-012 surfaces its [Main] <Digi-Burst 2> ability").toBeDefined();

    expect(s.engine.applyIntent(0, { type: "activateEffect", sourceInstanceId, effectKey: entry!.effectKey })).toEqual({
      ok: true,
    });
    await settle(() => p1.battleArea.some((p) => p.permanentId === weakTarget.permanentId) === false, 5000);

    expect(burster.stack.length).toBe(0); // both digivolution cards trashed as the cost
    expect(p1.battleArea.some((p) => p.permanentId === weakTarget.permanentId)).toBe(false); // deleted
  });
});

describe("§16-15 <Rush> (comprehensive-0233)", () => {
  beforeEach(() => {
    cite(
      "comprehensive-0233",
      "Rush permits attacks the turn played and is a persistent keyword",
      "6f597fcf757c2632ff18ed331c9d1fd671a194944ac62dfdc95564ba4305b7aa",
    );
    cite(
      "comprehensive-0160",
      "Inherited effects are gained from digivolution cards",
      "cf0386d979c47c389addc2afcf2307aac519f9af6d75ea36cb70c09e2020299f",
    );
    cite(
      "comprehensive-0167",
      "One trigger condition triggers once even when multiple matching events occur simultaneously",
      "6833093207ae30f62d832ec8605eae546ffbc36cc1d21650e06b65d34d9b8fc6",
    );
  });
  it.each(["BT4-038", "BT8-077"])(
    "%s publicly attacks the turn played while the neutral control cannot",
    async (card) => {
      const s = setup({
        0: {
          hand: [
            { card, as: "rusher" },
            { card: "BT1-009", as: "neutral" },
            { card: "BT1-009", as: "reserve" },
          ],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: { security: ["BT1-011", "BT1-011", "BT1-011"], deck: ["BT1-009", "BT1-009", "BT1-009"] },
      });
      s.state.memory = 10;
      const turn = s.engine.runOneTurn();
      await advance(s.engine).waitForMainPhase(0);
      for (const alias of ["rusher", "neutral"]) {
        const instanceId = s.inst(alias).instanceId;
        expect(s.engine.applyIntent(0, { type: "playCard", instanceId })).toEqual({ ok: true });
        await settle(
          () =>
            s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === instanceId) &&
            s.state.pendingDecision === undefined,
        );
      }
      expect(s.state.memory).toBe(3);
      const rusherId = s.perm("rusher").permanentId;
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("neutral").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: false, reason: "illegal-target" });
      expect(s.perm("neutral").isSuspended).toBe(false);
      expect(
        s.engine.applyIntent(0, { type: "attack", attackerPermanentId: rusherId, target: { kind: "player" } }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[1]!.security.length === 2 && s.state.pendingDecision === undefined);
      expect(s.perm("rusher").isSuspended).toBe(true);
      expect(observe(s.engine).hasKeyword(s.perm("rusher"), "Rush")).toBe(true);
      expect(observe(s.engine).hasKeyword(s.perm("neutral"), "Rush")).toBe(false);
      expect(s.state.memory).toBe(3);
      advance(s.engine).endMainPhaseIfOpen(0);
      await turn;
      expect(s.perm("rusher").permanentId).toBe(rusherId);
      expect(observe(s.engine).hasKeyword(s.perm("rusher"), "Rush")).toBe(true);
      expect(s.perm("rusher").stack).toHaveLength(0);
    },
  );
  it("loses printed Rush after public digivolution without resetting its fresh-play restriction", async () => {
    const s = setup({
      0: {
        hand: [{ card: "BT8-077", as: "base" }, { card: "BT8-078", as: "evolver" }, "BT1-009"],
        deck: ["BT1-009", "BT1-009", "BT1-009"],
      },
      1: { security: ["BT1-011", "BT1-011", "BT1-011"], deck: ["BT1-009", "BT1-009", "BT1-009"] },
    });
    s.state.memory = 10;
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    const baseInstanceId = s.inst("base").instanceId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: baseInstanceId })).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === baseInstanceId) &&
        s.state.pendingDecision === undefined,
    );
    const host = s.perm("base");
    const permanentId = host.permanentId;
    const enteredTurn = host.enterFieldTurnCount;
    expect(observe(s.engine).hasKeyword(host, "Rush")).toBe(true);
    const evolverInstanceId = s.inst("evolver").instanceId;
    expect(s.engine.applyIntent(0, { type: "digivolve", permanentId, instanceId: evolverInstanceId })).toEqual({
      ok: true,
    });
    await settle(() => host.topCard.instanceId === evolverInstanceId && s.state.pendingDecision === undefined);
    expect(host.permanentId).toBe(permanentId);
    expect(host.enterFieldTurnCount).toBe(enteredTurn);
    expect(host.stack.map((c) => c.instanceId)).toEqual([baseInstanceId]);
    expect(observe(s.engine).hasKeyword(host, "Rush")).toBe(false);
    expect(s.state.memory).toBe(3);
    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: permanentId, target: { kind: "player" } }),
    ).toEqual({ ok: false, reason: "illegal-target" });
    expect(host.isSuspended).toBe(false);
    expect(s.state.players[1]!.security).toHaveLength(3);
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
  });
  it.each([
    {
      source: "BT10-008",
      destination: "BT19-012",
      receivesRush: true,
      memory: 2,
      security: "BT1-011",
      stripSources: false,
    },
    {
      source: "BT19-008",
      destination: "BT19-012",
      receivesRush: true,
      memory: 2,
      security: "BT1-011",
      stripSources: false,
    },
    {
      source: "BT10-008",
      destination: "AD1-001",
      receivesRush: false,
      memory: 4,
      security: "BT1-011",
      stripSources: false,
    },
    {
      source: "BT19-008",
      destination: "AD1-001",
      receivesRush: false,
      memory: 4,
      security: "BT1-011",
      stripSources: false,
    },
    {
      source: "BT10-008",
      destination: "BT19-012",
      receivesRush: true,
      memory: 2,
      security: "BT1-101",
      stripSources: true,
    },
    {
      source: "BT19-008",
      destination: "BT19-012",
      receivesRush: true,
      memory: 2,
      security: "BT1-101",
      stripSources: true,
    },
  ])(
    "$source inherited Rush matches $destination and resolves $security security",
    async ({ source, destination, receivesRush, memory, security, stripSources }) => {
      const s = setup(
        {
          0: {
            hand: [{ card: source, as: "base" }, { card: destination, as: "evolver" }, "BT1-009"],
            deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
          },
          1: { security: [security, security, security], deck: ["BT1-009", "BT1-009", "BT1-009"] },
        },
        { autoSelectCards: true, autoOrderCards: true, autoOrderTriggers: true, autoAcceptOptional: true },
      );
      s.state.memory = 10;
      const loop = s.engine.startTurnLoop();
      await advance(s.engine).waitForMainPhase(0);
      const baseInstanceId = s.inst("base").instanceId;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: baseInstanceId })).toEqual({ ok: true });
      await settle(
        () =>
          s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === baseInstanceId) &&
          s.state.pendingDecision === undefined,
      );
      const host = s.perm("base");
      const permanentId = host.permanentId;
      const enteredTurn = host.enterFieldTurnCount;
      expect(observe(s.engine).hasKeyword(host, "Rush")).toBe(false);
      expect(
        s.engine.applyIntent(0, { type: "attack", attackerPermanentId: permanentId, target: { kind: "player" } }),
      ).toEqual({ ok: false, reason: "illegal-target" });
      const evolverInstanceId = s.inst("evolver").instanceId;
      expect(s.engine.applyIntent(0, { type: "digivolve", permanentId, instanceId: evolverInstanceId })).toEqual({
        ok: true,
      });
      await settle(() => host.topCard.instanceId === evolverInstanceId && s.state.pendingDecision === undefined);
      expect(host.permanentId).toBe(permanentId);
      expect(host.enterFieldTurnCount).toBe(enteredTurn);
      expect(host.stack.map((c) => c.instanceId)).toEqual([baseInstanceId]);
      expect(observe(s.engine).hasKeyword(host, "Rush")).toBe(receivesRush);
      expect(s.state.memory).toBe(memory);
      const attack = s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: permanentId,
        target: { kind: "player" },
      });
      expect(attack).toEqual(receivesRush ? { ok: true } : { ok: false, reason: "illegal-target" });
      if (receivesRush) {
        await settle(() => s.state.players[1]!.security.length === 2 && s.state.pendingDecision === undefined);
      }
      expect(host.isSuspended).toBe(receivesRush);
      expect(s.state.players[1]!.security).toHaveLength(receivesRush ? 2 : 3);
      expect(s.state.pendingDecision).toBeUndefined();
      expect(s.state.players[0]!.battleArea.find((p) => p.permanentId === permanentId)).toBe(host);
      expect(host.topCard.instanceId).toBe(evolverInstanceId);
      expect(host.enterFieldTurnCount).toBe(enteredTurn);
      expect(host.stack.map((c) => c.instanceId)).toEqual(stripSources ? [] : [baseInstanceId]);
      expect(observe(s.engine).hasKeyword(host, "Rush")).toBe(receivesRush && !stripSources);
      expect(s.state.players[0]!.trash.some((c) => c.instanceId === baseInstanceId)).toBe(stripSources);
      expect(s.state.players[1]!.trash.some((c) => c.cardId === "BT1-101")).toBe(stripSources);
      expect(s.state.memory).toBe(memory);
      advance(s.engine).endMainPhaseIfOpen(0);
      await advance(s.engine).waitForMainPhase(1);
      expect(s.state.turnSeat).toBe(1);
      expect(observe(s.engine).hasKeyword(host, "Rush")).toBe(false);
      expect(host.enterFieldTurnCount).toBe(enteredTurn);
      advance(s.engine).endMainPhaseIfOpen(1);
      await advance(s.engine).waitForMainPhase(0);
      expect(s.state.turnSeat).toBe(0);
      expect(observe(s.engine).hasKeyword(host, "Rush")).toBe(receivesRush && !stripSources);
      expect(s.state.players[0]!.battleArea.find((p) => p.permanentId === permanentId)).toBe(host);
      expect(host.enterFieldTurnCount).toBe(enteredTurn);
      expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
      await loop;
    },
  );
  it.each([
    { source: "EX1-057", host: "BT3-089", recipient: "EX1-057" },
    { source: "BT5-063", host: "BT10-064", recipient: "BT10-064" },
  ])(
    "$source continuously grants Rush to a new eligible recipient until its source is removed",
    async ({ source, host, recipient }) => {
      const s = setup(
        {
          0: {
            battleArea: [
              { card: host, as: "sourceHost", under: [source] },
              { card: recipient, as: "olderRecipient" },
            ],
            hand: [{ card: "BT1-009", as: "neutral" }, { card: recipient, as: "newRecipient" }, "BT1-009"],
            deck: ["BT1-028", "BT1-028", "BT1-028", "BT1-028"],
          },
          1: {
            battleArea: [{ card: recipient, as: "opposingRecipient" }, "BT1-086"],
            hand: [{ card: "BT1-099", as: "stripOption" }, "BT1-009"],
            security: ["BT1-011", "BT1-011", "BT1-011"],
            deck: ["BT7-032", "BT7-032", "BT7-032", "BT7-032"],
          },
        },
        { autoAcceptOptional: true, autoOrderTriggers: true, autoOrderCards: true },
      );
      const sourceHost = s.perm("sourceHost");
      const inheritedId = sourceHost.stack[0]!.instanceId;
      const sourceHostId = sourceHost.permanentId;
      s.state.memory = 10;
      const loop = s.engine.startTurnLoop();
      await advance(s.engine).waitForMainPhase(0);
      expect(observe(s.engine).hasKeyword(sourceHost, "Rush")).toBe(false);
      expect(observe(s.engine).hasKeyword(s.perm("olderRecipient"), "Rush")).toBe(true);
      expect(observe(s.engine).hasKeyword(s.perm("opposingRecipient"), "Rush")).toBe(false);
      const neutralId = s.inst("neutral").instanceId;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: neutralId })).toEqual({ ok: true });
      await settle(
        () =>
          s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === neutralId) &&
          s.state.pendingDecision === undefined,
      );
      const neutral = s.perm("neutral");
      expect(s.state.memory).toBe(8);
      expect(observe(s.engine).hasKeyword(neutral, "Rush")).toBe(false);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: neutral.permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: false, reason: "illegal-target" });
      expect(neutral.isSuspended).toBe(false);
      const newRecipientId = s.inst("newRecipient").instanceId;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: newRecipientId })).toEqual({ ok: true });
      await settle(
        () =>
          s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === newRecipientId) &&
          s.state.pendingDecision === undefined,
      );
      const newlyPlayed = s.perm("newRecipient");
      const permanentId = newlyPlayed.permanentId;
      const enteredTurn = newlyPlayed.enterFieldTurnCount;
      expect(newlyPlayed.topCard.instanceId).toBe(newRecipientId);
      expect(observe(s.engine).hasKeyword(newlyPlayed, "Rush")).toBe(true);
      expect(observe(s.engine).hasKeyword(s.perm("olderRecipient"), "Rush")).toBe(true);
      expect(observe(s.engine).hasKeyword(sourceHost, "Rush")).toBe(false);
      expect(observe(s.engine).hasKeyword(neutral, "Rush")).toBe(false);
      expect(observe(s.engine).hasKeyword(s.perm("opposingRecipient"), "Rush")).toBe(false);
      expect(s.state.memory).toBe(3);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[1]!.security.length === 2 && s.state.pendingDecision === undefined);
      expect(newlyPlayed.isSuspended).toBe(true);
      expect(neutral.isSuspended).toBe(false);
      expect(s.perm("olderRecipient").isSuspended).toBe(false);
      expect(s.state.memory).toBe(3);
      advance(s.engine).endMainPhaseIfOpen(0);
      await advance(s.engine).waitForMainPhase(1);
      expect(s.state.memory).toBe(3);
      expect(observe(s.engine).hasKeyword(newlyPlayed, "Rush")).toBe(false);
      expect(observe(s.engine).hasKeyword(s.perm("olderRecipient"), "Rush")).toBe(false);
      expect(sourceHost.stack.map((card) => card.instanceId)).toEqual([inheritedId]);
      const optionId = s.inst("stripOption").instanceId;
      expect(s.engine.applyIntent(1, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
      expect(s.state.pendingDecision?.seat).toBe(1);
      expect(
        s.engine.applyIntent(1, {
          type: "respondDecision",
          decisionId: s.state.pendingDecision!.decisionId,
          response: { kind: "chooseTargets", instanceIds: [sourceHostId] },
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.state.players[1]!.trash.some((card) => card.instanceId === optionId) &&
          s.state.pendingDecision === undefined,
      );
      expect(sourceHost.stack).toHaveLength(0);
      expect(s.state.players[0]!.trash.some((card) => card.instanceId === inheritedId)).toBe(true);
      expect(s.state.players[1]!.trash.some((card) => card.instanceId === inheritedId)).toBe(false);
      expect(s.state.players[0]!.battleArea.find((p) => p.permanentId === sourceHostId)).toBe(sourceHost);
      expect(s.state.memory).toBe(0);
      advance(s.engine).endMainPhaseIfOpen(1);
      await advance(s.engine).waitForMainPhase(0);
      expect(s.state.memory).toBe(3);
      expect(newlyPlayed.enterFieldTurnCount).toBe(enteredTurn);
      expect(s.state.players[0]!.battleArea.find((p) => p.permanentId === permanentId)).toBe(newlyPlayed);
      for (const alias of ["sourceHost", "olderRecipient", "newRecipient", "neutral", "opposingRecipient"]) {
        expect(observe(s.engine).hasKeyword(s.perm(alias), "Rush")).toBe(false);
      }
      expect(s.state.pendingDecision).toBeUndefined();
      expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
      await loop;
    },
  );
  it.each([
    { source: "BT11-054", host: "BT1-080" },
    { source: "BT16-075", host: "BT3-089" },
  ])(
    "$source inherited trigger distinguishes plays, enforces frequency and resets next turn",
    async ({ source, host }) => {
      const preferInstanceIds: string[] = [];
      const s = setup(
        {
          0: {
            battleArea: [{ card: host, as: "sourceHost", under: [source] }, "BT1-087"],
            hand: [
              { card: "BT7-032", as: "ordinary" },
              { card: "BT7-032", as: "effectPlayed" },
              { card: "BT10-100", as: "option" },
              { card: "BT7-032", as: "blockedRepeat" },
              { card: "BT10-100", as: "repeatOption" },
              { card: "BT7-032", as: "afterReset" },
              { card: "BT10-100", as: "resetOption" },
              "BT1-009",
            ],
            deck: ["BT1-009", "BT1-009", "BT1-009"],
          },
          1: { security: ["BT1-011", "BT1-011", "BT1-011"], deck: ["BT1-009", "BT1-009", "BT1-009"] },
        },
        {
          autoAcceptOptional: true,
          autoSelectCards: true,
          autoOrderTriggers: true,
          autoOrderCards: true,
          preferInstanceIds,
        },
      );
      const effectPlayedId = s.inst("effectPlayed").instanceId;
      preferInstanceIds.push(effectPlayedId);
      s.state.memory = 10;
      const loop = s.engine.startTurnLoop();
      await advance(s.engine).waitForMainPhase(0);
      const ordinaryId = s.inst("ordinary").instanceId;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: ordinaryId })).toEqual({ ok: true });
      await settle(
        () =>
          s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === ordinaryId) &&
          s.state.pendingDecision === undefined,
      );
      const ordinary = s.perm("ordinary");
      expect(observe(s.engine).hasKeyword(ordinary, "Rush")).toBe(false);
      expect(observe(s.engine).hasKeyword(s.perm("sourceHost"), "Rush")).toBe(false);
      expect(s.state.memory).toBe(7);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: ordinary.permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: false, reason: "illegal-target" });
      const optionId = s.inst("option").instanceId;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
      await settle(
        () =>
          s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === optionId) &&
          s.state.pendingDecision === undefined,
      );
      const recipient = s.perm("effectPlayed");
      const recipientId = recipient.permanentId;
      expect(recipient.topCard.instanceId).toBe(effectPlayedId);
      expect(observe(s.engine).hasKeyword(recipient, "Rush")).toBe(true);
      expect(observe(s.engine).hasKeyword(ordinary, "Rush")).toBe(false);
      expect(observe(s.engine).hasKeyword(s.perm("sourceHost"), "Rush")).toBe(false);
      expect(s.state.memory).toBe(4);
      expect(
        s.engine.applyIntent(0, { type: "attack", attackerPermanentId: recipientId, target: { kind: "player" } }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[1]!.security.length === 2 && s.state.pendingDecision === undefined);
      expect(recipient.isSuspended).toBe(true);
      expect(ordinary.isSuspended).toBe(false);
      expect(s.state.memory).toBe(4);
      const blockedRepeatId = s.inst("blockedRepeat").instanceId;
      preferInstanceIds.splice(0, preferInstanceIds.length, blockedRepeatId);
      const repeatOptionId = s.inst("repeatOption").instanceId;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: repeatOptionId })).toEqual({ ok: true });
      await settle(
        () =>
          s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === repeatOptionId) &&
          s.state.pendingDecision === undefined,
      );
      const blockedRepeat = s.perm("blockedRepeat");
      expect(blockedRepeat.topCard.instanceId).toBe(blockedRepeatId);
      expect(observe(s.engine).hasKeyword(blockedRepeat, "Rush")).toBe(false);
      expect(s.state.memory).toBe(1);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: blockedRepeat.permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: false, reason: "illegal-target" });
      expect(blockedRepeat.isSuspended).toBe(false);
      expect(s.state.players[1]!.security).toHaveLength(2);
      advance(s.engine).endMainPhaseIfOpen(0);
      await advance(s.engine).waitForMainPhase(1);
      expect(s.state.turnSeat).toBe(1);
      expect(observe(s.engine).hasKeyword(recipient, "Rush")).toBe(false);
      expect(s.state.players[0]!.battleArea.find((p) => p.permanentId === recipientId)).toBe(recipient);
      expect(recipient.topCard.instanceId).toBe(effectPlayedId);
      expect(s.perm("sourceHost").stack).toHaveLength(1);
      advance(s.engine).endMainPhaseIfOpen(1);
      await advance(s.engine).waitForMainPhase(0);
      expect(s.state.turnSeat).toBe(0);
      expect(observe(s.engine).hasKeyword(recipient, "Rush")).toBe(false);
      const afterResetId = s.inst("afterReset").instanceId;
      preferInstanceIds.splice(0, preferInstanceIds.length, afterResetId);
      const resetOptionId = s.inst("resetOption").instanceId;
      expect(s.state.memory).toBe(3);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: resetOptionId })).toEqual({ ok: true });
      await settle(
        () =>
          s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === resetOptionId) &&
          s.state.pendingDecision === undefined,
      );
      const afterReset = s.perm("afterReset");
      expect(afterReset.topCard.instanceId).toBe(afterResetId);
      expect(observe(s.engine).hasKeyword(afterReset, "Rush")).toBe(true);
      expect(observe(s.engine).hasKeyword(recipient, "Rush")).toBe(false);
      expect(observe(s.engine).hasKeyword(blockedRepeat, "Rush")).toBe(false);
      expect(s.state.memory).toBe(0);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: afterReset.permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[1]!.security.length === 1 && s.state.pendingDecision === undefined);
      expect(afterReset.isSuspended).toBe(true);
      expect(s.state.memory).toBe(0);
      expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
      await loop;
    },
  );
  it("EX3-049 grants Rush only to the newly played D-Brigade subject", async () => {
    const s = setup(
      {
        0: {
          battleArea: [
            { card: "BT3-059", as: "decoy" },
            { card: "EX3-050", as: "sourceHost", under: ["EX3-049"] },
          ],
          hand: [
            { card: "BT1-009", as: "neutral" },
            { card: "BT3-059", as: "subject" },
            { card: "BT3-059", as: "repeat" },
            "BT1-009",
          ],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: { security: ["BT1-011", "BT1-011", "BT1-011"], deck: ["BT1-009", "BT1-009", "BT1-009"] },
      },
      { autoSelectCards: true, autoAcceptOptional: true, autoOrderTriggers: true, autoOrderCards: true },
    );
    s.state.memory = 10;
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    for (const alias of ["neutral", "subject"]) {
      const instanceId = s.inst(alias).instanceId;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId })).toEqual({ ok: true });
      await settle(
        () =>
          s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === instanceId) &&
          s.state.pendingDecision === undefined,
      );
      expect(observe(s.engine).hasKeyword(s.perm("neutral"), "Rush")).toBe(false);
    }
    const subject = s.perm("subject");
    expect(observe(s.engine).hasKeyword(subject, "Rush")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("neutral"), "Rush")).toBe(false);
    expect(observe(s.engine).hasKeyword(s.perm("decoy"), "Rush")).toBe(false);
    expect(observe(s.engine).hasKeyword(s.perm("sourceHost"), "Rush")).toBe(false);
    expect(s.state.memory).toBe(6);
    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: subject.permanentId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 2 && s.state.pendingDecision === undefined);
    const repeatInstanceId = s.inst("repeat").instanceId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: repeatInstanceId })).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === repeatInstanceId) &&
        s.state.pendingDecision === undefined,
    );
    const repeat = s.perm("repeat");
    expect(observe(s.engine).hasKeyword(repeat, "Rush")).toBe(false);
    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: repeat.permanentId, target: { kind: "player" } }),
    ).toEqual({ ok: false, reason: "illegal-target" });
    expect(repeat.isSuspended).toBe(false);
    expect(s.state.memory).toBe(4);
    expect(s.state.players[1]!.security).toHaveLength(2);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(observe(s.engine).hasKeyword(subject, "Rush")).toBe(false);
    expect(s.state.players[0]!.battleArea.find((p) => p.permanentId === subject.permanentId)).toBe(subject);
    expect(s.perm("sourceHost").stack).toHaveLength(1);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
  it("P-098 offers only blue Rush recipients after a yellow effect play", async () => {
    const s = setup(
      {
        0: {
          battleArea: [{ card: "BT1-038", as: "sourceHost", under: ["P-098"] }, "BT1-087"],
          hand: [
            { card: "BT1-009", as: "red" },
            { card: "BT1-028", as: "blue" },
            { card: "BT7-032", as: "yellow" },
            { card: "BT10-100", as: "option" },
            "BT1-009",
          ],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: {
          battleArea: [{ card: "BT1-028", as: "enemyBlue" }],
          security: ["BT1-011", "BT1-011", "BT1-011"],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoOrderTriggers: true, autoOrderCards: true },
    );
    s.state.memory = 10;
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    for (const alias of ["red", "blue"]) {
      const instanceId = s.inst(alias).instanceId;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId })).toEqual({ ok: true });
      await settle(
        () =>
          s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === instanceId) &&
          s.state.pendingDecision === undefined,
      );
    }
    const blue = s.perm("blue");
    expect(observe(s.engine).hasKeyword(blue, "Rush")).toBe(false);
    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: blue.permanentId, target: { kind: "player" } }),
    ).toEqual({ ok: false, reason: "illegal-target" });
    expect(s.state.memory).toBe(6);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("yellow").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const rushDecision = s.state.pendingDecision!;
    const request = s.decisions.find(({ req }) => req.decisionId === rushDecision.decisionId)!.req;
    expect(request.sourceCardId).toBe("P-098");
    expect(new Set(request.options?.candidateInstanceIds)).toEqual(
      new Set([s.perm("sourceHost").permanentId, blue.permanentId]),
    );
    expect(request.options?.candidateInstanceIds).toHaveLength(2);
    for (const alias of ["red", "yellow", "enemyBlue"]) {
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: rushDecision.decisionId,
          response: { kind: "chooseTargets", instanceIds: [s.perm(alias).permanentId] },
        }).ok,
      ).toBe(false);
      expect(s.state.pendingDecision?.decisionId).toBe(rushDecision.decisionId);
      expect(observe(s.engine).hasKeyword(blue, "Rush")).toBe(false);
    }
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: rushDecision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [blue.permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("option").instanceId) &&
        s.state.pendingDecision === undefined,
    );
    expect(observe(s.engine).hasKeyword(blue, "Rush")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("red"), "Rush")).toBe(false);
    expect(observe(s.engine).hasKeyword(s.perm("yellow"), "Rush")).toBe(false);
    expect(observe(s.engine).hasKeyword(s.perm("sourceHost"), "Rush")).toBe(false);
    expect(s.state.memory).toBe(3);
    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: blue.permanentId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 2 && s.state.pendingDecision === undefined);
    expect(blue.isSuspended).toBe(true);
    expect(s.state.memory).toBe(3);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(observe(s.engine).hasKeyword(blue, "Rush")).toBe(false);
    expect(s.state.players[0]!.battleArea.find((p) => p.permanentId === blue.permanentId)).toBe(blue);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
  it.each(["EX3-030", "EX3-031"])(
    "%s chooses one Rush recipient from a public simultaneous Dragon play",
    async (source) => {
      const s = setup(
        {
          0: {
            battleArea: [
              { card: "EX3-033", as: "sourceHost", under: [source] },
              { card: "BT1-053", as: "olderDragon" },
              "BT1-086",
              {
                card: "BT1-084",
                as: "batchHost",
                under: [
                  { card: "EX3-035", as: "firstDragon" },
                  { card: "EX3-025", as: "secondDragon" },
                  { card: "BT1-009", as: "unrelatedSource" },
                ],
              },
            ],
            hand: [{ card: "BT7-097", as: "option" }, "BT1-009"],
            deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
          },
          1: { security: ["BT1-011", "BT1-011", "BT1-011"], deck: ["BT1-009", "BT1-009", "BT1-009"] },
        },
        { autoOrderTriggers: true, autoOrderCards: true, autoAcceptOptional: true },
      );
      s.state.memory = 10;
      const loop = s.engine.startTurnLoop();
      await advance(s.engine).waitForMainPhase(0);
      const optionId = s.inst("option").instanceId;
      const firstId = s.inst("firstDragon").instanceId;
      const secondId = s.inst("secondDragon").instanceId;
      const unrelatedId = s.inst("unrelatedSource").instanceId;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
      const hostDecision = s.state.pendingDecision!;
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: hostDecision.decisionId,
          response: { kind: "chooseTargets", instanceIds: [s.perm("batchHost").permanentId] },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      const materialsDecision = s.state.pendingDecision!;
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: materialsDecision.decisionId,
          response: { kind: "selectCards", instanceIds: [firstId, secondId] },
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.state.pendingDecision?.kind === "chooseTargets" ||
          s.state.players[0]!.trash.some((c) => c.instanceId === optionId),
      );
      expect(s.state.pendingDecision?.kind).toBe("chooseTargets");
      const rushDecision = s.state.pendingDecision!;
      const request = s.decisions.find(({ req }) => req.decisionId === rushDecision.decisionId)!.req;
      const first = s.perm("firstDragon");
      const second = s.perm("secondDragon");
      expect(request.sourceCardId).toBe(source);
      expect(new Set(request.options?.candidateInstanceIds)).toEqual(new Set([first.permanentId, second.permanentId]));
      expect(request.options?.candidateInstanceIds).toHaveLength(2);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: rushDecision.decisionId,
          response: { kind: "chooseTargets", instanceIds: [s.perm("olderDragon").permanentId] },
        }).ok,
      ).toBe(false);
      expect(s.state.pendingDecision?.decisionId).toBe(rushDecision.decisionId);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: rushDecision.decisionId,
          response: { kind: "chooseTargets", instanceIds: [second.permanentId] },
        }),
      ).toEqual({ ok: true });
      await settle(
        () => s.state.players[0]!.trash.some((c) => c.instanceId === optionId) && s.state.pendingDecision === undefined,
      );
      expect(observe(s.engine).hasKeyword(first, "Rush")).toBe(false);
      expect(observe(s.engine).hasKeyword(second, "Rush")).toBe(true);
      expect(observe(s.engine).hasKeyword(s.perm("olderDragon"), "Rush")).toBe(false);
      expect(s.perm("batchHost").stack.map((c) => c.instanceId)).toEqual([unrelatedId]);
      expect(s.state.memory).toBe(3);
      expect(s.state.players[0]!.deck).toHaveLength(2);
      expect(s.decisions.filter(({ req }) => req.kind === "chooseTargets" && req.sourceCardId === source)).toHaveLength(
        1,
      );
      expect(
        s.engine.applyIntent(0, { type: "attack", attackerPermanentId: first.permanentId, target: { kind: "player" } }),
      ).toEqual({ ok: false, reason: "illegal-target" });
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: second.permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[1]!.security.length === 2 && s.state.pendingDecision === undefined);
      expect(first.isSuspended).toBe(false);
      expect(second.isSuspended).toBe(true);
      advance(s.engine).endMainPhaseIfOpen(0);
      await advance(s.engine).waitForMainPhase(1);
      expect(observe(s.engine).hasKeyword(second, "Rush")).toBe(false);
      expect(s.state.players[0]!.battleArea.find((p) => p.permanentId === second.permanentId)).toBe(second);
      expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
      await loop;
    },
  );
  it.each(["EX3-030", "EX3-031"])("%s keeps two inherited Rush occurrences independent on one host", async (source) => {
    cite(
      "comprehensive-0193",
      "Each physical source has its own use; used sources do not trigger again this turn and reset when the turn changes",
      "b18368c15408ced59ec2cebcf84779b30e851cc34973ebf428203c4f4295e8cf",
    );
    const s = setup(
      {
        0: {
          battleArea: [
            { card: "EX3-033", as: "sourceHost", under: [source, source] },
            { card: "BT1-053", as: "olderDragon" },
            "BT1-086",
            {
              card: "BT1-084",
              as: "batchHost",
              under: [
                { card: "EX3-035", as: "firstDragon" },
                { card: "EX3-025", as: "secondDragon" },
                { card: "BT1-009", as: "unrelatedSource" },
                { card: "EX3-035", as: "repeatFirst" },
                { card: "EX3-025", as: "repeatSecond" },
                { card: "EX3-035", as: "resetFirst" },
                { card: "EX3-025", as: "resetSecond" },
              ],
            },
          ],
          hand: [
            { card: "BT7-097", as: "option" },
            { card: "BT7-097", as: "repeatOption" },
            { card: "BT7-097", as: "resetOption" },
            "BT1-009",
          ],
          deck: [
            "BT1-028",
            "BT1-028",
            "BT1-028",
            "BT1-028",
            "BT7-032",
            "BT7-032",
            "BT7-032",
            "BT7-032",
            "AD1-001",
            "AD1-001",
            "AD1-001",
            "AD1-001",
          ],
        },
        1: { security: ["BT1-011", "BT1-011", "BT1-011"], deck: ["BT1-009", "BT1-009", "BT1-009"] },
      },
      { autoOrderTriggers: true, autoOrderCards: true, autoAcceptOptional: true },
    );
    const sourceIds = s.perm("sourceHost").stack.map((card) => card.instanceId);
    expect(sourceIds).toHaveLength(2);
    expect(new Set(sourceIds).size).toBe(2);
    expect(s.perm("sourceHost").stack.map((card) => card.cardId)).toEqual([source, source]);
    s.state.memory = 10;
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    const optionId = s.inst("option").instanceId;
    const firstId = s.inst("firstDragon").instanceId;
    const secondId = s.inst("secondDragon").instanceId;
    const unrelatedId = s.inst("unrelatedSource").instanceId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const hostDecision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: hostDecision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("batchHost").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const materialsDecision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: materialsDecision.decisionId,
        response: { kind: "selectCards", instanceIds: [firstId, secondId] },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.pendingDecision?.kind === "chooseTargets" ||
        s.state.players[0]!.trash.some((c) => c.instanceId === optionId),
    );
    expect(s.state.pendingDecision?.kind).toBe("chooseTargets");
    const rushDecision = s.state.pendingDecision!;
    const request = s.decisions.find(({ req }) => req.decisionId === rushDecision.decisionId)!.req;
    const first = s.perm("firstDragon");
    const second = s.perm("secondDragon");
    expect(request.sourceCardId).toBe(source);
    expect(new Set(request.options?.candidateInstanceIds)).toEqual(new Set([first.permanentId, second.permanentId]));
    expect(request.options?.candidateInstanceIds).toHaveLength(2);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: rushDecision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("olderDragon").permanentId] },
      }).ok,
    ).toBe(false);
    expect(s.state.pendingDecision?.decisionId).toBe(rushDecision.decisionId);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: rushDecision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [first.permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        (s.state.pendingDecision?.kind === "chooseTargets" &&
          s.state.pendingDecision.decisionId !== rushDecision.decisionId) ||
        s.state.players[0]!.trash.some((c) => c.instanceId === optionId),
    );
    expect(s.state.pendingDecision?.kind).toBe("chooseTargets");
    const secondDecision = s.state.pendingDecision!;
    expect(secondDecision.decisionId).not.toBe(rushDecision.decisionId);
    const secondRequest = s.decisions.find(({ req }) => req.decisionId === secondDecision.decisionId)!.req;
    expect(secondRequest.sourceCardId).toBe(source);
    expect(new Set(secondRequest.options?.candidateInstanceIds)).toEqual(
      new Set([first.permanentId, second.permanentId]),
    );
    expect(secondRequest.options?.candidateInstanceIds).toHaveLength(2);
    expect(observe(s.engine).hasKeyword(first, "Rush")).toBe(true);
    expect(observe(s.engine).hasKeyword(second, "Rush")).toBe(false);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: secondDecision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [second.permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(
      () => s.state.players[0]!.trash.some((c) => c.instanceId === optionId) && s.state.pendingDecision === undefined,
    );
    expect(observe(s.engine).hasKeyword(first, "Rush")).toBe(true);
    expect(observe(s.engine).hasKeyword(second, "Rush")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("olderDragon"), "Rush")).toBe(false);
    expect(s.perm("batchHost").stack.map((c) => c.instanceId)).toEqual([
      unrelatedId,
      ...["repeatFirst", "repeatSecond", "resetFirst", "resetSecond"].map((alias) => s.inst(alias).instanceId),
    ]);
    expect(s.state.memory).toBe(3);
    expect(s.state.players[0]!.deck).toHaveLength(10);
    expect(s.decisions.filter(({ req }) => req.kind === "chooseTargets" && req.sourceCardId === source)).toHaveLength(
      2,
    );
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: second.permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 2 && s.state.pendingDecision === undefined);
    expect(first.isSuspended).toBe(false);
    expect(second.isSuspended).toBe(true);
    async function playLaterBatch(optionAlias: string, recipientAliases: string[], expectedChoices: number) {
      const nextOptionId = s.inst(optionAlias).instanceId;
      const materialIds = recipientAliases.map((alias) => s.inst(alias).instanceId);
      const choicesBefore = s.decisions.filter(
        ({ req }) => req.kind === "chooseTargets" && req.sourceCardId === source,
      ).length;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: nextOptionId })).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: s.state.pendingDecision!.decisionId,
          response: { kind: "chooseTargets", instanceIds: [s.perm("batchHost").permanentId] },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: s.state.pendingDecision!.decisionId,
          response: { kind: "selectCards", instanceIds: materialIds },
        }),
      ).toEqual({ ok: true });
      const decisionIds: string[] = [];
      for (let index = 0; index < expectedChoices; index += 1) {
        await settle(
          () =>
            (s.state.pendingDecision?.kind === "chooseTargets" &&
              !decisionIds.includes(s.state.pendingDecision.decisionId)) ||
            s.state.players[0]!.trash.some((card) => card.instanceId === nextOptionId),
        );
        expect(s.state.pendingDecision?.kind).toBe("chooseTargets");
        const decision = s.state.pendingDecision!;
        decisionIds.push(decision.decisionId);
        const choiceRequest = s.decisions.find(({ req }) => req.decisionId === decision.decisionId)!.req;
        expect(choiceRequest.sourceCardId).toBe(source);
        const recipients = recipientAliases.map((alias) => s.perm(alias));
        expect(new Set(choiceRequest.options?.candidateInstanceIds)).toEqual(
          new Set(recipients.map((p) => p.permanentId)),
        );
        expect(choiceRequest.options?.candidateInstanceIds).toHaveLength(2);
        expect(observe(s.engine).hasKeyword(recipients[0]!, "Rush")).toBe(index === 1);
        expect(observe(s.engine).hasKeyword(recipients[1]!, "Rush")).toBe(false);
        expect(
          s.engine.applyIntent(0, {
            type: "respondDecision",
            decisionId: decision.decisionId,
            response: { kind: "chooseTargets", instanceIds: [recipients[index]!.permanentId] },
          }),
        ).toEqual({ ok: true });
      }
      await settle(
        () =>
          s.state.players[0]!.trash.some((card) => card.instanceId === nextOptionId) ||
          s.state.pendingDecision?.kind === "chooseTargets",
      );
      expect(s.state.pendingDecision).toBeUndefined();
      expect(s.state.players[0]!.trash.some((card) => card.instanceId === nextOptionId)).toBe(true);
      expect(s.decisions.filter(({ req }) => req.kind === "chooseTargets" && req.sourceCardId === source)).toHaveLength(
        choicesBefore + expectedChoices,
      );
      for (let index = 0; index < recipientAliases.length; index += 1) {
        expect(s.perm(recipientAliases[index]!).topCard.instanceId).toBe(materialIds[index]);
      }
    }
    expect(s.state.memory).toBe(3);
    await playLaterBatch("repeatOption", ["repeatFirst", "repeatSecond"], 0);
    await advance(s.engine).waitForMainPhase(1);
    expect(observe(s.engine).hasKeyword(first, "Rush")).toBe(false);
    expect(observe(s.engine).hasKeyword(second, "Rush")).toBe(false);
    expect(s.perm("sourceHost").stack.map((card) => card.instanceId)).toEqual(sourceIds);
    expect(s.state.players[0]!.battleArea.find((p) => p.permanentId === second.permanentId)).toBe(second);
    expect(s.state.memory).toBe(4);
    expect(s.state.players[0]!.deck).toHaveLength(8);
    expect(observe(s.engine).hasKeyword(s.perm("repeatFirst"), "Rush")).toBe(false);
    expect(observe(s.engine).hasKeyword(s.perm("repeatSecond"), "Rush")).toBe(false);
    advance(s.engine).endMainPhaseIfOpen(1);
    await advance(s.engine).waitForMainPhase(0);
    expect(s.state.memory).toBe(3);
    expect(s.perm("sourceHost").stack.map((card) => card.instanceId)).toEqual(sourceIds);
    await playLaterBatch("resetOption", ["resetFirst", "resetSecond"], 2);
    await advance(s.engine).waitForMainPhase(1);
    expect(s.state.memory).toBe(4);
    expect(s.state.players[0]!.deck).toHaveLength(5);
    expect(s.perm("batchHost").stack.map((card) => card.instanceId)).toEqual([unrelatedId]);
    expect(s.perm("sourceHost").stack.map((card) => card.instanceId)).toEqual(sourceIds);
    for (const alias of ["firstDragon", "secondDragon", "repeatFirst", "repeatSecond", "resetFirst", "resetSecond"]) {
      expect(observe(s.engine).hasKeyword(s.perm(alias), "Rush")).toBe(false);
    }
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
  it.each(["EX3-030", "EX3-031"])("%s binds Rush only to the Dragon in a public mixed play", async (source) => {
    const s = setup(
      {
        0: {
          battleArea: [
            { card: "EX3-033", as: "sourceHost", under: [source] },
            { card: "BT1-053", as: "olderDragon" },
            "BT1-086",
            {
              card: "BT1-084",
              as: "batchHost",
              under: [
                { card: "BT1-009", as: "unrelatedPlay" },
                { card: "EX3-025", as: "secondDragon" },
                { card: "EX3-035", as: "retainedDragon" },
              ],
            },
          ],
          hand: [{ card: "BT7-097", as: "option" }, "BT1-009"],
          deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
        },
        1: { security: ["BT1-011", "BT1-011", "BT1-011"], deck: ["BT1-009", "BT1-009", "BT1-009"] },
      },
      { autoOrderTriggers: true, autoOrderCards: true, autoAcceptOptional: true },
    );
    s.state.memory = 10;
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    const optionId = s.inst("option").instanceId;
    const firstId = s.inst("unrelatedPlay").instanceId;
    const secondId = s.inst("secondDragon").instanceId;
    const unrelatedId = s.inst("retainedDragon").instanceId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const hostDecision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: hostDecision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("batchHost").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const materialsDecision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: materialsDecision.decisionId,
        response: { kind: "selectCards", instanceIds: [firstId, secondId] },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.trash.some((c) => c.instanceId === optionId) ||
        s.state.pendingDecision?.kind === "chooseTargets",
    );
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.state.players[0]!.trash.some((c) => c.instanceId === optionId)).toBe(true);
    const first = s.perm("unrelatedPlay");
    const second = s.perm("secondDragon");
    expect(observe(s.engine).hasKeyword(first, "Rush")).toBe(false);
    expect(observe(s.engine).hasKeyword(second, "Rush")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("olderDragon"), "Rush")).toBe(false);
    expect(s.perm("batchHost").stack.map((c) => c.instanceId)).toEqual([unrelatedId]);
    expect(s.state.memory).toBe(3);
    expect(s.state.players[0]!.deck).toHaveLength(2);
    expect(s.decisions.filter(({ req }) => req.kind === "chooseTargets" && req.sourceCardId === source)).toHaveLength(
      0,
    );
    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: first.permanentId, target: { kind: "player" } }),
    ).toEqual({ ok: false, reason: "illegal-target" });
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: second.permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 2 && s.state.pendingDecision === undefined);
    expect(first.isSuspended).toBe(false);
    expect(second.isSuspended).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(observe(s.engine).hasKeyword(second, "Rush")).toBe(false);
    expect(s.state.players[0]!.battleArea.find((p) => p.permanentId === second.permanentId)).toBe(second);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});

describe("§16-16 <Blitz> (comprehensive-0234)", () => {
  it("16-16-1/16-16-5: offers the attack only once the opponent has 1 or more memory", async () => {
    cite(
      "comprehensive-0234",
      "16-16-1 <Blitz>: this Digimon may attack once your opponent has 1 or more memory (i.e. " +
        "memory has crossed to your side); 16-16-5 it can't be used before that crossing",
      "41989eae2306a38a7bb6718872bf276ce11c34f32cbc0d1d19d9817cbf7d14f2",
    );

    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const blitzer = digimon(0, 5000, NON_KEYWORD_CARD);
    p0.battleArea.push(blitzer);
    const { primitives } = s.engine as unknown as { primitives: Primitives };

    // Memory favors the turn player (seat 0): the opponent has no memory, so Blitz does nothing.
    s.state.memory = 3;
    await primitives.blitzAttack!(blitzer.permanentId);
    expect(s.state.pendingDecision).toBeUndefined();

    // Memory now favors the OPPONENT (seat 1): "your opponent has 1+ memory", so Blitz is offered.
    s.state.memory = -3;
    void primitives.blitzAttack!(blitzer.permanentId);
    await drainMicrotasks();
    expect(s.state.pendingDecision?.promptText).toBe("Activate Blitz?");
  });
});

describe("§16-17 <Delay> (comprehensive-0235)", () => {
  it("16-17-1/16-17-3: a <Delay> [Main] ability is unusable the turn the card enters the battle area", async () => {
    cite(
      "comprehensive-0235",
      "16-17-1 <Delay>: while this card is in the battle area, trashing it activates the " +
        "specified effect; 16-17-3 it can't activate the same turn the card entered the battle area",
      "866991fdeb6c896a2840c30399a87d353e8cbd33d30f706e6729ba46bd4428d2",
    );

    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const delayer = digimon(0, 0, "BT10-097"); // [Main] <Delay>: trash self, gain 2 memory
    delayer.enterFieldTurnCount = s.state.turnCount; // entered THIS turn
    p0.battleArea.push(delayer);

    // No activatable <Delay> ability is offered the turn it entered the field.
    expect(activatableEffects(s, delayer).some((e) => /delay/i.test(e.description))).toBe(false);
  });

  it("becomes activatable (and mandatorily trashes the card) once it's been on the field since a prior turn", async () => {
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const delayer = digimon(0, 0, "BT10-097");
    delayer.enterFieldTurnCount = s.state.turnCount - 1; // entered on an earlier turn
    p0.battleArea.push(delayer);
    const sourceInstanceId = delayer.topCard!.instanceId;

    const entry = activatableEffects(s, delayer).find((e) => e.instanceId === sourceInstanceId);
    expect(entry, "BT10-097 surfaces its <Delay> ability once eligible").toBeDefined();

    const trashBefore = p0.trash.length;
    expect(s.engine.applyIntent(0, { type: "activateEffect", sourceInstanceId, effectKey: entry!.effectKey })).toEqual({
      ok: true,
    });
    await settle(() => p0.battleArea.length === 0, 5000);

    expect(p0.battleArea.some((p) => p.permanentId === delayer.permanentId)).toBe(false); // trashed itself
    expect(p0.trash.length).toBe(trashBefore + 1);
  });
});

describe("§16-18 <Decoy> (comprehensive-0236)", () => {
  it("a <Decoy>-protected Digimon stays deletable: the protection is paid by deleting the Decoy holder", async () => {
    cite(
      "comprehensive-0236",
      "§16-18-1 <Decoy (X)>: 'When another of your specified Digimon would be deleted by an " +
        "opponent's effect, by deleting the Digimon with this effect, this effect prevents the " +
        "Digimon specified by this effect from being deleted.' The protection is a one-shot " +
        "cost paid at the deletion consult, never a standing can't-be-deleted restriction.",
      "311375329fc7791aba6a16b180691e3063bce3bba790f4f92dff802e21987ca1",
    );

    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const decoy = digimon(0, 3000, "BT11-082"); // printed <Decoy ([Bagra Army])>
    const protectedAlly = digimon(0, 1000, "BT10-070"); // a [Bagra Army] Digimon it covers
    p0.battleArea.push(decoy, protectedAlly);
    await s.engine.recomputeContinuousEffects();
    const reader = (s.engine as unknown as { continuous: { hasRestriction(id: string, r: string): boolean } })
      .continuous;

    // The covered ally carries NO standing restriction: it is deletable until the Decoy
    // holder is actually deleted as the cost at the consult.
    expect(reader.hasRestriction(protectedAlly.permanentId, "beDeleted")).toBe(false);
    // The <Decoy> marker itself is the keyword grant the deletion consult reads.
    expect(
      (s.engine as unknown as { continuous: { hasKeyword(id: string, k: string): boolean } }).continuous.hasKeyword(
        decoy.permanentId,
        "Decoy",
      ),
    ).toBe(true);
  });
});

describe("§16-19 <Armor Purge> (comprehensive-0237)", () => {
  it("NOW MET: a printed-<Armor Purge> Digimon that loses a battle should be spared by trashing its own top card", async () => {
    cite(
      "comprehensive-0237",
      "DIVERGENCE: §16-19-1 <Armor Purge>: 'When a Digimon with this effect would be " +
        "deleted, by trashing the top card of the Digimon with this effect, this effect " +
        "prevents the deletion.' Every real <Armor Purge> printer checked (BT10-012, " +
        "BT10-015, BT10-074) compiles the keyword to an empty-actions Static marker only — " +
        "no Replacement/Prevent registration exists anywhere in the engine keyed on " +
        "'Armor Purge' (confirmed by an engine-wide grep for hasKeyword(...,\"Armor Purge\")). " +
        "A Digimon that loses a battle is deleted exactly as if it never printed the keyword.",
      "993f34e99731aacdbfd14f07fb7cd8eedf6747bae2c2595679e77b43b79aa5ae",
    );

    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const attacker = digimon(0, 9000, NON_KEYWORD_CARD);
    p0.battleArea.push(attacker);
    const armored = digimon(1, 4000, "BT10-012"); // printed <Armor Purge>
    armored.isSuspended = true;
    armored.stack.push(instance(NON_KEYWORD_CARD, 1, true)); // a top card to trash as the cost
    p1.battleArea.push(armored);
    await s.engine.recomputeContinuousEffects(); // pick up BT10-012's printed <Armor Purge>

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "permanent", permanentId: armored.permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => false, 5000);

    // EXPECTED (per §16-19-1): spared by trashing its own top card instead.
    expect(p1.battleArea.some((p) => p.permanentId === armored.permanentId)).toBe(true);
  });

  it("names the saved Digimon as the source of its battle <Armor Purge> prompt", async () => {
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const attacker = digimon(0, 9000, NON_KEYWORD_CARD);
    p0.battleArea.push(attacker);
    const armored = digimon(1, 4000, "BT10-012");
    armored.isSuspended = true;
    armored.stack.push(instance(NON_KEYWORD_CARD, 1, true));
    p1.battleArea.push(armored);
    await s.engine.recomputeContinuousEffects();
    const armoredTop = armored.topCard!;

    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: attacker.permanentId,
      target: { kind: "permanent", permanentId: armored.permanentId },
    });
    await settle(() => false, 5000);

    const prompt = s.decisions.find(({ req }) => req.options?.effectText?.includes("Armor Purge"));
    expect(prompt?.req).toMatchObject({
      sourceCardId: "BT10-012",
      sourceInstanceId: armoredTop.instanceId,
      sourcePermanentId: armored.permanentId,
    });
  });
});
