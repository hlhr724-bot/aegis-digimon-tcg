import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-ascension",
  player: {
    security: [],
    battleArea: [
      {
        card: "BT26-075",
        as: "scourge",
      },
      {
        card: "ST1-05",
        as: "finisher",
        enteredThisTurn: true,
      },
    ],
  },
  opponent: {
    security: [],
    battleArea: [
      {
        card: "ST2-10",
        as: "attacker",
        suspended: true,
      },
    ],
  },
  opponentPolicy: {
    endBreeding: true,
    main: [
      {
        kind: "attack",
      },
    ],
    fallbackMain: "end",
  },
});

export default fixture;
