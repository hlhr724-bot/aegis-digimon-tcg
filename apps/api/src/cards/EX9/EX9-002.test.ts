import { describe, expect, it } from "vitest";
import { compiled } from "./EX9-002.js";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";

describe("EX9-002", () => {
  it("encodes the inherited once-per-turn face-down Ver.2 evolution clause", () =>
    expect(compiled.effects?.find((entry) => entry.isInherited)).toMatchObject({
      trigger: "YourTurn",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "onAddDigivolutionCards",
          triggerFilter: { isSelfRef: true },
          sourceFilter: { controllerDefault: "mine" },
          addedDigivolutionCardFilter: { faceDown: true },
          actions: [{ kind: "Digivolve", from: ["hand"], reduceCost: 1, payCost: true, optional: true }],
        },
      ],
    }));

  it("uses a real Training placement to evolve into Ver.2 from hand for cost minus 1", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX9-015", as: "host", under: ["EX9-002"] }],
          hand: ["EX9-017"],
          deck: ["BT1-027", "BT1-048"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 4;
    await s.ready();
    const ability = observe(s.engine).activatableEffects(s.perm("host"))[0]!;
    expect(ability).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("host").topCard.instanceId,
        effectKey: ability.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === "EX9-017");

    expect(s.perm("host").topCard.cardId).toBe("EX9-017");
    expect(s.state.memory).toBe(3);
    expect(s.perm("host").stack.map((card) => card.cardId)).toEqual(["BT1-048", "BT1-027", "EX9-002", "EX9-015"]);
    expect(s.perm("host").stack[0]!.faceUp).toBe(false);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("does not react to a real normal digivolution's face-up source card", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX9-014", as: "host", under: ["EX9-002"] }],
          hand: ["EX9-017"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.state.players[0]!.hand.find((card) => card.cardId === "EX9-017")!.instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === "EX9-017");

    expect(s.perm("host").topCard.cardId).toBe("EX9-017");
    expect(s.perm("host").stack.map((card) => [card.cardId, card.faceUp])).toEqual([
      ["EX9-002", true],
      ["EX9-014", true],
    ]);
    expect(s.state.memory).toBe(1);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("does not offer a Ver.1 destination after a real face-down Training placement", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX9-015", as: "host", under: ["EX9-002"] }],
          hand: ["EX9-009"],
          deck: ["BT1-027"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 5;
    await s.ready();
    const training = observe(s.engine).activatableEffects(s.perm("host"))[0]!;
    expect(training).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("host").topCard.instanceId,
        effectKey: training.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").stack.length === 2);

    expect(s.perm("host").topCard.cardId).toBe("EX9-015");
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["EX9-009"]);
    expect(s.state.memory).toBe(5);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("only reacts when the face-down card is placed under the permanent carrying EX9-002", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX9-015", as: "host", under: ["EX9-002"] },
            { card: "EX9-015", as: "other" },
          ],
          hand: ["EX9-017"],
          deck: ["BT1-027", "BT1-048"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 5;
    await s.ready();
    const training = observe(s.engine).activatableEffects(s.perm("other"))[0]!;
    expect(training).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("other").topCard.instanceId,
        effectKey: training.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("other").stack.length === 1);

    expect(s.perm("other").topCard.cardId).toBe("EX9-015");
    expect(s.perm("host").topCard.cardId).toBe("EX9-015");
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["EX9-017"]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("allows declining the optional evolution after a real face-down placement", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX9-015", as: "host", under: ["EX9-002"] }],
          hand: ["EX9-017"],
          deck: ["BT1-027"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 5;
    await s.ready();
    const training = observe(s.engine).activatableEffects(s.perm("host"))[0]!;
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("host").topCard.instanceId,
        effectKey: training.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").stack.length === 2);

    expect(s.perm("host").topCard.cardId).toBe("EX9-015");
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["EX9-017"]);
    expect(s.state.memory).toBe(5);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("enforces Once Per Turn across a second face-down placement in the same evolution", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX9-015", as: "host", under: ["EX9-002"] }],
          hand: ["EX9-017", "BT1-009", "EX9-018"],
          deck: ["BT1-027", "BT1-048"],
        },
        1: { battleArea: [{ card: "BT1-037", as: "opponent", under: ["BT1-009"] }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 6;
    await s.ready();
    const training = observe(s.engine).activatableEffects(s.perm("host"))[0]!;
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("host").topCard.instanceId,
        effectKey: training.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === "EX9-017");

    expect(s.perm("host").topCard.cardId).toBe("EX9-017");
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toContain("EX9-018");
    expect(s.perm("host").stack.map((card) => card.cardId)).toEqual(["BT1-009", "BT1-027", "EX9-002", "EX9-015"]);
    expect(s.state.players[1]!.battleArea[0]!.stack).toHaveLength(0);
    expect(s.state.memory).toBe(5);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("resets the Once Per Turn watcher at the next real owner turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX9-015", as: "host", under: ["EX9-002"] }],
          hand: ["EX9-017", "BT1-009", "EX9-018"],
          deck: ["BT1-027", "BT1-048", "BT1-049", "BT1-050"],
        },
        1: { deck: ["BT1-009", "BT1-010", "BT1-011"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 4;
    await s.ready();
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 4;
    const firstTraining = observe(s.engine).activatableEffects(s.perm("host"))[0]!;
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("host").topCard.instanceId,
        effectKey: firstTraining.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === "EX9-017");

    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    const nextTraining = observe(s.engine).activatableEffects(s.perm("host"))[0]!;
    expect(nextTraining).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("host").topCard.instanceId,
        effectKey: nextTraining.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === "EX9-018");
    expect(s.state.memory).toBe(0);
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;

    expect(s.perm("host").topCard.cardId).toBe("EX9-018");
    expect(s.state.memory).toBe(0);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});
