import { describe, expect, it } from "vitest";
import { advance } from "#api/engine/testkit/advance";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/index";

describe("Ginryumon (BT27) DP boost, attack evolution from hand or trash and inherited DP", () => {
  it("gives 1 of your Digimon +3000 DP until the opponent's turn ends when played", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-009", as: "ally" }],
          hand: [{ card: "BT27-009", as: "ginryumon" }],
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("ally").topCard.instanceId);
    s.state.memory = 5;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("ginryumon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("ally").currentDP === 6000 && !s.state.pendingDecision);
    expect(s.state.memory).toBe(0);
    s.state.turnSeat = 1;
    await advance(s.engine).recompute();
    expect(s.perm("ally").currentDP).toBe(6000);
  });

  it.each([
    ["trash", 0, 4],
    ["hand", 1, 3],
  ] as const)(
    "digivolves from the %s into a [Chronicle] Digimon while attacking (cost choice %i)",
    async (zone, optionIndex, cost) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT27-009", as: "ginryumon", under: ["BT27-008"] }],
            [zone]: [{ card: "BT27-013", as: "hisyaryumon" }],
          },
          1: { security: ["BT1-009"] },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.memory = 5;
      await s.ready();
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("ginryumon").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "chooseOption");
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: s.state.pendingDecision!.decisionId,
          response: { kind: "chooseOption", optionIndex },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("ginryumon").topCard.cardId === "BT27-013");
      expect(s.perm("ginryumon").stack.map(({ cardId }) => cardId)).toEqual(["BT27-008", "BT27-009"]);
      expect(s.state.memory).toBe(5 - cost);
    },
  );

  it("does not offer a non-[Chronicle] Digimon card", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-009", as: "ginryumon" }],
          hand: [{ card: "BT1-020", as: "unrelated" }],
          trash: [{ card: "BT20-087", as: "chronicleTamer" }],
        },
        1: { security: ["BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("ginryumon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "attackEnded") && !s.state.pendingDecision);
    expect(s.perm("ginryumon").topCard.cardId).toBe("BT27-009");
    expect(s.state.memory).toBe(5);
  });

  it("may decline the attack evolution", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-009", as: "ginryumon" }],
          trash: [{ card: "BT27-013", as: "hisyaryumon" }],
        },
        1: { security: ["BT1-009"] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("ginryumon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "attackEnded") && !s.state.pendingDecision);
    expect(s.perm("ginryumon").topCard.cardId).toBe("BT27-009");
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toEqual(["BT27-013"]);
  });

  it("grants inherited +2000 DP only during its controller's turn", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "host", under: ["BT27-009"] }] } });
    await s.ready();
    expect(s.perm("host").currentDP).toBe(5000);
    s.state.turnSeat = 1;
    await advance(s.engine).recompute();
    expect(s.perm("host").currentDP).toBe(3000);
  });
});
