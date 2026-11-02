import { describe, expect, it } from "vitest";
import "../../cards/index.js";
import { setupEngine, settle } from "../testkit/harness.js";

describe("repeated De-Digivolve stops once no opponent Digimon can lose a card", () => {
  it("asks only for the peels that can still change the board", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT18-052", as: "cannonbeemon" }],
          eggDeck: ["BT1-001"],
          deck: Array(12).fill("BT1-001"),
          security: Array.from({ length: 5 }, () => ({ card: "BT1-001", faceUp: true })),
        },
        1: {
          battleArea: [
            { card: "BT21-045", as: "peelable", under: ["BT21-042", "BT21-044"] },
            { card: "BT21-042", as: "rookie" },
          ],
          eggDeck: ["BT1-001"],
          deck: Array(12).fill("BT1-001"),
          security: 5,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("peelable").topCard.instanceId);
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("cannonbeemon").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.pendingDecision === undefined &&
        s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT18-052"),
    );

    const targetPrompts = s.decisions.filter(
      ({ seat, req }) => seat === 0 && req.kind === "chooseTargets" && req.promptText === "CannonBeemon",
    );
    expect(targetPrompts).toHaveLength(2);
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.perm("peelable").topCard.cardId).toBe("BT21-042");
    expect(s.perm("peelable").stack).toHaveLength(0);
    expect(s.perm("rookie").topCard.cardId).toBe("BT21-042");
  });
});
