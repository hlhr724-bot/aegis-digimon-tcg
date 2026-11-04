import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { observe } from "../../engine/testkit/observe.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./EX5-054.js";
import "../index.js";

const CARD = "EX5-054";

describe("EX5-054 MetalEtemon", () => {
  it("matches the catalog and encodes deletion scaling plus the optional redirect cost", () => {
    expect(getCardDefinition(CARD)).toMatchObject({
      cardId: CARD,
      nameEn: "MetalEtemon",
      colors: ["Black", "Yellow"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 12,
      dp: 12000,
      evoCosts: [
        { color: "Black", level: 5, memoryCost: 4 },
        { color: "Yellow", level: 5, memoryCost: 4 },
      ],
      forms: ["Mega"],
      attributes: ["Virus"],
      types: ["Cyborg"],
      effectText: expect.stringContaining("For each card with [Etemon]/[Sukamon]"),
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    for (const trigger of ["OnPlay", "WhenDigivolving"] as const) {
      expect(compiled.effects?.find((entry) => entry.trigger === trigger)?.actions).toEqual([
        {
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon", "Tamer"],
              playCostLte: 3,
              playCostLteScaling: {
                per: 1,
                unit: "trash",
                filter: {
                  controller: "mine",
                  nameOrTrait: [{ tokens: ["Etemon", "Sukamon"], match: "name" }],
                },
              },
            },
            count: 1,
          },
        },
      ]);
    }
    expect(compiled.effects?.find((entry) => entry.trigger === "OpponentsTurn")).toMatchObject({
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenOpponentAttacks",
          sourceFilter: { controller: "opponent", kind: ["Digimon"] },
          cost: {
            kind: "place",
            destination: "security",
            position: "top",
            target: {
              from: ["hand"],
              count: 1,
              filter: { controller: "mine", nameOrTrait: [{ tokens: ["Etemon", "Sukamon"], match: "name" }] },
            },
          },
          actions: [{ kind: "RedirectAttack", optional: true, includePlayer: true }],
        },
      ],
    });
  });

  it("deletes the exact play-cost boundary on play and leaves a card above the scaled ceiling", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: CARD, as: "source" }],
          trash: ["BT11-040", "BT11-041"],
        },
        1: {
          battleArea: [
            { card: "BT1-018", as: "boundary" },
            { card: "BT1-021", as: "above" },
          ],
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    const boundaryId = s.perm("boundary").permanentId;
    preferred.push(boundaryId);
    s.state.memory = 20;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("source").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => !s.state.players[1]!.battleArea.some((p) => p.permanentId === boundaryId));
    expect(s.state.players[1]!.battleArea.some((p) => p.topCard?.cardId === "BT1-018")).toBe(false);
    expect(s.state.players[1]!.battleArea.some((p) => p.topCard?.cardId === "BT1-021")).toBe(true);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(["BT11-040", "BT11-041"]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("uses the same scaled deletion effect on public play and When Digivolving", async () => {
    const play = setupEngine(
      {
        0: { hand: [{ card: CARD, as: "source" }], trash: ["BT11-040"] },
        1: { battleArea: [{ card: "BT1-014", as: "target" }] },
      },
      { autoSelectCards: true },
    );
    play.state.memory = 20;
    await play.ready();
    expect(play.engine.applyIntent(0, { type: "playCard", instanceId: play.inst("source").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => play.state.players[1]!.battleArea.length === 0);
    expect(play.state.players[1]!.battleArea).toHaveLength(0);

    const evolve = setupEngine(
      {
        0: { battleArea: [{ card: "EX5-049", as: "base" }], hand: [{ card: CARD, as: "evo" }] },
        1: { battleArea: [{ card: "BT1-014", as: "target" }] },
      },
      { autoSelectCards: true, autoChooseOption: true },
    );
    evolve.state.memory = 20;
    await evolve.ready();
    expect(
      evolve.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: evolve.perm("base").permanentId,
        instanceId: evolve.inst("evo").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => evolve.state.players[1]!.battleArea.length === 0);
    expect(evolve.perm("base").topCard.cardId).toBe(CARD);
    expect(evolve.perm("base").stack.map((card) => card.cardId)).toEqual(["EX5-049"]);
    expect(evolve.state.players[1]!.battleArea).toHaveLength(0);
  });

  it("deletes the scaled boundary through the public When Digivolving route", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX5-049", as: "base" }],
          hand: [{ card: CARD, as: "evo" }],
          trash: ["BT11-040"],
        },
        1: {
          battleArea: [
            { card: "BT1-014", as: "boundary" },
            { card: "BT1-018", as: "above" },
          ],
        },
      },
      { autoSelectCards: true, autoChooseOption: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("boundary").permanentId);
    s.state.memory = 20;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evo").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.players[1]!.battleArea.some((p) => p.topCard?.cardId === "BT1-014"));
    expect(s.perm("base").topCard.cardId).toBe(CARD);
    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["EX5-049"]);
    expect(s.state.players[1]!.battleArea.some((p) => p.topCard?.cardId === "BT1-018")).toBe(true);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it.each([
    { label: "black level-5", base: "EX5-049", legal: true },
    { label: "yellow level-5", base: "BT11-041", legal: true },
    { label: "level-4", base: "BT1-014", legal: false },
  ])("checks the public $label evolution route", async ({ base, legal }) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: base, as: "base" }],
          hand: [{ card: CARD, as: "evo" }],
          deck: [{ card: "BT1-009", as: "bonus" }],
        },
      },
      { autoChooseOption: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evo").instanceId,
      }).ok,
    ).toBe(legal);
    await settle();
    expect(s.perm("base").topCard.cardId).toBe(legal ? CARD : base);
    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(legal ? [base] : []);
    expect(s.state.memory).toBe(legal ? 6 : 10);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual(
      legal ? [s.inst("bonus").instanceId] : [s.inst("evo").instanceId],
    );
    expect(s.state.players[0]!.deck.some((card) => card.instanceId === s.inst("bonus").instanceId)).toBe(!legal);
  });

  it("answers Q3646: it may pay the security cost and decline switching an attack on this Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD, as: "source", suspended: true }],
          hand: [{ card: "BT11-040", as: "paid" }],
          security: ["BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-010", as: "attacker" }] },
      },
      { autoSelectCards: false },
    );
    s.state.turnSeat = 1;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("source").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const activationDecision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: activationDecision.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.pendingDecision?.kind === "optional" &&
        s.state.pendingDecision.decisionId !== activationDecision.decisionId,
    );
    const decision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(s.state.players[0]!.security[0]!.cardId).toBe("BT11-040");
    expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === s.perm("source").permanentId)).toBe(true);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("answers Q3647: redirecting to this Digimon is legal, while the opponent's player is not a target", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD, as: "source" }],
          hand: [{ card: "BT11-041", as: "paid" }],
          security: ["BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-010", as: "attacker" }], security: ["BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("source").permanentId);
    s.state.turnSeat = 1;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(s.state.players[0]!.security[0]!.cardId).toBe("BT11-041");
    expect(
      s.events.some(
        (event) =>
          event.kind === "attackDeclared" &&
          event.target.kind === "permanent" &&
          event.target.permanentId === s.perm("source").permanentId,
      ),
    ).toBe(true);
    expect(s.state.pendingDecision).toBeUndefined();
  });
  it("offers its own controller's security, not the attacker's, as the player target (Discord 1558441146781536346, Q3647)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: CARD, as: "source", suspended: true },
            { card: "BT1-009", as: "attacked", suspended: true },
          ],
          hand: [{ card: "BT11-041", as: "paid" }],
          security: ["BT1-009", "BT1-010"],
        },
        1: { battleArea: [{ card: "BT1-010", as: "attacker" }], security: ["BT1-011", "BT1-012"] },
      },
      { autoAcceptOptional: true, autoSelectCards: false },
    );
    s.state.turnSeat = 1;
    await s.ready();
    const sourceId = s.perm("source").permanentId;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("attacked").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.pendingDecision?.kind === "selectCards" &&
        s.decisions.at(-1)?.req.options?.candidateInstanceIds?.includes(sourceId) === true,
    );
    const redirect = s.decisions.at(-1)!.req;
    expect(redirect.seat).toBe(0);
    expect(redirect.options?.candidateInstanceIds).toEqual([sourceId, "mine"]);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: redirect.decisionId,
        response: { kind: "selectCards", instanceIds: ["mine"] },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(s.events.filter((event) => event.kind === "attackDeclared").at(-1)).toMatchObject({
      seat: 1,
      target: { kind: "player" },
      redirected: true,
    });
    expect(s.state.players[0]!.security.map((card) => card.cardId)).toEqual(["BT1-009", "BT1-010"]);
    expect(s.state.players[1]!.security.map((card) => card.cardId)).toEqual(["BT1-011", "BT1-012"]);
    expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === sourceId)).toBe(true);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});
