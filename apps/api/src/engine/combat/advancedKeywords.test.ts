import { describe, it, expect } from "vitest";
import { EffectDuration, type Permanent, type PlayerState } from "@aegis/shared";
import { advance } from "../testkit/advance.js";
import { makeInstance as instance, makeDigimon as digimon, setupEngine as setup, settle } from "../testkit/harness.js";
import "../../cards/index.js";

/**
 * A3 behavioral proofs for Lane R8's six keyword mechanics (Comprehensive Rules §16):
 * ＜Raid＞ (§16-23), ＜Fortitude＞ (§16-27), ＜Scapegoat＞ (§16-32), and ＜Decoy＞ (§16-18).
 * Each real printer's card only carries a `Static` marker (empty actions) in its compiled
 * IR; the behavior is consumed generically from the printed keyword, mirroring how
 * ＜Collision＞/＜Iceclad＞/＜Blocker＞ are read (combat/legality.ts, combat/controller.ts,
 * effects/primitives.ts) rather than being special-cased per card.
 *
 * Each `describe` pairs the real behavior with a NEGATIVE CONTROL (an otherwise-identical
 * board with a non-keyword card in the keyword holder's seat) proving the effect does NOT
 * happen without the keyword — ruling out "it always redirects/replays/prevents" bugs.
 */

const NON_KEYWORD_CARD = "AD1-001"; // no top-level combat keyword used by these fixtures
const VANILLA_CARD = "BT1-013"; // no main, inherited, Security, or keyword text

describe("§16-23 <Raid> — switch the attack target to the opponent's highest-DP unsuspended Digimon", () => {
  it("a printed-<Raid> attacker redirects a player-directed attack onto the opponent's highest-DP unsuspended Digimon", async () => {
    const s = setup({ autoSelectCards: true });
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const attacker = digimon(0, 5000, "AD1-004"); // printed <Raid>
    p0.battleArea.push(attacker);
    const highDP = digimon(1, 9000, NON_KEYWORD_CARD); // unsuspended, highest DP
    const lowDP = digimon(1, 1000, NON_KEYWORD_CARD); // unsuspended, lower DP — must NOT be chosen
    p1.battleArea.push(highDP, lowDP);
    await s.engine.recomputeContinuousEffects();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => p0.battleArea.some((p) => p.permanentId === attacker.permanentId) === false, 5000);

    // Redirected onto the highest-DP unsuspended Digimon and battled it instead of the player:
    // the 5000 DP attacker loses that battle to the 9000 DP defender, so the ATTACKER's own
    // removal (impossible for a normal, unblocked player-directed attack, which never deletes
    // the attacker) is the proof the redirect — and the ensuing battle — actually happened.
    expect(p0.battleArea.some((p) => p.permanentId === attacker.permanentId)).toBe(false);
    // The (higher-DP) defender WINS the battle and survives.
    expect(p1.battleArea.some((p) => p.permanentId === highDP.permanentId)).toBe(true);
    // The lower-DP Digimon was never a legal Raid target and is untouched.
    expect(p1.battleArea.some((p) => p.permanentId === lowDP.permanentId)).toBe(true);
  });

  it("announces <Raid> only when an unsuspended opposing Digimon could become the target", async () => {
    const raidAnnouncements = async (opponentDigimon: "none" | "suspended" | "unsuspended") => {
      const s = setup({ autoSelectCards: true });
      const p0 = s.state.players[0] as PlayerState;
      const p1 = s.state.players[1] as PlayerState;
      const attacker = digimon(0, 15000, "AD1-004");
      p0.battleArea.push(attacker);
      p1.security.push(instance("AD1-001", 1, false));
      if (opponentDigimon !== "none") {
        const defender = digimon(1, 1000, NON_KEYWORD_CARD);
        defender.isSuspended = opponentDigimon === "suspended";
        p1.battleArea.push(defender);
      }
      await s.engine.recomputeContinuousEffects();

      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: attacker.permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.state.pendingDecision === undefined &&
          s.events.some(
            (event) => event.kind === "securityChecked" || (event.kind === "cardsMoved" && event.to === "trash"),
          ),
        5000,
      );
      return s.events
        .filter(
          (event) =>
            (event.kind === "effectTriggered" || event.kind === "effectResolved") &&
            event.effectKey.endsWith("/keyword/Raid"),
        )
        .map((event) => event.kind);
    };

    expect(await raidAnnouncements("none")).toEqual([]);
    expect(await raidAnnouncements("suspended")).toEqual([]);
    expect(await raidAnnouncements("unsuspended")).toEqual(["effectTriggered", "effectResolved"]);
  });

  it("NEGATIVE CONTROL: a non-<Raid> attacker never redirects a player-directed attack", async () => {
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const attacker = digimon(0, 5000, NON_KEYWORD_CARD); // no <Raid>
    p0.battleArea.push(attacker);
    const highDP = digimon(1, 9000, NON_KEYWORD_CARD);
    p1.battleArea.push(highDP);
    await s.engine.recomputeContinuousEffects();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => false, 200);

    // No redirect: the untouched opponent Digimon is still on the field, and the attacker
    // (unopposed by any battle) survives too.
    expect(p1.battleArea.some((p) => p.permanentId === highDP.permanentId)).toBe(true);
    expect(p0.battleArea.some((p) => p.permanentId === attacker.permanentId)).toBe(true);
  });

  it("does not prompt or redirect after a Raid attacker leaves during When Attacking", async () => {
    const s = setup(
      {
        0: { battleArea: [{ card: "BT3-086", as: "attacker" }], hand: ["BT3-092"] },
        1: { battleArea: [{ card: NON_KEYWORD_CARD, as: "highest", dp: 9000 }], security: ["BT1-001"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    await s.ready();
    const attackerId = s.perm("attacker").permanentId;
    const highestId = s.perm("highest").permanentId;
    const securityBefore = p1.security.length;

    // BT3-086's real [When Attacking] effect plays MaloMyotismon, then deletes itself.
    // Grant Raid through the documented ledger seam so this test isolates the combat rule's
    // declaration snapshot while exercising an actual production OnUseAttack departure.
    advance(s.engine).ledgers.continuous.addKeywordGrant(attackerId, "Raid", EffectDuration.Permanent);
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: attackerId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !p0.battleArea.some((permanent) => permanent.permanentId === attackerId), 5000);
    await settle();

    expect(p0.battleArea.some((permanent) => permanent.permanentId === attackerId)).toBe(false);
    expect(p1.battleArea.some((permanent) => permanent.permanentId === highestId)).toBe(true);
    expect(p1.security).toHaveLength(securityBefore);
    expect(
      s.events.filter((event) => event.kind === "attackDeclared" && event.target.kind === "permanent"),
    ).toHaveLength(0);
    expect(s.decisions.filter(({ req }) => req.kind === "selectCards" && req.promptText.includes("Raid"))).toHaveLength(
      0,
    );
    expect(s.state.pendingDecision).toBeUndefined();
  });
});

describe("§16-27 <Fortitude> — replay for free on deletion, when the holder had digivolution cards", () => {
  it("a <Fortitude> Digimon with digivolution cards is replayed for free after a battle deletion", async () => {
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const attacker = digimon(1, 9000, NON_KEYWORD_CARD);
    p1.battleArea.push(attacker);
    const fort = digimon(0, 4000, "BT20-034"); // printed <Fortitude>
    fort.isSuspended = true;
    fort.stack.push(instance(NON_KEYWORD_CARD, 0, true)); // "with digivolution cards"
    p0.battleArea.push(fort);
    await s.engine.recomputeContinuousEffects();
    s.state.turnSeat = 1; // seat 1 is declaring the attack
    const trashBefore = p0.trash.length;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "permanent", permanentId: fort.permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => p0.trash.length > trashBefore, 5000);
    await settle(() => p0.battleArea.some((p) => p.topCard?.cardId === "BT20-034"), 5000);

    expect(p0.battleArea.some((p) => p.topCard?.cardId === "BT20-034")).toBe(true);
    // Replayed as a FRESH permanent with no digivolution cards (the stack card stays trashed).
    const replayed = p0.battleArea.find((p) => p.topCard?.cardId === "BT20-034");
    expect(replayed?.stack.length).toBe(0);
  });

  it("NEGATIVE CONTROL: a <Fortitude> Digimon with NO digivolution cards stays deleted", async () => {
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const attacker = digimon(1, 9000, NON_KEYWORD_CARD);
    p1.battleArea.push(attacker);
    const fort = digimon(0, 4000, "BT20-034"); // printed <Fortitude>, but NO stack
    fort.isSuspended = true;
    p0.battleArea.push(fort);
    await s.engine.recomputeContinuousEffects();
    s.state.turnSeat = 1;
    const trashBefore = p0.trash.length;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "permanent", permanentId: fort.permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => p0.trash.length > trashBefore, 5000);
    await settle(() => false, 100);

    expect(p0.battleArea.some((p) => p.topCard?.cardId === "BT20-034")).toBe(false);
  });
});

describe("§16-32 <Scapegoat> — delete another Digimon to prevent a non-owner-effect deletion", () => {
  it("deleting another Digimon prevents a <Scapegoat> Digimon's battle deletion", async () => {
    const s = setup({ autoSelectCards: true });
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const other = digimon(0, 1000, NON_KEYWORD_CARD); // the sacrifice
    const scapegoater = digimon(0, 4000, "BT20-080"); // printed <Scapegoat>
    scapegoater.isSuspended = true;
    p0.battleArea.push(other, scapegoater);
    const attacker = digimon(1, 9000, NON_KEYWORD_CARD);
    p1.battleArea.push(attacker);
    await s.engine.recomputeContinuousEffects();
    s.state.turnSeat = 1;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "permanent", permanentId: scapegoater.permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => p0.battleArea.some((p) => p.permanentId === other.permanentId) === false, 5000);

    expect(p0.battleArea.some((p) => p.permanentId === scapegoater.permanentId)).toBe(true); // spared
    expect(p0.battleArea.some((p) => p.permanentId === other.permanentId)).toBe(false); // sacrificed
    // Without this the client sees only the sacrifice leaving and a battle that quietly failed.
    expect(s.events.filter((e) => e.kind === "deletionPrevented")).toEqual([
      {
        kind: "deletionPrevented",
        keyword: "Scapegoat",
        seat: 0,
        permanentId: scapegoater.permanentId,
        cardId: "BT20-080",
        paidPermanentId: other.permanentId,
        paidCardId: NON_KEYWORD_CARD,
      },
    ]);
  });

  it("with no OTHER Digimon to sacrifice, a <Scapegoat> Digimon is deleted normally", async () => {
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const scapegoater = digimon(0, 4000, "BT20-080"); // printed <Scapegoat>, no other Digimon
    scapegoater.isSuspended = true;
    p0.battleArea.push(scapegoater);
    const attacker = digimon(1, 9000, NON_KEYWORD_CARD);
    p1.battleArea.push(attacker);
    await s.engine.recomputeContinuousEffects();
    s.state.turnSeat = 1;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "permanent", permanentId: scapegoater.permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => p0.battleArea.length === 0, 5000);

    expect(p0.battleArea.some((p) => p.permanentId === scapegoater.permanentId)).toBe(false);
  });

  it("NEGATIVE CONTROL: a non-<Scapegoat> Digimon is deleted even with another Digimon available", async () => {
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const other = digimon(0, 1000, VANILLA_CARD);
    const target = digimon(0, 4000, VANILLA_CARD); // NO <Scapegoat>
    target.isSuspended = true;
    p0.battleArea.push(other, target);
    const attacker = digimon(1, 9000, VANILLA_CARD);
    p1.battleArea.push(attacker);
    await s.engine.recomputeContinuousEffects();
    s.state.turnSeat = 1;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "permanent", permanentId: target.permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => p0.battleArea.some((p) => p.permanentId === target.permanentId) === false, 5000);

    expect(p0.battleArea.some((p) => p.permanentId === target.permanentId)).toBe(false); // deleted
    expect(p0.battleArea.some((p) => p.permanentId === other.permanentId)).toBe(true); // untouched
  });
});

describe("§16-18 <Decoy> — delete this Digimon to prevent an opponent-effect deletion of another matching Digimon", () => {
  it("does not fabricate deletion immunity for a non-Yuu Bagra Army Digimon", async () => {
    // BT11-082 legitimately protects Yuu Amano through its separate printed [All Turns]
    // effect. That restriction must not leak to another Bagra Army Digimon merely because
    // it also matches the card's <Decoy> specifier.
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    p0.battleArea.push(digimon(0, 6000, "BT11-082"));
    p0.battleArea.push(digimon(0, 3000, "BT10-070")); // Bagra Army Digimon, but not Yuu Amano
    await s.engine.recomputeContinuousEffects();
    const reader = (s.engine as unknown as { continuous: { hasRestriction(id: string, r: string): boolean } })
      .continuous;
    const bagraArmyPermanent = p0.battleArea.find((p) => p.topCard?.cardId === "BT10-070");
    expect(reader.hasRestriction(bagraArmyPermanent!.permanentId, "beDeleted")).toBe(false);
  });

  it("the real mechanic: deleting the <Decoy> holder prevents an opponent-effect deletion of another matching Digimon", async () => {
    const s = setup({ autoSelectCards: true, autoAcceptOptional: true });
    const p0 = s.state.players[0] as PlayerState;
    const decoyHolder = digimon(0, 6000, "BT11-082"); // printed <Decoy ([Bagra Army])>
    const protectedDigimon = digimon(0, 3000, "BT10-070"); // Damemon: [Bagra Army]-trait Digimon
    p0.battleArea.push(decoyHolder, protectedDigimon);
    await s.engine.recomputeContinuousEffects();

    // Simulate an opponent's effect deleting `protectedDigimon` — resolving under seat 1.
    const primitives = (
      s.engine as unknown as {
        primitives: { deletePermanent(ids: string[], cause?: string): Promise<number> };
      }
    ).primitives;
    s.state.turnSeat = 1; // controllerSeat() reads state.turnSeat -> the "opponent" for seat 0's card
    const trashBefore = p0.trash.length;
    const deletedCount = await primitives.deletePermanent([protectedDigimon.permanentId], "byEffect");

    // The Decoy holder was deleted INSTEAD — the protected Digimon survives.
    expect(deletedCount).toBe(0); // the ORIGINAL target was not among the deleted set
    expect(p0.battleArea.some((p) => p.permanentId === protectedDigimon.permanentId)).toBe(true);
    expect(p0.battleArea.some((p) => p.permanentId === decoyHolder.permanentId)).toBe(false);
    expect(p0.trash.length).toBeGreaterThan(trashBefore);
    expect(s.events.filter((e) => e.kind === "deletionPrevented")).toEqual([
      {
        kind: "deletionPrevented",
        keyword: "Decoy",
        seat: 0,
        permanentId: protectedDigimon.permanentId,
        cardId: "BT10-070",
        paidPermanentId: decoyHolder.permanentId,
        paidCardId: "BT11-082",
      },
    ]);
  });

  it("orders every matching <Decoy> holder as its own reaction and pays only the one used", async () => {
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const firstDecoy = digimon(0, 6000, "BT11-082");
    const secondDecoy = digimon(0, 6000, "BT11-082");
    secondDecoy.stack.push(instance(NON_KEYWORD_CARD, 0, true));
    const protectedDigimon = digimon(0, 3000, "BT10-070");
    p0.battleArea.push(firstDecoy, secondDecoy, protectedDigimon);
    await s.engine.recomputeContinuousEffects();
    s.state.turnSeat = 1;
    const primitives = (
      s.engine as unknown as {
        primitives: { deletePermanent(ids: string[], cause?: string): Promise<number> };
      }
    ).primitives;
    const answerDecoy = async (holder: Permanent, use: boolean) => {
      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      expect(s.decisions.at(-1)!.req.options!.candidateInstanceIds).toEqual([holder.topCard.instanceId]);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: s.state.pendingDecision!.decisionId,
          response: { kind: "selectCards", instanceIds: use ? [holder.topCard.instanceId] : [] },
        }),
      ).toEqual({ ok: true });
    };

    const deletion = primitives.deletePermanent([protectedDigimon.permanentId], "byEffect");
    await answerDecoy(firstDecoy, false);
    const orderKeys = s.decisions.find(({ req }) => req.kind === "orderTriggers")?.req.options?.triggerKeys ?? [];
    expect(orderKeys).toEqual([
      expect.stringContaining(`keyword-decoy/${firstDecoy.permanentId}/`),
      expect.stringContaining(`keyword-decoy/${secondDecoy.permanentId}/`),
    ]);
    await answerDecoy(secondDecoy, true);
    await deletion;

    expect(p0.battleArea.some(({ permanentId }) => permanentId === protectedDigimon.permanentId)).toBe(true);
    expect(p0.battleArea.some(({ permanentId }) => permanentId === firstDecoy.permanentId)).toBe(true);
    expect(p0.battleArea.some(({ permanentId }) => permanentId === secondDecoy.permanentId)).toBe(false);
  });

  it("keeps distinct origins when different printed <Decoy> cards can protect the same Digimon", async () => {
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const commandramon = digimon(0, 2000, "EX3-046"); // Decoy ([D-Brigade])
    const machmon = digimon(0, 4000, "BT6-059"); // Decoy (Black)
    const protectedDigimon = digimon(0, 4000, "EX3-049"); // black and D-Brigade
    p0.battleArea.push(commandramon, machmon, protectedDigimon);
    await s.engine.recomputeContinuousEffects();
    s.state.turnSeat = 1;
    const primitives = (
      s.engine as unknown as {
        primitives: { deletePermanent(ids: string[], cause?: string): Promise<number> };
      }
    ).primitives;

    const deletion = primitives.deletePermanent([protectedDigimon.permanentId], "byEffect");
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const commandramonDecision = s.state.pendingDecision!;
    expect(s.decisions.at(-1)!.req).toMatchObject({
      sourceCardId: "EX3-046",
      options: { candidateInstanceIds: [commandramon.topCard.instanceId] },
    });
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: commandramonDecision.decisionId,
        response: { kind: "selectCards", instanceIds: [] },
      }),
    ).toEqual({ ok: true });

    await settle(
      () =>
        s.state.pendingDecision?.kind === "selectCards" &&
        s.state.pendingDecision.decisionId !== commandramonDecision.decisionId,
    );
    const machmonDecision = s.state.pendingDecision!;
    expect(s.decisions.at(-1)!.req).toMatchObject({
      sourceCardId: "BT6-059",
      options: { candidateInstanceIds: [machmon.topCard.instanceId] },
    });
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: machmonDecision.decisionId,
        response: { kind: "selectCards", instanceIds: [machmon.topCard.instanceId] },
      }),
    ).toEqual({ ok: true });
    await deletion;

    expect(p0.battleArea.some(({ permanentId }) => permanentId === protectedDigimon.permanentId)).toBe(true);
    expect(p0.battleArea.some(({ permanentId }) => permanentId === commandramon.permanentId)).toBe(true);
    expect(p0.battleArea.some(({ permanentId }) => permanentId === machmon.permanentId)).toBe(false);
  });

  it("attributes an inherited <Decoy> decision to its digivolution-card source", async () => {
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const inheritedDecoy = digimon(0, 4000, "BT8-063"); // X Antibody host
    inheritedDecoy.stack.push(instance("BT8-060", 0, true)); // Ryudamon inherited Decoy (Black)
    const protectedDigimon = digimon(0, 4000, "EX3-049");
    p0.battleArea.push(inheritedDecoy, protectedDigimon);
    await s.engine.recomputeContinuousEffects();
    s.state.turnSeat = 1;
    const primitives = (
      s.engine as unknown as {
        primitives: { deletePermanent(ids: string[], cause?: string): Promise<number> };
      }
    ).primitives;

    const deletion = primitives.deletePermanent([protectedDigimon.permanentId], "byEffect");
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const decision = s.state.pendingDecision!;
    expect(s.decisions.at(-1)!.req).toMatchObject({
      sourceCardId: "BT8-060",
      options: {
        candidateInstanceIds: [inheritedDecoy.topCard.instanceId],
        effectText:
          "[All Turns] While this Digimon has [X-Antibody] in its traits, it gains ＜Decoy (Black)＞. (When one of your other black Digimon would be deleted by an opponent's effect, you may delete this Digimon to prevent that deletion.)",
      },
    });
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "selectCards", instanceIds: [inheritedDecoy.topCard.instanceId] },
      }),
    ).toEqual({ ok: true });
    await deletion;

    expect(p0.battleArea.some(({ permanentId }) => permanentId === protectedDigimon.permanentId)).toBe(true);
    expect(p0.battleArea.some(({ permanentId }) => permanentId === inheritedDecoy.permanentId)).toBe(false);
  });

  it("NEGATIVE CONTROL: with no <Decoy> holder present, an opponent-effect deletion goes through", async () => {
    const s = setup({ autoSelectCards: true, autoAcceptOptional: true });
    const p0 = s.state.players[0] as PlayerState;
    const target = digimon(0, 3000, "BT10-070"); // [Bagra Army]-trait Digimon, no Decoy holder on board
    p0.battleArea.push(target);
    await s.engine.recomputeContinuousEffects();

    const primitives = (
      s.engine as unknown as {
        primitives: { deletePermanent(ids: string[], cause?: string): Promise<number> };
      }
    ).primitives;
    s.state.turnSeat = 1;
    const deletedCount = await primitives.deletePermanent([target.permanentId], "byEffect");

    expect(deletedCount).toBe(1);
    expect(p0.battleArea.some((p) => p.permanentId === target.permanentId)).toBe(false);
  });
});

describe("§16-19 <Armor Purge> — trash this Digimon's own top card to prevent its deletion", () => {
  it("a printed-<Armor Purge> holder with a digivolution card survives by shedding its top card", async () => {
    const s = setup({ autoSelectCards: true });
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const holder = digimon(0, 5000, "BT8-012"); // printed <Armor Purge> (Flamedramon)
    holder.isSuspended = true;
    holder.stack.push(instance(NON_KEYWORD_CARD, 0, true));
    const underlyingInstanceId = holder.stack[0]!.instanceId;
    p0.battleArea.push(holder);
    const attacker = digimon(1, 9000, NON_KEYWORD_CARD);
    p1.battleArea.push(attacker);
    await s.engine.recomputeContinuousEffects();
    s.state.turnSeat = 1;
    const trashBefore = p0.trash.length;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "permanent", permanentId: holder.permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => p0.trash.length > trashBefore, 5000);
    await settle(() => false, 50); // flush: no later async step should still be pending

    // The permanent SURVIVES: same permanentId, now showing the promoted stack card.
    const survivor = p0.battleArea.find((p) => p.permanentId === holder.permanentId);
    expect(survivor).toBeDefined();
    expect(survivor?.topCard?.instanceId).toBe(underlyingInstanceId);
    expect(survivor?.stack.length).toBe(0);
    // The purged (old) top card is in trash — the "shed armor".
    expect(p0.trash.some((c) => c.cardId === "BT8-012")).toBe(true);
    // Announced naming the holder, not the card the purge promoted in its place.
    expect(s.events.filter((e) => e.kind === "deletionPrevented")).toEqual([
      {
        kind: "deletionPrevented",
        keyword: "Armor Purge",
        seat: 0,
        permanentId: holder.permanentId,
        cardId: "BT8-012",
        paidPermanentId: holder.permanentId,
        paidCardId: "BT8-012",
      },
    ]);
  });

  it("NEGATIVE CONTROL: with NO digivolution card to reveal, an <Armor Purge> holder is deleted normally", async () => {
    const s = setup({ autoSelectCards: true });
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const holder = digimon(0, 5000, "BT8-012"); // printed <Armor Purge>, but NO stack
    holder.isSuspended = true;
    p0.battleArea.push(holder);
    const attacker = digimon(1, 9000, NON_KEYWORD_CARD);
    p1.battleArea.push(attacker);
    await s.engine.recomputeContinuousEffects();
    s.state.turnSeat = 1;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "permanent", permanentId: holder.permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => p0.battleArea.some((p) => p.permanentId === holder.permanentId) === false, 5000);

    expect(p0.battleArea.some((p) => p.permanentId === holder.permanentId)).toBe(false);
  });

  it("NEGATIVE CONTROL: a non-<Armor Purge> Digimon with a digivolution card is deleted normally", async () => {
    const s = setup({ autoSelectCards: true });
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const target = digimon(0, 5000, NON_KEYWORD_CARD); // no <Armor Purge>
    target.isSuspended = true;
    target.stack.push(instance(NON_KEYWORD_CARD, 0, false));
    p0.battleArea.push(target);
    const attacker = digimon(1, 9000, NON_KEYWORD_CARD);
    p1.battleArea.push(attacker);
    await s.engine.recomputeContinuousEffects();
    s.state.turnSeat = 1;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "permanent", permanentId: target.permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => p0.battleArea.some((p) => p.permanentId === target.permanentId) === false, 5000);

    expect(p0.battleArea.some((p) => p.permanentId === target.permanentId)).toBe(false);
  });
});

describe("§16-37 <Fragment (N)> — choose and trash N of this Digimon's own digivolution cards to prevent its deletion", () => {
  it("a printed-<Fragment (3)> holder with exactly 3 digivolution cards survives by trashing all 3", async () => {
    const s = setup({ autoSelectCards: true });
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const holder = digimon(0, 11000, "EX10-033"); // printed <Fragment (3)> (Pyramidimon)
    holder.isSuspended = true;
    holder.stack.push(
      instance(NON_KEYWORD_CARD, 0, false),
      instance(NON_KEYWORD_CARD, 0, false),
      instance(NON_KEYWORD_CARD, 0, false),
    );
    const stackInstanceIds = holder.stack.map((c) => c.instanceId);
    p0.battleArea.push(holder);
    const attacker = digimon(1, 15000, NON_KEYWORD_CARD);
    p1.battleArea.push(attacker);
    await s.engine.recomputeContinuousEffects();
    s.state.turnSeat = 1;
    const trashBefore = p0.trash.length;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "permanent", permanentId: holder.permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => p0.trash.length >= trashBefore + 3, 5000);

    // The permanent SURVIVES, top card unchanged, stack fully emptied.
    const survivor = p0.battleArea.find((p) => p.permanentId === holder.permanentId);
    expect(survivor).toBeDefined();
    expect(survivor?.topCard?.cardId).toBe("EX10-033");
    expect(survivor?.stack.length).toBe(0);
    for (const id of stackInstanceIds) {
      expect(p0.trash.some((c) => c.instanceId === id)).toBe(true);
    }
    expect(s.events.filter((e) => e.kind === "deletionPrevented")).toEqual([
      {
        kind: "deletionPrevented",
        keyword: "Fragment",
        seat: 0,
        permanentId: holder.permanentId,
        cardId: "EX10-033",
      },
    ]);
  });

  it("NEGATIVE CONTROL: with FEWER than 3 digivolution cards, a <Fragment (3)> holder is deleted normally", async () => {
    const s = setup({ autoSelectCards: true });
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const holder = digimon(0, 11000, "EX10-033"); // printed <Fragment (3)>, only 2 stacked
    holder.isSuspended = true;
    holder.stack.push(instance(NON_KEYWORD_CARD, 0, false), instance(NON_KEYWORD_CARD, 0, false));
    p0.battleArea.push(holder);
    const attacker = digimon(1, 15000, NON_KEYWORD_CARD);
    p1.battleArea.push(attacker);
    await s.engine.recomputeContinuousEffects();
    s.state.turnSeat = 1;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "permanent", permanentId: holder.permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => p0.battleArea.some((p) => p.permanentId === holder.permanentId) === false, 5000);

    expect(p0.battleArea.some((p) => p.permanentId === holder.permanentId)).toBe(false);
  });

  it("NEGATIVE CONTROL: a non-<Fragment> Digimon with 3 digivolution cards is deleted normally", async () => {
    const s = setup({ autoSelectCards: true });
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const target = digimon(0, 11000, NON_KEYWORD_CARD); // no <Fragment>
    target.isSuspended = true;
    target.stack.push(
      instance(NON_KEYWORD_CARD, 0, false),
      instance(NON_KEYWORD_CARD, 0, false),
      instance(NON_KEYWORD_CARD, 0, false),
    );
    p0.battleArea.push(target);
    const attacker = digimon(1, 15000, NON_KEYWORD_CARD);
    p1.battleArea.push(attacker);
    await s.engine.recomputeContinuousEffects();
    s.state.turnSeat = 1;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "permanent", permanentId: target.permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => p0.battleArea.some((p) => p.permanentId === target.permanentId) === false, 5000);

    expect(p0.battleArea.some((p) => p.permanentId === target.permanentId)).toBe(false);
  });
});

describe("§16-43 <Ascension> — when this card is deleted, you may place it at the top of your security stack", () => {
  it("a printed-<Ascension> Digimon, when deleted, may be placed on top of security instead of trash", async () => {
    const s = setup({ autoSelectCards: true, autoAcceptOptional: true });
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const holder = digimon(0, 12000, "EX12-047"); // printed <Ascension> (Amaterasumon)
    holder.isSuspended = true;
    const holderCardId = holder.topCard!.cardId;
    p0.battleArea.push(holder);
    const attacker = digimon(1, 15000, NON_KEYWORD_CARD);
    p1.battleArea.push(attacker);
    await s.engine.recomputeContinuousEffects();
    s.state.turnSeat = 1;
    const securityBefore = p0.security.length;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "permanent", permanentId: holder.permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => p0.security.length > securityBefore, 5000);
    await settle(() => false, 50); // flush: no later async step should still be pending

    expect(p0.battleArea.some((p) => p.permanentId === holder.permanentId)).toBe(false);
    // NOT in trash: it went to the top of security instead.
    expect(p0.trash.some((c) => c.cardId === holderCardId)).toBe(false);
    expect(p0.security[0]?.cardId).toBe(holderCardId);
    expect(p0.security[0]?.faceUp).toBe(false);
  });

  it("NEGATIVE CONTROL: a non-<Ascension> Digimon, when deleted, goes to trash (never security)", async () => {
    const s = setup({ autoSelectCards: true });
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const target = digimon(0, 12000, NON_KEYWORD_CARD); // no <Ascension>
    target.isSuspended = true;
    p0.battleArea.push(target);
    const attacker = digimon(1, 15000, NON_KEYWORD_CARD);
    p1.battleArea.push(attacker);
    await s.engine.recomputeContinuousEffects();
    s.state.turnSeat = 1;
    const securityBefore = p0.security.length;
    const trashBefore = p0.trash.length;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "permanent", permanentId: target.permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => p0.trash.length > trashBefore, 5000);

    expect(p0.security.length).toBe(securityBefore);
    expect(p0.trash.some((c) => c.cardId === NON_KEYWORD_CARD)).toBe(true);
  });
});

describe("§16-21 <Material Save N> — when this Digimon is deleted, place N specified digivolution cards under a Tamer instead of trashing them", () => {
  it("a printed-<Material Save 1> holder's matching DigiXros-requirement card is saved under a Tamer", async () => {
    const s = setup({ autoSelectCards: true });
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const tamer = digimon(0, 0, "AD1-019"); // a Tamer permanent
    const holder = digimon(0, 12000, "BT19-063"); // printed <Material Save 1>, DigiXros [SkullKnightmon] x [DeadlyAxemon]
    holder.isSuspended = true;
    const matching = instance("BT7-058", 0, false); // SkullKnightmon printing — matches the requirement
    const nonMatching = instance(NON_KEYWORD_CARD, 0, false); // does NOT match
    holder.stack.push(matching, nonMatching);
    p0.battleArea.push(tamer, holder);
    const attacker = digimon(1, 15000, NON_KEYWORD_CARD);
    p1.battleArea.push(attacker);
    await s.engine.recomputeContinuousEffects();
    s.state.turnSeat = 1;
    const trashBefore = p0.trash.length;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "permanent", permanentId: holder.permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => p0.trash.length > trashBefore, 5000);
    await settle(() => false, 50); // flush: no later async step should still be pending

    // The matching card is now under the Tamer, NOT in trash.
    const tamerAfter = p0.battleArea.find((p) => p.permanentId === tamer.permanentId);
    expect(tamerAfter?.stack.some((c) => c.instanceId === matching.instanceId)).toBe(true);
    expect(p0.trash.some((c) => c.instanceId === matching.instanceId)).toBe(false);
    // The non-matching card was trashed along with the rest of the deleted permanent.
    expect(p0.trash.some((c) => c.instanceId === nonMatching.instanceId)).toBe(true);
  });

  it("NEGATIVE CONTROL: a non-<Material Save> Digimon's matching-named card is trashed like any other", async () => {
    const s = setup({ autoSelectCards: true });
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const tamer = digimon(0, 0, "AD1-019");
    const target = digimon(0, 12000, NON_KEYWORD_CARD); // no <Material Save>
    target.isSuspended = true;
    const matching = instance("BT7-058", 0, false);
    target.stack.push(matching);
    p0.battleArea.push(tamer, target);
    const attacker = digimon(1, 15000, NON_KEYWORD_CARD);
    p1.battleArea.push(attacker);
    await s.engine.recomputeContinuousEffects();
    s.state.turnSeat = 1;
    const trashBefore = p0.trash.length;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "permanent", permanentId: target.permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => p0.trash.length > trashBefore, 5000);
    await settle(() => false, 50); // flush: no later async step should still be pending

    const tamerAfter = p0.battleArea.find((p) => p.permanentId === tamer.permanentId);
    expect(tamerAfter?.stack.some((c) => c.instanceId === matching.instanceId)).toBe(false);
    expect(p0.trash.some((c) => c.instanceId === matching.instanceId)).toBe(true);
  });
});

describe("§16-39 <Progress> — this Digimon isn't affected by your opponent's effects while attacking", () => {
  it("a printed-<Progress> attacker survives an opponent's targeted-delete effect during its own attack", async () => {
    const s = setup({ autoSelectCards: true, autoAcceptOptional: true });
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    // The ONLY level<=4 Digimon on the attacking side, so BT10-070's targeted delete has
    // exactly one candidate. Immunity prevents affectation, not selection (§15-15-5-3).
    const attacker = digimon(0, 6000, "P-189"); // printed <Progress>, level 4
    p0.battleArea.push(attacker);
    // BT10-070 Damemon: "[Opponent's Turn][Once Per Turn] When an opponent's Digimon attacks,
    // by trashing 1 of this Digimon's digivolution cards, delete 1 of your opponent's level 4
    // or lower Digimon." — the correct polarity: it reacts to the OPPOSING side attacking.
    const damemon = digimon(1, 3000, "BT10-070");
    damemon.stack.push(instance(NON_KEYWORD_CARD, 1, false));
    p1.battleArea.push(damemon);
    // Seed a non-empty security stack so the player-directed attack does not instantly end
    // the game on an empty-security loss before the reactive effect gets to resolve.
    p1.security.push(instance(NON_KEYWORD_CARD, 1, false), instance(NON_KEYWORD_CARD, 1, false));
    await s.engine.recomputeContinuousEffects();
    const p1TrashBefore = p1.trash.length;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    // Flush to full quiescence (not just "the first observable change") — Damemon's cost
    // payment and its (attempted) Delete are two separate async steps; settling on only the
    // first would assert before the second has had a chance to run.
    await settle(() => false, 5000);

    // Damemon paid its cost, but Progress prevents the selected attacker from being
    // deleted. With a single candidate selection is automatic; the multi-candidate
    // conformance regression separately proves the immune card remains selectable.
    expect(p1.trash.length).toBeGreaterThan(p1TrashBefore);
    expect(p0.battleArea.some((p) => p.permanentId === attacker.permanentId)).toBe(true);
  });

  it("NEGATIVE CONTROL: a non-<Progress> attacker IS deleted by the same opponent effect during its attack", async () => {
    const s = setup({ autoSelectCards: true, autoAcceptOptional: true });
    const p0 = s.state.players[0] as PlayerState;
    const p1 = s.state.players[1] as PlayerState;
    const attacker = digimon(0, 6000, NON_KEYWORD_CARD); // level 4, no <Progress>
    p0.battleArea.push(attacker);
    const damemon = digimon(1, 3000, "BT10-070");
    damemon.stack.push(instance(NON_KEYWORD_CARD, 1, false));
    p1.battleArea.push(damemon);
    p1.security.push(instance(NON_KEYWORD_CARD, 1, false), instance(NON_KEYWORD_CARD, 1, false));
    await s.engine.recomputeContinuousEffects();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => false, 5000);

    expect(p0.battleArea.some((p) => p.permanentId === attacker.permanentId)).toBe(false);
  });
});
