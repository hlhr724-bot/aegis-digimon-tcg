import { expect } from "vitest";
import type { Permanent, Seat } from "@aegis/shared";
import { settle, type EngineSetup } from "#api/engine/testkit/harness";

type Params = { setup: EngineSetup; seat: Seat; attacker: Permanent };

function countEndedAttacks(setup: EngineSetup): number {
  return setup.events.filter((event) => event.kind === "attackEnded").length;
}

export async function attackPlayer({ setup, seat, attacker }: Params): Promise<void> {
  const endedBefore = countEndedAttacks(setup);
  expect(
    setup.engine.applyIntent(seat, {
      type: "attack",
      attackerPermanentId: attacker.permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await settle(
    () =>
      setup.state.gameOver ||
      (countEndedAttacks(setup) > endedBefore &&
        setup.state.combatWindow === undefined &&
        setup.state.pendingDecision === undefined),
  );
}
