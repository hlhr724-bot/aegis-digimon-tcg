import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-guard",
  memory: 10,
  turnSeat: 1,
  opening: [["ST1-10"], ["ST2-10"]],
  player: {
    hand: [],
    security: ["ST1-04", "ST1-02", "ST1-03"],
    battleArea: [
      { card: "BT6-063", as: "hero" },
      { card: "EX13-052", as: "guard" },
    ],
  },
  opponent: {
    hand: [{ card: "ST2-16", as: "removal" }],
    security: [],
    battleArea: [{ card: "ST2-03", as: "color-source" }],
  },
  opponentPolicy: {
    endBreeding: true,
    main: [{ kind: "play", card: "ST2-16", whenOpponentCard: "BT6-063" }],
    fallbackMain: "end",
    decisions: [{ sourceCard: "ST2-16", kind: "chooseTargets", target: "hero" }],
  },
});

export default fixture;
