import { describe, expect, it } from "vitest";
import "../cards/index.js";
import { setupEngine, settle } from "./testkit/harness.js";

describe("PlaceUnder other-host producer sweep — Discord 1557666953748025394", () => {
  it.each(["BT11-088", "BT11-109", "BT12-083"])(
    "excludes the moved Digimon from %s's destination picker",
    async (cardId) => {
      const preferred: string[] = [];
      const s = setupEngine(
        {
          0: {
            hand: [{ card: cardId, as: "played" }],
            deck: ["BT1-085"],
            battleArea: [
              { card: "BT11-082", as: "bagra" },
              { card: "BT4-080", as: "base" },
            ],
          },
          1: {
            battleArea: [
              { card: "BT1-009", as: "victim", under: [{ card: "BT1-013", as: "shed" }] },
              { card: "BT1-014", as: "host" },
              { card: "BT1-013", as: "other" },
              { card: "TOKEN-Uka-no-Mitama", as: "token" },
            ],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
      );
      s.state.memory = 10;
      await s.ready();
      const victimPermanent = s.perm("victim").permanentId;
      const top = s.perm("victim").topCard.instanceId;
      const host = s.perm("host").permanentId;
      preferred.push(victimPermanent, host);
      const result =
        cardId === "BT12-083"
          ? s.engine.applyIntent(0, {
              type: "digivolve",
              permanentId: s.perm("base").permanentId,
              instanceId: s.inst("played").instanceId,
            })
          : s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId });
      expect(result).toEqual({ ok: true });
      await settle(() => s.perm("host").stack.length === 1 && s.state.pendingDecision === undefined);
      expect(s.perm("token").stack).toHaveLength(0);
      expect(s.perm("host").stack.map(({ instanceId }) => instanceId)).toEqual([top]);
      expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("shed").instanceId]);
      const hostDecision = s.decisions.filter(({ req }) => req.kind === "chooseTargets").at(-1)!.req;
      expect(hostDecision.options?.candidateInstanceIds?.sort()).toEqual([host, s.perm("other").permanentId].sort());
    },
  );
});
