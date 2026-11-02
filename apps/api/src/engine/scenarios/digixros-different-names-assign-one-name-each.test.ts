import { describe, expect, it } from "vitest";
import "../../cards/index.js";
import { setupEngine } from "../testkit/harness.js";

const DORBICKMON = "EX3-014";
const MEGIDRAMON_ALSO_CHAOSGALLANTMON = "EX2-012";
const OTHER_MEGIDRAMON_ALSO_CHAOSGALLANTMON = "EX3-064";
const VORVOMON = "EX3-005";

function declareDorbickmonDigiXros(materials: readonly string[]) {
  const s = setupEngine({
    0: {
      hand: [
        { card: DORBICKMON, as: "dorbickmon" },
        ...materials.map((card, index) => ({ card, as: `material-${index}` })),
      ],
    },
  });
  s.state.memory = 13;
  return s.engine.applyIntent(0, {
    type: "playCard",
    instanceId: s.inst("dorbickmon").instanceId,
    digiXros: { materialInstanceIds: materials.map((_card, index) => s.inst(`material-${index}`).instanceId) },
  });
}

describe("DigiXros materials with different names", () => {
  it("counts two cards that are also treated as another name under their two names", () => {
    expect(declareDorbickmonDigiXros([MEGIDRAMON_ALSO_CHAOSGALLANTMON, OTHER_MEGIDRAMON_ALSO_CHAOSGALLANTMON])).toEqual(
      { ok: true },
    );
  });

  it("refuses a third card once both of the shared names are taken", () => {
    expect(
      declareDorbickmonDigiXros([
        MEGIDRAMON_ALSO_CHAOSGALLANTMON,
        OTHER_MEGIDRAMON_ALSO_CHAOSGALLANTMON,
        MEGIDRAMON_ALSO_CHAOSGALLANTMON,
      ]),
    ).toEqual({ ok: false, reason: "invalid-material" });
  });

  it("still refuses two cards that share their only name", () => {
    expect(declareDorbickmonDigiXros([VORVOMON, VORVOMON])).toEqual({ ok: false, reason: "invalid-material" });
  });
});
