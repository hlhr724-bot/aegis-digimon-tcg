import { describe, expect, it } from "vitest";
import "../../cards/index.js";
import { observe } from "../testkit/observe.js";
import { setupEngine, settle } from "../testkit/harness.js";

describe("Creepymon (X Antibody) trashes security only by digivolving", () => {
  it("trashes one security card when two copies in the trash trigger on the same attack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT8-111", as: "creepymon" }],
          trash: [
            { card: "BT24-078", as: "firstAntibody" },
            { card: "BT24-078", as: "secondAntibody" },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011"],
        },
        1: {
          security: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013"],
          trash: Array.from({ length: 10 }, () => "BT1-009"),
          deck: ["BT1-010", "BT1-011"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("creepymon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined, 5000);

    expect(s.perm("creepymon").topCard?.cardId).toBe("BT24-078");
    expect(s.perm("creepymon").stack.map((card) => card.cardId)).toEqual(["BT8-111"]);
    expect(s.state.players[0]!.trash.filter((card) => card.cardId === "BT24-078")).toHaveLength(1);
    expect(s.state.players[1]!.security).toHaveLength(3);
  });
});
