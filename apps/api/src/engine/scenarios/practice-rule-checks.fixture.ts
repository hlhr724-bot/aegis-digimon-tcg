import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "practice-rule-checks",
  memory: 9,
  player: {
    hand: [{ card: "ST3-16", as: "seven-heavens" }],
    battleArea: [{ card: "ST3-02", as: "salamon" }],
    security: ["ST3-02", "ST3-03", "ST3-04"],
  },
  opponent: {
    battleArea: [{ card: "BT14-011", as: "blocker" }],
    security: [],
  },
});

export default fixture;
