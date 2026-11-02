import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/EX6/EX6-073";
import "#api/cards/index";

describe("Demon Lord option payment", () => {
  it("returns a Seven Great Demon Lords Option with six differently named Digimon for Ogudomon's attack", async () => {
    const lords = ["EX6-060", "EX6-058", "EX6-056", "EX6-054", "BT23-070", "EX5-063", "EX6-069"];
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX6-073", as: "ogudomon" }], trash: lords, deck: ["BT1-009"] },
        1: {
          battleArea: [{ card: "BT1-024", as: "target", suspended: true }],
          security: Array.from({ length: 8 }, () => "BT1-009"),
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderCards: true, autoOrderTriggers: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("ogudomon").permanentId,
        target: { kind: "permanent", permanentId: s.perm("target").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.perm("ogudomon").stack).toHaveLength(0);
    expect(s.state.players[0]!.deck.slice(-7).map((card) => card.cardId)).toEqual([...lords].reverse());
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.pendingDecision).toBeUndefined();
  });
  it("rejects a non-Demon-Lord Option as the seventh payment card", async () => {
    const sources = ["EX6-060", "EX6-058", "EX6-056", "EX6-054", "BT23-070", "EX5-063", "ST1-16"];
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX6-073", as: "ogudomon", under: sources }], deck: ["BT1-009"] },
        1: {
          battleArea: [{ card: "BT1-024", as: "target", suspended: true }],
          security: Array.from({ length: 8 }, () => "BT1-009"),
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("ogudomon").permanentId,
        target: { kind: "permanent", permanentId: s.perm("target").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.perm("ogudomon").stack.map((card) => card.cardId)).toEqual(sources);
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toEqual(["BT1-009"]);
    expect(s.state.players[1]!.security).toHaveLength(8);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});
