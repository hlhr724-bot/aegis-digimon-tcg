import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CardColor, getCardDefinition } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { observe } from "../../engine/testkit/observe.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { syntheticDefinitions } from "../../engine/testkit/syntheticDefinitions.js";
import { compiled } from "./BT16-076.js";
import "../index.js";

describe("BT16-076", () => {
  it("may delete an opposing Digimon at 6000 DP or lower by trashing two hand cards", () => {
    expect(compiled.effects?.[0]?.actions?.[0]).toMatchObject({
      kind: "Delete",
      optional: true,
      abortOnDecline: true,
      allowCostWithoutTarget: true,
      cost: { kind: "trash", target: { count: 2 } },
      target: { filter: { dp: { op: "lte", value: 6000 } } },
    });
  });

  it("plays a level 4 or lower SoC Digimon from trash if deletion did not happen", () => {
    expect(compiled.effects?.[0]?.actions?.[1]).toMatchObject({
      kind: "PlayWithoutCost",
      from: ["trash"],
      payCost: false,
      optional: true,
      condition: { kind: "ifThisEffectDidNotDelete" },
    });
  });

  it("digivolves into Fenriloogamon from trash when another SoC Digimon is deleted", () => {
    expect(compiled.effects?.[1]).toMatchObject({
      trigger: "AllTurns",
      actions: [
        {
          kind: "SubTrigger",
          event: "onDeletionOf",
          actions: [
            {
              kind: "Digivolve",
              from: ["trash"],
              payCost: false,
              optional: true,
              condition: { kind: "selfDigivolutionStackMatchesFilter", filter: { kind: ["Tamer"] } },
            },
          ],
        },
      ],
    });
  });

  it("keeps the inherited attacker suspended when the opponent has no memory", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT15-080", as: "host", under: ["BT16-076"] }] },
      1: { battleArea: ["BT1-009"], security: ["BT1-009", "BT1-009"] },
    });
    s.state.turnSeat = 0;
    s.state.memory = 0;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 1 && !observe(s.engine).isAttacking());

    expect(s.perm("host").isSuspended).toBe(true);
  });

  it("unsuspends the inherited attacker after the attack when the opponent has memory", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT15-080", as: "host", under: ["BT16-076"] }] },
      1: { battleArea: ["BT15-080"], security: ["BT1-009", "BT1-009"] },
    });
    s.state.turnSeat = 0;
    s.state.memory = 0;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
    s.state.memory = -1;
    expect(s.engine.applyIntent(1, { type: "declineBlock" })).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 1 && !observe(s.engine).isAttacking());

    expect(s.perm("host").isSuspended).toBe(false);
  });

  it("deletes a 6000-DP opponent after a legal alternate evolution", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT14-074", as: "base" }],
          hand: [{ card: "BT16-076", as: "soloogar" }, "BT1-009", "BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "target", dp: 6000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 3;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("soloogar").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard?.cardId === "BT16-076" && s.state.players[1]!.battleArea.length === 0);

    expect(s.perm("base").topCard?.cardId).toBe("BT16-076");
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.hand).toHaveLength(0);
  });

  it("uses the fallback SoC play when no opposing Digimon is at or below 6000 DP", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT14-074", as: "base" }],
          hand: [{ card: "BT16-076", as: "soloogar" }, "BT1-009", "BT1-009"],
          trash: [{ card: "BT14-074", as: "fallback" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "target", dp: 6001 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 3;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("soloogar").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("base").topCard?.cardId === "BT16-076" &&
        s.state.players[0]!.battleArea.filter((permanent) => permanent.topCard?.cardId === "BT14-074").length === 1,
    );

    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.state.players[1]!.battleArea[0]?.currentDP).toBe(6001);
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.battleArea.filter((permanent) => permanent.topCard?.cardId === "BT14-074")).toHaveLength(
      1,
    );
    expect(
      s.decisions
        .filter(({ req }) => req.kind === "optional" && req.sourceCardId === "BT16-076")
        .map(({ req }) => req.options?.effectTextPart),
    ).toEqual([
      "If this effect didn't delete, you may play 1 level 4 or lower [SoC] trait Digimon card from your trash without paying the cost.",
    ]);
  });
});

describe("BT16-076 Soloogarmon — KB Q&A rulings", () => {
  // Every printed [Fenriloogamon] accepts a Lv.5 purple or red base, so the ruling's
  // unmet-requirement case needs a synthetic one that only digivolves from green.
  const GREEN_ONLY_FENRILOOGAMON = "TEST-Q2662-GREEN-FENRILOOGAMON";

  beforeAll(() => {
    syntheticDefinitions.set(GREEN_ONLY_FENRILOOGAMON, {
      ...getCardDefinition("BT14-081")!,
      cardId: GREEN_ONLY_FENRILOOGAMON,
      colors: [CardColor.Green],
      evoCosts: [{ color: CardColor.Green, level: 5, memoryCost: 4 }],
    });
  });

  afterAll(() => {
    syntheticDefinitions.delete(GREEN_ONLY_FENRILOOGAMON);
  });

  it("only digivolves into a [Fenriloogamon] in the trash whose digivolution requirements it meets (Q2662)", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT16-076", as: "soloogarmon", under: ["BT14-074", { card: "BT14-087", as: "socTamer" }] },
            { card: "BT14-074", as: "deletedSoc" },
          ],
          trash: [
            { card: GREEN_ONLY_FENRILOOGAMON, as: "unmetFenriloogamon" },
            { card: "BT14-081", as: "metFenriloogamon" },
          ],
        },
        1: { security: ["BT1-009"] },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        declinePrompts: ["Play without paying the cost"],
        preferInstanceIds,
      },
    );
    preferInstanceIds.push(s.inst("unmetFenriloogamon").instanceId);
    await s.ready();

    await advance(s.engine).verb.deletePermanent([s.perm("deletedSoc").permanentId], "byEffect");
    await settle(() => s.perm("soloogarmon").topCard?.cardId !== "BT16-076");
    await settle();

    expect(s.perm("soloogarmon").topCard?.instanceId).toBe(s.inst("metFenriloogamon").instanceId);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("unmetFenriloogamon").instanceId);
  });
});
