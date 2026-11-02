import { describe, expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import fixture from "#api/engine/scenarios/relinked-prevention-source-resets-usage.fixture";
import "#api/cards/index";

describe("Relinked prevention source usage", () => {
  it.each(["warudamon", "cometmon"])(
    "preserves Cometmon's spent usage only while it stays linked when paying with %s",
    async (payment) => {
      const preferred: string[] = [];
      const s = setupScenario(fixture, {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoChooseOption: true,
        autoOrderTriggers: true,
        preferInstanceIds: preferred,
        declinePrompts: ["trashSecurityTop"],
      });
      preferred.push(s.perm("deusmon").permanentId, s.inst(payment).instanceId);
      const hostId = s.perm("deusmon").permanentId;
      const hostInstanceId = s.inst("deusmon").instanceId;
      await s.ready();
      const loop = s.engine.startTurnLoop();
      try {
        await advance(s.engine).waitForMainPhase(1);
        expect(
          s.engine.applyIntent(1, {
            type: "attack",
            attackerPermanentId: s.perm("dragonMode").permanentId,
            target: { kind: "player" },
          }),
        ).toEqual({ ok: true });
        await settle(() => !observe(s.engine).isAttacking());
        expect(s.perm("dragonMode").topCard.cardId).toBe("AD1-024");
        expect(
          s.events.some(
            (event) =>
              event.kind === "cardsMoved" &&
              event.instanceIds.includes(s.inst(payment).instanceId) &&
              event.to === "trash",
          ),
        ).toBe(true);
        expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("godGrade").instanceId);
        const survivingHost = s.state.players[0]!.battleArea.find((permanent) => permanent.permanentId === hostId);
        const preventionPrompts = s.decisions.filter(
          ({ req }) => req.sourceCardId === "EX10-030" && req.promptText === "Prevent leaving the battle area?",
        );
        expect(survivingHost?.linked.map((card) => card.instanceId)).toEqual(
          payment === "cometmon" ? [s.inst("warudamon").instanceId] : undefined,
        );
        expect(preventionPrompts).toHaveLength(payment === "cometmon" ? 2 : 1);
        const preventionNotices = s.events.flatMap((event) =>
          event.kind === "effectTriggered" && event.sourceCardId === "EX10-030" ? [event] : [],
        );
        expect(preventionNotices.map(({ description }) => description)).toEqual(
          preventionPrompts.map(
            () =>
              "[All Turns] [Once Per Turn] When this Digimon would leave the battle area, by trashing 1 of its link cards, it doesn't leave.",
          ),
        );
        expect(preventionNotices.every((event) => event.beforeRemoval === true)).toBe(true);
        expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("cometmon").instanceId);
        expect(s.state.players[0]!.deck.at(-1)?.instanceId === hostInstanceId).toBe(payment === "warudamon");
        expect(s.state.pendingDecision).toBeUndefined();
      } finally {
        await finishTurnLoop({ setup: s, loop });
      }
    },
  );
});
