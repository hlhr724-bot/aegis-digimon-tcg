import { describe, expect, it } from "vitest";
import { observe } from "../../engine/testkit/observe.js";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./EX9-003.js";
import "../index.js";

describe("EX9-003", () => {
  it("inherits a once-per-turn Ver.3 digivolution cost reduction when it has a face-down digivolution card", () =>
    expect(compiled.effects?.find((entry) => entry.isInherited)).toMatchObject({
      trigger: "YourTurn",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "Replacement",
          event: "wouldDigivolve",
          sourceFilter: { digivolutionCards: "hasFaceDown" },
          into: { nameOrTrait: [{ tokens: ["Ver.3"], match: "trait" }] },
          actions: [{ mode: "reduceCost", amount: 1 }],
        },
      ],
    }));

  it("reduces a Ver.3 digivolution from 2 memory to 1 when the stack has a face-down card", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX9-023", as: "host", under: [{ card: "BT1-009", faceUp: false }, "EX9-003"] }],
          hand: [{ card: "EX9-029", as: "evo" }],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 2;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("evo").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard?.cardId === "EX9-029");

    expect(s.perm("host").topCard?.cardId).toBe("EX9-029");
    expect(s.state.memory).toBe(1);
  });

  it("does not reduce a Ver.3 digivolution when the stack has no face-down card", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX9-023", as: "host", under: ["EX9-003"] }],
          hand: [{ card: "EX9-029", as: "evo" }],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 2;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("evo").instanceId,
      }).ok,
    ).toBe(true);
    await settle(() => s.perm("host").topCard?.cardId === "EX9-029");
    expect(s.perm("host").topCard?.cardId).toBe("EX9-029");
    expect(s.state.memory).toBe(0);
  });

  it("reserves its reduction for its own host when another face-down stack digivolves first", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX9-023", as: "host", under: [{ card: "BT1-009", faceUp: false }, "EX9-003"] },
            { card: "EX9-023", as: "peer", under: [{ card: "BT1-010", faceUp: false }] },
          ],
          hand: [
            { card: "EX9-029", as: "peerEvolution" },
            { card: "EX9-029", as: "hostEvolution" },
          ],
          deck: Array.from({ length: 10 }, () => "BT1-048"),
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("peer").permanentId,
        instanceId: s.inst("peerEvolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("peer").topCard.cardId === "EX9-029");
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.state.memory).toBe(1);

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("hostEvolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === "EX9-029");
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.state.memory).toBe(0);
  });

  it("does not reduce a digivolution into a non-Ver.3 Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX9-023", as: "host", under: [{ card: "BT1-009", faceUp: false }, "EX9-003"] }],
          hand: [{ card: "EX9-026", as: "evo" }],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 2;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("evo").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard?.cardId === "EX9-026");

    expect(s.perm("host").topCard?.cardId).toBe("EX9-026");
    expect(s.state.memory).toBe(0);
  });

  it("consumes the reduction once per turn across two Ver.3 digivolutions", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX9-023", as: "host", under: [{ card: "BT1-009", faceUp: false }, "EX9-003"] }],
          hand: [
            { card: "EX9-029", as: "first" },
            { card: "EX9-030", as: "second" },
          ],
          deck: Array.from({ length: 20 }, () => "BT1-048"),
        },
        1: { deck: Array.from({ length: 20 }, () => "BT1-048") },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("first").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard?.cardId === "EX9-029");
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.state.memory).toBe(2);

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("second").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard?.cardId === "EX9-030");
    expect(s.state.pendingDecision).toBeUndefined();

    expect(s.state.memory).toBe(-2);
  });

  it("resets the inherited reduction after the turn changes", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX9-023", as: "host", under: [{ card: "BT1-009", faceUp: false }, "EX9-003"] }],
          hand: [
            { card: "EX9-029", as: "first" },
            { card: "EX9-030", as: "second" },
          ],
          deck: Array.from({ length: 20 }, () => "BT1-048"),
        },
        1: { deck: Array.from({ length: 20 }, () => "BT1-048") },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 3;
    await s.ready();
    const firstTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("first").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard?.cardId === "EX9-029");
    expect(s.state.memory).toBe(2);

    advance(s.engine).endMainPhaseIfOpen(0);
    await firstTurn;
    s.state.turnSeat = 1;
    s.state.memory = 3;
    await advance(s.engine).runTurn(1);
    s.state.turnSeat = 0;
    s.state.memory = 3;
    const nextTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("second").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard?.cardId === "EX9-030");
    expect(s.state.memory).toBe(1);
    expect(s.state.pendingDecision).toBeUndefined();
    advance(s.engine).endMainPhaseIfOpen(0);
    await nextTurn;
  });

  it("Q4743 stacks Tokomon's reduction with Meat's Delay reduction", async () => {
    const options = { autoDeclineOptional: false, autoSelectCards: true, autoChooseOption: true };
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX9-070", as: "meat" },
            { card: "EX9-025", as: "host", under: ["EX9-003", "EX9-023"] },
          ],
          hand: [
            { card: "BT1-009", as: "cost" },
            { card: "EX9-030", as: "evo" },
          ],
          deck: ["BT1-048"],
        },
      },
      options,
    );
    s.perm("meat").placedByEffect = true;
    s.state.memory = 5;
    await s.ready();

    const meat = observe(s.engine).activatableEffects(s.perm("meat"))[0]!;
    expect(meat).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("meat").topCard.instanceId,
        effectKey: meat.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const choice = s.state.pendingDecision!;
    expect(choice.kind).toBe("optional");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: choice.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    options.autoDeclineOptional = true;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });

    await settle(() => s.perm("host").topCard?.cardId === "EX9-030");

    expect(s.perm("host").topCard?.cardId).toBe("EX9-030");
    expect(s.perm("host").stack[0]).toMatchObject({ cardId: "BT1-009", faceUp: false });
    expect(s.state.memory).toBe(4);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});
