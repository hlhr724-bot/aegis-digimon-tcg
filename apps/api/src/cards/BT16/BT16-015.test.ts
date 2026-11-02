import { describe, expect, it } from "vitest";
import { EffectTiming, getCardDefinition } from "@aegis/shared";
import { matchingAlternateDigivolutionRequirement } from "../../engine/cards/cardData.js";
import { matchNameOrTrait } from "../../engine/effects/interpreter.js";
import { observe } from "../../engine/testkit/observe.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { advance } from "../../engine/testkit/advance.js";
import { compiled } from "./BT16-015.js";
import "../BT13/BT13-014.js";
import "../BT2/BT2-019.js";
import "../ST1/ST1-16.js";
import "../index.js";

describe("BT16-015", () => {
  it("compiles Blitz, exact alternate evolution, and exact-name stack conditions", () => {
    expect(compiled.digivolutionRequirement).toEqual([{ namesExact: ["Phoenixmon"], cost: 2, isAlternate: true }]);
    expect(compiled.effects?.[0]?.actions[0]).toMatchObject({
      kind: "GainKeyword",
      keyword: { keyword: "Blitz" },
      duration: "forTheTurn",
    });

    const condition = {
      kind: "selfDigivolutionStackHasTrait",
      filter: {
        nameOrTrait: [
          { tokens: ["Phoenixmon"], match: "nameExact" },
          { tokens: ["X Antibody"], match: "nameExact" },
        ],
      },
    };
    expect(compiled.effects?.[0]?.actions[1]).toMatchObject({
      kind: "GrantStatic",
      grant: { keyword: "EndOfAttack", targetFilter: { keyword: "OnDeletion" } },
      condition: { kind: "allOf", conditions: [{ kind: "isYourTurn" }, condition] },
    });
    expect(compiled.effects?.[1]).toMatchObject({
      trigger: "YourTurn",
      actions: [
        { kind: "GrantStatic", grant: { keyword: "EndOfAttack", targetFilter: { keyword: "OnDeletion" } }, condition },
      ],
    });
    expect(compiled.effects?.[2]?.actions[0]).toMatchObject({
      kind: "PlayWithoutCost",
      optional: true,
      from: ["hand"],
      payCost: false,
      bindResultAs: "playedDigimon",
      target: {
        filter: {
          controller: "mine",
          kind: ["Digimon"],
          colors: ["Red"],
          dp: { op: "lte", value: 11000 },
          nameOrTrait: [{ tokens: ["Avian", "Bird", "Beast", "Animal", "Sovereign"], match: "traitContains" }],
          excludeNameOrTrait: [{ tokens: ["Sea Animal"], match: "traitContains" }],
        },
      },
    });
    expect(compiled.effects?.[2]?.actions[1]).toMatchObject({
      kind: "Delete",
      target: {
        filter: { controller: "opponent", kind: ["Digimon"], dp: { valueFrom: "playedDigimon", valueField: "dp" } },
      },
    });
  });

  it("matches Phoenixmon and X Antibody by exact card name, never by the X Antibody trait", () => {
    const phoenixmonReference: { tokens: string[]; match: "nameExact" } = {
      tokens: ["Phoenixmon"],
      match: "nameExact",
    };
    const xAntibodyReference: { tokens: string[]; match: "nameExact" } = {
      tokens: ["X Antibody"],
      match: "nameExact",
    };
    expect(matchNameOrTrait({ nameEn: "Phoenixmon" }, phoenixmonReference)).toBe(true);
    expect(matchNameOrTrait({ nameEn: "Phoenixmon (X Antibody)" }, phoenixmonReference)).toBe(false);
    expect(matchNameOrTrait(getCardDefinition("BT9-109")!, xAntibodyReference)).toBe(true);
    expect(matchNameOrTrait(getCardDefinition("EX11-053")!, xAntibodyReference)).toBe(true);
    expect(matchNameOrTrait(getCardDefinition("BT9-014")!, xAntibodyReference)).toBe(false);
    expect(matchNameOrTrait(getCardDefinition("EX8-015")!, xAntibodyReference)).toBe(false);
    expect(matchingAlternateDigivolutionRequirement("BT16-015", "ST1-10")).toMatchObject({
      namesExact: ["Phoenixmon"],
      cost: 2,
    });
    expect(matchingAlternateDigivolutionRequirement("BT16-015", "BT16-015")).toBeUndefined();
    expect(compiled.effects?.[0]?.actions[1]).toMatchObject({
      condition: {
        conditions: [{ kind: "isYourTurn" }, { filter: { nameOrTrait: [phoenixmonReference, xAntibodyReference] } }],
      },
    });
    expect(compiled.effects?.[1]).toMatchObject({
      actions: [{ condition: { filter: { nameOrTrait: [phoenixmonReference, xAntibodyReference] } } }],
    });
  });

  it.each([
    { source: "BT9-014", projects: false },
    { source: "EX8-015", projects: false },
    { source: "BT9-109", projects: true },
    { source: "EX11-053", projects: true },
  ])("with $source under it, End of Attack on its On Deletion effects is $projects", async ({ source, projects }) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT16-015", as: "phoenixmonX", under: ["BT13-014", source] }] },
        1: { battleArea: [{ card: "BT1-009", as: "prey", dp: 6000 }], security: ["BT1-090"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(
      advance(s.engine)
        .ledgers.continuous.listOnDeletionAtEndOfAttackProjections()
        .some((projection) => projection.permanentId === s.perm("phoenixmonX").permanentId),
    ).toBe(projects);
    const preyId = s.perm("prey").permanentId;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("phoenixmonX").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());

    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === preyId)).toBe(!projects);
  });

  it("naturally evolves, grants Blitz, and resolves an inherited On Deletion at end of attack (Q2614)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT2-019", as: "base", under: ["BT13-014"] }],
          hand: [{ card: "BT16-015", as: "phoenixmonX" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "prey", dp: 6000 }], security: ["BT1-090"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 2;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("phoenixmonX").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard?.cardId === "BT16-015");

    expect(observe(s.engine).hasKeyword(s.perm("base"), "Blitz")).toBe(true);
    const preyId = s.perm("prey").permanentId;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());

    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === preyId)).toBe(false);
  });

  it("does not install the projection from an opponent-turn digivolution timing", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT16-015", as: "phoenixmonX", under: ["BT13-014", "BT2-019"] }] },
    });
    s.state.turnSeat = 1;
    await s.ready();

    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("phoenixmonX"));

    expect(
      advance(s.engine)
        .ledgers.continuous.listOnDeletionAtEndOfAttackProjections()
        .some((projection) => projection.permanentId === s.perm("phoenixmonX").permanentId),
    ).toBe(false);
  });

  it("stops projecting after a natural de-digivolve removes the source clause (Q2615)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT16-015", as: "phoenixmonX", dp: 7000, under: ["BT13-014", "BT2-019"] }],
          deck: ["BT1-090", "BT1-090"],
        },
        1: {
          hand: [{ card: "BT16-062", as: "zanmetsumon" }],
          battleArea: [{ card: "BT1-020", as: "prey", dp: 6000 }],
          deck: ["BT1-090", "BT1-090"],
          security: ["BT1-090"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 8;
    await s.ready();

    const opponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("zanmetsumon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("phoenixmonX").stack.every((card) => card.cardId !== "BT2-019"));
    expect(s.perm("phoenixmonX").stack).toHaveLength(1);

    advance(s.engine).endMainPhaseIfOpen(1);
    await opponentTurn;

    s.state.turnSeat = 0;
    s.state.memory = -s.state.memory;
    const ownerTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);

    const preyId = s.perm("prey").permanentId;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("phoenixmonX").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());

    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === preyId)).toBe(true);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await ownerTurn;
  });

  it("does not project inherited effects when no Phoenixmon or X Antibody source is present", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT16-015", as: "phoenixmonX", under: ["BT13-014"] }] },
        1: { battleArea: [{ card: "BT1-009", as: "prey", dp: 6000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    const preyId = s.perm("prey").permanentId;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("phoenixmonX").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());

    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === preyId)).toBe(true);
  });

  it("plays a legal red Avian on its natural On Deletion and deletes only within that DP", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT16-015", as: "phoenixmonX" }],
          hand: [{ card: "BT16-008", as: "playedAvian" }],
        },
        1: {
          hand: [{ card: "ST1-16", as: "gaiaForce" }],
          battleArea: [
            { card: "BT1-009", as: "withinPlayedDP", dp: 4000 },
            { card: "BT1-009", as: "abovePlayedDP", dp: 5000 },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 10;
    await s.ready();
    const withinId = s.perm("withinPlayedDP").permanentId;
    const aboveId = s.perm("abovePlayedDP").permanentId;

    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("gaiaForce").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT16-008"));

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT16-008")).toBe(true);
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === withinId)).toBe(false);
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === aboveId)).toBe(true);
  });
});
