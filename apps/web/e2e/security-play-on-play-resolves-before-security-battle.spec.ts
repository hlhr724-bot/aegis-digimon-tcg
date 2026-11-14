import fixture from "../../api/src/engine/scenarios/security-play-on-play-resolves-before-security-battle.fixture";
import { fixturePermanentId } from "../../api/src/engine/scenario/references";
import { test, expect } from "./scenario-page";

test.use({
  holdBotAfterTurn: 4,
  botMainIntents: [
    [
      { type: "attack", attackerPermanentId: fixturePermanentId("attacker"), target: { kind: "player" } },
      { type: "endPhase" },
    ],
    { scope: "test" },
  ],
});

test("KingEtemon played by Etemon's [Security] resolves its [On Play] before the security battle", async ({
  scenario,
}) => {
  const refs = await scenario.openFixture(fixture, "normal", "none");

  await scenario.resolveUntil(
    (s) => s.turnSeat === 0 && s.players[1]!.trash.some((card) => card.instanceId === refs.instanceId("attackerTop")),
    (decision) =>
      decision.kind === "selectCards" && decision.sourceCardId === "BT14-038"
        ? { instanceIds: [refs.instanceId("kingEtemon")] }
        : decision.kind === "selectCards"
          ? { instanceIds: [refs.instanceId("sukamonA"), refs.instanceId("sukamonB")] }
          : { accept: true },
    30_000,
  );

  const events = (await scenario.presentation()).events;
  const onPlayPlayed = events.findIndex(
    (event) => event.kind === "cardPlayed" && event.instanceId === refs.instanceId("sukamonA"),
  );
  const securityChecked = events.findIndex((event) => event.kind === "securityChecked");
  expect(onPlayPlayed).toBeGreaterThanOrEqual(0);
  expect(onPlayPlayed).toBeLessThan(securityChecked);

  const final = await scenario.snapshot();
  expect(final.players[0]!.battleArea.map((permanent) => permanent.topCard.instanceId).sort()).toEqual(
    [refs.instanceId("kingEtemon"), refs.instanceId("sukamonA"), refs.instanceId("sukamonB")].sort(),
  );
  expect(final.players[1]!.battleArea).toHaveLength(0);
  await scenario.healthy();
});
