import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/battle-replacement-digivolution-priority.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";

it.each([true, false])(
  "resolves replacement digivolution before the opponent's battle-win effect during an effect attack: %s",
  async (effectAttack) => {
    const preferred: string[] = [];
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred });
    await s.ready();
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    preferred.push(s.perm("giant-slayer").permanentId, s.perm("paladin").permanentId);
    const result = effectAttack
      ? s.engine.applyIntent(0, { type: "endPhase" })
      : s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("giant-slayer").permanentId,
          target: { kind: "permanent", permanentId: s.perm("paladin").permanentId },
        });
    expect(result).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && !s.state.pendingDecision);
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;

    const evolutionIndex = s.events.findIndex(
      (event) =>
        event.kind === "effectTriggered" && event.sourceCardId === "BT26-060" && event.timing === "WhenDigivolving",
    );
    const battleWinIndex = s.events.findIndex(
      (event) =>
        event.kind === "effectTriggered" && event.sourceCardId === "EX13-076" && event.timing === "whenBattleWon",
    );
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT26-060")).toBe(false);
    expect(s.state.players[0]!.deck.map(({ cardId }) => cardId)).toContain("BT26-060");
    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["EX13-076"]);
    expect(evolutionIndex).toBeGreaterThan(-1);
    expect(battleWinIndex).toBeGreaterThan(evolutionIndex);
  },
);
