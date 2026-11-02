import { expect } from "vitest";
import { Phase, type Seat } from "@aegis/shared";
import { buildBotView } from "#api/bot/view";
import { createFixtureBotPolicy } from "#api/engine/scenario/botPolicy";
import type { ScenarioFixture } from "#api/engine/scenario/types";
import { advance } from "#api/engine/testkit/advance";
import { settle, type EngineSetup } from "#api/engine/testkit/harness";

type Params = { setup: EngineSetup; fixture: ScenarioFixture; seat?: Seat };

export async function runFixtureBotTurn({ setup, fixture, seat = 1 }: Params): Promise<void> {
  const policy = createFixtureBotPolicy(fixture.presentation?.opponent);
  if (!policy) {
    throw new Error("The fixture has no scripted opponent");
  }
  const { engine, state } = setup;
  await settle(() => state.turnSeat === seat && (engine.breeding.isOpen || state.phase === Phase.Main));
  if (engine.breeding.isOpen) {
    expect(engine.applyIntent(seat, policy.chooseBreedingAction(buildBotView(state, seat)!))).toEqual({ ok: true });
  }
  await advance(engine).waitForMainPhase(seat);
  while (state.turnSeat === seat && state.phase === Phase.Main && !state.gameOver) {
    const intent = policy.chooseMainAction(buildBotView(state, seat)!);
    expect(engine.applyIntent(seat, intent)).toEqual({ ok: true });
    if (intent.type === "endPhase") {
      break;
    }
    await settle(() => state.combatWindow === undefined && state.pendingDecision === undefined);
  }
  await settle(() => state.turnSeat !== seat || state.gameOver);
}
