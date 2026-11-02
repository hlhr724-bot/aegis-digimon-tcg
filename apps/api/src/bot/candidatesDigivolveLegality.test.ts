import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { enumerateMainPhaseCandidates } from "#api/bot/candidates";
import { buildBotView } from "#api/bot/view";
import { advance } from "#api/engine/testkit/advance";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/bot-skips-digivolution-forbidden-by-base.fixture";

describe("Bot digivolve candidates", () => {
  it("offers only digivolutions the engine accepts", async () => {
    const s = setupScenario(fixture);
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const turuiemon = s.inst("turuiemon").instanceId;
      const lucemon = s.perm("lucemon").permanentId;
      const salamon = s.perm("salamon").permanentId;
      const digivolutions = enumerateMainPhaseCandidates(buildBotView(s.state, 0)!).filter(
        (candidate) => candidate.kind === "digivolve",
      );

      expect(digivolutions.map((candidate) => candidate.intent)).toEqual([
        { type: "digivolve", permanentId: salamon, instanceId: turuiemon },
      ]);
      expect(digivolutions[0]!.cost).toBe(1);
      expect(s.engine.applyIntent(0, { type: "digivolve", permanentId: lucemon, instanceId: turuiemon })).toMatchObject(
        { ok: false, reason: "invalid-evolution" },
      );
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
