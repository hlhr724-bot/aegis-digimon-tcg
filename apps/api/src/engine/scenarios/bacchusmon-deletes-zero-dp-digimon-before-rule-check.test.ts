import { describe, expect, it } from "vitest";
import fixture from "#api/engine/scenarios/bacchusmon-deletes-zero-dp-digimon-before-rule-check.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { Phase } from "@aegis/shared/schema/enums";
import "#api/cards/BT25/BT25-077";
import "#api/cards/BT16/BT16-101";
import "#api/cards/BT19/BT19-050";
import "#api/cards/BT5/BT5-098";
import "#api/cards/BT5/BT5-039";
import "#api/cards/ST3/ST3-10";
import "#api/cards/BT1/BT1-009";

describe("Bacchusmon suspending a Digimon to 0 DP", () => {
  it("deletes that Digimon as the lowest DP before the rule check runs", async () => {
    const preferred: string[] = [];
    const s = setupScenario(fixture, {
      autoAcceptOptional: true,
      autoSelectCards: true,
      autoChooseOption: true,
      preferInstanceIds: preferred,
    });
    const shootingStarmon = s.inst("shooting-starmon").instanceId;
    preferred.push(shootingStarmon);
    await s.ready();
    s.state.phase = Phase.Main;
    expect(
      s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("meteor-shower").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT25-077") &&
        s.state.pendingDecision === undefined,
    );
    const opponent = s.state.players[1]!;
    expect(opponent.trash.some((card) => card.instanceId === shootingStarmon)).toBe(true);
    expect(opponent.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["ST3-10"]);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});
