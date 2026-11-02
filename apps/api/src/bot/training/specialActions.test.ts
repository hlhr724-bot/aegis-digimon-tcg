import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { mainActions } from "./actions.js";
import "../../cards/index.js";

for (const seat of [0, 1] as const) {
  describe(`compound Main declarations for seat ${seat}`, () => {
    it("offers both Omnimon DNA orders and executes the selected stack order", async () => {
      const s = setupEngine(
        {
          [seat]: {
            battleArea: [
              { card: "BT22-013", as: "greymon" },
              { card: "BT22-026", as: "garurumon" },
            ],
            hand: [{ card: "EX13-016", as: "result" }],
            deck: ["BT22-008"],
          },
        },
        { autoDeclineOptional: true, autoSelectCards: true },
      );
      s.state.turnSeat = seat;
      s.state.memory = 0;
      await s.ready();
      const routes = mainActions(s.engine, seat).filter(({ intent }) => intent.type === "dnaDigivolve");
      expect(routes.map(({ materialIds }) => materialIds)).toEqual([
        [s.perm("greymon").permanentId, s.perm("garurumon").permanentId],
        [s.perm("garurumon").permanentId, s.perm("greymon").permanentId],
      ]);
      expect(s.engine.applyIntent(seat, routes[1]!.intent)).toEqual({ ok: true });
      await settle(() => s.state.players[seat]!.battleArea.some((p) => p.topCard?.cardId === "EX13-016"));
      const result = s.state.players[seat]!.battleArea.find((p) => p.topCard?.cardId === "EX13-016")!;
      expect(result.stack.map((c) => c.cardId)).toEqual(["BT22-026", "BT22-013"]);
      expect(s.state.memory).toBe(0);
    });

    it("uses effective DNA levels and names for EX13 Wingdramon and Groundramon", async () => {
      const s = setupEngine({ [seat]: { battleArea: ["EX13-021", "EX13-041"], hand: ["EX13-045"] } });
      s.state.turnSeat = seat;
      await s.ready();
      expect(mainActions(s.engine, seat).filter(({ intent }) => intent.type === "dnaDigivolve")).toHaveLength(2);
    });

    it.each(["hand", "field"] as const)("links an Appmon from %s and excludes self-linking", async (zone) => {
      const s = setupEngine(
        {
          [seat]: {
            battleArea: [
              { card: "BT26-051", as: "host" },
              ...(zone === "field" ? [{ card: "BT26-010", as: "material" }] : []),
            ],
            hand: zone === "hand" ? [{ card: "BT26-010", as: "material" }] : [],
          },
        },
        { autoDeclineOptional: true },
      );
      s.state.turnSeat = seat;
      s.state.memory = 4;
      await s.ready();
      const routes = mainActions(s.engine, seat).filter(
        ({ intent }) => intent.type === "linkCard" && intent.instanceId === s.inst("material").instanceId,
      );
      expect(routes).toHaveLength(1);
      expect(routes[0]?.targetId).toBe(s.perm("host").permanentId);
      expect(routes[0]?.projectedCost).toBe(3);
      expect(s.engine.applyIntent(seat, routes[0]!.intent)).toEqual({ ok: true });
      await settle(() => s.perm("host").linked.some((c) => c.cardId === "BT26-010"));
      expect(s.state.memory).toBe(1);
      if (zone === "field") expect(s.state.players[seat]!.battleArea).toHaveLength(1);
    });

    it("App Fuses using the selected linked instance, excluding an unrelated linked card", async () => {
      const s = setupEngine(
        {
          [seat]: {
            battleArea: [{ card: "BT26-051", as: "host", linked: [{ card: "EX10-024", as: "partner" }] }],
            hand: [{ card: "BT25-036", as: "result" }],
            deck: ["BT1-010", "BT1-013"],
            security: ["BT1-001"],
          },
        },
        { autoDeclineOptional: true, autoSelectCards: true, autoChooseOption: true },
      );
      s.state.turnSeat = seat;
      s.state.memory = 0;
      await s.ready();
      const route = mainActions(s.engine, seat).find(({ intent }) => intent.type === "appFusion");
      expect(route?.materialIds).toEqual([s.inst("partner").instanceId]);
      expect(route?.projectedCost).toBe(0);
      expect(s.engine.applyIntent(seat, route!.intent)).toEqual({ ok: true });
      await settle(() => s.perm("host").topCard.cardId === "BT25-036");
      expect(s.perm("host").linked).toHaveLength(0);
      expect(s.perm("host").stack.map((c) => c.cardId)).toEqual(["BT26-051", "EX10-024"]);
    });
  });
}
