import { describe, expect, it } from "vitest";
import "#api/cards/index";
import type { CardSpec, PermanentSpec } from "#api/engine/scenario/types";
import fixture from "#api/engine/scenarios/face-down-stacked-cards-are-not-playable.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";

const cases = [
  { name: "this Digimon's own digivolution cards", defender: "loweemonHost", source: "loweemonSource" },
  { name: "any digivolution card of the leaving Digimon", defender: "kazemonHost", source: "kazemonSource" },
  { name: "the cards under a Tamer", defender: "shoutmonX5", source: "underTamer" },
] as const;

function revealSources(faceUp: boolean) {
  const reveal = (spec: CardSpec): CardSpec => (typeof spec === "string" ? spec : { ...spec, faceUp });
  const battleArea = (fixture.board[0]!.battleArea ?? []).map((permanent) =>
    typeof permanent === "string"
      ? permanent
      : ({ ...permanent, under: permanent.under?.map(reveal) } as PermanentSpec),
  );
  return { ...fixture, board: { ...fixture.board, 0: { ...fixture.board[0], battleArea } } };
}

async function attackAndSettle(faceUp: boolean, defender: string) {
  const s = setupScenario(revealSources(faceUp), { autoAcceptOptional: true, autoSelectCards: true });
  await s.ready();
  const turn = s.engine.runOneTurn();
  await advance(s.engine).waitForMainPhase(1);
  expect(
    s.engine.applyIntent(1, {
      type: "attack",
      attackerPermanentId: s.perm("attacker").permanentId,
      target: { kind: "permanent", permanentId: s.perm(defender).permanentId },
    }),
  ).toEqual({ ok: true });
  await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
  advance(s.engine).endMainPhaseIfOpen(1);
  await turn;
  return s;
}

function playedCardIds(s: Awaited<ReturnType<typeof attackAndSettle>>) {
  return s.state.players[0]!.battleArea.map((permanent) => permanent.topCard?.instanceId);
}

describe("playing cards from a stack", () => {
  it.each(cases)("does not play a face-down card from $name", async ({ defender, source }) => {
    const s = await attackAndSettle(false, defender);

    expect(playedCardIds(s)).not.toContain(s.inst(source).instanceId);
  });

  it.each(cases)("plays the same card from $name when it is face up", async ({ defender, source }) => {
    const s = await attackAndSettle(true, defender);

    expect(playedCardIds(s)).toContain(s.inst(source).instanceId);
  });
});
