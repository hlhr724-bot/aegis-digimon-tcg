import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/multicolor-dna-materials.fixture";
import "#api/cards/index";

it.each([false, true])(
  "DNA digivolves multicolor Sorcermon with black Blimpmon in either order (%s)",
  async (reverse) => {
    const s = setupScenario(fixture, { autoDeclineOptional: true, autoSelectCards: true });
    s.state.phase = Phase.Main;
    await s.ready();
    const materials = [s.perm("blimpmon").permanentId, s.perm("sorcermon").permanentId];
    expect(s.inst("shakkoumon").dnaDigivolveRoutes).toHaveLength(1);
    expect(s.inst("shakkoumon").dnaDigivolveRoutes[0]?.projectedCost).toBe(0);
    expect(
      s.engine.applyIntent(0, {
        type: "dnaDigivolve",
        instanceId: s.inst("shakkoumon").instanceId,
        materialPermanentIds: reverse ? materials.reverse() : materials,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT25-038"));
    const merged = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard?.cardId === "BT25-038");
    expect(merged?.stack.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["BT24-058", "BT26-022", "P-197", "BT25-003"]),
    );
    expect(s.state.memory).toBe(3);
  },
);
