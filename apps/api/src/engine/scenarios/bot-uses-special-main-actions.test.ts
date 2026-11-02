import { Phase } from "@aegis/shared/schema/enums";
import { describe, expect, it } from "vitest";
import type { BotPolicy } from "#api/bot/policy";
import { createProjectedEvaluationPolicy } from "#api/bot/projectedPolicy";
import { createResidualPolicy } from "#api/bot/evolution/residualPolicy";
import { defaultBotProgram } from "#api/bot/defaultBotProgram";
import { buildBotView } from "#api/bot/view";
import type { GameEngine } from "#api/engine/GameEngine";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import dna from "#api/engine/scenarios/bot-takes-favorable-dna.fixture";
import appFusion from "#api/engine/scenarios/bot-takes-free-app-fusion.fixture";
import link from "#api/engine/scenarios/bot-links-without-sacrificing-attacker.fixture";
import "#api/cards/index";

const factories: { name: string; create: (engine: GameEngine) => BotPolicy }[] = [
  { name: "projected", create: (engine) => createProjectedEvaluationPolicy({ engine, seat: 0, seed: 42 }) },
  {
    name: "certified residual",
    create: (engine) => createResidualPolicy({ engine, seat: 0, seed: 42, program: defaultBotProgram({}).program }),
  },
];

for (const factory of factories) {
  describe(`${factory.name} special Main actions`, () => {
    it("merges two suspended materials through a free DNA declaration", async () => {
      const setup = setupScenario(dna, { autoDeclineOptional: true, autoSelectCards: true });
      setup.state.phase = Phase.Main;
      await setup.ready();
      const view = buildBotView(setup.state, 0);
      if (view === undefined) {
        throw new Error("Expected seated view");
      }
      const intent = factory.create(setup.engine).chooseMainAction(view);
      expect(intent).toMatchObject({ type: "dnaDigivolve", instanceId: setup.inst("fusion").instanceId });
      expect(setup.engine.applyIntent(0, intent)).toEqual({ ok: true });
      await settle(() => setup.state.players[0]!.battleArea.some((unit) => unit.topCard.cardId === "BT16-012"));
      expect(setup.state.players[0]!.battleArea).toHaveLength(1);
      expect(setup.state.players[0]!.battleArea[0]!.isSuspended).toBe(false);
      expect(setup.state.memory).toBe(0);
    });

    it("takes the free App Fusion route instead of passing or paying normal evolution cost", async () => {
      const setup = setupScenario(appFusion, {
        autoDeclineOptional: true,
        autoSelectCards: true,
        autoChooseOption: true,
      });
      setup.state.phase = Phase.Main;
      await setup.ready();
      const view = buildBotView(setup.state, 0);
      if (view === undefined) {
        throw new Error("Expected seated view");
      }
      const intent = factory.create(setup.engine).chooseMainAction(view);
      expect(intent).toMatchObject({ type: "appFusion", instanceId: setup.inst("fusion").instanceId });
      expect(setup.engine.applyIntent(0, intent)).toEqual({ ok: true });
      await settle(() => setup.perm("host").topCard.cardId === "BT25-036");
      expect(setup.perm("host").linked).toHaveLength(0);
      expect(setup.state.memory).toBe(0);
    });

    it("links an affordable hand card while preserving its field body", async () => {
      const setup = setupScenario(link, { autoDeclineOptional: true, autoSelectCards: true });
      setup.state.phase = Phase.Main;
      await setup.ready();
      const view = buildBotView(setup.state, 0);
      if (view === undefined) {
        throw new Error("Expected seated view");
      }
      const intent = factory.create(setup.engine).chooseMainAction(view);
      expect(intent).toEqual({
        type: "linkCard",
        instanceId: setup.inst("link").instanceId,
        targetPermanentId: setup.perm("host").permanentId,
      });
      expect(setup.engine.applyIntent(0, intent)).toEqual({ ok: true });
      await settle(() => setup.perm("host").linked.length === 1);
      expect(setup.state.players[0]!.battleArea).toHaveLength(1);
      expect(setup.state.memory).toBe(0);
    });
  });
}
