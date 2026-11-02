import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { drainMicrotasks, settle, setupEngine } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";
import { compiled } from "./BT15-064.js";

describe("BT15-064", () => {
  it.each([
    ["BT14-074", false],
    ["BT14-087", true],
  ])("requires a SoC Tamer rather than a SoC Digimon for attack deletion: %s", async (source, allowed) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT15-064", as: "host", under: [{ card: source, faceUp: true }] }] },
        1: { battleArea: [{ card: "BT1-009", as: "target" }], security: ["BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await drainMicrotasks();
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT1-009")).toBe(!allowed);
  });

  it("reveals three to place one Machine/Cyborg/SoC under itself and add another to hand", () => {
    expect(compiled.effects?.[0]).toMatchObject({
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          rest: "trash",
          add: [{ to: "placeUnder", underFilter: { isSelfRef: true } }, { to: "hand" }],
        },
      ],
    });
    expect(compiled.effects?.[1]).toMatchObject({
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "RevealAdd",
          add: [{ to: "placeUnder", underFilter: { isSelfRef: true } }, { to: "hand" }],
        },
      ],
    });
  });
  it("deletes a low-cost opposing card with SoC in stack and inherited de-digivolves", () => {
    expect(compiled.effects?.[2]).toMatchObject({
      trigger: "WhenAttacking",
      actions: [{ kind: "Delete", condition: { kind: "selfDigivolutionStackHasTrait" } }],
    });
    expect(compiled.effects?.[3]).toMatchObject({
      trigger: "WhenAttacking",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [{ kind: "DeDigivolve", stopAtLevel: 3 }],
    });
  });

  it("places the first qualifying reveal under this Megadramon, not another Machine host", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT15-066", as: "otherHost" }],
          hand: [{ card: "BT15-064", as: "source" }],
          deck: [
            { card: "BT15-066", as: "underCandidate" },
            { card: "BT15-064", as: "handCandidate" },
            { card: "BT1-009", as: "filler" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("source").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.perm("source").stack.some(({ instanceId }) => instanceId === s.inst("underCandidate").instanceId),
    );

    expect(s.perm("source").stack.map(({ instanceId }) => instanceId)).toContain(s.inst("underCandidate").instanceId);
    expect(s.perm("otherHost").stack).toHaveLength(0);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("handCandidate").instanceId);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("filler").instanceId);
  });

  it("de-digivolves once per turn and resets after the next real turn", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT13-019", as: "attacker", under: ["BT15-064"] }],
          hand: [{ card: "BT1-009", as: "spare" }],
          deck: ["BT1-009", "BT1-009"],
        },
        1: {
          battleArea: [
            { card: "BT15-061", as: "target", under: ["BT15-055"] },
            { card: "BT15-061", as: "targetAgain", under: ["BT15-055"] },
          ],
          security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009"],
          deck: ["BT1-009", "BT1-009"],
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    s.state.memory = 10;
    preferred.push(s.perm("target").topCard!.instanceId);
    await s.ready();
    const firstTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).blockingSeat() === 1);
    expect(s.engine.applyIntent(1, { type: "declineBlock" })).toEqual({ ok: true });
    await settle(() => s.perm("target").topCard?.cardId === "BT15-055" && !observe(s.engine).isAttacking());
    await advance(s.engine).verb.unsuspend([s.perm("attacker").permanentId]);
    preferred.length = 0;
    preferred.push(s.perm("targetAgain").topCard!.instanceId);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).blockingSeat() === 1);
    expect(s.engine.applyIntent(1, { type: "declineBlock" })).toEqual({ ok: true });
    await settle(
      () =>
        !observe(s.engine).isAttacking() &&
        s.state.pendingDecision === undefined &&
        s.state.players[1]!.security.length === 3,
    );
    expect(s.perm("targetAgain").topCard?.cardId).toBe("BT15-061");
    advance(s.engine).endMainPhaseIfOpen(0);
    await firstTurn;
    s.state.turnSeat = 1;
    s.state.memory = 10;
    await advance(s.engine).runTurn(1);
    s.state.turnSeat = 0;
    s.state.memory = 10;
    const nextTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    await advance(s.engine).verb.unsuspend([s.perm("attacker").permanentId, s.perm("targetAgain").permanentId]);
    preferred.length = 0;
    preferred.push(s.perm("targetAgain").topCard!.instanceId);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("targetAgain").topCard?.cardId === "BT15-055" && !observe(s.engine).isAttacking());
    expect(s.perm("targetAgain").topCard?.cardId).toBe("BT15-055");
    advance(s.engine).endMainPhaseIfOpen(0);
    await nextTurn;
  });
});

describe("BT15-064 Megadramon — KB Q&A rulings", () => {
  it("places the only revealed Machine/Cyborg/SoC card under itself and adds nothing to hand (Q2550)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT15-064", as: "source" }],
          deck: [
            { card: "BT1-009", as: "firstFiller" },
            { card: "BT15-066", as: "onlyMachine" },
            { card: "BT1-009", as: "secondFiller" },
            { card: "BT15-061", as: "unrevealedMachine" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("source").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.pendingDecision === undefined &&
        s.state.players[0]!.trash.some(({ instanceId }) => instanceId === s.inst("secondFiller").instanceId),
    );

    const player = s.state.players[0]!;
    expect(s.perm("source").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("onlyMachine").instanceId]);
    expect(player.hand).toHaveLength(0);
    expect(player.trash.map(({ instanceId }) => instanceId).sort()).toEqual(
      [s.inst("firstFiller").instanceId, s.inst("secondFiller").instanceId].sort(),
    );
    expect(player.deck.map(({ instanceId }) => instanceId)).toEqual([s.inst("unrevealedMachine").instanceId]);
  });

  it("adds only a Machine/Cyborg/SoC trait card to hand, never a revealed card without the trait (Q2551)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT15-064", as: "source" }],
          deck: [
            { card: "BT15-066", as: "firstMachine" },
            { card: "BT1-009", as: "withoutTrait" },
            { card: "BT15-061", as: "secondMachine" },
          ],
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    s.state.memory = 10;
    preferred.push(s.inst("withoutTrait").instanceId);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("source").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.pendingDecision === undefined &&
        s.state.players[0]!.trash.some(({ instanceId }) => instanceId === s.inst("withoutTrait").instanceId),
    );

    const player = s.state.players[0]!;
    const machineIds = [s.inst("firstMachine").instanceId, s.inst("secondMachine").instanceId];
    const placedUnder = s.perm("source").stack.map(({ instanceId }) => instanceId);
    const addedToHand = player.hand.map(({ instanceId }) => instanceId);
    expect(placedUnder).toHaveLength(1);
    expect(addedToHand).toHaveLength(1);
    expect([...placedUnder, ...addedToHand].sort()).toEqual([...machineIds].sort());
    expect(player.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("withoutTrait").instanceId]);
  });
});
