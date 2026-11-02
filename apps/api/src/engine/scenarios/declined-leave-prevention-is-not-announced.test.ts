import { describe, expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle, type EngineSetup } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import fixture, {
  declinedDelayFixture,
} from "#api/engine/scenarios/declined-leave-prevention-is-not-announced.fixture";
import "#api/cards/index";

const SLAYERDRAMON = "EX13-024";
const DRAGON_GENE = "BT20-093";
const PREVENTION_PROMPT = "Prevent leaving the battle area?";
const DELAY_PROMPT = "Trash this card to activate its ＜Delay＞ effect?";

type AttackParams = { setup: EngineSetup; attacker: string; target: string };
type AnswerParams = { setup: EngineSetup; accept: boolean };

function countPreventionPrompts(setup: EngineSetup): number {
  return setup.decisions.filter(({ req }) => req.sourceCardId === SLAYERDRAMON && req.promptText === PREVENTION_PROMPT)
    .length;
}

function getEffectLifecycle(setup: EngineSetup, cardId: string) {
  return setup.events.flatMap((event) =>
    (event.kind === "effectTriggered" || event.kind === "effectResolved") && event.sourceCardId === cardId
      ? [event.kind]
      : [],
  );
}

function getPreventionLifecycle(setup: EngineSetup) {
  return getEffectLifecycle(setup, SLAYERDRAMON);
}

function isOnBattleArea(setup: EngineSetup, alias: string): boolean {
  return setup.state.players[0]!.battleArea.some(({ permanentId }) => permanentId === setup.perm(alias).permanentId);
}

function isInTrash(setup: EngineSetup, alias: string): boolean {
  return setup.state.players[0]!.trash.some(({ instanceId }) => instanceId === setup.inst(alias).instanceId);
}

function countBlockWindows(setup: EngineSetup): number {
  return setup.events.filter(({ kind }) => kind === "blockWindowOpened").length;
}

function declareAttack({ setup, attacker, target }: AttackParams): void {
  expect(
    setup.engine.applyIntent(1, {
      type: "attack",
      attackerPermanentId: setup.perm(attacker).permanentId,
      target: { kind: "permanent", permanentId: setup.perm(target).permanentId },
    }),
  ).toEqual({ ok: true });
}

async function declineSlayerdramonBlock(setup: EngineSetup, blockWindowsBefore: number): Promise<void> {
  await settle(() => countBlockWindows(setup) > blockWindowsBefore);
  expect(setup.engine.applyIntent(0, { type: "declineBlock" })).toEqual({ ok: true });
}

async function answerPrevention({ setup, accept }: AnswerParams): Promise<void> {
  await settle(() => setup.state.pendingDecision?.promptText === PREVENTION_PROMPT);
  expect(
    setup.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: setup.state.pendingDecision!.decisionId,
      response: { kind: "optional", accept },
    }),
  ).toEqual({ ok: true });
}

async function waitForAttackEnd(setup: EngineSetup): Promise<void> {
  await settle(() => !observe(setup.engine).isAttacking() && setup.state.pendingDecision === undefined);
}

describe("Declined leave prevention", () => {
  it("announces Slayerdramon's once-per-turn prevention only when its controller uses it", async () => {
    const preferred: string[] = [];
    const s = setupScenario(fixture, { autoSelectCards: true, preferInstanceIds: preferred });
    preferred.push(s.perm("slayerdramon").permanentId);
    await s.ready();
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(1);
      const turnCount = s.state.turnCount;
      const memory = s.state.memory;

      declareAttack({ setup: s, attacker: "firstAttacker", target: "firstDracomon" });
      await declineSlayerdramonBlock(s, 0);
      await answerPrevention({ setup: s, accept: false });
      await waitForAttackEnd(s);
      expect(countPreventionPrompts(s)).toBe(1);
      expect(getPreventionLifecycle(s)).toEqual([]);
      expect(isInTrash(s, "firstDracomon")).toBe(true);
      expect(s.perm("slayerdramon").isSuspended).toBe(false);

      declareAttack({ setup: s, attacker: "secondAttacker", target: "secondDracomon" });
      await declineSlayerdramonBlock(s, 1);
      await answerPrevention({ setup: s, accept: true });
      await waitForAttackEnd(s);
      expect(countPreventionPrompts(s)).toBe(2);
      expect(getPreventionLifecycle(s)).toEqual(["effectTriggered", "effectResolved"]);
      expect(isOnBattleArea(s, "secondDracomon")).toBe(true);
      expect(s.perm("slayerdramon").isSuspended).toBe(true);
      expect(s.perm("spareDracomon").isSuspended).toBe(false);

      declareAttack({ setup: s, attacker: "thirdAttacker", target: "thirdDracomon" });
      await waitForAttackEnd(s);
      expect(countBlockWindows(s)).toBe(2);
      expect(countPreventionPrompts(s)).toBe(2);
      expect(getPreventionLifecycle(s)).toEqual(["effectTriggered", "effectResolved"]);
      expect(isInTrash(s, "thirdDracomon")).toBe(true);
      expect(s.perm("spareDracomon").isSuspended).toBe(false);

      expect(s.state.turnSeat).toBe(1);
      expect(s.state.turnCount).toBe(turnCount);
      expect(s.state.memory).toBe(memory);
      expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual([
        SLAYERDRAMON,
        "ST8-03",
        "ST8-03",
      ]);
      expect(s.state.players[1]!.battleArea.every(({ isSuspended }) => isSuspended)).toBe(true);

      advance(s.engine).endMainPhaseIfOpen(1);
      await advance(s.engine).waitForMainPhase(0);
      expect(s.state.turnCount).toBe(turnCount + 1);
      expect(s.perm("slayerdramon").isSuspended).toBe(false);
      expect(s.state.pendingDecision).toBeUndefined();
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });

  it("keeps a declined Delay leave reaction off the public effect lifecycle", async () => {
    const preferred: string[] = [];
    const s = setupScenario(declinedDelayFixture, { autoSelectCards: true, preferInstanceIds: preferred });
    preferred.push(s.perm("endangeredDracomon").permanentId);
    await s.ready();
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(1);
      const turnCount = s.state.turnCount;
      const memory = s.state.memory;

      expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("gaiaForce").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.pendingDecision?.promptText === DELAY_PROMPT);
      expect(s.state.pendingDecision?.seat).toBe(0);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: s.state.pendingDecision!.decisionId,
          response: { kind: "optional", accept: false },
        }),
      ).toEqual({ ok: true });
      await settle(() => isInTrash(s, "endangeredDracomon") && s.state.pendingDecision === undefined);

      expect(getEffectLifecycle(s, DRAGON_GENE)).toEqual([]);
      expect(isOnBattleArea(s, "dragonGene")).toBe(true);
      expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("gaiaForce").instanceId]);
      expect(s.state.memory).toBe(memory - 8);
      expect(s.state.turnSeat).toBe(1);
      expect(s.state.turnCount).toBe(turnCount);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
