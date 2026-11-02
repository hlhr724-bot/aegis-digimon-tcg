import { describe, it, expect } from "vitest";
import { EffectTiming, type PlayerState } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine as setup, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT24-093.js";
import "../index.js";

describe("BT24-093 [Main] on-play body fires on a real playCard (not dead)", () => {
  it("performs security-to-hand and Recovery before the printed then-place tail", () => {
    expect(compiled.effects.find((effect) => effect.trigger === "Main")?.actions).toEqual([
      expect.objectContaining({ kind: "SecurityManipulation", op: "toHand", toTop: true }),
      expect.objectContaining({ kind: "SecurityManipulation", op: "addTop", source: "deck" }),
      expect.objectContaining({ kind: "PlaceInBattleAreaSelf" }),
    ]);
  });

  it("targets a named host's top stacked card for the Delay effect", () => {
    const delay = compiled.effects.find((effect) => effect.trigger === "AllTurns");
    expect(delay).toMatchObject({ keywords: [{ keyword: "Delay" }] });
    expect(delay?.actions[0]).toMatchObject({
      kind: "SubTrigger",
      event: "whenSecurityRemoved",
      actions: [
        {
          kind: "SecurityManipulation",
          op: "addTop",
          detachPermanentTop: true,
          source: { filter: { nameOrTrait: [{ tokens: ["Aegiochusmon", "Jupitermon"], match: "name" }] } },
        },
      ],
    });
  });

  it("encodes the printed Security play from hand or trash", () => {
    expect(compiled.effects.find((effect) => effect.trigger === "Security")).toMatchObject({
      isSecurity: true,
      actions: [
        {
          kind: "PlayWithoutCost",
          from: ["hand", "trash"],
          payCost: false,
          optional: true,
          target: {
            filter: {
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Aegiomon", "Elecmon"], match: "nameExact" }],
            },
          },
        },
      ],
    });
  });

  it.each([
    ["Aegiomon from hand", "hand", "BT24-034"],
    ["Elecmon from trash", "trash", "BT24-031"],
  ] as const)("plays %s without paying the cost", async (_label, zone, card) => {
    const s = setup(
      {
        0: {
          security: [{ card: "BT24-093", as: "temple" }],
          [zone]: [{ card, as: "target" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.Security, s.inst("temple"));
    await settle(() =>
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === s.inst("target").instanceId),
    );

    expect(
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === s.inst("target").instanceId),
    ).toBe(true);
  });

  it("publicly reveals Security and plays an exact Aegiomon from hand for free (Q5693)", async () => {
    const s = setup(
      {
        0: {
          security: [{ card: "BT24-093", as: "temple" }],
          hand: [{ card: "BT24-034", as: "aegiomon" }],
          deck: ["BT1-009", "BT1-010"],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "attacker", dp: 3000 }],
          security: ["BT1-013"],
          hand: ["BT1-010"],
          deck: ["BT1-011", "BT1-012"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 3;
    await s.ready();
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "securityChecked") && !observe(s.engine).isAttacking());
    await settle(() =>
      s.state.players[0]!.battleArea.some((perm) => perm.topCard.instanceId === s.inst("aegiomon").instanceId),
    );

    expect(s.state.players[0]!.battleArea.map((perm) => perm.topCard.instanceId)).toContain(
      s.inst("aegiomon").instanceId,
    );
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).not.toContain(s.inst("aegiomon").instanceId);
    expect(s.state.players[0]!.security).toHaveLength(0);
    expect(s.events.filter((event) => event.kind === "securityChecked")).toHaveLength(1);
    expect(s.state.pendingDecision).toBeUndefined();
    advance(s.engine).endMainPhaseIfOpen(1);
    await turn;
  });

  it("moves the top security card to hand, recovers 1 from deck to security, and lands in the battle area", async () => {
    const s = setup(
      {
        0: {
          battleArea: [{ card: "BT1-045", dp: 3000 }],
          hand: [{ card: "BT24-093", as: "option" }],
          security: [{ card: "AD1-001", as: "topSecurity" }],
          deck: [{ card: "AD1-001", as: "deckCard" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const p0 = s.state.players[0] as PlayerState;

    const option = s.inst("option");
    const topSecurity = s.inst("topSecurity");
    const deckCard = s.inst("deckCard");
    s.state.memory = 0;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: option.instanceId })).toEqual({ ok: true });

    await settle(() => p0.battleArea.some((perm) => perm.topCard?.cardId === "BT24-093"));
    await settle(() => false, 60);

    expect(p0.hand.some((c) => c.instanceId === topSecurity.instanceId)).toBe(true);
    expect(p0.security.some((c) => c.instanceId === topSecurity.instanceId)).toBe(false);
    expect(p0.security.length).toBe(1);
    expect(p0.deck.some((c) => c.instanceId === deckCard.instanceId)).toBe(false);
    expect(p0.battleArea.some((perm) => perm.topCard?.cardId === "BT24-093")).toBe(true);
    expect(p0.trash.some((c) => c.cardId === "BT24-093")).toBe(false);
  });

  it("recovers and enters the battle area even with no security card to add to hand (Q5692)", async () => {
    const s = setup({
      0: {
        battleArea: ["BT1-045"],
        hand: [{ card: "BT24-093", as: "option" }],
        deck: [{ card: "BT1-013", as: "recovered" }],
      },
    });
    s.state.memory = 2;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.security.some((card) => card.instanceId === s.inst("recovered").instanceId));
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT24-093")).toBe(true);
  });

  it("uses Delay to place the named Digimon's top stacked card as top security (Q5694/Q5695)", async () => {
    const s = setup(
      {
        0: {
          battleArea: [
            { card: "BT24-093", as: "option" },
            { card: "BT24-014", as: "host", under: [{ card: "BT24-034", as: "stacked" }] },
          ],
          security: [{ card: "BT1-013", as: "removed" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.perm("option").enterFieldTurnCount = s.state.turnCount - 1;
    s.perm("option").placedByEffect = true;

    await advance(s.engine).verb.trashFromSecurity(0, 1);
    await settle(() => s.state.players[0]!.security[0]?.instanceId === s.inst("host").instanceId);

    expect(s.perm("host").topCard.instanceId).toBe(s.inst("stacked").instanceId);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("option").instanceId);
  });

  it("does not use a fresh Delay option even with a named stack", async () => {
    const s = setup({
      0: {
        battleArea: [
          { card: "BT24-093", as: "option" },
          { card: "BT24-014", as: "host", under: [{ card: "BT1-009", as: "nonMatching" }] },
        ],
        security: [{ card: "BT1-013", as: "removed" }],
      },
      1: { battleArea: [{ card: "BT1-009", as: "attacker", dp: 3000 }], deck: ["BT1-010", "BT1-011"] },
    });
    s.state.turnSeat = 1;
    await s.ready();
    s.perm("option").placedByEffect = true;
    const removedId = s.inst("removed").instanceId;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 0);

    expect(s.state.players[0]!.security).toHaveLength(0);
    expect(s.state.players[0]!.security.map((card) => card.instanceId)).not.toContain(removedId);
    expect(s.state.players[0]!.security.map((card) => card.instanceId)).not.toContain(s.inst("nonMatching").instanceId);
    expect(s.perm("host").stack.map((card) => card.instanceId)).toContain(s.inst("nonMatching").instanceId);
  });

  it("uses an aged Delay option after a public security battle", async () => {
    const s = setup(
      {
        0: {
          battleArea: [
            { card: "BT24-093", as: "option" },
            { card: "BT24-014", as: "host", under: [{ card: "BT24-034", as: "stacked" }] },
          ],
          security: [{ card: "BT1-013", as: "removed" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "attacker", dp: 3000 }], deck: ["BT1-010", "BT1-011"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    s.perm("option").placedByEffect = true;
    s.perm("option").enterFieldTurnCount = s.state.turnCount - 1;
    const hostInstanceId = s.inst("host").instanceId;
    const stackedInstanceId = s.inst("stacked").instanceId;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security[0]?.instanceId === hostInstanceId);

    expect(s.state.players[0]!.security[0]?.instanceId).toBe(hostInstanceId);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("option").instanceId);
    expect(s.perm("host").topCard.instanceId).toBe(stackedInstanceId);
  });
});
