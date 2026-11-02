import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";

describe("trash DeathXmon does not react to Mistymon", () => {
  it.each(["BT9-112", "BT20-082"])(
    "keeps %s in trash while Mistymon deletes Angemon and attacks security",
    async (deathxmon) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "EX13-030", as: "base" }],
            hand: [{ card: "EX13-033", as: "mistymon" }],
            security: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"],
            deck: ["BT1-009", "BT1-010"],
          },
          1: {
            battleArea: [{ card: "ST3-05", as: "angemon" }],
            trash: [{ card: deathxmon, as: "deathxmon" }],
            security: ["BT1-009", "BT1-010", "BT1-011"],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
      );
      s.state.memory = 10;
      await s.ready();
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("mistymon").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.events.some((event) => event.kind === "attackEnded") &&
          !observe(s.engine).isAttacking() &&
          s.state.pendingDecision === undefined,
      );
      expect(s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("deathxmon").instanceId)).toBe(true);
      expect(s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("angemon").instanceId)).toBe(true);
      expect(s.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === deathxmon)).toBe(
        false,
      );
      expect(s.events.filter((event) => event.kind === "securityChecked")).toHaveLength(1);
      expect(
        s.events.filter((event) => event.kind === "effectTriggered" && event.sourceCardId === "EX13-033").length,
      ).toBeGreaterThanOrEqual(2);
    },
  );
});
