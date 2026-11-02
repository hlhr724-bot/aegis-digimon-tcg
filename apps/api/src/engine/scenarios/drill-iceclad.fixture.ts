import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-iceclad",
  player: {
    hand: ["ST1-02"],
    security: ["ST1-04"],
    battleArea: [
      { card: "EX11-016", as: "polarBearmon", under: ["ST2-02", "ST2-05"] },
      { card: "ST1-05", as: "birdramon" },
    ],
  },
  opponent: { security: [], battleArea: [{ card: "ST1-11", as: "warGreymon", suspended: true }] },
});

export default fixture;
