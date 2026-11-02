import { describe, expect, it } from "vitest";
import type { DecisionResponse } from "@aegis/shared";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { drainMicrotasks, settle, type EngineSetup } from "#api/engine/testkit/harness";
import { fixtureInstanceId, fixturePermanentId } from "#api/engine/scenario/references";
import fixture from "#api/engine/scenarios/mystimon-security-trash-attack-stays-optional.fixture";
import "#api/cards/index";

const PLACE_CLAUSE =
  "[On Play] [When Digivolving] You may place 1 [Witchelny] text card from your hand as the bottom security card.";
const ATTACK_CLAUSE = "1 of your Digimon may attack";
const TRASH_COST = "Then, by trashing your top security card";

async function answer(s: EngineSetup, emphasis: string, response: DecisionResponse): Promise<void> {
  await settle(() => s.state.pendingDecision !== undefined);
  const { req } = s.decisions.at(-1)!;
  expect(req.options?.effectTextEmphasis).toBe(emphasis);
  expect(s.engine.applyIntent(0, { type: "respondDecision", decisionId: req.decisionId, response })).toEqual({
    ok: true,
  });
}

async function playMistymonAndPayTrashCost(s: EngineSetup): Promise<void> {
  await advance(s.engine).waitForMainPhase(0);
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("mistymonCard").instanceId })).toEqual({
    ok: true,
  });
  await answer(s, PLACE_CLAUSE, { kind: "optional", accept: false });
  await answer(s, TRASH_COST, { kind: "optional", accept: true });
  await settle(() => s.state.pendingDecision !== undefined);
  expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(fixtureInstanceId("topSecurity"));
  expect(s.state.players[0]!.security).toHaveLength(2);
}

describe("Mistymon's security-trash attack", () => {
  it("lets the player decline the attack after trashing the top security card", async () => {
    const s = setupScenario(fixture, { autoSelectCards: true, autoOrderTriggers: true });
    const loop = s.engine.startTurnLoop();
    try {
      await playMistymonAndPayTrashCost(s);
      await answer(s, ATTACK_CLAUSE, { kind: "optional", accept: false });
      await settle(() => s.state.pendingDecision === undefined && s.state.combatWindow === undefined);
      await drainMicrotasks();

      expect(s.state.pendingDecision).toBeUndefined();
      expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(false);
      expect(s.state.players[1]!.security).toHaveLength(3);
      expect(s.perm("readyAttacker").isSuspended).toBe(false);
      expect(s.state.players[1]!.battleArea.map((permanent) => permanent.permanentId)).not.toContain(
        fixturePermanentId("opponentRookie"),
      );
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });

  it("still attacks when the player accepts after trashing the top security card", async () => {
    const s = setupScenario(fixture, {
      autoSelectCards: true,
      autoOrderTriggers: true,
      preferInstanceIds: [fixturePermanentId("readyAttacker")],
    });
    const loop = s.engine.startTurnLoop();
    try {
      await playMistymonAndPayTrashCost(s);
      await answer(s, ATTACK_CLAUSE, { kind: "optional", accept: true });
      await settle(() => s.events.some((event) => event.kind === "attackDeclared"));

      expect(s.events.find((event) => event.kind === "attackDeclared")).toMatchObject({
        attackerPermanentId: fixturePermanentId("readyAttacker"),
      });
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });

  it("keeps the security stack when the player refuses the trash cost", async () => {
    const s = setupScenario(fixture, { autoSelectCards: true, autoOrderTriggers: true });
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("mistymonCard").instanceId })).toEqual({
        ok: true,
      });
      await answer(s, PLACE_CLAUSE, { kind: "optional", accept: false });
      await answer(s, TRASH_COST, { kind: "optional", accept: false });
      await settle(() => s.state.pendingDecision === undefined);
      await drainMicrotasks();

      expect(s.state.pendingDecision).toBeUndefined();
      expect(s.state.players[0]!.security.map((card) => card.instanceId)[0]).toBe(fixtureInstanceId("topSecurity"));
      expect(s.state.players[0]!.security).toHaveLength(3);
      expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(false);
      expect(s.state.players[1]!.battleArea.map((permanent) => permanent.permanentId)).toContain(
        fixturePermanentId("opponentRookie"),
      );
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
