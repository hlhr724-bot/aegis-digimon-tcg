import { expect, it } from "vitest";
import { buildMatchHistoryCsv } from "@/account/buildMatchHistoryCsv";

const match = {
  id: "match-1",
  mode: "ranked" as const,
  opponentName: "Rival",
  opponentKind: "human" as const,
  result: "win" as const,
  reason: "security",
  finishedAt: Date.UTC(2026, 9, 29, 12, 0, 0),
  deckName: "Blue Flare",
};

it("writes a header and one row per match", () => {
  expect(buildMatchHistoryCsv([match])).toBe(
    "finished_at,mode,result,reason,opponent,opponent_kind,deck,match_id\r\n" +
      "2026-10-29T12:00:00.000Z,ranked,win,security,Rival,human,Blue Flare,match-1\r\n",
  );
});

it("quotes separators and neutralizes spreadsheet formulas in player-written text", () => {
  const [, row] = buildMatchHistoryCsv([{ ...match, opponentName: '=HYPERLINK("x")', deckName: 'Red, "Fast"' }]).split(
    "\r\n",
  );
  expect(row).toBe('2026-10-29T12:00:00.000Z,ranked,win,security,"\'=HYPERLINK(""x"")",human,"Red, ""Fast""",match-1');
});

it("leaves the deck empty for matches without one", () => {
  const [, row] = buildMatchHistoryCsv([{ ...match, deckName: undefined }]).split("\r\n");
  expect(row).toBe("2026-10-29T12:00:00.000Z,ranked,win,security,Rival,human,,match-1");
});
