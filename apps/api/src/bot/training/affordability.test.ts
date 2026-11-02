import { describe, expect, it } from "vitest";
import { $changes, Decoder, Encoder } from "@colyseus/schema";
import { GameState } from "@aegis/shared";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { mainActions } from "./actions.js";
import "../../cards/index.js";

describe("training play affordability", () => {
  it.each(["BT10-087", "BT10-088", "BT11-095"])(
    "excludes unaffordable plays with an unrelated DigiXros material provider (%s)",
    async (card) => {
      const setup = setupEngine({
        0: { hand: [{ card: "BT5-112", as: "played" }], battleArea: [{ card }] },
      });
      setup.state.memory = 1;
      await setup.ready();
      const intent = { type: "playCard" as const, instanceId: setup.inst("played").instanceId };
      const before = setup.state.toJSON();
      expect(mainActions(setup.engine, 0).map((action) => action.intent)).not.toContainEqual(intent);
      expect(setup.engine.applyIntent(0, intent)).toEqual({ ok: false, reason: "insufficient-memory" });
      expect(setup.state.toJSON()).toEqual(before);
      expect(setup.decisions).toEqual([]);
    },
  );

  it("preserves a payable sacrifice with an existing resident sacrifice effect", async () => {
    const setup = setupEngine(
      {
        0: {
          hand: [{ card: "BT25-076", as: "played" }],
          battleArea: [
            { card: "BT25-076", as: "resident", under: ["EX9-005"] },
            { card: "EX9-047", as: "payment", under: [{ card: "EX9-005", as: "egg" }] },
          ],
        },
        1: { security: ["EX9-046", "EX9-046"], deck: ["EX9-046"] },
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    setup.state.memory = 1;
    await setup.ready();
    const intent = { type: "playCard" as const, instanceId: setup.inst("played").instanceId };
    const before = setup.state.toJSON();
    expect(mainActions(setup.engine, 0).map((action) => action.intent)).toContainEqual(intent);
    expect(setup.state.toJSON()).toEqual(before);
    expect(setup.engine.applyIntent(0, intent)).toEqual({ ok: true });
    await settle(() => setup.engine.mainVerbContinuationsInFlight === 0);
    expect(setup.state.players[0]!.battleArea.map((unit) => unit.topCard.instanceId).sort()).toEqual(
      [setup.inst("resident").instanceId, intent.instanceId].sort(),
    );
    // The fixture accepts Eyesmon's subsequent deletion retrieval as well as the payment.
    expect(setup.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([setup.inst("egg").instanceId]);
    expect(setup.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([setup.inst("payment").instanceId]);
    expect(setup.events).toContainEqual({ kind: "memoryChanged", from: 1, to: -4, reason: "playCard" });
    expect(setup.events.filter((event) => event.kind === "actionRejected")).toEqual([]);
    expect(setup.state.pendingDecision).toBeUndefined();
  });

  it.each(["BT25-076", "EX9-057"])(
    "excludes %s when both own and resident sacrifice reductions have no payment",
    async (card) => {
      const setup = setupEngine({
        0: {
          hand: [{ card, as: "played" }],
          battleArea: [{ card: "BT25-076", under: ["EX9-005", "EX9-046", "EX9-048", "EX9-054"] }, { card: "EX1-066" }],
        },
      });
      setup.state.memory = 1;
      await setup.ready();
      const intent = { type: "playCard" as const, instanceId: setup.inst("played").instanceId };
      const before = setup.state.toJSON();
      expect(mainActions(setup.engine, 0).map((action) => action.intent)).not.toContainEqual(intent);
      expect(setup.engine.applyIntent(0, intent)).toEqual({ ok: false, reason: "insufficient-memory" });
      expect(setup.state.toJSON()).toEqual(before);
      expect(setup.decisions).toEqual([]);
    },
  );

  it.each([false, true].flatMap((interactive) => [false, true].map((matches) => ({ interactive, matches }))))(
    "checks subscription applicability without consuming it (interactive=$interactive matches=$matches)",
    async ({ interactive, matches }) => {
      const setup = setupEngine({
        0: { hand: [{ card: "EX9-057", as: "played" }], battleArea: [{ card: "EX9-047", as: "source" }] },
      });
      setup.state.memory = 0;
      await setup.ready();
      let activations = 0;
      const key = "affordability/applicable";
      setup.engine.subTriggers.subscribeReplacement({
        event: "wouldBePlayed",
        mode: "reduceCost",
        amount: 5,
        description: "target-specific play reduction",
        sourcePermanentId: setup.perm("source").permanentId,
        controllerSeat: 0,
        oncePerTurnKey: key,
        consumeOnActivate: true,
        appliesTo: (target, origin) =>
          matches &&
          target.controllerSeat === 0 &&
          target.topCard.cardId === "EX9-057" &&
          (!interactive || origin === "hand"),
        ...(interactive
          ? {
              activate: async () => {
                activations++;
                return true;
              },
            }
          : {}),
      });
      const encoder = new Encoder(setup.state);
      const clients = ([0, 1] as const).map((seat) => ({
        view: setup.engine.makeStateView(seat)!,
        decoder: new Decoder(new GameState()),
      }));
      const project = (full: boolean) => {
        const iterator = { offset: 0 };
        if (full) encoder.encodeAll(iterator);
        else encoder.encode(iterator);
        const sharedOffset = iterator.offset;
        for (const { view, decoder } of clients) {
          iterator.offset = sharedOffset;
          decoder.decode(
            full
              ? encoder.encodeAllView(view, sharedOffset, iterator)
              : encoder.encodeView(view, sharedOffset, iterator),
          );
        }
        encoder.discardChanges();
        return clients.map(({ decoder }) => decoder.state.toJSON());
      };
      const projections = project(true);
      expect(clients[0]!.decoder.state.players[0]!.hand[0]!.cardId).toBe("EX9-057");
      expect(clients[1]!.decoder.state.players[0]!.hand).toHaveLength(0);
      const before = setup.state.toJSON();
      const handCard = setup.inst("played");
      const parent = handCard[$changes]!.parent;
      const root = handCard[$changes]!.root;
      const intent = { type: "playCard" as const, instanceId: setup.inst("played").instanceId };
      for (let query = 0; query < 2; query++) {
        expect(mainActions(setup.engine, 0).some((action) => action.sourceId === intent.instanceId)).toBe(matches);
        expect(setup.engine.tracker.count(key, "replacement")).toBe(0);
        expect(activations).toBe(0);
        expect(setup.state.toJSON()).toEqual(before);
        expect(handCard[$changes]!.parent).toBe(parent);
        expect(handCard[$changes]!.root).toBe(root);
        expect(project(false)).toEqual(projections);
      }
      expect(setup.engine.applyIntent(0, intent)).toEqual(
        matches ? { ok: true } : { ok: false, reason: "insufficient-memory" },
      );
      await settle(() => setup.engine.mainVerbContinuationsInFlight === 0);
      expect(activations).toBe(matches && interactive ? 1 : 0);
      expect(setup.engine.tracker.count(key, "replacement")).toBe(matches ? 1 : 0);
      expect(setup.events.filter((event) => event.kind === "actionRejected")).toEqual([]);
      expect(setup.events.filter((event) => event.kind === "memoryChanged" && event.reason === "playCard")).toEqual(
        matches ? [{ kind: "memoryChanged", from: 0, to: -10, reason: "playCard" }] : [],
      );
    },
  );

  it.each(["spent", "destination", "seat", "origin"])(
    "excludes an unavailable interactive subscription (%s)",
    async (mismatch) => {
      const setup = setupEngine({
        0: { hand: [{ card: "EX9-057", as: "played" }], battleArea: [{ card: "EX9-047", as: "source" }] },
      });
      setup.state.memory = 0;
      await setup.ready();
      const key = "affordability/unavailable";
      let activations = 0;
      setup.engine.subTriggers.subscribeReplacement({
        event: "wouldBePlayed",
        mode: "reduceCost",
        amount: 5,
        description: "unavailable play reduction",
        sourcePermanentId: setup.perm("source").permanentId,
        controllerSeat: mismatch === "seat" ? 1 : 0,
        oncePerTurnKey: key,
        appliesTo: (target, origin) =>
          target.controllerSeat === 0 && origin === (mismatch === "origin" ? "trash" : "hand"),
        intoMatches: () => mismatch !== "destination",
        activate: async () => {
          activations++;
          return true;
        },
      });
      if (mismatch === "spent") setup.engine.tracker.register(key, "replacement");
      const before = setup.state.toJSON();
      const intent = { type: "playCard" as const, instanceId: setup.inst("played").instanceId };
      expect(mainActions(setup.engine, 0).map((action) => action.intent)).not.toContainEqual(intent);
      expect(setup.engine.applyIntent(0, intent)).toEqual({ ok: false, reason: "insufficient-memory" });
      expect(setup.state.toJSON()).toEqual(before);
      expect(activations).toBe(0);
      expect(setup.engine.tracker.count(key, "replacement")).toBe(mismatch === "spent" ? 1 : 0);
      expect(setup.decisions).toEqual([]);
    },
  );

  it.each(["EX8-074", "BT25-020"])("ignores an unrelated resident self reducer (%s)", async (resident) => {
    const setup = setupEngine({
      0: {
        hand: [{ card: "EX9-057", as: "played" }],
        battleArea: [resident, "EX9-057"],
      },
    });
    setup.state.memory = 0;
    await setup.ready();
    const before = setup.state.toJSON();
    const intent = { type: "playCard" as const, instanceId: setup.inst("played").instanceId };
    expect(mainActions(setup.engine, 0).map((action) => action.intent)).not.toContainEqual(intent);
    expect(setup.state.toJSON()).toEqual(before);
    expect(setup.engine.applyIntent(0, intent)).toEqual({ ok: false, reason: "insufficient-memory" });
    expect(setup.decisions).toEqual([]);
  });

  it.each([false, true])("excludes a sacrifice play without an eligible stack (board present=%s)", async (present) => {
    const setup = setupEngine({
      0: {
        hand: [{ card: "BT25-076", as: "played" }],
        battleArea: present ? [{ card: "EX9-048", as: "ineligible" }] : [],
      },
    });
    setup.state.memory = 0;
    await setup.ready();
    const before = setup.state.toJSON();
    const intent = { type: "playCard" as const, instanceId: setup.inst("played").instanceId };
    expect(mainActions(setup.engine, 0).map((action) => action.intent)).not.toContainEqual(intent);
    expect(setup.state.toJSON()).toEqual(before);
    expect(setup.engine.applyIntent(0, intent)).toEqual({ ok: false, reason: "insufficient-memory" });
    expect(setup.decisions).toEqual([]);
  });

  it("preserves a self reducer combined with a passive pay-time subscription", async () => {
    const setup = setupEngine(
      {
        0: { hand: [{ card: "BT9-112", as: "played" }] },
        1: { battleArea: ["BT6-090", "BT6-090", "BT6-090"] },
      },
      { autoDeclineOptional: true },
    );
    setup.state.memory = 0;
    await setup.ready();
    const key = "affordability/passive";
    setup.engine.subTriggers.subscribeReplacement({
      event: "wouldBePlayed",
      mode: "reduceCost",
      amount: 1,
      description: "one-shot passive play reduction",
      oncePerTurnKey: key,
      consumeOnActivate: true,
      appliesTo: (target) => target.controllerSeat === 0,
    });
    const before = setup.state.toJSON();
    const intent = { type: "playCard" as const, instanceId: setup.inst("played").instanceId };
    expect(mainActions(setup.engine, 0).map((action) => action.intent)).toContainEqual(intent);
    expect(mainActions(setup.engine, 0).map((action) => action.intent)).toContainEqual(intent);
    expect(setup.engine.tracker.count(key, "replacement")).toBe(0);
    expect(setup.state.toJSON()).toEqual(before);
    expect(setup.engine.applyIntent(0, intent)).toEqual({ ok: true });
    await settle(() => setup.engine.mainVerbContinuationsInFlight === 0);
    expect(setup.events).toContainEqual({ kind: "memoryChanged", from: 0, to: -10, reason: "playCard" });
    expect(setup.engine.tracker.count(key, "replacement")).toBe(1);
    expect(setup.events.filter((event) => event.kind === "actionRejected")).toEqual([]);
  });

  it.each([3, 4])("checks DeathXmon's automatic reduction with %i opposing Tamers", async (count) => {
    const setup = setupEngine({
      0: { hand: [{ card: "BT9-112", as: "played" }] },
      1: { battleArea: Array.from({ length: count }, () => "BT6-090") },
    });
    setup.state.memory = 0;
    await setup.ready();
    const before = setup.state.toJSON();
    const actions = mainActions(setup.engine, 0);
    expect(
      actions.some(
        (action) => action.intent.type === "playCard" && action.sourceId === setup.inst("played").instanceId,
      ),
    ).toBe(count === 4);
    expect(setup.state.toJSON()).toEqual(before);
    expect(setup.decisions).toEqual([]);
  });

  it("preserves a sacrifice route handled by an interactive BeforePayCost effect", async () => {
    const setup = setupEngine({
      0: {
        hand: [{ card: "BT25-076", as: "played" }],
        battleArea: [{ card: "EX9-047", under: ["EX9-005"] }],
      },
    });
    setup.state.memory = 0;
    await setup.ready();
    expect(mainActions(setup.engine, 0).map((action) => action.intent)).toContainEqual({
      type: "playCard",
      instanceId: setup.inst("played").instanceId,
    });
    expect(setup.state.pendingDecision).toBeUndefined();
  });

  it.each([0, 1])("excludes an eleven-cost play with only %i suspension payers", async (count) => {
    const setup = setupEngine({
      0: {
        hand: [{ card: "EX8-074", as: "played" }],
        battleArea: Array.from({ length: count }, () => "EX9-047"),
        breeding: { card: "EX9-005" },
      },
      1: { battleArea: [{ card: "EX9-048", suspended: true }] },
    });
    setup.state.memory = 0;
    await setup.ready();
    const intent = { type: "playCard" as const, instanceId: setup.inst("played").instanceId };
    expect(mainActions(setup.engine, 0).map((action) => action.intent)).not.toContainEqual(intent);
    expect(setup.engine.applyIntent(0, intent)).toEqual({ ok: false, reason: "insufficient-memory" });
    expect(setup.state.pendingDecision).toBeUndefined();
  });

  it("preserves and pays the two-Digimon suspension route", async () => {
    const setup = setupEngine(
      {
        0: {
          hand: [{ card: "EX8-074", as: "played" }],
          battleArea: [
            { card: "EX9-047", as: "own" },
            { card: "EX9-048", as: "second" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    setup.state.memory = 0;
    await setup.ready();
    const intent = { type: "playCard" as const, instanceId: setup.inst("played").instanceId };
    expect(mainActions(setup.engine, 0).map((action) => action.intent)).toContainEqual(intent);
    expect(setup.engine.applyIntent(0, intent)).toEqual({ ok: true });
    await settle(() => setup.engine.mainVerbContinuationsInFlight === 0);
    expect(setup.state.players[0]!.battleArea.some((unit) => unit.topCard.instanceId === intent.instanceId)).toBe(true);
    expect(setup.perm("own").isSuspended).toBe(true);
    expect(setup.perm("second").isSuspended).toBe(true);
    expect(setup.events.filter((event) => event.kind === "actionRejected")).toEqual([]);
  });
});
