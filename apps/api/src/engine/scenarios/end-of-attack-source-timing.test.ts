import { describe, expect, it } from "vitest";
import { advance } from "#api/engine/testkit/advance";
import { settle, setupEngine } from "#api/engine/testkit/harness";
import "#api/cards/index";

describe("End-of-attack source timing", () => {
  it("does not trigger a newly evolved Megidramon at the already resolving end of attack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX13-013", as: "attacker", under: ["EX13-001"] }],
          hand: [
            { card: "BT17-080", as: "takato" },
            { card: "BT21-079", as: "megidramon" },
          ],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: { deck: ["BT1-009", "BT1-009", "BT1-009"], security: ["BT1-009", "BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, autoOrderTriggers: true },
    );
    await s.ready();
    s.state.memory = 3;
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
    await settle();
    expect(s.perm("attacker").topCard.cardId).toBe("BT21-079");
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT17-080")).toBe(true);
    expect(
      s.events.some(
        (event) =>
          event.kind === "effectTriggered" && event.sourceCardId === "BT21-079" && event.timing === "OnEndAttack",
      ),
    ).toBe(false);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});
