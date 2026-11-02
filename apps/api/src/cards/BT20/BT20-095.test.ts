import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT20-095.js";
import "./index.js";
import "./BT20-010.js";
import "./BT20-049.js";
import "../ST1/ST1-16.js";

describe("BT20-095 Fellowship of Hope's Keepers", () => {
  it("reveals and places itself for the Main effect", () => {
    expect(compiled.effects.find((entry) => entry.trigger === "Main" && !entry.keywords)).toMatchObject({
      actions: [{ kind: "RevealAdd", revealCount: 3 }, { kind: "PlaceInBattleAreaSelf" }],
    });
  });

  it("only offers the breeding-area digivolution as Delay", () => {
    const effect = compiled.effects.find((entry) => entry.trigger === "AllTurns");
    const watcher = effect?.actions[0];
    const delay = watcher?.kind === "SubTrigger" ? watcher : undefined;
    expect(delay).toMatchObject({
      actions: [
        {
          kind: "Digivolve",
          target: { fromSelectionRef: "fellowshipMoved" },
          into: { nameOrTrait: [{ tokens: ["Chronicle"], match: "trait" }] },
          cost: {
            kind: "moveToBattleArea",
            target: {
              filter: { zone: "breeding", levelComparison: { op: "gte", value: 3 } },
              bindAs: "fellowshipMoved",
            },
          },
          abortOnDecline: true,
        },
      ],
    });
    const movementCost = delay?.actions[0]?.cost;
    expect(typeof movementCost === "object" ? movementCost.target?.filter : undefined).not.toHaveProperty(
      "nameOrTrait",
    );
    expect(compiled.effects.find((entry) => entry.trigger === "AllTurns")).toMatchObject({
      keywords: [{ keyword: "Delay" }],
      actions: [
        {
          kind: "SubTrigger",
          event: "onDeletionOf",
          actions: [{ kind: "Digivolve", payCost: false, optional: true }],
        },
      ],
    });
    expect(compiled.effects.find((entry) => entry.trigger === "AllTurns")?.actions).toHaveLength(1);
  });

  it("restricts the Security play to Chronicle Digimon and Tamers, not Options", () => {
    const security = compiled.effects.find((entry) => entry.trigger === "Security");
    const play = security?.actions.find((action) => action.kind === "PlayWithoutCost");
    expect(play).toMatchObject({
      kind: "PlayWithoutCost",
      target: {
        filter: {
          kind: ["Digimon", "Tamer"],
          playCostLte: 5,
          nameOrTrait: [{ tokens: ["Chronicle"], match: "trait" }],
        },
      },
    });
  });

  it("naturally reveals three cards, adds one Chronicle, and places itself", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT20-095", as: "option" }],
          battleArea: ["BT20-047"],
          deck: ["BT20-010", "BT20-047", "BT20-049"],
        },
      },
      { autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 3;
    const optionId = s.inst("option").instanceId;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === optionId));

    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toContain("BT20-010");
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === optionId)).toBe(true);
    expect(s.state.players[0]!.deck).toHaveLength(2);
    expect(s.state.memory).toBe(0);
  });

  it.each([
    [0, "BT20-047", "BT20-049"],
    [1, "BT20-047", "BT20-049"],
  ] as const)("publicly honors the reveal remainder top/bottom choice (option %s)", async (choice, first, second) => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT20-095", as: "option" }],
          battleArea: ["BT20-047"],
          deck: ["BT20-010", first, second, "BT1-010"],
        },
      },
      { autoSelectCards: true, autoChooseOption: true, preferOptionIndex: choice },
    );
    s.state.memory = 3;
    const optionId = s.inst("option").instanceId;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === optionId));
    const ids = s.state.players[0]!.deck.map((card) => card.cardId);
    const observed = choice === 0 ? ids.slice(0, 2) : ids.slice(-2);
    expect(observed).toEqual([first, second]);
  });

  it.each([true, false])(
    "public Security may play a cost-5-or-less Chronicle from hand before placement (%s)",
    async (accept) => {
      const s = setupEngine(
        {
          0: { battleArea: [{ card: "BT20-010", as: "attacker" }] },
          1: {
            security: [{ card: "BT20-095", as: "option" }],
            hand: [{ card: "BT20-048", as: "chronicle" }],
            deck: ["BT1-010", "BT1-010", "BT1-010"],
          },
        },
        { autoAcceptOptional: accept, autoDeclineOptional: !accept, autoSelectCards: true },
      );
      const optionId = s.inst("option").instanceId;
      await s.ready();
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("attacker").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.instanceId === optionId));
      expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT20-048")).toBe(accept);
      expect(s.state.players[1]!.hand.some((card) => card.cardId === "BT20-048")).toBe(!accept);
      expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.instanceId === optionId)).toBe(true);
    },
  );

  it("public Security accepts Chronicle play cost 5 but refuses a cost-7 Chronicle", async () => {
    for (const [candidate, accepted] of [
      ["BT20-012", true],
      ["BT20-015", false],
    ] as const) {
      const s = setupEngine(
        {
          0: { battleArea: [{ card: "BT20-010", as: "attacker" }] },
          1: {
            security: [{ card: "BT20-095", as: "option" }],
            hand: [{ card: candidate, as: "candidate" }],
            deck: ["BT1-010", "BT1-010", "BT1-010"],
          },
        },
        { autoAcceptOptional: true, autoDeclineOptional: false, autoSelectCards: true },
      );
      const optionId = s.inst("option").instanceId;
      await s.ready();
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("attacker").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[1]!.battleArea.some((p) => p.topCard.instanceId === optionId));
      expect(s.state.players[1]!.battleArea.some((p) => p.topCard.cardId === candidate)).toBe(accepted);
      expect(s.state.players[1]!.hand.some((card) => card.instanceId === s.inst("candidate").instanceId)).toBe(
        !accepted,
      );
    }
  });

  it("does not play a non-Digimon Chronicle Option from hand through Security", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT20-010", as: "attacker" }] },
        1: {
          security: [{ card: "BT20-095", as: "option" }],
          hand: [{ card: "BT20-095", as: "chronicleOption" }],
          deck: ["BT1-010", "BT1-010", "BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const optionId = s.inst("option").instanceId;
    const chronicleOptionId = s.inst("chronicleOption").instanceId;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.instanceId === optionId));
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.instanceId === chronicleOptionId)).toBe(
      false,
    );
    expect(s.state.players[1]!.hand.some((card) => card.instanceId === chronicleOptionId)).toBe(true);
  });

  it.each(["hand", "trash", "refuse", "wrongTrait", "egg"] as const)(
    "immediately resolves the prior-turn Delay after public deletion: %s",
    async (route) => {
      const accepted = route === "hand" || route === "trash";
      // An egg base has no legal digivolution, but the Delay may still be paid for no effect (Q5710).
      const delayPaid = accepted || route === "egg";
      const destinationZone = route === "trash" ? "trash" : "hand";
      const s = setupEngine(
        {
          0: {
            breeding: { card: route === "egg" ? "BT1-001" : "BT1-009", as: "breedingSource" },
            battleArea: [{ card: route === "wrongTrait" ? "BT20-047" : "BT20-048", as: "victim" }],
            hand: [
              { card: "BT20-095", as: "option" },
              ...(destinationZone === "hand"
                ? [{ card: route === "egg" ? "BT20-010" : "BT20-012", as: "destination" }]
                : []),
            ],
            ...(destinationZone === "trash" ? { trash: [{ card: "BT20-012", as: "destination" }] } : {}),
            deck: Array.from({ length: 7 }, () => "BT1-010"),
          },
          1: {
            battleArea: [{ card: "BT1-009", as: "redSource" }],
            hand: [{ card: "ST1-16", as: "delete" }],
            deck: ["BT1-010", "BT1-010"],
          },
        },
        {
          autoAcceptOptional: route !== "refuse",
          autoDeclineOptional: route === "refuse",
          autoSelectCards: true,
          autoChooseOption: true,
        },
      );
      const optionId = s.inst("option").instanceId;
      const victimId = s.perm("victim").topCard.instanceId;
      const baseId = s.perm("breedingSource").topCard.instanceId;
      const destinationId = s.inst("destination").instanceId;
      s.state.memory = 3;
      const ownTurn = s.engine.runOneTurn();
      await settle(() => s.state.phase === Phase.Breeding || s.state.phase === Phase.Main);
      if (s.state.phase === Phase.Breeding) s.engine.applyIntent(0, { type: "endPhase" });
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
      await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === optionId));
      expect(s.state.memory).toBe(0);
      advance(s.engine).endMainPhaseIfOpen(0);
      await ownTurn;
      s.state.turnSeat = 1;
      s.state.memory = 8;
      const opponentTurn = s.engine.runOneTurn();
      await advance(s.engine).waitForMainPhase(1);
      expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("delete").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "ST1-16"));
      const evolved = s.state.players[0]!.battleArea.find((p) => p.topCard.instanceId === destinationId);
      expect(s.state.players[0]!.trash.some((card) => card.instanceId === victimId)).toBe(true);
      expect(evolved !== undefined).toBe(accepted);
      expect(evolved?.stack.map((card) => card.instanceId) ?? []).toEqual(accepted ? [baseId] : []);
      expect(s.state.players[0]!.breeding?.topCard.instanceId).toBe(accepted ? undefined : baseId);
      expect(s.state.players[0]![destinationZone].some((card) => card.instanceId === destinationId)).toBe(!accepted);
      expect(s.state.players[0]!.trash.some((card) => card.instanceId === optionId)).toBe(delayPaid);
      expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === optionId)).toBe(!delayPaid);
      expect(s.state.memory).toBe(0);
      advance(s.engine).endMainPhaseIfOpen(1);
      await opponentTurn;
    },
  );
});
