import { EffectTiming, type CompiledCard } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { registerIrCard, runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT22-101.js";

// No printed card unsuspends a Tamer and then lowers your own security inside one effect, so a
// borrowed Digimon carries that shape for the trigger-versus-activation test.
const UNSUSPEND_THEN_TRASH_SECURITY_ID = "BT1-009";
const unsuspendThenTrashSecurity: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        { kind: "Unsuspend", target: { filter: { controller: "mine", kind: ["Tamer"] }, count: 1 } },
        { kind: "SecurityManipulation", op: "trashTop", controller: "mine", amount: 1 },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

describe("BT22-101 Kyoko Kuremi", () => {
  it("sets memory to three at the start of your turn when memory is two or less", () => {
    const effect = compiled.effects.find((entry) => entry.trigger === "StartOfYourTurn");
    expect(effect?.actions[0]).toMatchObject({
      kind: "SetMemory",
      value: 3,
      condition: { kind: "memoryAtMost", value: 2, controller: "mine" },
    });
  });

  it("returns a CS Digimon from trash when a level 4 or higher CS Digimon is deleted", () => {
    const watcher = compiled.effects.find((entry) => entry.trigger === "AllTurns")?.actions[0] as any;
    expect(watcher).toMatchObject({
      kind: "SubTrigger",
      event: "onDeletionOf",
      sourceFilter: {
        controller: "mine",
        kind: ["Digimon"],
        levelComparison: { op: "gte", value: 4 },
        nameOrTrait: [{ tokens: ["CS"], match: "trait" }],
      },
      actions: [
        {
          kind: "Return",
          to: "hand",
          cost: { kind: "suspend", target: { filter: { isSelfRef: true }, isSelf: true } },
          optional: true,
          abortOnDecline: true,
        },
      ],
    });
    expect(watcher.actions[0].target.filter).toMatchObject({
      zone: "trash",
      controller: "mine",
      kind: ["Digimon"],
      nameOrTrait: [{ tokens: ["CS"], match: "trait" }],
    });
  });

  it("digivolves itself into Alphamon only when it unsuspends and no Alphamon is present", () => {
    const watcher = compiled.effects.find((entry) => entry.trigger === "YourTurn")?.actions[0] as any;
    expect(watcher).toMatchObject({
      kind: "SubTrigger",
      event: "whenUnsuspended",
      sourceFilter: { isSelfRef: true },
    });
    expect(watcher.fireCondition).toBeUndefined();
    expect(watcher.activationCondition).toBeUndefined();
    expect(watcher.actions[0]).toMatchObject({
      kind: "Digivolve",
      target: { filter: { isSelfRef: true }, isSelf: true, count: 1 },
      into: {
        controllerDefault: "mine",
        kind: ["Digimon"],
        nameOrTrait: [{ tokens: ["Alphamon"], match: "nameExact" }],
      },
      from: ["hand"],
      reduceCost: 2,
      payCost: true,
      optional: true,
      condition: {
        kind: "youHaveNone",
        filter: { nameOrTrait: [{ tokens: ["Alphamon"], match: "nameExact" }] },
      },
    });
  });

  it("plays itself from security without paying its cost", () => {
    const security = compiled.effects.find((entry) => entry.trigger === "Security");
    expect(security).toMatchObject({ isSecurity: true, actions: [{ kind: "PlayWithoutCost", payCost: false }] });
  });

  it("sets memory through the public start-turn timing", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT22-101", as: "kyoko" }] },
    });
    s.state.memory = 2;
    await advance(s.engine).fireForInstance(EffectTiming.OnStartTurn, s.perm("kyoko").topCard!);
    expect(s.state.memory).toBe(3);
  });

  it("pays the reduced cost and respects Alphamon's Kyoko evolution requirement", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT22-101", as: "kyoko", suspended: true }],
          hand: [{ card: "BT22-063", as: "alphamon" }],
          security: 3,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;

    await advance(s.engine).fireSubTrigger("whenUnsuspended", {
      unsuspendedPermanentId: s.perm("kyoko").permanentId,
    });
    await settle(() => s.perm("kyoko").topCard?.cardId === "BT22-063");

    expect(s.state.memory).toBe(2);
    expect(s.perm("kyoko").stack.at(-1)?.cardId).toBe("BT22-101");
  });

  it("reaches the evolution through the real turn-start unsuspend flow", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT22-101", as: "kyoko", suspended: true }],
          deck: ["BT1-009"],
          hand: [{ card: "BT22-063", as: "alphamon" }],
          security: 3,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    await advance(s.engine).runTurn(0);

    expect(s.perm("kyoko").topCard?.cardId).toBe("BT22-063");
    expect(s.perm("kyoko").stack.at(-1)?.cardId).toBe("BT22-101");
  });

  it("does not attempt Alphamon when Kyoko's alternate requirement is unavailable", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT22-101", as: "kyoko", suspended: true }],
          hand: [{ card: "BT22-063", as: "alphamon" }],
          security: 4,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    await advance(s.engine).runTurn(0);

    expect(s.perm("kyoko").topCard?.cardId).toBe("BT22-101");
    expect(s.state.players[0]!.hand.some((card) => card.cardId === "BT22-063")).toBe(true);
  });

  it("checks Alphamon's 3-or-fewer-security requirement when it activates, not when it triggers (CR 15-8-3-7, Q4976)", async () => {
    const original = runtimeCompiledCard(UNSUSPEND_THEN_TRASH_SECURITY_ID);
    if (original === undefined) throw new Error(`${UNSUSPEND_THEN_TRASH_SECURITY_ID} must be registered`);
    registerIrCard(UNSUSPEND_THEN_TRASH_SECURITY_ID, unsuspendThenTrashSecurity);
    try {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT22-101", as: "kyoko", suspended: true },
              { card: UNSUSPEND_THEN_TRASH_SECURITY_ID, as: "source" },
            ],
            hand: [{ card: "BT22-063", as: "alphamon" }],
            security: 4,
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
      );
      s.state.memory = 5;
      await s.ready();

      await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("source"));
      await settle(() => s.state.pendingDecision === undefined && s.perm("kyoko").topCard?.cardId === "BT22-063");

      expect(s.state.players[0]!.security).toHaveLength(3);
      expect(s.perm("kyoko").topCard?.cardId).toBe("BT22-063");
      expect(s.perm("kyoko").stack.at(-1)?.cardId).toBe("BT22-101");
      expect(s.state.memory).toBe(2);
    } finally {
      registerIrCard(UNSUSPEND_THEN_TRASH_SECURITY_ID, original);
    }
  });

  it("does not offer an Alphamon with no Kyoko Kuremi digivolution route", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT22-101", as: "kyoko", suspended: true }],
          hand: [{ card: "BT6-111", as: "otherAlphamon" }],
          security: 3,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    await advance(s.engine).runTurn(0);

    expect(s.perm("kyoko").topCard?.cardId).toBe("BT22-101");
    expect(s.state.players[0]!.hand.some((card) => card.cardId === "BT6-111")).toBe(true);
  });
});

describe("BT22-101 Kyoko Kuremi — KB Q&A rulings", () => {
  it.each([
    { requirement: "met with 3 security cards", alphamon: "BT22-063", security: 3, digivolves: true },
    { requirement: "unmet with 4 security cards", alphamon: "BT22-063", security: 4, digivolves: false },
    { requirement: "absent from another Alphamon", alphamon: "BT6-111", security: 3, digivolves: false },
  ])(
    "digivolves into Alphamon on unsuspend only when its digivolution requirement is $requirement (Q4976)",
    async ({ alphamon, security, digivolves }) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT22-101", as: "kyoko", suspended: true }],
            deck: ["BT1-009"],
            hand: [{ card: alphamon, as: "alphamon" }],
            security,
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.memory = 5;
      await s.ready();

      await advance(s.engine).runTurn(0);

      expect(s.perm("kyoko").isSuspended).toBe(false);
      expect(s.perm("kyoko").topCard.cardId).toBe(digivolves ? alphamon : "BT22-101");
      expect(s.state.players[0]!.hand.some((card) => card.cardId === alphamon)).toBe(!digivolves);
    },
  );
});
