import "#api/cards/BT18/BT18-011";
import "#api/cards/BT18/BT18-088";
import { expect, it } from "vitest";
import fixture from "#api/engine/scenarios/inherited-end-of-turn-player-attack-is-optional.fixture";
import { advance } from "#api/engine/testkit/advance";
import { setupScenario } from "#api/engine/testkit/scenario";

it.each([true, false])("attacks a player at end of turn only when the controller accepts: %s", async (accept) => {
  const s = setupScenario(fixture, {
    autoAcceptOptional: accept,
    autoDeclineOptional: !accept,
    autoSelectCards: true,
  });
  await s.ready();
  await advance(s.engine).runTurn(0);
  const hostId = s.perm("hybridHost").permanentId;
  expect(s.decisions.some((decision) => decision.req.kind === "optional" && decision.seat === 0)).toBe(true);
  expect(s.events.some((event) => event.kind === "attackDeclared" && event.attackerPermanentId === hostId)).toBe(
    accept,
  );
  expect(s.state.players[1]!.security).toHaveLength(accept ? 0 : 1);
});
