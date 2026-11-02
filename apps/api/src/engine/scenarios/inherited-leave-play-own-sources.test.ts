import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/inherited-leave-play-own-sources.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";

it.each(["AD1-003", "BT18-048"])(
  "does not play cards from another Digimon's sources when the holder of %s leaves",
  async (inherited) => {
    const otherTamer = inherited === "BT18-048" ? "BT18-091" : "BT12-089";
    const s = setupScenario(
      {
        ...fixture,
        board: {
          ...fixture.board,
          0: {
            ...fixture.board[0],
            battleArea: [
              { card: "AD1-008", as: "leaving", suspended: true, under: [inherited] },
              { card: "BT1-010", as: "other", under: [otherTamer, "BT12-007"] },
            ],
          },
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    const leavingId = s.perm("leaving").permanentId;
    const otherSources = s.perm("other").stack.map(({ instanceId }) => instanceId);

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: leavingId },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);

    advance(s.engine).endMainPhaseIfOpen(1);
    await turn;

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([s.perm("other").permanentId]);
    expect(s.perm("other").stack.map(({ instanceId }) => instanceId)).toEqual(otherSources);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toEqual(
      expect.arrayContaining(["AD1-008", inherited]),
    );
  },
);
