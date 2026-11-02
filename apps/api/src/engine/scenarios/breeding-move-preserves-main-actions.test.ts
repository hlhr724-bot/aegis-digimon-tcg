import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/breeding-move-preserves-main-actions.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";

it("moves Gazimon into the same turn's Main phase without On Play and resolves On Play when another is played", async () => {
  const preferred: string[] = [];
  const s = setupScenario(fixture, {
    autoSelectCards: true,
    autoOrderCards: true,
    preferInstanceIds: preferred,
  });
  preferred.push(s.perm("raised-gazimon").permanentId, s.perm("raised-gazimon").topCard.instanceId);
  const loop = s.engine.startTurnLoop();
  try {
    await settle(() => s.state.phase === Phase.Breeding && s.state.turnSeat === 0);
    const player = s.state.players[0]!;
    const turn = s.state.turnCount;
    const memory = s.state.memory;
    const handIds = player.hand.map(({ instanceId }) => instanceId);
    const deckIds = player.deck.map(({ instanceId }) => instanceId);
    const raisedId = s.perm("raised-gazimon").permanentId;

    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: raisedId })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);

    expect(player.breeding).toBeUndefined();
    expect(player.battleArea.map(({ permanentId }) => permanentId)).toEqual([raisedId]);
    expect(player.hand.map(({ instanceId }) => instanceId)).toEqual(handIds);
    expect(player.deck.map(({ instanceId }) => instanceId)).toEqual(deckIds);
    expect(s.state.turnCount).toBe(turn);
    expect(s.state.memory).toBe(memory);
    expect(s.state.turnSeat).toBe(0);
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.events.filter((event) => event.kind === "effectTriggered" && event.sourceCardId === "EX9-058")).toEqual(
      [],
    );

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played-gazimon").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.engine.mainVerbContinuationsInFlight === 0 &&
        !s.state.pendingDecision &&
        s.events.some(
          (event) => event.kind === "effectResolved" && event.sourceInstanceId === s.inst("played-gazimon").instanceId,
        ),
    );

    expect(s.events).toContainEqual(
      expect.objectContaining({
        kind: "effectResolved",
        sourceCardId: "EX9-058",
        sourceInstanceId: s.inst("played-gazimon").instanceId,
        timing: "OnPlay",
      }),
    );
    expect(player.hand.map(({ cardId }) => cardId)).toContain("EX9-049");
    expect(s.perm("raised-gazimon").stack.map(({ cardId }) => cardId)).toEqual(["EX9-010", "BT15-006"]);
    expect(s.perm("raised-gazimon").stack[0]).toMatchObject({ cardId: "EX9-010", faceUp: false });
    expect(s.state.memory).toBe(memory - 3);
    expect(s.state.phase).toBe(Phase.Main);
    expect(s.state.turnSeat).toBe(0);
    expect(s.state.turnCount).toBe(turn);
    expect(s.state.pendingDecision).toBeUndefined();
  } finally {
    s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
    await loop;
  }
});
