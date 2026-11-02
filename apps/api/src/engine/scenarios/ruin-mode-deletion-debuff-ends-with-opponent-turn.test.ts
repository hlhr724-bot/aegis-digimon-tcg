import fixtureRuinModeDeletion from "./ruin-mode-deletion-debuff-ends-with-opponent-turn.fixture.js";
import { Phase } from "@aegis/shared";
import { expect, it } from "vitest";
import "../../cards/index.js";
import { layScenarioFixture } from "../scenario/fixture.js";
import { BLUE_DECK, RED_DECK } from "../testDecks.js";
import { advance } from "../testkit/advance.js";
import { assertNoLoudGap, setupEngine, settle, settleAcrossTimers } from "../testkit/harness.js";

it("ShineGreymon: Ruin Mode deleted on the opponent's turn debuffs only until that turn ends", async () => {
  const s = setupEngine({ 0: {}, 1: {} }, { autoSelectCards: true });
  const references = layScenarioFixture(s.state, fixtureRuinModeDeletion, [RED_DECK, BLUE_DECK], true);
  const loop = s.engine.startTurnLoop();
  try {
    const [attackerSide, ownerSide] = s.state.players;
    const permanentWithAlias = (alias: string) =>
      [...attackerSide!.battleArea, ...ownerSide!.battleArea].find(
        ({ permanentId }) => permanentId === references.permanentId(alias),
      )!;
    const attacker = permanentWithAlias("attacker");
    const bystander = permanentWithAlias("bystander");
    const ruinMode = permanentWithAlias("ruin-mode");

    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "permanent", permanentId: ruinMode.permanentId },
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).finishAttack();
    await settleAcrossTimers(() => ownerSide!.battleArea.length === 0 && s.state.pendingDecision === undefined);
    expect(attacker.currentDP).toBe(15000);
    expect(bystander.currentDP).toBe(2000);

    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await settle(() => s.state.turnSeat === 1 && s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);

    expect(attacker.currentDP).toBe(20000);
    expect(bystander.currentDP).toBe(7000);
    assertNoLoudGap(s);
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
