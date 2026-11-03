import "#api/cards/index";
import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import fixture from "#api/engine/scenarios/monitamon-adds-two-from-either-category.fixture";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";

// BT10-058 adds 2 cards from one pool: black [Knightmon]/[DeadlyAxemon] names OR the [Twilight]
// trait, in any mix. A judge confirmed this reading over the stale one-per-category Q1985.
type Setup = ReturnType<typeof setupScenario>;

async function playMonitamonAndSelect(s: Setup, pick: string[]) {
  await s.ready();
  s.state.phase = Phase.Main;
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("monitamon").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => s.state.pendingDecision?.kind === "selectCards");
  const selection = s.decisions.at(-1)!.req;
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: selection.decisionId,
      response: { kind: "selectCards", instanceIds: pick },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.pendingDecision === undefined && s.state.players[0]!.deck.length === 8);
  return selection;
}

function handIds(s: Setup) {
  return s.state.players[0]!.hand.map(({ instanceId }) => instanceId).sort();
}

describe("Monitamon adds 2 revealed cards from either category", () => {
  it("adds two black Knightmon cards and bottoms the Twilight card", async () => {
    const s = setupScenario(fixture, { autoOrderCards: true });
    const knightmon = s.inst("blackKnightmon").instanceId;
    const lordKnightmon = s.inst("blackLordKnightmon").instanceId;
    const sparrowmon = s.inst("twilightSparrowmon").instanceId;

    const selection = await playMonitamonAndSelect(s, [knightmon, lordKnightmon]);

    expect(selection.options).toMatchObject({ min: 2, max: 2 });
    expect([...(selection.options?.candidateInstanceIds ?? [])].sort()).toEqual(
      [knightmon, lordKnightmon, sparrowmon].sort(),
    );
    expect(handIds(s)).toEqual([knightmon, lordKnightmon].sort());
    expect(
      s.state.players[0]!.deck.slice(-2)
        .map(({ instanceId }) => instanceId)
        .sort(),
    ).toEqual([s.inst("yellowKnightmon").instanceId, sparrowmon].sort());
  });

  it("adds two Twilight cards when no Knightmon is revealed", async () => {
    const s = setupScenario(
      {
        ...fixture,
        board: {
          ...fixture.board,
          0: {
            ...fixture.board[0],
            deck: [
              { card: "BT10-060", as: "twilightSparrowmon" },
              { card: "BT10-063", as: "twilightHiVisionMonitamon" },
              { card: "BT5-042", as: "yellowKnightmon" },
              ...Array(7).fill("BT1-009"),
            ],
          },
        },
      },
      { autoOrderCards: true },
    );
    const sparrowmon = s.inst("twilightSparrowmon").instanceId;
    const hiVisionMonitamon = s.inst("twilightHiVisionMonitamon").instanceId;

    const selection = await playMonitamonAndSelect(s, [sparrowmon, hiVisionMonitamon]);

    expect([...(selection.options?.candidateInstanceIds ?? [])].sort()).toEqual([sparrowmon, hiVisionMonitamon].sort());
    expect(handIds(s)).toEqual([sparrowmon, hiVisionMonitamon].sort());
  });
});
