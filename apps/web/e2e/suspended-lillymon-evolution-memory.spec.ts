import fixture from "@api-fixtures/suspended-lillymon-evolution-memory.fixture";
import { test, expect } from "@e2e/scenario-page";

test.use({ holdBotAfterTurn: 1 });

for (const speed of ["normal", "slow"] as const) {
  test(`announces suspended Lillymon memory gain at ${speed} speed without leaving presentation gates pending`, async ({
    scenario,
  }) => {
    const refs = await scenario.openFixture(fixture, speed, "none");
    await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
    await scenario.attack(refs.permanentId("host"));
    await scenario.resolveUntil(
      (state) => !state.pendingDecision && !state.combatWindow && state.players[1]!.securityCount === 2,
      () => ({ accept: false }),
    );
    const attacked = await scenario.snapshot();
    expect(
      attacked.players[0]!.battleArea.find((permanent) => permanent.permanentId === refs.permanentId("host"))
        ?.isSuspended,
    ).toBe(true);
    expect(attacked.players[1]!.battleArea.every((permanent) => !permanent.isSuspended)).toBe(true);
    expect(attacked.memory).toBe(10);
    await scenario.evolve("Lillymon (X Antibody)", refs.permanentId("host"));
    await scenario.resolveUntil(
      (state) =>
        !state.pendingDecision &&
        state.memory === 8 &&
        state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === refs.instanceId("lillymon")),
      () => ({ accept: false }),
    );
    const evolved = await scenario.snapshot();
    expect(
      evolved.players[0]!.battleArea.find((permanent) => permanent.permanentId === refs.permanentId("host"))
        ?.isSuspended,
    ).toBe(true);
    expect(evolved.players[1]!.securityCount).toBe(2);
    expect(evolved.players[0]!.handCount).toBe(attacked.players[0]!.handCount);
    const presentation = await scenario.presentation();
    expect(
      presentation.events.filter(
        (event) =>
          event.kind === "effectResolved" && event.sourceCardId === "BT15-051" && event.timing === "WhenDigivolving",
      ),
    ).toHaveLength(1);
    await scenario.healthy();
  });
}
