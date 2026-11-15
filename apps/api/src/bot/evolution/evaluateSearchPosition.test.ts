import { describe, expect, it } from "vitest";
import { setupEngine } from "#api/engine/testkit/harness";
import { trainingObservation } from "#api/bot/training/observation";
import { evaluateSearchPosition } from "#api/bot/evolution/evaluateSearchPosition";
import { BOT_PROFILES, DEFAULT_BOT_PROFILE } from "#api/bot/profiles";

describe("bounded public-position evaluation", () => {
  it("reverses advantage between seats and values extra security", async () => {
    const setup = setupEngine({ 0: { security: ["BT1-010", "BT1-011"] }, 1: { security: ["BT1-010"] } });
    await setup.ready();
    const own = trainingObservation(setup.state, 0);
    own.memory = 3;
    own.turnSeat = 0;
    const opponent = { ...own, seat: 1 as const };
    const value = evaluateSearchPosition(own);
    expect(value).toBeGreaterThan(0.5);
    expect(value).toBeLessThan(1);
    expect(value + evaluateSearchPosition(opponent)).toBeCloseTo(1);
    const improved = structuredClone(own);
    improved.players[0]!.securityCount++;
    expect(evaluateSearchPosition(improved)).toBeGreaterThan(value);
  });

  it("ignores private card identities and deck order", async () => {
    const setup = setupEngine({ 0: { hand: ["BT1-010"] }, 1: { hand: ["BT1-011"], deck: ["BT1-012", "BT1-013"] } });
    await setup.ready();
    const before = evaluateSearchPosition(trainingObservation(setup.state, 0));
    setup.state.players[1]!.hand[0]!.cardId = "BT1-014";
    setup.state.players[1]!.deck.reverse();
    expect(evaluateSearchPosition(trainingObservation(setup.state, 0))).toBe(before);
  });

  it("values a ready attacker more under the aggressive style weights", async () => {
    const setup = setupEngine({ 0: { battleArea: [{ card: "BT1-015", as: "attacker" }] } });
    await setup.ready();
    const waiting = trainingObservation(setup.state, 0);
    waiting.players[0]!.board[0]!.canAttackPlayer = false;
    const ready = structuredClone(waiting);
    ready.players[0]!.board[0]!.canAttackPlayer = true;
    const readyGain = (profile: (typeof BOT_PROFILES)[keyof typeof BOT_PROFILES]) =>
      evaluateSearchPosition(ready, profile) - evaluateSearchPosition(waiting, profile);
    expect(readyGain(BOT_PROFILES.aggressive)).toBeGreaterThan(readyGain(BOT_PROFILES.defensive));
  });

  it("scores zero-security tie at 0.5 and increases monotonically across security 0 to 6", async () => {
    const setup = setupEngine({ 0: { security: ["BT1-010"] }, 1: { security: ["BT1-010"] } });
    await setup.ready();
    const base = trainingObservation(setup.state, 0);
    base.memory = 0;
    base.turnSeat = 0;

    const zeroBoth = structuredClone(base);
    zeroBoth.players[0]!.securityCount = 0;
    zeroBoth.players[1]!.securityCount = 0;
    expect(evaluateSearchPosition(zeroBoth)).toBeCloseTo(0.5, 9);

    const scores: number[] = [];
    for (let securityCount = 0; securityCount <= 6; securityCount += 1) {
      const obs = structuredClone(zeroBoth);
      obs.players[0]!.securityCount = securityCount;
      scores.push(evaluateSearchPosition(obs));
    }
    for (let index = 1; index < scores.length; index += 1) {
      expect(scores[index]).toBeGreaterThan(scores[index - 1]!);
    }
  });

  it("values security advantage more under the defensive style weights", async () => {
    const setup = setupEngine({ 0: { security: ["BT1-010", "BT1-011"] }, 1: { security: ["BT1-010"] } });
    await setup.ready();
    const ahead = trainingObservation(setup.state, 0);
    ahead.memory = 0;
    ahead.turnSeat = 0;
    const even = structuredClone(ahead);
    even.players[0]!.securityCount = 1;
    const securityGain = (profile: (typeof BOT_PROFILES)[keyof typeof BOT_PROFILES]) =>
      evaluateSearchPosition(ahead, profile) - evaluateSearchPosition(even, profile);
    expect(securityGain(BOT_PROFILES.defensive)).toBeGreaterThan(securityGain(BOT_PROFILES.aggressive));
  });

  it("does not overestimate attackers with securityAttack <= 0", async () => {
    const lethalSetup = setupEngine({
      0: { battleArea: [{ card: "BT1-015", as: "attacker" }], security: ["BT1-010"] },
      1: { security: [] },
    });
    await lethalSetup.ready();
    const sa1 = trainingObservation(lethalSetup.state, 0);
    sa1.memory = 0;
    sa1.turnSeat = 0;
    sa1.players[0]!.board[0]!.canAttackPlayer = true;
    sa1.players[0]!.board[0]!.securityAttack = 1;

    const sa0 = structuredClone(sa1);
    sa0.players[0]!.board[0]!.securityAttack = 0;
    const saNeg = structuredClone(sa1);
    saNeg.players[0]!.board[0]!.securityAttack = -1;

    expect(evaluateSearchPosition(sa0)).toBeLessThan(evaluateSearchPosition(sa1));
    expect(evaluateSearchPosition(saNeg)).toBeLessThan(evaluateSearchPosition(sa1));

    const nonLethalSetup = setupEngine({
      0: { battleArea: [{ card: "BT1-015", as: "attacker" }], security: ["BT1-010"] },
      1: { security: ["BT1-010", "BT1-011"] },
    });
    await nonLethalSetup.ready();
    const nonLethalSa1 = trainingObservation(nonLethalSetup.state, 0);
    nonLethalSa1.memory = 0;
    nonLethalSa1.turnSeat = 0;
    nonLethalSa1.players[0]!.board[0]!.canAttackPlayer = true;
    nonLethalSa1.players[0]!.board[0]!.securityAttack = 1;

    const nonLethalSa0 = structuredClone(nonLethalSa1);
    nonLethalSa0.players[0]!.board[0]!.securityAttack = 0;
    expect(evaluateSearchPosition(nonLethalSa0)).toBeLessThan(evaluateSearchPosition(nonLethalSa1));
  });

  it("accounts for cannotBlock, cannotAttack, and suspended statuses", async () => {
    const setup = setupEngine({
      0: { battleArea: [{ card: "BT1-015", as: "attacker" }], security: [] },
      1: { battleArea: [{ card: "BT1-015", as: "attacker" }], security: ["BT1-010"] },
    });
    await setup.ready();
    const base = trainingObservation(setup.state, 0);
    base.memory = 0;
    base.turnSeat = 0;
    base.players[0]!.board[0]!.keywords = ["Blocker"];
    base.players[0]!.board[0]!.suspended = false;
    base.players[0]!.board[0]!.statuses.cannotBlock = false;
    base.players[0]!.board[0]!.canAttackPlayer = false;
    base.players[1]!.board[0]!.suspended = false;
    base.players[1]!.board[0]!.statuses.cannotAttack = false;
    base.players[1]!.board[0]!.canAttackPlayer = false;

    const blockedStatus = structuredClone(base);
    blockedStatus.players[0]!.board[0]!.statuses.cannotBlock = true;
    expect(evaluateSearchPosition(base)).toBeGreaterThan(evaluateSearchPosition(blockedStatus));

    const suspendedBlocker = structuredClone(base);
    suspendedBlocker.players[0]!.board[0]!.suspended = true;
    expect(evaluateSearchPosition(base)).toBeGreaterThan(evaluateSearchPosition(suspendedBlocker));

    const suspendedEnemy = structuredClone(base);
    suspendedEnemy.turnSeat = 1;
    suspendedEnemy.players[0]!.board = [];
    suspendedEnemy.players[1]!.board[0]!.suspended = true;
    suspendedEnemy.players[1]!.board[0]!.canAttackPlayer = false;
    suspendedEnemy.players[1]!.board[0]!.statuses.cannotAttack = false;

    const cannotAttackEnemy = structuredClone(suspendedEnemy);
    cannotAttackEnemy.players[1]!.board[0]!.statuses.cannotAttack = true;
    expect(evaluateSearchPosition(cannotAttackEnemy)).toBeGreaterThan(evaluateSearchPosition(suspendedEnemy));
  });

  it("preserves seat-swap zero-sum symmetry on lethal and non-lethal boards", async () => {
    const lethalSetup = setupEngine({
      0: { battleArea: [{ card: "BT1-015", as: "attacker" }], security: ["BT1-010"] },
      1: { security: [] },
    });
    await lethalSetup.ready();
    const lethalSeat0 = trainingObservation(lethalSetup.state, 0);
    lethalSeat0.memory = 3;
    lethalSeat0.turnSeat = 0;
    lethalSeat0.players[0]!.board[0]!.canAttackPlayer = true;
    lethalSeat0.players[0]!.board[0]!.suspended = false;
    const lethalSeat1 = { ...lethalSeat0, seat: 1 as const };
    expect(
      evaluateSearchPosition(lethalSeat0, DEFAULT_BOT_PROFILE) +
        evaluateSearchPosition(lethalSeat1, DEFAULT_BOT_PROFILE),
    ).toBeCloseTo(1, 6);

    const normalSetup = setupEngine({
      0: { battleArea: [{ card: "BT1-015", as: "attacker" }], security: ["BT1-010"] },
      1: { security: ["BT1-010"] },
    });
    await normalSetup.ready();
    const normalSeat0 = trainingObservation(normalSetup.state, 0);
    normalSeat0.memory = 2;
    normalSeat0.turnSeat = 0;
    normalSeat0.players[0]!.board[0]!.canAttackPlayer = true;
    normalSeat0.players[0]!.board[0]!.suspended = false;
    const normalSeat1 = { ...normalSeat0, seat: 1 as const };
    expect(
      evaluateSearchPosition(normalSeat0, DEFAULT_BOT_PROFILE) +
        evaluateSearchPosition(normalSeat1, DEFAULT_BOT_PROFILE),
    ).toBeCloseTo(1, 6);
  });
});
