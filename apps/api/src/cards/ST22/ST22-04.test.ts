import { describe, expect, it } from "vitest";
import { EffectTiming, Phase } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { drainMicrotasks, setupEngine, settle, type BoardSpec } from "../../engine/testkit/harness.js";
import "../index.js";
import { observe } from "../../engine/testkit/observe.js";

describe("ST22-04 Taomon", () => {
  it("reduces one opposing Digimon by 3000 on play", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "ST22-04", as: "taomon" }] },
        1: { battleArea: [{ card: "BT1-009", dp: 7000, as: "opponent" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const opponent = s.perm("opponent");
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("taomon"));
    await settle(() => opponent.currentDP === 4000);
    expect(opponent.currentDP).toBe(4000);
  });

  it("also prevents that selected Digimon's When Digivolving effects until the opponent's turn ends", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "ST22-04", as: "taomon" },
            { card: "BT1-009", dp: 2000, as: "victim" },
          ],
        },
        1: { battleArea: [{ card: "BT1-009", dp: 7000, as: "opponent" }], hand: [{ card: "AD1-001", as: "evolver" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const opponent = s.perm("opponent");
    await s.ready();

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("taomon"));
    await settle(() => opponent.currentDP === 4000);
    expect(opponent.currentDP).toBe(4000);

    s.state.turnSeat = 1;
    s.state.memory = 5;
    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: opponent.permanentId,
        instanceId: s.inst("evolver").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => opponent.topCard?.cardId === "AD1-001");

    expect(s.perm("victim").currentDP).toBe(2000);
  });
  it("pays the top security once to unsuspend its Sakuyamon host after a completed attack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "ST22-06", as: "host", under: ["ST22-04"] }],
          security: [{ card: "ST1-02", as: "cost" }, "ST1-03"],
        },
        1: { security: ["ST1-02", "ST1-02"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const attack = () =>
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      });
    expect(attack()).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && !s.perm("host").isSuspended);
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.perm("host").isSuspended).toBe(false);
    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.state.players[0]!.trash.some((c) => c.instanceId === s.inst("cost").instanceId)).toBe(true);
    expect(attack()).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.state.players[1]!.security.length === 0);
    expect(s.state.players[1]!.security).toHaveLength(0);
    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.perm("host").isSuspended).toBe(true);
  });
});

describe("ST22-04 Taomon — KB Q&A rulings", () => {
  /**
   * Play Taomon from hand so its [On Play] locks one opposing Digimon: `subject` when `lockSubject`
   * is true, otherwise the `decoy`, which leaves `subject` as the unlocked control. Hands the turn
   * to the opponent afterwards; the lock lasts until their turn ends.
   */
  async function playTaomonLocking(board: BoardSpec, lockSubject: boolean, startingMemory = 10) {
    const preferred: string[] = [];
    const s = setupEngine(board, { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred });
    const locked = s.perm(lockSubject ? "subject" : "decoy");
    preferred.push(locked.permanentId, locked.topCard.instanceId);
    s.state.memory = startingMemory;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("taomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).timingEffectDisabled(locked, "whenDigivolving"));
    await settle(() => s.state.pendingDecision === undefined);
    expect(observe(s.engine).timingEffectDisabled(s.perm("subject"), "whenDigivolving")).toBe(lockSubject);
    s.state.turnSeat = 1;
    s.state.memory = 10;
    const preferSubject = () => preferred.splice(0, preferred.length, s.perm("subject").permanentId);
    return Object.assign(s, { preferSubject });
  }

  async function attackWithTaomonThatDigivolvesMidAttack() {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "ST22-04", as: "attacker", under: ["ST22-01"] },
            { card: "BT1-009", as: "ally" },
          ],
          hand: [
            { card: "ST22-10", as: "option" },
            { card: "ST22-05", as: "sakuyamon" },
          ],
          security: [{ card: "BT1-090", as: "topSecurity" }, "BT1-091"],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: { security: ["ST1-02", "ST1-02", "ST1-02"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking(), 3000);
    return s;
  }

  it("does not impose a timing lock on Magnamon X while its evolution immunity is active", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "ST22-04", as: "taomon" }], deck: ["BT1-009", "BT1-009"], security: ["BT1-009"] },
        1: {
          battleArea: [{ card: "BT21-036", as: "magna" }],
          hand: [{ card: "BT16-102", as: "magnaX" }],
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: s.perm("magna").permanentId,
        instanceId: s.inst("magnaX").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.perm("magna").currentDP).toBe(15000);
    s.state.turnSeat = 0;
    s.state.memory = 3;
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("taomon").instanceId })).toEqual({
      ok: true,
    });
    await settle();
    expect(observe(s.engine).timingEffectDisabled(s.perm("magna"), "whenDigivolving")).toBe(false);
    await turn;
    s.state.turnSeat = 1;
    s.state.phase = Phase.Main;
    s.state.memory = 3;
    await advance(s.engine).recompute();
    expect(observe(s.engine).timingEffectDisabled(s.perm("magna"), "whenDigivolving")).toBe(false);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("magna").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.perm("magna").isSuspended).toBe(false);
    expect(s.state.players[0]!.security).toHaveLength(0);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it.each([true, false])("gates Magnamon X security-triggered reactivation while locked=%s", async (lockSubject) => {
    const s = await playTaomonLocking(
      {
        0: { hand: [{ card: "ST22-04", as: "taomon" }] },
        1: {
          battleArea: [
            { card: "BT16-102", as: "subject", suspended: true, under: ["BT21-036"] },
            { card: "BT1-009", as: "decoy", dp: 8000 },
          ],
          hand: [{ card: "BT4-104", as: "blindingRay" }],
          security: ["BT1-009"],
        },
      },
      lockSubject,
      3,
    );
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("blindingRay").instanceId })).toEqual({
      ok: true,
    });
    await settle();
    expect(s.perm("subject").isSuspended).toBe(lockSubject);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it.each([true, false])(
    "stops a locked Digimon's [When Digivolving] effect from activating on digivolution (locked=%s) (Q5410)",
    async (lockSubject) => {
      const s = await playTaomonLocking(
        {
          0: { hand: [{ card: "ST22-04", as: "taomon" }] },
          1: {
            battleArea: [
              { card: "BT20-030", as: "subject", dp: 8000 },
              { card: "BT1-009", as: "decoy", dp: 8000 },
            ],
            hand: [{ card: "BT20-031", as: "liamon" }],
          },
        },
        lockSubject,
      );
      const taomon = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === "ST22-04")!;

      expect(
        s.engine.applyIntent(1, {
          type: "digivolve",
          permanentId: s.perm("subject").permanentId,
          instanceId: s.inst("liamon").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("subject").topCard.cardId === "BT20-031" && s.state.pendingDecision === undefined);
      await drainMicrotasks();

      expect(taomon.currentDP).toBe(lockSubject ? 7000 : 4000);
    },
  );

  it("still lets a locked Digimon activate its [When Digivolving] [When Attacking] effect when it attacks (Q5411)", async () => {
    const s = await playTaomonLocking(
      {
        0: {
          hand: [{ card: "ST22-04", as: "taomon" }],
          battleArea: [{ card: "BT1-009", as: "victim" }],
          security: ["BT1-009", "BT1-010"],
        },
        1: {
          battleArea: [
            { card: "EX12-037", as: "subject" },
            { card: "BT1-009", as: "decoy", dp: 8000 },
          ],
        },
      },
      true,
    );
    expect(s.state.players[0]!.battleArea).toHaveLength(2);

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("subject").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking(), 3000);

    expect(s.state.players[0]!.battleArea).toHaveLength(1);
  });

  it.each([true, false])(
    "stops another effect from activating a locked Digimon's [When Digivolving] effect (locked=%s) (Q5412)",
    async (lockSubject) => {
      const s = await playTaomonLocking(
        {
          0: { hand: [{ card: "ST22-04", as: "taomon" }] },
          1: {
            battleArea: [
              { card: "BT10-112", as: "subject", suspended: true },
              { card: "BT1-009", as: "decoy", dp: 8000 },
            ],
            hand: [
              { card: "BT10-110", as: "seikenMeppa" },
              { card: "BT10-068", as: "royalKnight" },
            ],
          },
        },
        lockSubject,
      );

      s.preferSubject();
      expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("seikenMeppa").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.players[1]!.trash.some((card) => card.cardId === "BT10-110"));
      await drainMicrotasks();

      const royalKnightId = s.inst("royalKnight").instanceId;
      expect(s.perm("subject").stack.some((card) => card.instanceId === royalKnightId)).toBe(!lockSubject);
      expect(s.perm("subject").isSuspended).toBe(false);
    },
  );

  it.each([true, false])(
    'does not let a locked Digimon pay the "by" cost of its [When Digivolving] effect (locked=%s) (Q5413)',
    async (lockSubject) => {
      const s = await playTaomonLocking(
        {
          0: { hand: [{ card: "ST22-04", as: "taomon" }], battleArea: [{ card: "BT1-009", as: "lowest" }] },
          1: {
            battleArea: [
              { card: "BT1-080", as: "subject" },
              { card: "BT10-055", as: "decoy" },
            ],
            hand: [
              { card: "BT24-081", as: "titamon" },
              { card: "BT1-013", as: "discard" },
            ],
            deck: ["BT1-010", "BT1-011"],
          },
        },
        lockSubject,
      );

      expect(
        s.engine.applyIntent(1, {
          type: "digivolve",
          permanentId: s.perm("subject").permanentId,
          instanceId: s.inst("titamon").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("subject").topCard.cardId === "BT24-081");
      await settle(() => s.state.pendingDecision === undefined);
      await drainMicrotasks();

      expect(s.state.players[1]!.hand.map((card) => card.instanceId).includes(s.inst("discard").instanceId)).toBe(
        lockSubject,
      );
      expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT1-009")).toBe(
        lockSubject,
      );
    },
  );

  it.each([
    { lockSubject: true, afterDigivolving: 3, afterAttacking: 2 },
    { lockSubject: false, afterDigivolving: 2, afterAttacking: 2 },
  ])(
    "does not spend a [Once Per Turn] use on a blocked [When Digivolving] timing (locked=$lockSubject) (Q5414)",
    async ({ lockSubject, afterDigivolving, afterAttacking }) => {
      const s = await playTaomonLocking(
        {
          0: {
            hand: [{ card: "ST22-04", as: "taomon" }],
            battleArea: ["BT1-009", "BT8-017"],
            security: ["BT1-009", "BT1-010", "BT1-011"],
          },
          1: {
            battleArea: [
              { card: "BT10-055", as: "subject" },
              { card: "BT1-009", as: "decoy", dp: 8000 },
            ],
            hand: [{ card: "EX12-037", as: "omnimon" }],
            deck: ["BT1-010", "BT1-011", "BT1-012"],
          },
        },
        lockSubject,
      );
      const myDigimonCount = () => s.state.players[0]!.battleArea.length;
      expect(myDigimonCount()).toBe(3);

      expect(
        s.engine.applyIntent(1, {
          type: "digivolve",
          permanentId: s.perm("subject").permanentId,
          instanceId: s.inst("omnimon").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("subject").topCard.cardId === "EX12-037");
      await settle(() => s.state.pendingDecision === undefined);
      await drainMicrotasks();
      expect(myDigimonCount()).toBe(afterDigivolving);

      expect(
        s.engine.applyIntent(1, {
          type: "attack",
          attackerPermanentId: s.perm("subject").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => !observe(s.engine).isAttacking(), 3000);
      expect(myDigimonCount()).toBe(afterAttacking);
    },
  );

  it.each([true, false])(
    "trashes an Option it used from under a Tamer unless that Option placed itself (linked=%s) (Q5415)",
    async (acceptLink) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "ST3-12", as: "tamer", under: [{ card: "ST22-09", as: "plugIn" }] },
              { card: "ST22-04", as: "taomon" },
            ],
            security: ["BT1-090"],
          },
          1: { battleArea: [{ card: "BT1-009", as: "opponent" }], security: ["ST1-02", "ST1-02"] },
        },
        { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: acceptLink ? [] : ["Link"] },
      );
      await s.ready();
      const plugInId = s.inst("plugIn").instanceId;

      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("taomon").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => !observe(s.engine).isAttacking(), 3000);

      expect(s.perm("tamer").stack).toHaveLength(0);
      expect(observe(s.engine).isRestricted(s.perm("opponent"), "beSuspended")).toBe(true);
      expect(s.perm("taomon").linked.some((card) => card.instanceId === plugInId)).toBe(acceptLink);
      expect(s.state.players[0]!.trash.some((card) => card.instanceId === plugInId)).toBe(!acceptLink);
    },
  );

  it("triggers its inherited [End of Attack] effect after Viximon digivolved it mid-attack (Q5416)", async () => {
    const s = await attackWithTaomonThatDigivolvesMidAttack();
    const attacker = s.perm("attacker");

    expect(attacker.topCard.cardId).toBe("ST22-05");
    expect(attacker.stack.map((card) => card.cardId)).toEqual(["ST22-01", "ST22-04"]);
    const checkIndex = s.events.findIndex((event) => event.kind === "securityChecked");
    const endOfAttackIndex = s.events.findIndex(
      (event) => event.kind === "effectTriggered" && event.sourceCardId === "ST22-04" && event.isInherited === true,
    );
    expect(endOfAttackIndex).toBeGreaterThan(checkIndex);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("topSecurity").instanceId);
    expect(attacker.isSuspended).toBe(false);
  });

  it("gives no <Alliance> to the Sakuyamon it became after declaring the attack (Q5420)", async () => {
    const s = await attackWithTaomonThatDigivolvesMidAttack();

    expect(s.perm("attacker").topCard.cardId).toBe("ST22-05");
    expect(s.events.some((event) => event.kind === "alliancePrompt")).toBe(false);
    expect(s.perm("ally").isSuspended).toBe(false);
    expect(s.events.filter((event) => event.kind === "securityChecked")).toHaveLength(1);
  });
});
