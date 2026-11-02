import "#api/cards/index";
import { describe, expect, it } from "vitest";
import { EffectDuration } from "@aegis/shared";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { internalsOf } from "#api/engine/testkit/internals";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/evade-suspends-opponent-effect-immune-digimon.fixture";

async function loseExamonBattle(acceptEvade: boolean) {
  const preferred: string[] = [];
  const s = setupScenario(fixture, {
    autoAcceptOptional: true,
    autoSelectCards: true,
    autoChooseOption: true,
    preferInstanceIds: preferred,
  });
  const id = (alias: string) => s.inst(alias).instanceId;
  const wingdramon = s.perm("wingdramon");
  preferred.push(wingdramon.topCard.instanceId);
  internalsOf(s.engine).continuous.addRestriction(wingdramon.permanentId, "beAffected", EffectDuration.Permanent, {
    byOpponentEffectsOnly: true,
  });
  const loop = s.engine.startTurnLoop();
  await advance(s.engine).waitForMainPhase(0);

  expect(
    s.engine.applyIntent(0, {
      type: "dnaDigivolve",
      instanceId: id("examon"),
      materialPermanentIds: [s.perm("greenMaterial").permanentId, s.perm("blueMaterial").permanentId],
    }),
  ).toEqual({ ok: true });
  await settle(() => s.events.some(({ kind }) => kind === "evadePrompt"));
  expect(
    s.engine.applyIntent(1, { type: "respondEvade", permanentId: wingdramon.permanentId, accept: acceptEvade }),
  ).toEqual({ ok: true });
  await settle(
    () => s.events.some(({ kind }) => kind === "attackEnded") && !s.state.pendingDecision && !s.state.combatWindow,
  );
  return { s, loop, wingdramon };
}

describe("Evade on a Digimon immune to the opponent's effects", () => {
  it("suspends it and prevents the deletion after it loses an opponent's effect battle", async () => {
    const { s, loop, wingdramon } = await loseExamonBattle(true);
    try {
      const survivor = s.state.players[1]!.battleArea.find(({ permanentId }) => permanentId === wingdramon.permanentId);
      expect(survivor?.isSuspended).toBe(true);
      expect(s.state.players[1]!.trash.some(({ cardId }) => cardId === "EX3-020")).toBe(false);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });

  it("deletes it when Evade is declined", async () => {
    const { s, loop } = await loseExamonBattle(false);
    try {
      expect(s.state.players[1]!.battleArea).toHaveLength(0);
      expect(s.state.players[1]!.trash.some(({ cardId }) => cardId === "EX3-020")).toBe(true);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
