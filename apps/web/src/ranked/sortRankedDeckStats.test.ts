import { expect, it } from "vitest";
import { sortRankedDeckStats } from "@/ranked/sortRankedDeckStats";

const rows = [
  { archetype: "Examon", games: 40, wins: 22, players: 12, winrate: 0.55, coverCardId: null, colors: [] },
  { archetype: "alphamon", games: 90, wins: 30, players: 30, winrate: null, coverCardId: null, colors: [] },
  { archetype: "Jupitermon", games: 60, wins: 36, players: 15, winrate: 0.6, coverCardId: null, colors: [] },
];

function getOrder(column: "archetype" | "games" | "wins" | "winrate", descending: boolean) {
  return sortRankedDeckStats({ rows, sort: { column, descending }, locale: "en" }).map((row) => row.archetype);
}

it("orders decks by the chosen column in either direction", () => {
  expect(getOrder("games", true)).toEqual(["alphamon", "Jupitermon", "Examon"]);
  expect(getOrder("wins", false)).toEqual(["Examon", "alphamon", "Jupitermon"]);
  expect(getOrder("archetype", false)).toEqual(["alphamon", "Examon", "Jupitermon"]);
});

it("keeps decks without a published win rate last in both directions", () => {
  expect(getOrder("winrate", true)).toEqual(["Jupitermon", "Examon", "alphamon"]);
  expect(getOrder("winrate", false)).toEqual(["Examon", "Jupitermon", "alphamon"]);
});
