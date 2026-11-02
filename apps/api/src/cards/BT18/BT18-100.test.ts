import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";
import { compiled } from "./BT18-100.js";

describe("BT18-100 Gospel of the Fallen Angel", () => {
  it("issue #5219: Lucemon's breeding When Digivolving triggers after Gospel evolves from trash", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "BT1-006", as: "base" },
          battleArea: ["BT10-071"],
          hand: [{ card: "BT18-100", as: "option" }],
          trash: [{ card: "EX10-013", as: "lucemon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle();
    expect(s.state.players[0]!.breeding).toBeUndefined();
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "EX10-013")).toBe(true);
  });

  it("covers the breeding digivolution, Delay, and Security placement clauses", () => {
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(compiled.effects).toContainEqual(
      expect.objectContaining({
        trigger: "Security",
        isSecurity: true,
        actions: [{ kind: "PlaceInBattleAreaSelf" }],
      }),
    );
    expect(compiled.effects[0]).toMatchObject({
      trigger: "Main",
      actions: [
        {
          kind: "Digivolve",
          optional: true,
          from: ["trash"],
          payCost: false,
          target: { filter: { zone: "breeding", controller: "mine" }, targetBreeding: true },
          into: { nameOrTrait: [{ tokens: ["Lucemon"], match: "nameExact" }] },
        },
        { kind: "PlaceInBattleAreaSelf" },
      ],
    });
  });

  it("uses Q3052's placed-Option boundary and the printed reduced-cost payment", () => {
    const delay = compiled.effects.find((effect) => effect.keywords?.some((keyword) => keyword.keyword === "Delay"));
    expect(delay).toMatchObject({
      trigger: "Main",
      actions: [
        {
          kind: "Trash",
          target: { filter: { controller: "opponent", kind: ["Option"] } },
          cost: {
            kind: "digivolve",
            from: ["trash"],
            costReduction: 3,
            into: { nameOrTrait: [{ tokens: ["Lucemon"], match: "name" }] },
          },
        },
      ],
    });
    const delayAction = delay?.actions?.[0] as { target?: { filter?: unknown } } | undefined;
    expect(delayAction?.target?.filter).not.toHaveProperty("placedByPlaceInBattleAreaEffect");
  });

  it("naturally digivolves the breeding-area Digimon from trash and places this Option", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "BT1-006", as: "base" },
          battleArea: ["BT10-071"],
          hand: [{ card: "BT18-100", as: "option" }],
          trash: [{ card: "BT18-034", as: "lucemon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.breeding?.topCard?.cardId === "BT18-034");

    expect(s.state.players[0]!.breeding?.topCard?.cardId).toBe("BT18-034");
    expect(s.state.players[0]!.battleArea.some((perm) => perm.topCard?.cardId === "BT18-100")).toBe(true);
    expect(s.state.memory).toBe(5);
  });

  it("does not treat a Lucemon variant as the exact breeding-area Main destination", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "BT1-006", as: "base" },
          battleArea: ["BT10-071"],
          hand: [{ card: "BT18-100", as: "option" }],
          trash: [{ card: "BT18-082", as: "lucemonVariant" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((perm) => perm.topCard?.cardId === "BT18-100"));

    expect(s.state.players[0]!.breeding?.topCard?.cardId).toBe("BT1-006");
    expect(s.state.players[0]!.battleArea.some((perm) => perm.topCard?.cardId === "BT18-100")).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("lucemonVariant").instanceId)).toBe(
      true,
    );
  });

  it("naturally pays Delay by digivolving a Lucemon-name Digimon from trash, then trashes any opponent battle-area Option", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT18-082", as: "base" },
            { card: "BT18-100", as: "option" },
          ],
          trash: [{ card: "BT19-043", as: "destination" }],
          deck: ["BT1-010"],
        },
        1: { battleArea: [{ card: "BT18-099", as: "opponentOption" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferOptionIndex: 0 },
    );
    s.perm("option").placedByEffect = true;
    s.state.memory = 10;
    await s.ready();

    const activatable = observe(s.engine).activatableEffects(s.perm("option"));
    const delay = Array.isArray(activatable)
      ? activatable.find(
          (entry): entry is { effectKey: string; description?: string } =>
            typeof entry === "object" &&
            entry !== null &&
            "effectKey" in entry &&
            typeof entry.effectKey === "string" &&
            "description" in entry &&
            typeof entry.description === "string" &&
            entry.description.includes("Delay"),
        )
      : undefined;
    expect(delay?.effectKey).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("option").topCard!.instanceId,
        effectKey: delay!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("base").topCard?.instanceId === s.inst("destination").instanceId &&
        s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("opponentOption").instanceId),
    );

    expect(s.perm("base").topCard?.instanceId).toBe(s.inst("destination").instanceId);
    expect(s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("opponentOption").instanceId)).toBe(
      true,
    );
    expect(s.state.memory).toBe(7);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("option").instanceId)).toBe(true);
  });

  it.each(["BT1-010", "BT26-032"])(
    "leaves opposing %s untouched at the Option target boundary",
    async (targetCardId) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT18-082", as: "base" },
              { card: "BT18-100", as: "option" },
            ],
            trash: [{ card: "BT19-043", as: "destination" }],
            deck: ["BT1-010"],
          },
          1: { battleArea: [{ card: targetCardId, as: "opponentDigimon" }] },
        },
        { autoAcceptOptional: true, autoSelectCards: true, preferOptionIndex: 0 },
      );
      s.perm("option").placedByEffect = true;
      s.state.memory = 10;
      await s.ready();

      const activatable = observe(s.engine).activatableEffects(s.perm("option"));
      const delay = Array.isArray(activatable)
        ? activatable.find(
            (entry): entry is { effectKey: string; description?: string } =>
              typeof entry === "object" &&
              entry !== null &&
              "effectKey" in entry &&
              typeof entry.effectKey === "string" &&
              "description" in entry &&
              typeof entry.description === "string" &&
              entry.description.includes("Delay"),
          )
        : undefined;
      expect(delay?.effectKey).toBeDefined();
      expect(
        s.engine.applyIntent(0, {
          type: "activateEffect",
          sourceInstanceId: s.perm("option").topCard!.instanceId,
          effectKey: delay!.effectKey,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("base").topCard?.instanceId === s.inst("destination").instanceId);

      expect(s.perm("base").topCard?.instanceId).toBe(s.inst("destination").instanceId);
      expect(
        s.state.players[1]!.battleArea.some((perm) => perm.permanentId === s.perm("opponentDigimon").permanentId),
      ).toBe(true);
      expect(s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("opponentDigimon").instanceId)).toBe(
        false,
      );
    },
  );

  it("naturally places itself from Security", async () => {
    const s = setupEngine(
      {
        0: { security: [{ card: "BT18-100", as: "option" }] },
        1: { battleArea: [{ card: "BT1-010", as: "attacker" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.turnSeat = 1;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("option").instanceId),
    );

    expect(
      s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("option").instanceId),
    ).toBe(true);
  });
});
