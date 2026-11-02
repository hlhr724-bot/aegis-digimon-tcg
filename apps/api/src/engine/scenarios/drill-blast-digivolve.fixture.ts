import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-blast-digivolve",
  turnSeat: 1,
  player: {
    hand: [
      {
        card: "ST15-12",
        as: "counter",
      },
    ],
    security: [],
    battleArea: [
      {
        card: "BT2-063",
        as: "base",
      },
    ],
  },
  opponent: {
    security: [],
    battleArea: [
      {
        card: "ST2-05",
        as: "attacker",
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
