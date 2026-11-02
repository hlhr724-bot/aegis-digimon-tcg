import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/multicolor-option-needs-both-colors.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";

it("requires a black color source for Suka's Curse even with a yellow Chuumon and Sukamon cards in hand", async () => {
  const s = setupScenario(fixture);
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("curse").instanceId })).toEqual({
      ok: false,
      reason: "color-requirement-unmet",
    });
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("curse").instanceId)).toBe(true);
    expect(s.perm("chuumon").topCard.cardId).toBe("BT14-032");
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});

it("allows Suka's Curse when a black source accompanies the yellow evolution host", async () => {
  const s = setupScenario(
    {
      ...fixture,
      board: {
        ...fixture.board,
        0: {
          ...fixture.board[0],
          battleArea: [...(fixture.board[0]?.battleArea ?? []), { card: "BT14-058", as: "black-source" }],
        },
      },
    },
    { autoAcceptOptional: true, autoSelectCards: true },
  );
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("curse").instanceId })).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.trash.some((card) => card.cardId === "BT14-097") && s.state.pendingDecision === undefined,
    );
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT14-034")).toBe(true);
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
