import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-decode",
  memory: 10,
  turnSeat: 1,
  opening: [["ST1-10"], ["ST2-10"]],
  player: {
    hand: [],
    security: ["ST1-04", "ST1-02", "ST1-03"],
    battleArea: [{ card: "EX13-065", as: "hero", under: [{ card: "BT6-082", as: "blanc" }] }],
  },
  opponent: {
    hand: [{ card: "ST2-16", as: "removal" }],
    security: [],
    battleArea: [{ card: "ST2-03", as: "color-source" }],
  },
  opponentPolicy: {
    endBreeding: true,
    main: [{ kind: "play", card: "ST2-16", whenOpponentCard: "EX13-065" }],
    fallbackMain: "end",
    decisions: [{ sourceCard: "ST2-16", kind: "chooseTargets", target: "hero" }],
  },
});

export default fixture;
