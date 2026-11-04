import { EffectDuration } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../testkit/advance.js";
import { setupEngine, settle } from "../testkit/harness.js";
import "../../cards/index.js";

describe("dual option cost ignores Digimon effect immunity", () => {
  it("suspends an opposing Digimon immune to Digimon effects to pay a DUAL card's Option-use reduction", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "ST18-04", as: "ownPayer" }],
          hand: [{ card: "LM-066", as: "ligero" }],
        },
        1: {
          battleArea: [
            { card: "EX13-060", as: "immunePayer" },
            { card: "EX13-072", as: "lockTarget" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    await s.ready();
    await advance(s.engine).verb.restrict(s.perm("immunePayer").permanentId, "beAffected", EffectDuration.Permanent, {
      fromSourceKind: ["Digimon"],
      byOpponentEffectsOnly: true,
    });

    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("ligero").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some(({ cardId }) => cardId === "LM-066"));
    await settle();

    expect(s.state.memory).toBe(-4);
    expect(s.perm("ownPayer").isSuspended).toBe(true);
    expect(s.state.players[1]!.deck.at(-1)?.cardId).toBe("EX13-060");
    expect(s.state.pendingDecision).toBeUndefined();
  });
});
