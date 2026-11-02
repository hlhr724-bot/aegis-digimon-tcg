import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";
import { compiled } from "#api/cards/BT27/BT27-003";
import "#api/cards/index";

type AttackParams = {
  hand: string[];
  underHost: string[];
  accept: boolean;
};

async function attackWithHost({ hand, underHost, accept }: AttackParams) {
  const s = setupEngine(
    {
      0: {
        battleArea: [{ card: "BT1-064", as: "host", under: underHost, dp: 20_000 }],
        hand,
        deck: ["BT1-009", "BT1-009", "BT1-009"],
      },
      1: { security: ["BT1-009", "BT1-009", "BT1-009"], deck: ["BT1-009", "BT1-009"] },
    },
    { autoSelectCards: true, autoAcceptOptional: accept, autoDeclineOptional: !accept },
  );
  await s.ready();
  s.state.memory = 5;
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("host").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
  return s;
}

describe("Frimon inherited attack digivolution", () => {
  it("publishes a once-per-turn inherited optional digivolve into a [Leomon]-named or [ACCEL] card from hand", () => {
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects).toHaveLength(1);
    expect(compiled.effects[0]).toMatchObject({
      trigger: "WhenAttacking",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [{ kind: "Digivolve", from: ["hand"], payCost: true, optional: true }],
    });
  });

  it.each([
    ["BT14-048", "a [Leomon]-named card", 2],
    ["BT20-039", "an [ACCEL] trait card", 3],
  ])("digivolves the host into %s (%s) and pays its digivolution cost", async (card, _label, cost) => {
    const s = await attackWithHost({ hand: [card], underHost: ["BT27-003"], accept: true });
    expect(s.perm("host").topCard.cardId).toBe(card);
    expect(s.perm("host").stack.map(({ cardId }) => cardId)).toEqual(["BT27-003", "BT1-064"]);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toEqual(["BT1-009"]);
    expect(s.state.memory).toBe(5 - cost);
  });

  it("does not digivolve into a card with neither [Leomon] in its name nor the [ACCEL] trait", async () => {
    const s = await attackWithHost({ hand: ["BT11-051"], underHost: ["BT27-003"], accept: true });
    expect(s.perm("host").topCard.cardId).toBe("BT1-064");
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toEqual(["BT11-051"]);
    expect(s.state.memory).toBe(5);
  });

  it("does not digivolve when Frimon is not under the attacking Digimon", async () => {
    const s = await attackWithHost({ hand: ["BT14-048"], underHost: ["BT1-003"], accept: true });
    expect(s.perm("host").topCard.cardId).toBe("BT1-064");
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toEqual(["BT14-048"]);
    expect(s.state.memory).toBe(5);
  });

  it("keeps the host and hand unchanged when the controller declines", async () => {
    const s = await attackWithHost({ hand: ["BT14-048"], underHost: ["BT27-003"], accept: false });
    expect(s.perm("host").topCard.cardId).toBe("BT1-064");
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toEqual(["BT14-048"]);
    expect(s.state.memory).toBe(5);
  });

  it("digivolves only once per turn", async () => {
    const s = await attackWithHost({ hand: ["BT14-048", "BT4-057"], underHost: ["BT27-003"], accept: true });
    expect(s.perm("host").topCard.cardId).toBe("BT14-048");
    expect(s.state.memory).toBe(3);

    await advance(s.engine).verb.unsuspend([s.perm("host").permanentId]);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);

    expect(s.perm("host").topCard.cardId).toBe("BT14-048");
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toEqual(["BT4-057", "BT1-009"]);
    expect(s.state.memory).toBe(3);
  });
});
