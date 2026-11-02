import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/trait-color-waiver-excludes-breeding.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";

it("does not waive Dragon's Roar colors from a yellow Data Digimon in breeding", async () => {
  const s = setupScenario(fixture);
  s.state.phase = Phase.Main;
  await s.ready();
  expect(s.inst("dragons-roar").playableFromHand).toBe(false);
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("dragons-roar").instanceId }).ok).toBe(false);
  expect(s.state.memory).toBe(8);
  expect(s.state.players[0]!.hand.map((card) => card.cardId)).toContain("BT18-098");
  expect(s.state.players[0]!.security).toHaveLength(3);
});

it.each([false, true])(
  "uses Dragon's Roar with a battle-area trait waiver or ordinary breeding colors (%s)",
  async (ordinaryColors) => {
    const board = { ...fixture.board[0] };
    if (ordinaryColors) {
      board.battleArea = [{ card: "BT1-085" }];
    } else {
      board.breeding = undefined;
      board.battleArea = [{ card: "BT18-030", as: "candlemon" }];
    }
    const s = setupScenario(
      { ...fixture, board: { ...fixture.board, 0: board } },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.phase = Phase.Main;
    await s.ready();
    expect(s.inst("dragons-roar").playableFromHand).toBe(true);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("dragons-roar").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.resolvingOption === undefined && s.state.pendingDecision === undefined);
    expect(s.state.memory).toBe(3);
    expect(s.state.players[0]!.security).toHaveLength(3);
    expect(s.state.players[0]!.security.some((card) => card.cardId === "BT18-098")).toBe(true);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  },
);
