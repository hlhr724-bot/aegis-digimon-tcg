import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import type { DecisionRequest } from "@aegis/shared/protocol/decisions";
import type { DecisionResponse } from "@aegis/shared/protocol/intents";
import "#api/cards/index";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle, type EngineSetup } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/arts-digivolve-entry-effects-before-opponent-digivolve-watcher.fixture";

const DE_DIGIVOLVE_EFFECT = "BT25-057/ir-shared-0";

type Driver = {
  next: () => Promise<DecisionRequest>;
  respond: (request: DecisionRequest, response: DecisionResponse) => void;
};

function createDriver(s: EngineSetup): Driver {
  let answered: string | undefined;
  return {
    next: async () => {
      await settle(() => s.state.pendingDecision !== undefined && s.state.pendingDecision.decisionId !== answered);
      return s.decisions.at(-1)!.req;
    },
    respond: (request, response) => {
      answered = request.decisionId;
      expect(
        s.engine.applyIntent(request.seat, { type: "respondDecision", decisionId: request.decisionId, response }),
      ).toEqual({ ok: true });
    },
  };
}

async function attackWithOptionThenArtsDigivolve(s: EngineSetup, driver: Driver): Promise<DecisionRequest> {
  await advance(s.engine).waitForMainPhase(0);
  expect(
    s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("monarchlizamon").instanceId, useAs: "option" }),
  ).toEqual({ ok: true });
  const followUpAttack = await driver.next();
  expect(followUpAttack).toMatchObject({ seat: 0, kind: "optional", sourceCardId: "BT25-057" });
  driver.respond(followUpAttack, { kind: "optional", accept: true });
  const attackTarget = await driver.next();
  expect(attackTarget.options?.candidateInstanceIds).toEqual(["player"]);
  driver.respond(attackTarget, { kind: "selectCards", instanceIds: ["player"] });
  const arts = await driver.next();
  expect(arts.promptText).toContain("Arts Digivolve");
  driver.respond(arts, { kind: "selectCards", instanceIds: [s.perm("artsBase").topCard.instanceId] });
  return driver.next();
}

function dianamonTriggerIndex(s: EngineSetup): number {
  return s.events.findIndex((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT25-028");
}

describe("Arts Digivolve during an Option-ordered attack against an opponent's digivolve watcher", () => {
  it("lets the turn player's [When Digivolving] remove the watcher before it activates", async () => {
    const s = setupScenario(fixture, { autoOrderTriggers: false });
    const driver = createDriver(s);
    const loop = s.engine.startTurnLoop();
    try {
      const entry = await attackWithOptionThenArtsDigivolve(s, driver);
      expect(entry).toMatchObject({ seat: 0, kind: "orderTriggers" });
      expect(entry.options?.triggerCardIds).toEqual(["BT25-057", "BT25-057"]);
      const deDigivolveKey = entry.options!.triggerKeys!.find((key) => key.includes(DE_DIGIVOLVE_EFFECT))!;
      driver.respond(entry, { kind: "orderTriggers", order: [deDigivolveKey] });
      const deDigivolve = await driver.next();
      expect(deDigivolve).toMatchObject({ seat: 0, kind: "optional", sourceCardId: "BT25-057" });
      driver.respond(deDigivolve, { kind: "optional", accept: true });
      const battle = await driver.next();
      expect(battle).toMatchObject({ seat: 0, kind: "optional", sourceCardId: "BT25-057", promptText: "Battle" });
      driver.respond(battle, { kind: "optional", accept: false });
      await settle(() => s.state.pendingDecision === undefined && s.state.players[1]!.security.length === 1);

      expect(dianamonTriggerIndex(s)).toBe(-1);
      expect(s.perm("dianamon").topCard.instanceId).toBe(s.inst("dianamonUltimate").instanceId);
      expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toContain("BT25-028");
      expect(s.perm("artsBase").topCard.instanceId).toBe(s.inst("monarchlizamon").instanceId);
      expect(s.perm("artsBase").stack.map(({ instanceId }) => instanceId)).toEqual([
        s.inst("artsBaseLowerSource").instanceId,
        s.inst("artsBaseUpperSource").instanceId,
        s.inst("artsBase").instanceId,
      ]);
      expect(s.perm("tamer").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("tamerTopSource").instanceId]);
      expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual([
        s.inst("tamerBottomSource").instanceId,
      ]);
      expect(s.state.turnSeat).toBe(0);
      expect(s.state.phase).toBe(Phase.Main);
      expect(s.state.memory).toBe(1);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });

  it("activates the watcher only after the turn player has declined both [When Digivolving] effects", async () => {
    const s = setupScenario(fixture, { autoOrderTriggers: false });
    const driver = createDriver(s);
    const loop = s.engine.startTurnLoop();
    try {
      const entry = await attackWithOptionThenArtsDigivolve(s, driver);
      expect(entry).toMatchObject({ seat: 0, kind: "orderTriggers" });
      const entryKeys = entry.options!.triggerKeys!;
      driver.respond(entry, {
        kind: "orderTriggers",
        order: [...entryKeys],
        optionalAnswers: Object.fromEntries(entryKeys.map((key) => [key, false])),
      });
      const watcher = await driver.next();
      expect(watcher).toMatchObject({ seat: 1, kind: "optional", sourceCardId: "BT25-028" });
      expect(dianamonTriggerIndex(s)).toBe(-1);
      driver.respond(watcher, { kind: "optional", accept: true });
      await settle(() => s.state.pendingDecision === undefined && s.state.players[1]!.security.length === 1);

      expect(dianamonTriggerIndex(s)).toBeGreaterThanOrEqual(0);
      expect(s.perm("dianamon").topCard.cardId).toBe("BT25-028");
      expect(s.perm("artsBase").topCard.instanceId).toBe(s.inst("monarchlizamon").instanceId);
      expect(s.perm("artsBase").stack).toHaveLength(0);
      expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId).sort()).toEqual(
        [
          s.inst("artsBaseLowerSource").instanceId,
          s.inst("artsBaseUpperSource").instanceId,
          s.inst("artsBase").instanceId,
        ].sort(),
      );
      expect(s.perm("tamer").stack).toHaveLength(2);
      expect(s.state.turnSeat).toBe(0);
      expect(s.state.phase).toBe(Phase.Main);
      expect(s.state.memory).toBe(1);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
