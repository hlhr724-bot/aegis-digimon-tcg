import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-fortitude",
  memory: 10,
  turnSeat: 1,
  opening: [["ST1-10"], ["ST2-10"]],
  player: {
    hand: [],
    security: ["ST1-04", "ST1-02", "ST1-03"],
    battleArea: [{ card: "EX5-036", as: "hero", under: [{ card: "ST4-05", as: "source" }] }],
  },
  opponent: {
    hand: [{ card: "ST1-16", as: "removal" }],
    security: [],
    battleArea: [{ card: "ST1-03", as: "color-source" }],
  },
  opponentPolicy: {
    endBreeding: true,
    main: [{ kind: "play", card: "ST1-16", whenOpponentCard: "EX5-036" }],
    fallbackMain: "end",
    decisions: [{ sourceCard: "ST1-16", kind: "chooseTargets", target: "hero" }],
  },
});

export default fixture;
