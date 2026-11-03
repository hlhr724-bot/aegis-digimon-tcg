import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/direct-battle-without-defender-skips-attacker-choice.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";

it("ends Breakdramon's accepted battle without a selection when the opponent has only an option", async () => {
  const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: false });
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("breakdramon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        (s.events.some((event) => event.kind === "attackEnded") && s.state.pendingDecision === undefined) ||
        s.state.pendingDecision?.kind === "chooseTargets",
    );
    expect(s.decisions.some(({ req }) => req.sourceCardId === "EX13-044" && req.promptText === "Battle")).toBe(true);
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.decisions.some(({ req }) => req.sourceCardId === "EX13-044" && req.kind === "chooseTargets")).toBe(false);
    expect(s.events.some((event) => event.kind === "battleCompared")).toBe(false);
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.permanentId)).toEqual([
      s.perm("delayOption").permanentId,
    ]);
    expect(s.state.players[1]!.security).toHaveLength(2);
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
