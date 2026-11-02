import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/breeding-egg-evolves-during-attack.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";

it.each(["hand", "trash"] as const)(
  "evolves the hatched Digi-Egg into a Chronicle rookie from %s during Ouryumon's attack effect",
  async (zone) => {
    const board = fixture.board[0]!;
    const evolution = { card: "EX13-049", as: "breedingEvolution" };
    const preferred: string[] = [];
    const s = setupScenario(
      {
        ...fixture,
        board: {
          ...fixture.board,
          0: {
            ...board,
            hand: [...(board.hand ?? []), ...(zone === "hand" ? [evolution] : [])],
            trash: zone === "trash" ? [evolution] : [],
          },
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("attacker").permanentId, s.inst("ouryumon").instanceId);
    s.state.phase = Phase.Main;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).finishAttack();
    await settle();
    expect(s.perm("attacker").topCard.cardId).toBe("BT20-018");
    expect(s.state.players[0]!.breeding?.topCard.instanceId).toBe(s.inst("breedingEvolution").instanceId);
    expect(s.state.players[0]!.breeding?.stack.map((card) => card.cardId)).toEqual(["P-176"]);
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.state.players[0]![zone].some((card) => card.instanceId === s.inst("breedingEvolution").instanceId)).toBe(
      false,
    );
  },
);
