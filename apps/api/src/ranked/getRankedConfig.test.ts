import { describe, expect, it } from "vitest";
import { getRankedConfig } from "#api/ranked/getRankedConfig";
import { getRankedSeason } from "#api/ranked/getRankedSeason";
import { getRankedSeasonFormats } from "#api/ranked/getRankedSeasonFormats";

const FIRST_SEASON_DATE = Date.UTC(2026, 9, 24);

describe("curated season formats", () => {
  it("allows only Standard in season one even if a legacy environment allowlist requests other formats", () => {
    expect(
      getRankedConfig({
        env: { AEGIS_RANKED_ENABLED: "true", AEGIS_RANKED_FORMATS: "standard,BT10,pauper,unlimited" },
        now: FIRST_SEASON_DATE,
      }),
    ).toEqual({ enabled: true, formats: ["standard"] });
    expect(getRankedSeason(FIRST_SEASON_DATE).formats).toEqual(["standard"]);
  });

  it("keeps unconfigured seasons closed instead of inheriting the previous season's formats", () => {
    const first = getRankedSeason(FIRST_SEASON_DATE);
    expect(getRankedConfig({ env: { AEGIS_RANKED_ENABLED: "true" }, now: first.endsAt })).toEqual({
      enabled: true,
      formats: [],
    });
    expect(getRankedSeasonFormats({ seasonId: 2 })).toEqual([]);
  });

  it("keeps the rollout switch and protects the season definition from caller mutation", () => {
    const formats = getRankedSeasonFormats({ seasonId: 1 });
    formats.push("BT10");
    expect(getRankedSeasonFormats({ seasonId: 1 })).toEqual(["standard"]);
    expect(getRankedConfig({ env: {}, now: FIRST_SEASON_DATE }).enabled).toBe(false);
  });
});
