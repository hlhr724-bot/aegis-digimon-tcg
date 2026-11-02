import { describe, it, expect } from "vitest";
import { type PlayerState, type Seat } from "@aegis/shared";
import type { GameEngine } from "../../engine/GameEngine.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { advance } from "../../engine/testkit/advance.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";
import {
  blitzThroughCopiedGammamon,
  digivolveOverWhenDigivolvingGammamon,
  hiroWasPlayed,
  hostDpWithGammamonInheritedSource,
} from "./gammamonCopy.testSupport.js";

const RB1_030 = "RB1-030";
const GULUS_LV4 = "BT10-078";
const GAMMAMON_TEXT_OPTION = "BT10-094";
const NON_GAMMAMON_OPTION = "BT1-085";
const OPP_L3 = "BT1-009";
const OPP_L4 = "BT1-014";
const OPP_L5 = "BT1-020";
const MY_RECIPIENT = "BT1-024";
const GAMMAMON_EFFECT_SOURCE = "BT10-078";

type TestEngine = Pick<GameEngine, "applyIntent" | "seatPlayer"> & {
  recomputeContinuousEffects(): Promise<void>;
  primitives: { deletePermanent(ids: string[], cause?: string): Promise<number> };
  continuous: {
    listCustomEffectGrants(): readonly { instanceId: string; token: string }[];
    sweep(state: import("@aegis/shared").GameState, boundary: "opponentTurnEnd", seat: Seat): void;
  };
};

async function setupGranted(costCardId: string | undefined, expectGrant = costCardId !== undefined) {
  const preferInstanceIds: string[] = [];
  const s = setupEngine(
    {
      0: {
        battleArea: [
          { card: GULUS_LV4, dp: 4000, as: "base" },
          { card: MY_RECIPIENT, dp: 7000, as: "recipient" },
        ],
        hand: [...(costCardId !== undefined ? [{ card: costCardId }] : []), { card: RB1_030, as: "evolving" }],
      },
      1: {
        battleArea: [
          { card: OPP_L5, dp: 6000, as: "oppL5" },
          { card: OPP_L4, dp: 4000, as: "oppL4" },
          { card: OPP_L3, dp: 3000, as: "oppL3" },
        ],
      },
    },
    { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds },
  );
  const p0 = s.state.players[0] as PlayerState;
  const p1 = s.state.players[1] as PlayerState;
  const base = s.perm("base");
  const recipient = s.perm("recipient");
  const oppL3 = s.perm("oppL3");
  const oppL4 = s.perm("oppL4");
  const oppL5 = s.perm("oppL5");
  const evolving = s.inst("evolving");
  const engine = s.engine as unknown as TestEngine;

  preferInstanceIds.push(recipient.permanentId);

  s.state.memory = 10;

  await engine.recomputeContinuousEffects();
  engine.applyIntent(0, {
    type: "digivolve",
    permanentId: base.permanentId,
    instanceId: evolving.instanceId,
  });
  await settle(() => {
    const evolved = p0.battleArea.some((p) => p.topCard?.cardId === RB1_030);
    if (!evolved) return false;
    if (expectGrant) return engine.continuous.listCustomEffectGrants().length > 0;
    return p0.hand.every((c) => c.cardId !== RB1_030);
  });

  return {
    s,
    engine,
    p0,
    p1,
    recipient,
    oppL3,
    oppL4,
    oppL5,
    evolvedRB: p0.battleArea.some((p) => p.topCard?.cardId === RB1_030),
  };
}

describe("A3 RB1-030 — granted '[On Deletion] delete lowest-level opponent Digimon'", () => {
  it("uses the Lv.4 Gammamon evolution requirement and copies an All Turns effect from a Gammamon-name stack card", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: GULUS_LV4, as: "base", under: [GAMMAMON_EFFECT_SOURCE] }],
          hand: [{ card: RB1_030, as: "evolving" }, GAMMAMON_TEXT_OPTION],
        },
        1: { battleArea: [{ card: OPP_L4, as: "opponent" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    const baseSourceIds = s.perm("base").stack.map((card) => card.cardId);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolving").instanceId,
        useAlternateCost: true,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard?.cardId === RB1_030);

    expect(s.perm("base").topCard?.cardId).toBe(RB1_030);
    expect(s.state.memory).toBe(7);
    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual([...baseSourceIds, GULUS_LV4]);
    expect(observe(s.engine).hasKeyword(s.perm("base"), "Retaliation")).toBe(true);
  });

  it("copies Gammamon-name effects through RB1-030's inherited text on a higher host", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "RB1-031", as: "host", under: [GAMMAMON_EFFECT_SOURCE, RB1_030] }] },
    });
    await s.engine.recomputeContinuousEffects();
    expect(observe(s.engine).hasKeyword(s.perm("host"), "Retaliation")).toBe(true);
  });

  it("does not copy an effect from a non-Gammamon-name source card", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "RB1-031", as: "host", under: ["BT11-078", RB1_030] }] },
    });
    await s.engine.recomputeContinuousEffects();
    expect(observe(s.engine).hasKeyword(s.perm("host"), "Retaliation")).toBe(false);
  });

  it("POSITIVE: granted Digimon's deletion deletes the opponent's LOWEST-level Digimon", async () => {
    const { s, engine, p1, recipient, oppL3, oppL4, oppL5, evolvedRB } = await setupGranted(GAMMAMON_TEXT_OPTION);
    expect(evolvedRB).toBe(true);

    const grants = engine.continuous.listCustomEffectGrants();
    expect(
      grants.some((g) => g.instanceId === recipient.topCard.instanceId && g.token === "OnDeletionDeleteLowest"),
    ).toBe(true);

    await engine.recomputeContinuousEffects();
    await engine.primitives.deletePermanent([recipient.permanentId], "byEffect");
    await settle(() => !p1.battleArea.some((p) => p.permanentId === oppL3.permanentId));

    expect(p1.battleArea.some((p) => p.permanentId === oppL3.permanentId)).toBe(false);
    expect(p1.battleArea.some((p) => p.permanentId === oppL4.permanentId)).toBe(true);
    expect(p1.battleArea.some((p) => p.permanentId === oppL5.permanentId)).toBe(true);

    expect(
      s.events.find((e) => e.kind === "actionRejected" && "reason" in e && /Unsupported effect/.test(e.reason)),
    ).toBeUndefined();
  });

  it("NEGATIVE (cost): no Gammamon-text card in hand => no grant => deletion deletes nothing", async () => {
    const { s, engine, p1, recipient, oppL3, oppL4, oppL5, evolvedRB } = await setupGranted(NON_GAMMAMON_OPTION, false);
    expect(evolvedRB).toBe(true);

    const grants = engine.continuous.listCustomEffectGrants();
    expect(grants.some((g) => g.instanceId === recipient.topCard.instanceId)).toBe(false);

    await engine.recomputeContinuousEffects();
    await engine.primitives.deletePermanent([recipient.permanentId], "byEffect");
    await settle(() => !s.state.players[0]!.battleArea.some((p) => p.permanentId === recipient.permanentId));

    expect(p1.battleArea.some((p) => p.permanentId === oppL3.permanentId)).toBe(true);
    expect(p1.battleArea.some((p) => p.permanentId === oppL4.permanentId)).toBe(true);
    expect(p1.battleArea.some((p) => p.permanentId === oppL5.permanentId)).toBe(true);
  });

  it("EXPIRY: the grant lapses at the end of the opponent's turn (UntilOpponentTurnEnd)", async () => {
    const { s, engine, recipient, evolvedRB } = await setupGranted(GAMMAMON_TEXT_OPTION);
    expect(evolvedRB).toBe(true);
    expect(engine.continuous.listCustomEffectGrants().some((g) => g.instanceId === recipient.topCard.instanceId)).toBe(
      true,
    );

    engine.continuous.sweep(s.state, "opponentTurnEnd", 1 as Seat);

    expect(engine.continuous.listCustomEffectGrants().some((g) => g.instanceId === recipient.topCard.instanceId)).toBe(
      false,
    );
  });

  it("pays the When Attacking grant cost once per turn and resets next owner turn", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "RB1-030", as: "regulus" },
            { card: "BT1-024", as: "recipient" },
          ],
          hand: ["BT10-094", "BT10-094"],
          deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009"],
          security: ["BT1-010", "BT1-010", "BT1-010", "BT1-010", "BT1-010"],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "victim" }],
          deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009"],
          security: ["BT1-010", "BT1-010", "BT1-010", "BT1-010", "BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds },
    );
    preferInstanceIds.push(s.perm("recipient").permanentId);
    await s.ready();
    s.state.turnSeat = 0;
    s.state.memory = 3;
    const first = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    const paid = s.state.players[0]!.hand.map((card) => card.instanceId);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("regulus").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === paid[0]));
    await advance(s.engine).verb.unsuspend([s.perm("regulus").permanentId]);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("regulus").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === paid[1])).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(0);
    await first;

    s.state.turnSeat = 1;
    s.state.memory = 3;
    const opponent = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await opponent;
    s.state.turnSeat = 0;
    s.state.memory = 3;
    const owner = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("regulus").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === paid[1]));
    advance(s.engine).endMainPhaseIfOpen(0);
    await owner;
  });
});

describe("RB1-030 Regulusmon — KB Q&A rulings", () => {
  it("triggers the [When Digivolving] effect gained from a Gammamon-named digivolution card (Q4104)", async () => {
    const s = await digivolveOverWhenDigivolvingGammamon("RB1-030");

    expect(s.perm("host").topCard.cardId).toBe("RB1-030");
    expect(hiroWasPlayed(s)).toBe(true);
  });

  it("activates a gained [When Digivolving] ＜Blitz＞ and attacks while the opponent has memory (Q4105)", async () => {
    const s = await blitzThroughCopiedGammamon("RB1-030");

    expect(s.perm("host").topCard.cardId).toBe("RB1-030");
    expect(s.state.players[1]!.security).toHaveLength(0);
  });

  it("does not activate a Gammamon-named source's inherited effect a second time as its own (Q4106)", async () => {
    expect(await hostDpWithGammamonInheritedSource([], "RB1-030")).toBe(9000 + 2000);
    expect(await hostDpWithGammamonInheritedSource(["RB1-030"], "RB1-010")).toBe(11000 + 2000);
  });
});

describe("GitHub #5284 Regulusmon shared once-per-turn effect", () => {
  it("cannot trash a second card when attacking after paying the same effect when digivolving", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT10-078", as: "base" }],
          hand: [{ card: "RB1-030", as: "regulusmon" }, "BT10-094", "BT10-094"],
          deck: ["BT1-009", "BT1-010", "BT1-011"],
        },
        1: { security: ["BT1-009", "BT1-010"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("regulusmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "RB1-030" && s.state.pendingDecision === undefined);
    expect(s.state.players[0]!.trash.filter((card) => card.cardId === "BT10-094")).toHaveLength(1);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
    expect(s.state.players[0]!.trash.filter((card) => card.cardId === "BT10-094")).toHaveLength(1);
    expect(s.state.players[0]!.hand.filter((card) => card.cardId === "BT10-094")).toHaveLength(1);
  });
});

describe("RB1-030 Regulusmon inherited copy of a GulusGammamon On Deletion", () => {
  it("plays Gammamon from the trash when the blocking host is deleted in battle", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "P-240", as: "arcturusmon", under: ["EX12-007", "RB1-029", "RB1-030"] }],
          trash: [{ card: "RB1-005", as: "gammamon" }],
        },
        1: { battleArea: [{ card: "BT1-020", as: "attacker", dp: 30000 }], security: ["BT1-010"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.turnSeat = 1;
    await s.ready();

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
    expect(
      s.engine.applyIntent(0, { type: "declareBlock", blockerPermanentId: s.perm("arcturusmon").permanentId }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard?.instanceId === s.inst("gammamon").instanceId,
      ),
    );

    const gammamon = s.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard?.instanceId === s.inst("gammamon").instanceId,
    );
    expect(gammamon?.isSuspended).toBe(true);
  });
});
