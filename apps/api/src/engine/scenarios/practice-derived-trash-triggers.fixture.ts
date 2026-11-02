import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "practice-derived-trash-triggers",
  memory: 10,
  player: {
    battleArea: [
      {
        card: "BT24-045",
        as: "ogremon",
        under: [
          { card: "BT6-006", as: "tsunomon" },
          { card: "BT24-042", as: "goblimon" },
        ],
      },
      { card: "ST1-05", as: "birdramon" },
    ],
    hand: [
      { card: "BT1-009", as: "first-discard" },
      { card: "BT1-009", as: "second-discard" },
    ],
    trash: [
      { card: "BT24-072", as: "skullgreymon" },
      { card: "BT25-084", as: "titamon" },
    ],
    security: ["ST1-02", "ST1-03", "ST1-04"],
    deck: [
      { card: "ST1-10", as: "turn-draw" },
      { card: "ST1-09", as: "first-bonus" },
      { card: "ST1-08", as: "derived-draw" },
      { card: "ST1-07", as: "second-bonus" },
    ],
  },
  opponent: {
    battleArea: [
      { card: "BT14-011", as: "blocker" },
      { card: "ST2-03", as: "lowest-dp" },
    ],
    security: ["ST2-10", "ST2-10", "ST2-10"],
  },
  opponentPolicy: { endBreeding: true, blockerCard: "BT14-011", fallbackMain: "end" },
});

export default fixture;
