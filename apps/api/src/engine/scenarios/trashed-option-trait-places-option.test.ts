import "#api/cards/BT14/BT14-071";
import "#api/cards/BT15/BT15-100";
import "#api/cards/EX5/EX5-069";
import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import fixture from "#api/engine/scenarios/trashed-option-trait-places-option.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";

it("places Biting Crush when the trashed hand card is a Seven Great Demon Lords Option", async () => {
  const s = setupScenario(fixture, { autoSelectCards: true });
  await s.ready();
  s.state.phase = Phase.Main;
  const victimId = s.perm("victim").permanentId;
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("bitingCrush").instanceId })).toEqual({
    ok: true,
  });
  await settle(
    () =>
      !s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === victimId) &&
      s.state.pendingDecision === undefined,
  );
  expect(s.state.players[0]!.trash.map((card) => card.cardId)).toContain("BT15-100");
  expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard?.cardId)).toContain("EX5-069");
});
