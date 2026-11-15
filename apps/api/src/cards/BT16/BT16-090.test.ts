import { EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { observe } from "../../engine/testkit/observe.js";
import { setupEngine, settle, type EngineSetup } from "../../engine/testkit/harness.js";
import { compiled } from "./BT16-090.js";
import "../index.js";

const MAIN_KEY = `BT16-090/ir-${EffectTiming.OnDeclaration}-0`;

describe("BT16-090 Lui Ohwada", () => {
  it("models the inseparable costs before the optional paid breeding play", () => {
    expect(compiled.effects[1]).toMatchObject({
      trigger: "Main",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "CostGatedBlock",
          cost: { kind: "compound", costs: [{ kind: "deleteOwn" }, { kind: "trashBreeding" }] },
          actions: [
            {
              kind: "PlayWithoutCost",
              payCost: true,
              costOverride: 3,
              breeding: true,
              requiresEmpty: "breedingArea",
              optional: true,
            },
          ],
        },
      ],
    });
  });

  it("sets memory to 3 through natural turn progression", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT16-090", as: "lui" }],
        hand: ["BT1-009"],
        deck: ["BT1-010"],
      },
    });
    await s.ready();
    s.state.isFirstPlayersFirstTurn = true;
    s.state.memory = 2;
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.state.memory).toBe(3);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await turn;
  });

  it("deletes Ukkomon, trashes a breeding Digi-Egg, and plays Big Ukkomon there for 3", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT16-090", as: "lui" },
            { card: "BT16-082", as: "ukkomon" },
          ],
          breeding: { card: "BT1-001", as: "egg" },
          hand: [{ card: "BT16-083", as: "big" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 3;
    const luiId = s.inst("lui").instanceId;
    const ukkoId = s.inst("ukkomon").instanceId;
    const eggId = s.inst("egg").instanceId;
    const bigId = s.inst("big").instanceId;
    const [effect] = observe(s.engine).activatableEffects(s.perm("lui")) as { effectKey: string }[];
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("lui").topCard.instanceId,
        effectKey: effect!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(
      () => s.state.players[0]?.breeding?.topCard?.instanceId === bigId && s.state.pendingDecision === undefined,
      3000,
    );

    expect(s.state.players[0]?.battleArea.some((permanent) => permanent.topCard?.instanceId === ukkoId)).toBe(false);
    expect(s.state.players[0]?.battleArea.some((permanent) => permanent.topCard?.instanceId === luiId)).toBe(true);
    expect(s.state.players[0]?.trash.map((card) => card.instanceId)).toEqual(expect.arrayContaining([ukkoId, eggId]));
    expect(s.state.players[0]?.hand.some((card) => card.instanceId === bigId)).toBe(false);
    expect(s.state.memory).toBe(0);
  });

  it("plays Big Ukkomon for its fixed cost of 3 while Psychemon stops play cost reductions", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT16-090", as: "lui" },
            { card: "BT16-082", as: "ukkomon" },
          ],
          breeding: { card: "BT1-001", as: "egg" },
          hand: [{ card: "BT16-083", as: "big" }],
        },
        1: { battleArea: [{ card: "BT8-071", as: "psychemon" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 3;
    const bigId = s.inst("big").instanceId;
    const [effect] = observe(s.engine).activatableEffects(s.perm("lui")) as { effectKey: string }[];
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("lui").topCard.instanceId,
        effectKey: effect!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(
      () => s.state.players[0]?.breeding?.topCard?.instanceId === bigId && s.state.pendingDecision === undefined,
      3000,
    );

    expect(s.state.players[0]?.hand.some((card) => card.instanceId === bigId)).toBe(false);
    expect(s.state.players[0]?.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("ukkomon").instanceId, s.inst("egg").instanceId]),
    );
    expect(s.perm("psychemon").topCard.cardId).toBe("BT8-071");
    expect(s.state.memory).toBe(0);
  });

  it("does not delete Ukkomon when the breeding cost cannot be paid", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT16-090", as: "lui" },
          { card: "BT16-082", as: "ukkomon" },
        ],
      },
    });
    await s.ready();
    const luiId = s.inst("lui").instanceId;
    const ukkoId = s.inst("ukkomon").instanceId;
    const trashBefore = s.state.players[0]!.trash.map((card) => card.instanceId);
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("lui").topCard.instanceId,
        effectKey: MAIN_KEY,
      }),
    ).toEqual({ ok: false, reason: "illegal-target" });
    expect(s.state.players[0]?.battleArea.map((permanent) => permanent.topCard?.instanceId)).toEqual([luiId, ukkoId]);
    expect(s.state.players[0]?.trash.map((card) => card.instanceId)).toEqual(trashBefore);
    expect(s.state.memory).toBe(0);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});

describe("BT16-090 Lui Ohwada — KB Q&A rulings", () => {
  type BreedingSpec = { card: string; as: string; under?: string[] };

  function luiFixture(options: {
    breeding?: BreedingSpec;
    withUkkomon?: boolean;
    decline?: boolean;
    memory?: number;
  }): EngineSetup {
    const battleArea = [
      { card: "BT16-090", as: "lui" },
      options.withUkkomon === false ? { card: "AD1-001", as: "other" } : { card: "BT16-082", as: "ukkomon" },
    ];
    const s = setupEngine(
      {
        0: {
          battleArea,
          ...(options.breeding === undefined ? {} : { breeding: options.breeding }),
          hand: [{ card: "BT16-083", as: "big" }],
        },
      },
      options.decline === true
        ? { autoDeclineOptional: true, autoSelectCards: true }
        : { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = options.memory ?? 5;
    return s;
  }

  function activateMain(s: EngineSetup): ReturnType<EngineSetup["engine"]["applyIntent"]> {
    return s.engine.applyIntent(0, {
      type: "activateEffect",
      sourceInstanceId: s.perm("lui").topCard.instanceId,
      effectKey: MAIN_KEY,
    });
  }

  const trashIds = (s: EngineSetup): string[] => s.state.players[0]!.trash.map((card) => card.instanceId);
  const handIds = (s: EngineSetup): string[] => s.state.players[0]!.hand.map((card) => card.instanceId);

  it("can trash a Digi-Egg in the breeding area to pay the breeding cost (Q2684)", async () => {
    const s = luiFixture({ breeding: { card: "BT1-001", as: "egg" } });
    await s.ready();
    const eggId = s.inst("egg").instanceId;
    const bigId = s.inst("big").instanceId;

    expect(activateMain(s)).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.instanceId === bigId && !s.state.pendingDecision, 3000);

    expect(trashIds(s)).toContain(eggId);
    expect(s.state.players[0]!.breeding?.topCard?.cardId).toBe("BT16-083");
    expect(s.state.memory).toBe(2);
  });

  it("cannot play Big Ukkomon by paying only one of the two costs (Q2685)", async () => {
    const onlyUkkomon = luiFixture({});
    await onlyUkkomon.ready();
    const ukkomonId = onlyUkkomon.inst("ukkomon").instanceId;
    expect(activateMain(onlyUkkomon)).toEqual({ ok: false, reason: "illegal-target" });
    expect(onlyUkkomon.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === ukkomonId)).toBe(true);
    expect(handIds(onlyUkkomon)).toContain(onlyUkkomon.inst("big").instanceId);

    const onlyBreeding = luiFixture({ withUkkomon: false, breeding: { card: "BT1-001", as: "egg" } });
    await onlyBreeding.ready();
    expect(activateMain(onlyBreeding)).toEqual({ ok: false, reason: "illegal-target" });
    expect(onlyBreeding.state.players[0]!.breeding?.topCard?.instanceId).toBe(onlyBreeding.inst("egg").instanceId);
    expect(handIds(onlyBreeding)).toContain(onlyBreeding.inst("big").instanceId);

    const both = luiFixture({ breeding: { card: "BT1-001", as: "egg" } });
    await both.ready();
    expect(activateMain(both)).toEqual({ ok: true });
    await settle(
      () => both.state.players[0]!.breeding?.topCard?.cardId === "BT16-083" && !both.state.pendingDecision,
      3000,
    );
    expect(handIds(both)).not.toContain(both.inst("big").instanceId);
  });

  it("may decline to play Big Ukkomon after paying both costs (Q2686)", async () => {
    const s = luiFixture({ breeding: { card: "BT1-001", as: "egg" }, decline: true });
    await s.ready();
    const ukkomonId = s.inst("ukkomon").instanceId;
    const eggId = s.inst("egg").instanceId;
    const bigId = s.inst("big").instanceId;

    expect(activateMain(s)).toEqual({ ok: true });
    await settle(
      () => trashIds(s).includes(eggId) && trashIds(s).includes(ukkomonId) && !s.state.pendingDecision,
      3000,
    );

    expect(s.decisions.some(({ req }) => req.kind === "optional" && req.sourceCardId === "BT16-090")).toBe(true);
    expect(handIds(s)).toContain(bigId);
    expect(s.state.players[0]!.breeding).toBeUndefined();
    expect(s.state.memory).toBe(5);
  });

  it("processes <Overflow> when the trashed breeding Digimon is an ACE (Q2687)", async () => {
    const nonAce = luiFixture({ breeding: { card: "AD1-001", as: "plain" }, decline: true });
    await nonAce.ready();
    const plainId = nonAce.inst("plain").instanceId;
    expect(activateMain(nonAce)).toEqual({ ok: true });
    await settle(() => trashIds(nonAce).includes(plainId) && !nonAce.state.pendingDecision, 3000);
    expect(nonAce.state.memory).toBe(5);

    const s = luiFixture({ breeding: { card: "BT14-014", as: "ace" }, decline: true });
    await s.ready();
    const aceId = s.inst("ace").instanceId;

    expect(activateMain(s)).toEqual({ ok: true });
    await settle(() => trashIds(s).includes(aceId) && !s.state.pendingDecision, 3000);

    expect(s.state.players[0]!.breeding).toBeUndefined();
    expect(handIds(s)).toContain(s.inst("big").instanceId);
    expect(s.state.memory).toBe(5 - 3);
  });

  it("processes <Overflow> when an ACE is among the trashed breeding Digimon's digivolution cards (Q2688)", async () => {
    const nonAceUnder = luiFixture({ breeding: { card: "AD1-001", as: "host", under: ["BT1-001"] }, decline: true });
    await nonAceUnder.ready();
    const plainHostId = nonAceUnder.inst("host").instanceId;
    expect(activateMain(nonAceUnder)).toEqual({ ok: true });
    await settle(() => trashIds(nonAceUnder).includes(plainHostId) && !nonAceUnder.state.pendingDecision, 3000);
    expect(nonAceUnder.state.memory).toBe(5);

    const s = luiFixture({ breeding: { card: "AD1-001", as: "host", under: ["BT14-014"] }, decline: true });
    await s.ready();
    const hostId = s.inst("host").instanceId;
    const aceUnder = s.perm("host").stack.find((card) => card.cardId === "BT14-014")!;

    expect(activateMain(s)).toEqual({ ok: true });
    await settle(() => trashIds(s).includes(hostId) && !s.state.pendingDecision, 3000);

    expect(trashIds(s)).toContain(aceUnder.instanceId);
    expect(s.state.players[0]!.breeding).toBeUndefined();
    expect(s.state.memory).toBe(5 - 3);
  });
});
