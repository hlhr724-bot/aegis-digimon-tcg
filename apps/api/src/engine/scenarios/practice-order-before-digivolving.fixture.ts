import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "practice-order-before-digivolving",
  memory: 4,
  player: {
    battleArea: [{ card: "BT17-023", as: "kendogarurumon", under: [{ card: "BT1-029", as: "gabumon" }] }],
    hand: [{ card: "BT7-024", as: "alternative" }],
    security: ["ST1-02", "ST1-03", "ST1-04"],
    deck: [
      { card: "BT1-009", as: "turn-draw" },
      { card: "BT4-030", as: "attack-draw" },
      { card: "BT1-009", as: "bonus-draw" },
      { card: "BT1-009", as: "next-turn-draw" },
    ],
  },
  opponent: { security: ["ST2-10"] },
});

export default fixture;
