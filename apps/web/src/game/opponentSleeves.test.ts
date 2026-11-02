import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Every source file of a folder and its subfolders, barrels excluded. */
function folderSources(folder: string): string[] {
  return readdirSync(new URL(folder, import.meta.url), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? folderSources(`${folder}${entry.name}/`)
      : entry.name === "index.ts"
        ? []
        : [readFileSync(new URL(`${folder}${entry.name}`, import.meta.url), "utf8")],
  );
}
/** The screen's hooks, model, layout, queries and shared types all sit under ./screen. */
const gameScreenSource = [
  readFileSync(new URL("./GameScreen.tsx", import.meta.url), "utf8"),
  ...folderSources("./screen/"),
].join("\n");

describe("opponent hidden-card backs", () => {
  it("does not apply the local sleeve to opponent-owned piles", () => {
    // Each opponent pile is matched from its own `count` prop up to the closing
    // tag, so a decorative prop added between them cannot make the assertion pass
    // by accident — nor break it for being in the wrong place.
    // The piles are drawn from the presented board (`shownOpp`, and `breedingOpp` for the
    // raising area's own clock), not the live state.
    expect(gameScreenSource).toMatch(/count=\{opponent\.deckCount\}(?:(?!\/>)[\s\S])*?useSelectedSleeve=\{false\}/);
    expect(gameScreenSource).toMatch(/count=\{opponent\.trash\.length\}(?:(?!\/>)[\s\S])*?useSelectedSleeve=\{false\}/);
    expect(gameScreenSource).toMatch(
      /count=\{opponentBreeding\.eggDeckCount\}(?:(?!\/>)[\s\S])*?egg(?:(?!\/>)[\s\S])*?useSelectedSleeve=\{false\}/,
    );
    // Those `opponent` props are the presented board, and the raising area its own clock.
    expect(gameScreenSource).toMatch(/opponent=\{shownOpponent\}/);
    expect(gameScreenSource).toMatch(/opponentBreeding=\{breedingOpponent\}/);
    // The security shield's count goes through `shieldSecurityCount`, which holds the
    // figure while a scene is still showing a card leaving, so it is matched by its own
    // `shield={Side.Opponent}` marker instead.
    expect(gameScreenSource).toMatch(/shield=\{Side\.Opponent\}[\s\S]*?useSelectedSleeve=\{false\}/);
    expect(gameScreenSource).toMatch(/"data-drop": "perm-opp"(?:(?!\/>)[\s\S])*?useSelectedSleeve=\{false\}/);
  });
});
