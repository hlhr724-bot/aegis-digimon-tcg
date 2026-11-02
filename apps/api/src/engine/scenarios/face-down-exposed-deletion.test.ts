import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { EffectDuration, Zone } from "@aegis/shared/schema/enums";
import { advance } from "#api/engine/testkit/advance";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/face-down-exposed-deletion.fixture";
import { setupEngine, settle } from "#api/engine/testkit/harness";

describe("face-down cards exposed by De-Digivolve", () => {
  it("does not activate Reapermon's On Deletion after exposing a face-down top card", async () => {
    const s = setupScenario(fixture, { autoSelectCards: true, autoAcceptOptional: true, autoOrderTriggers: true });
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("blitz").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.players[1]!.battleArea.length === 0 && s.state.pendingDecision === undefined);
      expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toEqual(["BT1-025", "BT26-077"]);
      expect(s.events.filter((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT26-077")).toEqual(
        [],
      );
      expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId).sort()).toEqual(["AD1-009", "ST1-12"]);
    } finally {
      s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
      await loop;
    }
  });

  it.each([{ zeroDp: false }, { zeroDp: true }])(
    "trashes a hidden top without deletion reactions at zero DP=$zeroDp",
    async ({ zeroDp }) => {
      const s = setupEngine(
        {
          0: { hand: [{ card: "ST1-03", as: "play" }] },
          1: { battleArea: [{ card: "BT26-077", as: "hidden" }] },
        },
        { autoSelectCards: true, autoAcceptOptional: true },
      );
      s.perm("hidden").topCard.faceUp = false;
      await s.ready();
      if (zeroDp) {
        advance(s.engine).ledgers.modifiers.addPlayerDpModifier(
          s.state,
          1,
          -20000,
          EffectDuration.UntilOpponentTurnEnd,
        );
      }
      s.state.memory = 10;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("play").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.players[1]!.battleArea.length === 0 && s.state.pendingDecision === undefined);
      expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toEqual(["BT26-077"]);
      expect(s.events.filter((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT26-077")).toEqual(
        [],
      );
      expect(s.events.filter((event) => event.kind === "cardsMoved" && event.deletedPermanents !== undefined)).toEqual(
        [],
      );
      expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["ST1-03"]);
    },
  );
  it("trashes a hidden breeding top without a deletion event or a rule-check draw", async () => {
    const s = setupEngine({
      0: { hand: [{ card: "ST1-03", as: "play" }] },
      1: { breeding: { card: "BT26-077", as: "hidden", under: ["BT1-001"] } },
    });
    s.perm("hidden").topCard.faceUp = false;
    await s.ready();
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("play").instanceId })).toEqual({ ok: true });
    await settle();
    expect(s.state.players[1]!.breeding).toBeUndefined();
    expect(s.state.gameOver).toBe(false);
    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toEqual(["BT1-001", "BT26-077"]);
    expect(
      s.events.filter(
        (event) => event.kind === "cardsMoved" && event.from === Zone.Breeding && event.to === Zone.Trash,
      ),
    ).toHaveLength(1);
    expect(s.events.filter((event) => event.kind === "cardsMoved" && event.deletedPermanents !== undefined)).toEqual(
      [],
    );
  });
});
