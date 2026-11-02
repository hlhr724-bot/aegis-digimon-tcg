import type { ScenarioFixture, SeatSpec } from "../scenario/types.js";

export type PreventedBattleLoserBattle = "attack" | "effect" | "dnaAttack";

const EXAMON = "EX13-045";
const DRACOMON = "EX13-008";
const GREEN_LEVEL_SIX = "BT1-080";

const examonSeat = (battle: PreventedBattleLoserBattle): SeatSpec => {
  const dracomon = { card: DRACOMON, as: "dracomon" };
  const examonInHand = { card: EXAMON, as: "examon" };
  const zones =
    battle === "attack"
      ? { battleArea: [{ card: EXAMON, as: "examon", under: [GREEN_LEVEL_SIX] }], hand: [dracomon] }
      : battle === "effect"
        ? { battleArea: [{ card: GREEN_LEVEL_SIX, as: "base" }], hand: [examonInHand, dracomon] }
        : {
            battleArea: [
              { card: "EX13-041", as: "ground" },
              { card: "EX13-021", as: "wing" },
            ],
            hand: [examonInHand, dracomon],
          };
  return {
    ...zones,
    deck: [{ card: "BT1-010", as: "turnDraw" }, "BT1-011", "BT1-014", "BT1-010"],
    eggDeck: ["BT1-001"],
    security: 3,
  };
};

export function preventedBattleLoserDigivolutionOrdersWithBattleWin({
  battle = "attack",
}: { battle?: PreventedBattleLoserBattle } = {}): ScenarioFixture {
  return {
    name: "prevented-battle-loser-digivolution-orders-with-battle-win",
    memory: 10,
    turnSeat: 0,
    turnCount: 0,
    isFirstPlayersFirstTurn: false,
    board: {
      0: examonSeat(battle),
      1: {
        battleArea: [{ card: "BT26-085", as: "giantSlayer" }],
        hand: [{ card: "BT26-060", as: "destroyMode" }],
        deck: Array<string>(8).fill("BT1-010"),
        eggDeck: ["BT1-001"],
        security: 3,
      },
    },
  };
}

export default preventedBattleLoserDigivolutionOrdersWithBattleWin();
