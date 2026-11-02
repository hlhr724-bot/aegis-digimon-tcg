import { describe, expect, it } from "vitest";
import { advance } from "#api/engine/testkit/advance";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import "#api/cards/index";

describe("Nanimon attack restriction across evolution", () => {
  it.each([false, true])("only clears the restriction when Reina performs DNA: %s", async (useDna) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX13-054", as: "nanimon" }],
          security: ["BT1-080", "BT1-080"],
          deck: ["BT1-009", "BT1-009"],
        },
        1: {
          battleArea: [
            { card: "P-174", as: "boltmon", suspended: true },
            { card: "EX11-059", as: "reina" },
            { card: "EX8-057", as: "fodder" },
          ],
          trash: [{ card: "EX8-036", as: "skullmammothmon" }],
          hand: [
            { card: "EX8-057", as: "mainCost" },
            { card: "EX8-064", as: "bolt" },
          ],
          security: ["BT1-080", "BT1-080"],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, autoOrderTriggers: true },
    );
    const boltmonId = s.perm("boltmon").permanentId;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("nanimon").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(
        () => s.events.some((event) => event.kind === "attackEnded") && s.state.pendingDecision === undefined,
      );
      expect(observe(s.engine).isRestricted(s.perm("boltmon"), "attackPlayers")).toBe(true);
      advance(s.engine).endMainPhaseIfOpen(0);
      await advance(s.engine).waitForMainPhase(1);
      s.state.memory = 10;
      expect(
        s.engine.applyIntent(
          1,
          useDna
            ? {
                type: "attack",
                attackerPermanentId: s.perm("fodder").permanentId,
                target: { kind: "player" },
              }
            : {
                type: "digivolve",
                permanentId: boltmonId,
                instanceId: s.inst("bolt").instanceId,
              },
        ),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.cardId === "EX8-064") &&
          s.state.pendingDecision === undefined,
      );
      const bolt = s.state.players[1]!.battleArea.find((permanent) => permanent.topCard.cardId === "EX8-064")!;
      expect(bolt.permanentId === boltmonId).toBe(!useDna);
      expect(observe(s.engine).isRestricted(bolt, "attackPlayers")).toBe(!useDna);
      expect(bolt.stack.map((card) => card.cardId)).toEqual(useDna ? ["EX8-036", "P-174"] : ["P-174"]);
      const attacksEnded = s.events.filter((event) => event.kind === "attackEnded").length;
      const result = s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: bolt.permanentId,
        target: { kind: "player" },
      });
      expect(result.ok).toBe(useDna);
      if (useDna) {
        await settle(
          () =>
            s.events.filter((event) => event.kind === "attackEnded").length === attacksEnded + 1 &&
            s.state.pendingDecision === undefined,
        );
      }
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
