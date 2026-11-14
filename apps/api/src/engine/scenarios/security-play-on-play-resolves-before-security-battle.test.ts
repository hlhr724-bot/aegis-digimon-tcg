import "#api/cards/index";
import { describe, expect, it } from "vitest";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/security-play-on-play-resolves-before-security-battle.fixture";

describe("a Digimon played by a [Security] effect", () => {
  it("Q2413: resolves its [On Play] before the security Digimon battles the attacker", async () => {
    const s = setupScenario(fixture, {
      autoAcceptOptional: true,
      autoChooseOption: true,
      autoSelectCards: true,
    });
    const turn = s.engine.runOneTurn();
    try {
      await advance(s.engine).waitForMainPhase(1);
      expect(
        s.engine.applyIntent(1, {
          type: "attack",
          attackerPermanentId: s.perm("attacker").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.events.some((event) => event.kind === "attackEnded"));
      await settle(() => s.state.pendingDecision === undefined);

      const kingPlayed = s.events.findIndex(
        (event) => event.kind === "cardPlayed" && event.instanceId === s.inst("kingEtemon").instanceId,
      );
      const onPlayPlays = s.events.flatMap((event, index) =>
        event.kind === "cardPlayed" && event.cardId === "BT14-034" ? [index] : [],
      );
      const checked = s.events.findIndex((event) => event.kind === "securityChecked");
      expect(kingPlayed).toBeGreaterThanOrEqual(0);
      expect(onPlayPlays).toHaveLength(2);
      expect(onPlayPlays.every((index) => kingPlayed < index && index < checked)).toBe(true);
      expect(s.state.players[1]!.battleArea).toHaveLength(0);
      expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("attackerTop").instanceId]);
      expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId).sort()).toEqual(
        ["BT14-034", "BT14-034", "EX13-035"].sort(),
      );
      assertNoLoudGap(s);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await turn;
    }
  });
});
