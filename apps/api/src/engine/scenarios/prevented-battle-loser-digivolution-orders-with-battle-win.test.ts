import { Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import "../../cards/index.js";
import {
  preventedBattleLoserDigivolutionOrdersWithBattleWin,
  type PreventedBattleLoserBattle,
} from "./prevented-battle-loser-digivolution-orders-with-battle-win.fixture.js";
import { advance } from "../testkit/advance.js";
import { settle } from "../testkit/harness.js";
import { observe } from "../testkit/observe.js";
import { setupScenario } from "../testkit/scenario.js";

const EXAMON = "EX13-045";
const DESTROY_MODE = "BT26-060";
const DRACOMON = "EX13-008";

const startBattle = (s: ReturnType<typeof setupScenario>, battle: PreventedBattleLoserBattle) => {
  if (battle === "attack") {
    return s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("examon").permanentId,
      target: { kind: "player" },
    });
  }
  if (battle === "effect") {
    return s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("base").permanentId,
      instanceId: s.inst("examon").instanceId,
    });
  }
  return s.engine.applyIntent(0, {
    type: "dnaDigivolve",
    instanceId: s.inst("examon").instanceId,
    materialPermanentIds: [s.perm("ground").permanentId, s.perm("wing").permanentId],
  });
};

describe("battle-win trigger orders with the prevented loser's replacement digivolution (Q7361, Q7362)", () => {
  it.each<PreventedBattleLoserBattle>(["attack", "effect", "dnaAttack"])(
    "resolves Examon's win trigger before Destroy Mode's [When Digivolving] after a %s battle",
    async (battle) => {
      const s = setupScenario(preventedBattleLoserDigivolutionOrdersWithBattleWin({ battle }), {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoChooseOption: true,
        declinePrompts: ["Raid"],
      });
      const loop = s.engine.startTurnLoop();
      try {
        await settle(() => s.state.phase === Phase.Breeding);
        expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
        await advance(s.engine).waitForMainPhase(0);

        expect(startBattle(s, battle)).toEqual({ ok: true });
        if (battle === "attack") {
          await settle(() => s.engine.combat.hasOpenBlockWindow);
        }
        const blockDeclared =
          battle === "attack"
            ? s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: s.perm("giantSlayer").permanentId })
            : { ok: true };
        expect(blockDeclared).toEqual({ ok: true });
        await settle(() => s.events.some((event) => event.kind === "battleCompared"));
        await settle(() => s.engine.combat.hasOpenBlockWindow || !observe(s.engine).isAttacking());
        const blockDeclined = s.engine.combat.hasOpenBlockWindow
          ? s.engine.applyIntent(1, { type: "declineBlock" })
          : { ok: true };
        expect(blockDeclined).toEqual({ ok: true });
        await settle(() => s.state.pendingDecision === undefined && !observe(s.engine).isAttacking());

        const battleWonResolved = s.events.findIndex(
          (event) =>
            event.kind === "effectResolved" && event.sourceCardId === EXAMON && event.timing === "whenBattleWon",
        );
        const destroyModeResolved = s.events.findIndex(
          (event) =>
            event.kind === "effectResolved" &&
            event.sourceCardId === DESTROY_MODE &&
            event.timing === "WhenDigivolving",
        );
        expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual([DESTROY_MODE]);
        expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toContain(DRACOMON);
        expect(battleWonResolved).toBeGreaterThanOrEqual(0);
        expect(destroyModeResolved).toBeGreaterThan(battleWonResolved);
      } finally {
        s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
        await loop;
      }
    },
  );
});
