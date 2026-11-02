import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { drainMicrotasks, setupEngine, settle, type EngineSetup } from "../../engine/testkit/harness.js";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import "../index.js";

const FILLER = ["BT1-009", "BT1-013", "BT1-009", "BT1-013", "BT1-009", "BT1-013"];
const SECURITY = ["BT1-009", "BT1-013", "BT1-009"];

const boardIds = (s: EngineSetup, seat: 0 | 1 = 0): string[] =>
  s.state.players[seat]!.battleArea.map((permanent) => permanent.topCard!.instanceId);

describe("BT19-090 Meteor Rock Soul — catalog and IR", () => {
  it("matches the printed catalog record", () => {
    expect(getCardDefinition("BT19-090")).toMatchObject({
      cardId: "BT19-090",
      nameEn: "Meteor Rock Soul",
      colors: ["Red"],
      kinds: ["Option"],
      playCost: 3,
      dp: 0,
      evoCosts: [],
      types: ["Xros Heart"],
      maxCountInDeck: 4,
    });
    const definition = getCardDefinition("BT19-090")!;
    expect(definition.effectText).toContain("\u00a0");
    expect(definition.effectText!.replace(/\u00a0/g, " ")).toBe(
      "[Main] Activate 1 of the following effects:\n" +
        "\u30fbYou may play 1 Digimon card with the [Xros Heart] trait and 4000 DP or less from under your Tamer without paying the cost.\n" +
        "\u30fbBy unsuspending 1 of your [Shoutmon EX6] and 1 of your [ShootingStarmon], attack a player with 1 of your Digimon.",
    );
    expect(definition.securityEffectText!.replace(/\u00a0/g, " ")).toBe(
      "[Security] You may play 1 Digimon card with the [Xros Heart] trait and 4000 DP or less from under your Tamer without paying the cost.",
    );
  });

  it("compiles the modal [Main] and the [Security] copy of branch A", () => {
    const card = runtimeCompiledCard("BT19-090");
    expect(card).toMatchObject({ coverage: "full", residual: [] });
    expect(card?.effects).toMatchObject([
      {
        trigger: "Main",
        actions: [
          {
            kind: "Modal",
            choose: 1,
            options: [
              [
                {
                  kind: "PlayWithoutCost",
                  payCost: false,
                  optional: true,
                  from: ["underTamers"],
                  target: {
                    count: 1,
                    filter: {
                      controller: "mine",
                      zone: "underTamers",
                      kind: ["Digimon"],
                      nameOrTrait: [{ tokens: ["Xros Heart"], match: "trait" }],
                      dp: { op: "lte", value: 4000 },
                    },
                  },
                },
              ],
              [
                {
                  kind: "Attack",
                  attackTargetScope: "player",
                  cost: {
                    kind: "unsuspendNamed",
                    optional: true,
                    targets: [
                      { count: 1, filter: { nameOrTrait: [{ tokens: ["Shoutmon EX6"], match: "nameExact" }] } },
                      { count: 1, filter: { nameOrTrait: [{ tokens: ["ShootingStarmon"], match: "nameExact" }] } },
                    ],
                  },
                },
              ],
            ],
          },
        ],
      },
      { trigger: "Security", isSecurity: true, actions: [{ kind: "PlayWithoutCost", from: ["underTamers"] }] },
    ]);
    const modal = card!.effects[0]!.actions[0] as {
      options: { cost?: { targets: { filter: { suspended?: boolean } }[] } }[][];
    };
    const cost = modal.options[1]![0]!.cost;
    expect(cost?.targets.map((target) => target.filter.suspended)).toEqual([true, true]);
  });
});

describe("BT19-090 Meteor Rock Soul — [Main] branch A: play from under your Tamer", () => {
  it("plays the qualifying [Xros Heart] under-card free and leaves both near-misses under the Tamer", async () => {
    const prefer: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT19-090", as: "option" }, "BT1-009"],
          battleArea: [
            {
              card: "BT10-087",
              as: "tamer",
              under: [
                { card: "BT10-009", as: "tooBig" },
                { card: "BT1-009", as: "wrongTrait" },
                { card: "BT10-008", as: "shoutmon" },
              ],
            },
          ],
          deck: [...FILLER],
          security: [...SECURITY],
        },
        1: { deck: [...FILLER], security: [...SECURITY] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, preferInstanceIds: prefer },
    );
    s.state.memory = 3;
    prefer.push(s.inst("shoutmon").instanceId);
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard!.instanceId === s.inst("shoutmon").instanceId,
      ),
    );
    await drainMicrotasks();

    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("option").instanceId);
    expect(boardIds(s).sort()).toEqual([s.perm("tamer").topCard!.instanceId, s.inst("shoutmon").instanceId].sort());
    expect(s.perm("tamer").stack.map((card) => card.instanceId)).toEqual([
      s.inst("tooBig").instanceId,
      s.inst("wrongTrait").instanceId,
    ]);
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.events.find((event) => event.kind === "actionRejected")).toBeUndefined();
  });

  it("plays nothing when only near-miss cards sit under the Tamer", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT19-090", as: "option" }, "BT1-009"],
          battleArea: [
            {
              card: "BT10-087",
              as: "tamer",
              under: [
                { card: "BT10-009", as: "tooBig" },
                { card: "BT1-009", as: "wrongTrait" },
              ],
            },
          ],
          deck: [...FILLER],
          security: [...SECURITY],
        },
        1: { deck: [...FILLER], security: [...SECURITY] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("option").instanceId));
    await drainMicrotasks();

    expect(s.state.memory).toBe(0);
    expect(boardIds(s)).toEqual([s.perm("tamer").topCard!.instanceId]);
    expect(s.perm("tamer").stack.map((card) => card.instanceId)).toEqual([
      s.inst("tooBig").instanceId,
      s.inst("wrongTrait").instanceId,
    ]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("refuses the play outright with no red permanent on the caster's board", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT19-090", as: "option" }, "BT1-009"],
          battleArea: [{ card: "BT10-034", as: "yellow" }],
          deck: [...FILLER],
          security: [...SECURITY],
        },
        1: { deck: [...FILLER], security: [...SECURITY] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: false,
      reason: "color-requirement-unmet",
    });
    expect(s.state.memory).toBe(3);
  });
});

describe("BT19-090 Meteor Rock Soul — [Main] branch B: unsuspend two named Digimon, then attack", () => {
  function branchBFixture(opts: { starmon?: string; starmonSuspended?: boolean; ex6Suspended?: boolean }): {
    s: EngineSetup;
    prefer: string[];
  } {
    const prefer: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT19-090", as: "option" }, "BT1-009"],
          battleArea: [
            { card: "BT19-014", as: "ex6", suspended: opts.ex6Suspended ?? true },
            ...(opts.starmon === undefined
              ? []
              : [{ card: opts.starmon, as: "starmon", suspended: opts.starmonSuspended ?? true }]),
            { card: "BT1-013", as: "attacker", dp: 20_000 },
          ],
          deck: [...FILLER],
          security: [...SECURITY],
        },
        1: { deck: [...FILLER], security: [...SECURITY] },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoChooseOption: true,
        preferOptionIndex: 1,
        preferInstanceIds: prefer,
      },
    );
    s.state.memory = 3;
    prefer.push(s.perm("attacker").topCard!.instanceId);
    return { s, prefer };
  }

  it("unsuspends [Shoutmon EX6] and [ShootingStarmon] and drives a real attack on the player", async () => {
    const { s } = branchBFixture({ starmon: "BT19-035" });
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.security.length === SECURITY.length - 1);
    await drainMicrotasks();

    expect(s.perm("ex6").isSuspended).toBe(false);
    expect(s.perm("starmon").isSuspended).toBe(false);
    expect(s.perm("attacker").isSuspended).toBe(true);
    expect(s.state.players[1]!.security).toHaveLength(SECURITY.length - 1);
    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("option").instanceId);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("accepts a second card printed [ShootingStarmon] (BT5-039), the same exact name", async () => {
    const { s } = branchBFixture({ starmon: "BT5-039" });
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.security.length === SECURITY.length - 1);
    await drainMicrotasks();
    expect(s.perm("ex6").isSuspended).toBe(false);
    expect(s.perm("starmon").isSuspended).toBe(false);
    expect(s.perm("attacker").isSuspended).toBe(true);
  });

  it("Q3159: an already-unsuspended [ShootingStarmon] cannot pay half the cost", async () => {
    const { s } = branchBFixture({ starmon: "BT19-035", starmonSuspended: false });
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await drainMicrotasks();

    expect(s.perm("ex6").isSuspended).toBe(true);
    expect(s.perm("starmon").isSuspended).toBe(false);
    expect(s.perm("attacker").isSuspended).toBe(false);
    expect(s.state.players[1]!.security).toHaveLength(SECURITY.length);
    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("option").instanceId);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("refuses a name near-miss: a suspended [Starmon] is not a [ShootingStarmon]", async () => {
    const { s } = branchBFixture({ starmon: "BT9-035" });
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await drainMicrotasks();

    expect(s.perm("ex6").isSuspended).toBe(true);
    expect(s.perm("starmon").isSuspended).toBe(true);
    expect(s.perm("attacker").isSuspended).toBe(false);
    expect(s.state.players[1]!.security).toHaveLength(SECURITY.length);
  });

  it("refuses when there is no [ShootingStarmon] at all", async () => {
    const { s } = branchBFixture({});
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await drainMicrotasks();

    expect(s.perm("ex6").isSuspended).toBe(true);
    expect(s.perm("attacker").isSuspended).toBe(false);
    expect(s.state.players[1]!.security).toHaveLength(SECURITY.length);
  });
});

describe("BT19-090 Meteor Rock Soul — [Security]", () => {
  it("plays the defender's [Xros Heart] under-card free out of a real security check", async () => {
    const prefer: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-013", as: "attacker", dp: 20_000 }],
          deck: [...FILLER],
          security: [...SECURITY],
        },
        1: {
          battleArea: [
            {
              card: "BT10-087",
              as: "tamer",
              under: [
                { card: "BT10-009", as: "tooBig" },
                { card: "BT10-008", as: "shoutmon" },
              ],
            },
          ],
          deck: [...FILLER],
          security: [{ card: "BT19-090", as: "option" }, "BT1-009", "BT1-013"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, preferInstanceIds: prefer },
    );
    s.state.memory = 3;
    prefer.push(s.inst("shoutmon").instanceId);
    await s.ready();
    const memoryBefore = s.state.memory;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[1]!.battleArea.some(
        (permanent) => permanent.topCard!.instanceId === s.inst("shoutmon").instanceId,
      ),
    );
    await drainMicrotasks();

    expect(boardIds(s, 1).sort()).toEqual([s.perm("tamer").topCard!.instanceId, s.inst("shoutmon").instanceId].sort());
    expect(s.perm("tamer").stack.map((card) => card.instanceId)).toEqual([s.inst("tooBig").instanceId]);
    expect(s.state.memory).toBe(memoryBefore);
    expect(s.state.players[1]!.security.map((card) => card.cardId)).toEqual(["BT1-009", "BT1-013"]);
    expect(s.state.players[1]!.hand).toHaveLength(0);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});
