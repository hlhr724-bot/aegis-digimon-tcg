import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/redirected-attack-battles-defender.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";

it("battles CresGarurumon before Whamon can activate End of Attack", async () => {
  const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true });
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "attackEnded"));
    expect(s.events.some((event) => event.kind === "battleCompared")).toBe(true);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toContain("BT24-029");
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.security).toHaveLength(3);
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
