import "#api/cards/index";
import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { enumerateMainPhaseCandidates } from "#api/bot/candidates";
import { scoreCandidate } from "#api/bot/evaluate";
import { BOT_PROFILES } from "#api/bot/profiles";
import { createEvaluationPolicy } from "#api/bot/policy";
import { buildBotView } from "#api/bot/view";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import type { ScenarioFixture } from "#api/engine/scenario/types";
import fixture from "#api/engine/scenarios/bot-attack-redirection.fixture";

type Scenario = ReturnType<typeof setupScenario>;
type RunParams = { position?: ScenarioFixture; verify: (scenario: Scenario) => void | Promise<void> };

async function verifyMainPhase({ position = fixture, verify }: RunParams): Promise<void> {
  const s = setupScenario(position, { autoAcceptOptional: true, autoSelectCards: true });
  const loop = s.engine.runOneTurn();
  try {
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    await verify(s);
  } finally {
    s.engine.applyIntent(1, { type: "surrender" });
    await loop;
  }
}

type ScoreParams = { scenario: Scenario; attacker?: string; target?: string };

function getAttackScore({ scenario, attacker = "attacker", target }: ScoreParams): number {
  const view = buildBotView(scenario.state, 1)!;
  const attackerId = scenario.perm(attacker).permanentId;
  const key =
    target === undefined
      ? `attackPlayer:${attackerId}`
      : `attackDigimon:${attackerId}:${scenario.perm(target).permanentId}`;
  const attack = enumerateMainPhaseCandidates(view).find((candidate) => candidate.key === key);
  expect(attack).toBeDefined();
  return scoreCandidate(view, attack!, BOT_PROFILES.balanced);
}

describe("Bot attack redirection", () => {
  it.each([false, true])("rejects a losing attack into inherited redirection with suspended=%s", async (suspended) => {
    const position = structuredClone(fixture);
    position.board[0]!.battleArea = [{ card: "EX9-048", as: "redirector", under: ["EX9-005", "EX9-048"], suspended }];
    await verifyMainPhase({
      position,
      verify: (s) => {
        expect(getAttackScore({ scenario: s })).toBeLessThan(0);
        expect(createEvaluationPolicy().chooseMainAction(buildBotView(s.state, 1)!).type).not.toBe("attack");
      },
    });
  });

  it("does not award lethal to a redirected attack against empty security", async () => {
    const position = structuredClone(fixture);
    position.board[0]!.security = 0;
    await verifyMainPhase({
      position,
      verify: (s) => {
        expect(getAttackScore({ scenario: s })).toBeLessThan(0);
      },
    });
  });

  it("allows a favorable battle against a smaller redirect target", async () => {
    const position = structuredClone(fixture);
    position.board[1]!.battleArea = [{ card: "BT1-020", as: "attacker", dp: 10000 }];
    await verifyMainPhase({
      position,
      verify: (s) => {
        expect(getAttackScore({ scenario: s })).toBeGreaterThan(0);
      },
    });
  });

  it("ignores an inherited redirection without a matching target", async () => {
    const position = structuredClone(fixture);
    position.board[0]!.battleArea = [{ card: "BT1-020", as: "redirector", under: ["EX9-005"] }];
    await verifyMainPhase({
      position,
      verify: (s) => {
        expect(s.perm("attacker").attackRedirectTargets.player?.targetIds).toEqual([]);
        expect(getAttackScore({ scenario: s })).toBeGreaterThan(0);
      },
    });
  });

  it("stops charging for inherited redirection after its once-per-turn use", async () => {
    const position = structuredClone(fixture);
    position.board[1]!.battleArea!.push({ card: "ST1-03", as: "second", dp: 3000 });
    await verifyMainPhase({
      position,
      verify: async (s) => {
        expect(getAttackScore({ scenario: s, attacker: "second" })).toBeLessThan(0);
        expect(
          s.engine.applyIntent(1, {
            type: "attack",
            attackerPermanentId: s.perm("attacker").permanentId,
            target: { kind: "player" },
          }),
        ).toEqual({ ok: true });
        await settle(() => s.state.players[1]!.trash.some((card) => card.cardId === "ST1-03"));
        await advance(s.engine).waitForMainPhase(1);
        expect(s.state.players[1]!.trash.some((card) => card.cardId === "ST1-03")).toBe(true);
        expect(s.state.players[0]!.security).toHaveLength(5);
        expect(s.perm("second").attackRedirectTargets.player?.targetIds).toEqual([]);
        expect(getAttackScore({ scenario: s, attacker: "second" })).toBeGreaterThan(0);
      },
    });
  });

  it.each([false, true])("respects a Tamer's suspension cost with suspended=%s", async (suspended) => {
    const position = structuredClone(fixture);
    position.board[0]!.battleArea = [
      { card: "BT15-085", as: "tamer", suspended },
      { card: "BT1-073", as: "redirector", suspended: true },
    ];
    await verifyMainPhase({
      position,
      verify: (s) => {
        expect(getAttackScore({ scenario: s }) > 0).toBe(suspended);
      },
    });
  });

  it("accounts for redirection when attacking a weaker Digimon", async () => {
    const position = structuredClone(fixture);
    position.board[0]!.battleArea!.push({ card: "ST1-03", as: "victim", dp: 1000, suspended: true });
    await verifyMainPhase({
      position,
      verify: (s) => {
        expect(getAttackScore({ scenario: s, target: "victim" })).toBeLessThan(0);
      },
    });
  });

  it("applies player-only redirection only to player attacks", async () => {
    const position = structuredClone(fixture);
    position.board[0]!.battleArea = [
      { card: "BT11-092", as: "tamer" },
      { card: "BT2-066", as: "redirector", suspended: true },
      { card: "ST1-03", as: "victim", dp: 1000, suspended: true },
    ];
    await verifyMainPhase({
      position,
      verify: (s) => {
        expect(getAttackScore({ scenario: s })).toBeLessThan(0);
        expect(getAttackScore({ scenario: s, target: "victim" })).toBeGreaterThan(0);
      },
    });
  });
  it("can spend one attacker to exhaust a once-per-turn redirect before lethal", async () => {
    const position = structuredClone(fixture);
    position.board[0]!.security = 0;
    position.board[1]!.battleArea!.push({ card: "ST1-03", as: "second", dp: 3000 });
    await verifyMainPhase({
      position,
      verify: (s) => {
        expect(getAttackScore({ scenario: s })).toBeGreaterThan(100);
      },
    });
  });

  it("does not treat a repeatable redirect as exhausted by a second attacker", async () => {
    const position = structuredClone(fixture);
    position.board[0]!.security = 0;
    position.board[0]!.battleArea = [{ card: "BT9-044", as: "redirector", under: ["BT9-109"] }];
    position.board[1]!.battleArea!.push({ card: "ST1-03", as: "second", dp: 3000 });
    await verifyMainPhase({
      position,
      verify: (s) => {
        expect(getAttackScore({ scenario: s })).toBeLessThan(0);
      },
    });
  });

  it.each([{ hand: [] }, { hand: ["ST1-03"] }, { hand: ["BT3-070"] }])(
    "estimates hidden hand costs from public card counts: $hand",
    async ({ hand }) => {
      const position = structuredClone(fixture);
      position.board[0]!.battleArea = [{ card: "EX5-054", as: "redirector" }];
      position.board[0]!.hand = hand;
      await verifyMainPhase({
        position,
        verify: (s) => {
          const targets = s.perm("attacker").attackRedirectTargets.player?.targetIds;
          expect(targets).toEqual(hand.length === 0 ? [] : [s.perm("redirector").permanentId]);
        },
      });
    },
  );
  it("can exhaust a Tamer's suspension cost before a second attack wins", async () => {
    const position = structuredClone(fixture);
    position.board[0]!.security = 0;
    position.board[0]!.battleArea = [
      { card: "BT15-085", as: "tamer" },
      { card: "BT1-073", as: "redirector", suspended: true },
    ];
    position.board[1]!.battleArea!.push({ card: "ST1-03", as: "second", dp: 3000 });
    await verifyMainPhase({
      position,
      verify: (s) => {
        expect(s.perm("attacker").attackRedirectTargets.player?.capacity).toBe(1);
        expect(getAttackScore({ scenario: s })).toBeGreaterThan(100);
      },
    });
  });
});
